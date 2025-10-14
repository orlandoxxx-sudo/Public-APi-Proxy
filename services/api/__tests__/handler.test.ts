import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@fxproxy/shared', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@fxproxy/shared');
  return {
    ...actual,
    queryLatestRateDay: vi.fn(),
    queryByDateRange: vi.fn(),
    loadRuntimeConfig: vi.fn().mockResolvedValue({
      baseCurrency: 'USD',
      symbols: ['EUR'],
      publicApiUrl: 'https://example.com',
      dailyApiCallBudget: 10,
      cacheTtlSeconds: 60,
      hardStopOnBudget: false
    })
  };
});

import { queryLatestRateDay, queryByDateRange } from '@fxproxy/shared';
import { resolveLatest, resolveHistory, LatestArgsSchema, HistoryArgsSchema } from '../src/handler';

const mockedQueryLatestRateDay = queryLatestRateDay as unknown as vi.Mock;
const mockedQueryByDateRange = queryByDateRange as unknown as vi.Mock;

describe('LatestArgsSchema', () => {
  it('validates symbols list', () => {
    const parsed = LatestArgsSchema.parse({ base: 'USD', symbols: ['EUR'] });
    expect(parsed.symbols).toEqual(['EUR']);
  });
});

describe('resolveLatest', () => {
  beforeEach(() => {
    mockedQueryLatestRateDay.mockReset();
  });

  it('returns filtered rates', async () => {
    mockedQueryLatestRateDay.mockResolvedValue({
      pk: 'RATES#USD',
      sk: 'DATE#2024-04-01',
      sourceTs: '2024-04-01T00:00:00Z',
      lastGoodFetchAt: '2024-04-01T00:00:00Z',
      rates: {
        EUR: 0.92,
        GHS: 15.4
      }
    });

    const result = await resolveLatest({ base: 'USD', symbols: ['EUR', 'NGN'] });

    expect(result).toEqual({
      base: 'USD',
      asOf: '2024-04-01T00:00:00Z',
      rates: [{ key: 'EUR', value: 0.92 }]
    });
  });
});

describe('resolveHistory', () => {
  beforeEach(() => {
    mockedQueryByDateRange.mockReset();
  });

  it('returns chronologically sorted history with defined values', async () => {
    mockedQueryByDateRange.mockResolvedValue([
      {
        pk: 'RATES#USD',
        sk: 'DATE#2024-03-30',
        rates: { EUR: 0.9 },
        sourceTs: '2024-03-30T00:00:00Z',
        lastGoodFetchAt: '2024-03-30T00:00:00Z'
      },
      {
        pk: 'RATES#USD',
        sk: 'DATE#2024-03-31',
        rates: { EUR: 0.91 },
        sourceTs: '2024-03-31T00:00:00Z',
        lastGoodFetchAt: '2024-03-31T00:00:00Z'
      }
    ]);

    const result = await resolveHistory({ base: 'USD', symbol: 'EUR', days: 2 });

    expect(result).toEqual([
      { date: '2024-03-30', value: 0.9 },
      { date: '2024-03-31', value: 0.91 }
    ]);
  });
});

describe('HistoryArgsSchema', () => {
  it('defaults days to 30', () => {
    const parsed = HistoryArgsSchema.parse({ base: 'USD', symbol: 'EUR' });
    expect(parsed.days).toBe(30);
  });
});
