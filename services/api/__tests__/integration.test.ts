import { describe, expect, it, vi } from 'vitest';
import * as shared from '@fxproxy/shared';
import { resolveHistory } from '../src/handler';

vi.mock('@fxproxy/shared', () => ({
  queryByDateRange: vi.fn(),
  queryLatestRateDay: vi.fn(),
  loadRuntimeConfig: vi.fn()
}));

const mockedQueryByDateRange = shared.queryByDateRange as unknown as vi.Mock;
const mockedLoadRuntimeConfig = shared.loadRuntimeConfig as unknown as vi.Mock;

mockedLoadRuntimeConfig.mockResolvedValue({
  baseCurrency: 'USD',
  symbols: ['EUR'],
  publicApiUrl: 'https://example.com',
  dailyApiCallBudget: 100,
  cacheTtlSeconds: 60,
  hardStopOnBudget: false
});

describe('history integration', () => {
  it('returns 30 data points when data exists', async () => {
    const items = Array.from({ length: 30 }, (_, idx) => {
      const date = new Date('2024-03-01T00:00:00Z');
      date.setUTCDate(date.getUTCDate() + idx);
      const isoDate = date.toISOString().slice(0, 10);
      return {
        pk: 'RATES#USD',
        sk: `DATE#${isoDate}`,
        rates: { EUR: 0.8 + idx * 0.001 },
        sourceTs: `${isoDate}T00:00:00Z`,
        lastGoodFetchAt: `${isoDate}T00:00:00Z`
      };
    });

    mockedQueryByDateRange.mockResolvedValue(items);

    const result = await resolveHistory({ base: 'USD', symbol: 'EUR', days: 30 });
    expect(result).toHaveLength(30);
    expect(result[0]?.value).toBeCloseTo(0.8);
    expect(result[result.length - 1]?.value).toBeCloseTo(0.8 + 29 * 0.001);
  });
});
