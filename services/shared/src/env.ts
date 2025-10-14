import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { z } from 'zod';
import { RuntimeConfig } from './types';

const CONFIG_SCHEMA = z.object({
  baseCurrency: z.string().min(1),
  symbols: z.array(z.string().min(1)),
  publicApiUrl: z.string().url(),
  dailyApiCallBudget: z.number().int().positive(),
  cacheTtlSeconds: z.number().int().positive(),
  hardStopOnBudget: z.boolean().optional().default(false)
});

const PARAMS = {
  symbols: '/fxproxy/SYMBOLS',
  base: '/fxproxy/BASE',
  apiUrl: '/fxproxy/PUBLIC_API_URL',
  budget: '/fxproxy/DAILY_API_CALL_BUDGET',
  cacheTtl: '/fxproxy/CACHE_TTL_SECONDS'
} as const;

let cachedConfig: RuntimeConfig | undefined;
const ssm = new SSMClient({});

const booleanFromEnv = (value: string | undefined): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return ['1', 'true', 'TRUE', 'yes', 'YES', 'on'].includes(value);
};

async function getParameter(name: string): Promise<string> {
  const response = await ssm.send(
    new GetParameterCommand({ Name: name, WithDecryption: false })
  );
  const value = response.Parameter?.Value;
  if (!value) {
    throw new Error(`Missing SSM parameter ${name}`);
  }
  return value;
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const [symbolsRaw, baseRaw, apiUrlRaw, budgetRaw, cacheTtlRaw] = await Promise.all([
    process.env.SYMBOLS ?? getParameter(PARAMS.symbols),
    process.env.BASE ?? getParameter(PARAMS.base),
    process.env.PUBLIC_API_URL ?? getParameter(PARAMS.apiUrl),
    process.env.DAILY_API_CALL_BUDGET ?? getParameter(PARAMS.budget),
    process.env.CACHE_TTL_SECONDS ?? getParameter(PARAMS.cacheTtl)
  ]);

  const hardStop = booleanFromEnv(process.env.HARD_STOP_ON_BUDGET);

  const parsed = CONFIG_SCHEMA.parse({
    baseCurrency: baseRaw,
    symbols: symbolsRaw.split(',').map((s) => s.trim()).filter(Boolean),
    publicApiUrl: apiUrlRaw,
    dailyApiCallBudget: Number.parseInt(budgetRaw, 10),
    cacheTtlSeconds: Number.parseInt(cacheTtlRaw, 10),
    ...(hardStop !== undefined ? { hardStopOnBudget: hardStop } : {})
  });

  cachedConfig = parsed;
  return parsed;
}

export function setRuntimeConfig(config: RuntimeConfig): void {
  cachedConfig = config;
}
