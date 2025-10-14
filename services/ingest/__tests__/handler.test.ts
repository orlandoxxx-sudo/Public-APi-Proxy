import { describe, expect, it } from 'vitest';
import { normalizeRates } from '../src/handler';

describe('normalizeRates', () => {
  it('filters rates for configured symbols', () => {
    const result = normalizeRates(['EUR', 'GHS'], {
      asOf: '2024-04-01T00:00:00Z',
      rates: {
        EUR: 0.92,
        GHS: 15.4,
        JPY: 120
      }
    });

    expect(result).toEqual({
      date: '2024-04-01',
      rates: {
        EUR: 0.92,
        GHS: 15.4
      }
    });
  });

  it('returns empty map when symbols missing', () => {
    const result = normalizeRates(['NGN'], {
      asOf: '2024-04-01T00:00:00Z',
      rates: {
        EUR: 0.92
      }
    });

    expect(result).toEqual({ date: '2024-04-01', rates: {} });
  });
});
