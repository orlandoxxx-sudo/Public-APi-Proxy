export interface RateDay {
  pk: string;
  sk: string;
  rates: Record<string, number>;
  sourceTs: string;
  lastGoodFetchAt: string;
  ttl?: number;
}

export interface LatestResponseDto {
  base: string;
  asOf: string;
  rates: Array<{ key: string; value: number }>;
}

export interface RatePointDto {
  date: string;
  value: number;
}

export interface RuntimeConfig {
  baseCurrency: string;
  symbols: string[];
  publicApiUrl: string;
  dailyApiCallBudget: number;
  cacheTtlSeconds: number;
  hardStopOnBudget: boolean;
}
