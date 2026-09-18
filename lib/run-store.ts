import { postNdjson } from "./ndjson";
import {
  applyEvent,
  createRunState,
  isRunning,
  markStopped,
  type RunState,
} from "./run-frame";
import type { Decision, RunEvent } from "./run-types";

/**
 * The run in progress, held outside React so it outlives the screen that
 * started it. The console says "you can start reading before it finishes":
 * stepping from the run to the review list must not stop the run, and both
 * screens have to be looking at the same one. Browser only.
 */
export type Session = {
  domain: string;
  target: number;
  state: RunState;
  /** Bumped on every event, so a screen can tell whether to repaint. */
  version: number;
  controller: AbortController;
};

let session: Session | null = null;

/* ── Who is watching ─────────────────────────────────────────────────────── */

/** A run nobody has looked at for this long is stopped: it is spending money. */
const UNWATCHED_MS = 5_000;

let watchers = 0;
let unwatched: ReturnType<typeof setTimeout> | undefined;

/**
 * Call while a screen is showing the run; call the result when it stops. The
 * grace period covers the moment between two screens during navigation (and
 * Strict Mode's mount–unmount–mount in development).
 */
export function watchRun() {
  watchers++;
  clearTimeout(unwatched);
  return () => {
    watchers--;
    if (watchers > 0) return;
    unwatched = setTimeout(stopRun, UNWATCHED_MS);
  };
}

/* ── Starting and stopping ───────────────────────────────────────────────── */

function start(domain: string, target: number): Session {
  session?.controller.abort();

  const next: Session = {
    domain,
    target,
    state: createRunState(domain, target),
    version: 0,
    controller: new AbortController(),
  };
  session = next;

  const fold = (event: RunEvent) => {
    applyEvent(next.state, event, performance.now());
    next.version++;
    if (!isRunning(next.state)) saveSnapshot(next);
  };

  postNdjson<RunEvent>(
    "/api/run",
    { domain, target },
    next.controller.signal,
    fold,
  ).then(
    () => {
      // The stream closing without a verdict means the connection dropped.
      if (isRunning(next.state)) {
        fold({ type: "error", message: "The connection to the run was lost." });
      }
    },
    (error: unknown) => {
      if (next.controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      fold({ type: "error", message });
    },
  );

  return next;
}

/**
 * The run for this domain — the one already here, finished or not, or a new
 * one. Coming back to the console never starts a second run by itself; that
 * costs money, so it takes `restartRun`.
 */
export function ensureRun(domain: string, target: number): Session {
  return session?.domain === domain ? session : start(domain, target);
}

export function restartRun(domain: string, target: number): Session {
  return start(domain, target);
}

export function currentRun(domain: string): Session | null {
  return session?.domain === domain ? session : null;
}

export function stopRun() {
  if (!session || !isRunning(session.state)) return;
  session.controller.abort();
  markStopped(session.state, performance.now());
  session.version++;
  saveSnapshot(session);
}

/* ── Surviving a reload ──────────────────────────────────────────────────── */

/**
 * What the review list needs, kept in sessionStorage once a run ends — so
 * reloading the review screen shows the results instead of paying for them
 * again.
 */
export type Snapshot = {
  domain: string;
  read: number;
  hits: Decision[];
};

const key = (domain: string) => `worth-replying:run:${domain}`;

function saveSnapshot({ domain, state }: Session) {
  const snapshot: Snapshot = { domain, read: state.read, hits: state.hits };
  try {
    sessionStorage.setItem(key(domain), JSON.stringify(snapshot));
  } catch {
    // Storage full or unavailable: the live session still has everything.
  }
}

export function loadSnapshot(domain: string): Snapshot | null {
  try {
    const stored = sessionStorage.getItem(key(domain));
    return stored ? (JSON.parse(stored) as Snapshot) : null;
  } catch {
    return null;
  }
}
