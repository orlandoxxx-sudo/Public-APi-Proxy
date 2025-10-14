import { describe, expect, it, vi } from 'vitest';
import { __setDocumentClient, queryByDateRange } from '../src/ddb';

const send = vi.fn();

__setDocumentClient({
  send
} as never);

describe('queryByDateRange', () => {
  it('maps items to RateDay', async () => {
    send.mockResolvedValueOnce({
      Items: [
        {
          PK: 'RATES#USD',
          SK: 'DATE#2024-03-31',
          rates: { EUR: 0.91 },
          sourceTs: '2024-03-31T00:00:00Z',
          lastGoodFetchAt: '2024-03-31T00:00:00Z'
        }
      ]
    });

    const result = await queryByDateRange({
      tableName: 'FxRates',
      base: 'USD',
      startIsoDate: '2024-03-30',
      endIsoDate: '2024-03-31'
    });

    expect(send).toHaveBeenCalledOnce();
    expect(result).toEqual([
      {
        pk: 'RATES#USD',
        sk: 'DATE#2024-03-31',
        rates: { EUR: 0.91 },
        sourceTs: '2024-03-31T00:00:00Z',
        lastGoodFetchAt: '2024-03-31T00:00:00Z',
        ttl: undefined
      }
    ]);
  });
});
