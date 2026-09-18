import "server-only";

/**
 * A daily spending ceiling. Every paid call reports its cost here, and the
 * pipeline stops starting new work once the day's total crosses the line.
 *
 * The tally lives in process memory: it is exact under `next dev` and a single
 * `next start`, and only per-instance on serverless. Move it to a shared store
 * before relying on it as a hard limit across instances.
 */
export const DAILY_BUDGET_USD = Number(process.env.DAILY_BUDGET_USD ?? 5);

type Tally = { day: string; usd: number };

const store = globalThis as typeof globalThis & { __spend?: Tally };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function tally(): Tally {
  if (store.__spend?.day !== today()) store.__spend = { day: today(), usd: 0 };
  return store.__spend;
}

export function spend(usd: number) {
  if (usd > 0) tally().usd += usd;
}

export function spentToday() {
  return tally().usd;
}

export function overBudget() {
  return tally().usd >= DAILY_BUDGET_USD;
}

export class BudgetError extends Error {
  constructor() {
    super(
      `Today's $${DAILY_BUDGET_USD.toFixed(2)} budget is spent. It resets at midnight UTC.`,
    );
    this.name = "BudgetError";
  }
}

export function assertBudget() {
  if (overBudget()) throw new BudgetError();
}
