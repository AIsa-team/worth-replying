import type { Route, Signals } from "./run-types";

/**
 * Where each answer has to land. The console draws these as the tick on every
 * track, and the server routes on the same numbers, so they live in one place.
 */
export const THRESHOLDS = {
  icp: 0.6,
  /** Below this the author is not the buyer, however you squint. */
  icpFloor: 0.4,
  /** Reply value is a 0–3 rubric; 2 of 3 is the bar. */
  val: 2 / 3,
  hum: 0.3,
  inj: 0.1,
} as const;

/** How close to a threshold still counts as "on the line". */
const NEAR = 0.1;

export function routeFor(s: Signals): Route {
  // A tweet that talks to the model is never answered automatically.
  if (s.inj >= THRESHOLDS.inj) return "ARCHIVED";
  if (s.painName === "none" || s.val < THRESHOLDS.val) return "ARCHIVED";
  if (s.icp < THRESHOLDS.icpFloor) return "ARCHIVED";
  if (s.icp < THRESHOLDS.icp || s.hum >= THRESHOLDS.hum) return "NEEDS A HUMAN";
  return "IN THE QUEUE";
}

/**
 * Borderline calls jev refuses to make alone: the reason a tweet is set aside
 * for a person, and the number that put it there. Null when the call is clean.
 */
export function asideFor(s: Signals): { why: string; n: string } | null {
  if (s.inj >= THRESHOLDS.inj || s.painName === "none") return null;

  if (Math.abs(s.icp - THRESHOLDS.icp) < NEAR) {
    return { why: "is ICP sits on the line", n: bare(s.icp) };
  }
  if (s.icp >= THRESHOLDS.icp && Math.abs(s.hum - THRESHOLDS.hum) < NEAR) {
    return { why: "needs a human, almost", n: bare(s.hum) };
  }
  if (
    s.icp >= THRESHOLDS.icp &&
    s.val < THRESHOLDS.val &&
    s.val > THRESHOLDS.val - NEAR
  ) {
    return { why: "value under the bar", n: (s.val * 3).toFixed(1) };
  }
  return null;
}

/** Probabilities print as bare decimals — ".94", not "0.94". */
export function bare(v: number) {
  return v >= 1 ? "1.0" : v.toFixed(2).slice(1);
}
