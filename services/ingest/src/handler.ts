import { Handler } from 'aws-lambda';
import { z } from 'zod';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import {
  createLogger,
  incrementExternalCallAndCheckBudget,
  loadRuntimeConfig,
  putRateDay,
  httpGetJson
} from '@fxproxy/shared';

const TABLE_NAME = process.env.TABLE_NAME ?? '';

if (!TABLE_NAME) {
  throw new Error('TABLE_NAME environment variable is required');
}

const cloudWatch = new CloudWatchClient({});
const EXTERNAL_CALL_METRIC_NAMESPACE = 'FxProxy';
const EXTERNAL_CALL_METRIC_NAME = 'ExternalCalls';

const SourceResponseSchema = z.object({
  asOf: z.string().datetime(),
  rates: z.record(z.number())
});

type SourceResponse = z.infer<typeof SourceResponseSchema>;

async function getRatesFromSource(
  base: string,
  symbols: string[],
  url: string
): Promise<SourceResponse> {
  const parsedUrl = new URL(url);
  parsedUrl.searchParams.set('base', base);
  parsedUrl.searchParams.set('symbols', symbols.join(','));
  const payload = await httpGetJson<unknown>(parsedUrl.toString());
  const parsed = SourceResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Invalid response from source: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function normalizeRates(
  symbols: string[],
  response: SourceResponse
): { date: string; rates: Record<string, number> } {
  const date = response.asOf.slice(0, 10);
  const filteredRates: Record<string, number> = {};
  for (const symbol of symbols) {
    const value = response.rates[symbol];
    if (typeof value === 'number') {
      filteredRates[symbol] = value;
    }
  }

  return { date, rates: filteredRates };
}

export const handler: Handler = async (event, _context) => {
  const correlationId = (event?.detail?.correlationId as string | undefined) ??
    event?.headers?.['x-corr-id'] ??
    event?.headers?.['X-Corr-Id'];
  const logger = createLogger(correlationId);

  try {
    const config = await loadRuntimeConfig();

    const allowed = await incrementExternalCallAndCheckBudget({
      tableName: TABLE_NAME,
      budget: config.dailyApiCallBudget
    });

    if (!allowed) {
      logger.warn({ budget: config.dailyApiCallBudget }, 'BUDGET_HIT');
      if (config.hardStopOnBudget) {
        throw new Error('Daily external API budget exhausted');
      }
      return;
    }

    await cloudWatch.send(
      new PutMetricDataCommand({
        Namespace: EXTERNAL_CALL_METRIC_NAMESPACE,
        MetricData: [
          {
            MetricName: EXTERNAL_CALL_METRIC_NAME,
            Value: 1,
            Unit: 'Count'
          }
        ]
      })
    );

    const response = await getRatesFromSource(
      config.baseCurrency,
      config.symbols,
      config.publicApiUrl
    );

    const { date, rates } = normalizeRates(config.symbols, response);

    if (Object.keys(rates).length === 0) {
      logger.warn('No rates returned for configured symbols');
      return;
    }

    await putRateDay(TABLE_NAME, {
      pk: `RATES#${config.baseCurrency}`,
      sk: `DATE#${date}`,
      rates,
      sourceTs: response.asOf,
      lastGoodFetchAt: new Date().toISOString()
    });

    logger.info({ base: config.baseCurrency, date }, 'Ingested FX rates');
  } catch (error) {
    logger.error({ error }, 'Failed to ingest rates');
    throw error;
  }
};
