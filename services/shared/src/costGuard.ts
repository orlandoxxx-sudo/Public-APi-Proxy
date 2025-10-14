import { incrementDailyBudgetCounter } from './ddb';

export interface CostGuardInput {
  tableName: string;
  budget: number;
  now?: Date;
}

export async function incrementExternalCallAndCheckBudget(
  input: CostGuardInput
): Promise<boolean> {
  const { tableName, budget, now = new Date() } = input;
  const today = now.toISOString().slice(0, 10);

  const result = await incrementDailyBudgetCounter({
    tableName,
    budget,
    today
  });

  return result !== null;
}
