import "server-only";

/**
 * A daily spending ceiling. Every paid call reports its cost here, and the
 * pipeline stops starting new work once the day's total crosses the line.
 *
 * Two tallies, because the screens price a run by its model calls alone —
 * the profile, the searches, and jev. Data calls (AIsa) are still real money,
 * so `spendData` counts them toward the ceiling; they are just not part of the
 * figures the screens print.
 *
 * The tally lives in process memory: it is exact under `next dev` and a single
 * `next start`, and only per-instance on serverless. Move it to a shared store
 * before relying on it as a hard limit across instances.
 */
export const DAILY_BUDGET_USD = Number(process.env.DAILY_BUDGET_USD ?? 5);

type Tally = { day: string; usd: number; shown: number };

const store = globalThis as typeof globalThis & { __spend?: Tally };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function tally(): Tally {
  if (store.__spend?.day !== today()) {
    store.__spend = { day: today(), usd: 0, shown: 0 };
  }
  // A tally left in memory by an older build of this module may lack a field.
  store.__spend.shown ||= 0;
  return store.__spend;
}

/** A model call: counted, and part of every price the screens print. */
export function spend(usd: number) {
  if (!(usd > 0)) return;
  tally().usd += usd;
  tally().shown += usd;
}

/** A data call: counted toward the ceiling, never printed. */
export function spendData(usd: number) {
  if (usd > 0) tally().usd += usd;
}

/** Today's model spend — the figure the header shows. */
export function spentToday() {
  return tally().shown;
}

export function overBudget() {
  return tally().usd >= DAILY_BUDGET_USD;
}

export class BudgetError extends Error {
  constructor() {
    super("Today's spending limit is reached. It resets at midnight UTC.");
    this.name = "BudgetError";
  }
}

export function assertBudget() {
  if (overBudget()) throw new BudgetError();
}
