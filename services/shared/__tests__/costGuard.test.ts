import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/ddb', () => ({
  incrementDailyBudgetCounter: vi.fn()
}));

import { incrementExternalCallAndCheckBudget } from '../src/costGuard';
import { incrementDailyBudgetCounter } from '../src/ddb';

const mockedIncrement = incrementDailyBudgetCounter as unknown as vi.Mock;

describe('incrementExternalCallAndCheckBudget', () => {
  beforeEach(() => {
    mockedIncrement.mockReset();
  });

  it('returns true when under budget', async () => {
    mockedIncrement.mockResolvedValue({ count: 5 });
    const allowed = await incrementExternalCallAndCheckBudget({
      tableName: 'FxRates',
      budget: 10
    });

    expect(allowed).toBe(true);
  });

  it('returns false when budget exhausted', async () => {
    mockedIncrement.mockResolvedValue(null);
    const allowed = await incrementExternalCallAndCheckBudget({
      tableName: 'FxRates',
      budget: 10
    });

    expect(allowed).toBe(false);
  });
});
