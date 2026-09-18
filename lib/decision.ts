import type { Route, Signals } from "./run-types";

/**
 * Where each answer has to land. The console draws these as the tick on every
 * track, and the server routes on the same numbers, so they live in one place.
 */
export const THRESHOLDS = {
  /** Shown on the track for reference. Being a buyer helps; it is not required. */
  icp: 0.6,
  /** Reply value is a 0–3 rubric; halfway between "no opening" and "good". */
  val: 0.5,
  hum: 0.3,
  inj: 0.1,
} as const;

/** How close to a threshold still counts as "on the line". */
const NEAR = 0.08;

/**
 * Reply value alone decides whether a tweet is worth answering: a lively
 * conversation in the field is worth joining for the exposure, even when its
 * author is no customer. Who the author is only decides who should answer.
 */
export function routeFor(s: Signals): Route {
  // A tweet that talks to the model is never answered automatically.
  if (s.inj >= THRESHOLDS.inj) return "ARCHIVED";
  if (s.val < THRESHOLDS.val) return "ARCHIVED";
  if (s.hum >= THRESHOLDS.hum) return "NEEDS A HUMAN";
  return "IN THE QUEUE";
}

/**
 * Borderline calls jev refuses to make alone: the reason a tweet is set aside
 * for a person, and the number that put it there. Null when the call is clean.
 */
export function asideFor(s: Signals): { why: string; n: string } | null {
  if (s.inj >= THRESHOLDS.inj) return null;

  if (Math.abs(s.val - THRESHOLDS.val) < NEAR) {
    const why =
      s.val < THRESHOLDS.val ? "value under the bar" : "value only just over";
    return { why, n: (s.val * 3).toFixed(1) };
  }
  if (s.val >= THRESHOLDS.val && Math.abs(s.hum - THRESHOLDS.hum) < NEAR) {
    return { why: "needs a human, almost", n: bare(s.hum) };
  }
  return null;
}

/** Probabilities print as bare decimals — ".94", not "0.94". */
export function bare(v: number) {
  return v >= 1 ? "1.0" : v.toFixed(2).slice(1);
}
