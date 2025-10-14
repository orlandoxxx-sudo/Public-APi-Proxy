import { AppSyncResolverEvent, AppSyncResolverHandler } from 'aws-lambda';
import { LRUCache } from 'lru-cache';
import { z } from 'zod';
import {
  createLogger,
  loadRuntimeConfig,
  queryByDateRange,
  queryLatestRateDay
} from '@fxproxy/shared';

const TABLE_NAME = process.env.TABLE_NAME ?? '';

if (!TABLE_NAME) {
  throw new Error('TABLE_NAME environment variable is required');
}

const cache = new LRUCache<string, { expiresAt: number; value: unknown }>({ max: 512 });

export const LatestArgsSchema = z.object({
  base: z.string().min(1),
  symbols: z.array(z.string().min(1)).min(1)
});

export const HistoryArgsSchema = z.object({
  base: z.string().min(1),
  symbol: z.string().min(1),
  days: z.number().int().min(1).max(365).default(30)
});

type LatestArgs = z.infer<typeof LatestArgsSchema>;
type HistoryArgs = z.infer<typeof HistoryArgsSchema>;

const getCacheKey = (field: string, args: unknown): string => `${field}:${JSON.stringify(args)}`;

function getCorrelationId(event: AppSyncResolverEvent<unknown>): string | undefined {
  return (
    (event?.request?.headers?.['x-corr-id'] as string | undefined) ||
    (event?.request?.headers?.['X-Corr-Id'] as string | undefined) ||
    (event?.requestContext?.requestId as string | undefined)
  );
}

export async function resolveLatest(
  args: LatestArgs
): Promise<{ base: string; asOf: string; rates: Array<{ key: string; value: number }> }> {
  const item = await queryLatestRateDay(TABLE_NAME, args.base);
  if (!item) {
    throw new Error(`No rates found for base ${args.base}`);
  }

  const rates = args.symbols
    .map((symbol) => ({ key: symbol, value: item.rates[symbol] }))
    .filter((entry): entry is { key: string; value: number } => typeof entry.value === 'number');

  return {
    base: args.base,
    asOf: item.sourceTs,
    rates
  };
}

export async function resolveHistory(
  args: HistoryArgs
): Promise<Array<{ date: string; value: number }>> {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - (args.days - 1));

  const startIso = start.toISOString().slice(0, 10);
  const endIso = end.toISOString().slice(0, 10);

  const items = await queryByDateRange({
    tableName: TABLE_NAME,
    base: args.base,
    startIsoDate: startIso,
    endIsoDate: endIso
  });

  return items
    .map((item) => ({
      date: item.sk.replace('DATE#', ''),
      value: item.rates[args.symbol]
    }))
    .filter((point): point is { date: string; value: number } => typeof point.value === 'number');
}

export const handler: AppSyncResolverHandler<unknown, unknown> = async (event) => {
  const correlationId = getCorrelationId(event);
  const logger = createLogger(correlationId);

  try {
    const config = await loadRuntimeConfig();
    const ttlMs = config.cacheTtlSeconds * 1000;
    const fieldName = event.info.fieldName;
    const args = event.arguments ?? {};
    const cacheKey = getCacheKey(fieldName, args);
    const cached = cache.get(cacheKey);
    if (cached) {
      const entry = cached as { expiresAt: number; value: unknown };
      if (entry.expiresAt > Date.now()) {
        return entry.value;
      }
    }

    let result: unknown;

    if (fieldName === 'getLatest') {
      const validated = LatestArgsSchema.parse(args);
      result = await resolveLatest(validated);
    } else if (fieldName === 'getHistory') {
      const validated = HistoryArgsSchema.parse(args);
      result = await resolveHistory(validated);
    } else {
      throw new Error(`Unsupported field ${fieldName}`);
    }

    cache.set(cacheKey, { value: result, expiresAt: Date.now() + ttlMs }, { ttl: ttlMs });

    return result;
  } catch (error) {
    logger.error({ error, field: event.info.fieldName }, 'Resolver failed');
    throw error;
  }
};
