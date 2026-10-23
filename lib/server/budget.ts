import "server-only";
import { assertActive, type Caller } from "./auth";

/** Per-login caller totals; a separate global model guard protects the site's gateway.
 * Both are per process, approximate under concurrency, and reset at midnight UTC.
 * Personal data spend never consumes another caller's allowance.
 */
export const DAILY_BUDGET_USD = Number(process.env.DAILY_BUDGET_USD ?? 5);
type Tally = { usd: number; shown: number };
const store = globalThis as typeof globalThis & {
  __callerSpend?: { day: string; model: number; callers: Map<string, Tally> };
};
function ledger() {
  const day = new Date().toISOString().slice(0, 10);
  if (store.__callerSpend?.day !== day) store.__callerSpend = { day, model: 0, callers: new Map() };
  return store.__callerSpend;
}
function tally(caller: Caller) {
  const entries = ledger().callers;
  let value = entries.get(caller.id);
  if (!value) {
    value = { usd: 0, shown: 0 };
    entries.set(caller.id, value);
  }
  return value;
}
export function spend(caller: Caller, usd: number) {
  if (!(usd > 0)) return;
  tally(caller).usd += usd;
  tally(caller).shown += usd;
  ledger().model += usd;
}
export function spendData(caller: Caller, usd: number) {
  if (usd > 0) tally(caller).usd += usd;
}
export function spentToday(caller: Caller) { return tally(caller).shown; }
export function overBudget(caller: Caller) {
  return tally(caller).usd >= DAILY_BUDGET_USD || ledger().model >= DAILY_BUDGET_USD;
}
export class BudgetError extends Error {
  constructor() { super("The website's daily spending guard has been reached. Try again after midnight UTC."); }
}
export function assertBudget(caller: Caller) {
  assertActive(caller);
  if (overBudget(caller)) throw new BudgetError();
}
