import { THRESHOLDS, asideFor, bare } from "./decision";
import { ago, comma, initials, money } from "./format";
import type { Decision, Route, RunEvent } from "./run-types";

/**
 * The console's state machine. `/api/run` streams events; `applyEvent` folds
 * each one into a `RunState`, `advance` paces what the eye is shown, and
 * `toFrame` turns the state into exactly the strings the console prints.
 * Nothing here touches React, the network, or a clock of its own.
 */

/** jev decides far faster than anyone can read; these hold the display back. */
const LEAD_HOLD_MS = 1_500;
const COLUMN_STEP_MS = 420;
const COLUMN_ROWS = 4;
const ASIDE_ROWS = 3;
const TICKER_SIZE = 64;

function pct(v: number) {
  return `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`;
}

type RouteStyle = { chip: string; dot: string; avatar: string; rank: number };

const ROUTE_STYLES: Record<Route, RouteStyle> = {
  "IN THE QUEUE": {
    chip: "border-primary bg-primary text-primary-foreground",
    dot: "border border-primary bg-primary",
    avatar: "border border-primary bg-primary text-primary-foreground",
    rank: 2,
  },
  "NEEDS A HUMAN": {
    chip: "border-foreground bg-card text-foreground",
    dot: "border-2 border-foreground bg-card",
    avatar: "border-2 border-foreground bg-card text-foreground",
    rank: 1,
  },
  ARCHIVED: {
    chip: "border-border bg-muted text-muted-foreground",
    dot: "border border-faint bg-faint",
    avatar: "border border-rule-soft bg-border text-muted-foreground",
    rank: 0,
  },
};

/* ── State ───────────────────────────────────────────────────────────────── */

export type RunStatus =
  | "connecting"
  | "reading"
  | "searching"
  | "done"
  | "stopped"
  | "error";

type Column = { rows: Decision[]; at: number };

export type RunState = {
  status: RunStatus;
  domain: string;
  message: string | null;
  doneReason: "complete" | "exhausted" | "budget" | null;
  target: number;
  queries: number;
  startedAt: number | null;
  endedAt: number | null;
  read: number;
  decided: number;
  authors: Set<string>;
  tally: Record<Route, number>;
  costs: { profile: number; search: number; jev: number };
  lead: Decision | null;
  leadAt: number;
  /** The most interesting decision since the lead last changed. */
  leadNext: Decision | null;
  /** Decided but not yet shown in a column; only the newest few are kept. */
  waiting: Decision[];
  columns: [Column, Column];
  aside: { handle: string; why: string; n: string }[];
  ticker: { ini: string; cls: string }[];
};

export function createRunState(domain: string, target: number): RunState {
  return {
    status: "connecting",
    domain,
    message: null,
    doneReason: null,
    target,
    queries: 0,
    startedAt: null,
    endedAt: null,
    read: 0,
    decided: 0,
    authors: new Set(),
    tally: { "IN THE QUEUE": 0, "NEEDS A HUMAN": 0, ARCHIVED: 0 },
    costs: { profile: 0, search: 0, jev: 0 },
    lead: null,
    leadAt: 0,
    leadNext: null,
    waiting: [],
    columns: [
      { rows: [], at: 0 },
      { rows: [], at: 0 },
    ],
    aside: [],
    ticker: [],
  };
}

export function isRunning(state: RunState) {
  return (
    state.status === "connecting" ||
    state.status === "reading" ||
    state.status === "searching"
  );
}

/** Fold one server event into the state. Mutates — the state lives in a ref. */
export function applyEvent(state: RunState, event: RunEvent, now: number) {
  switch (event.type) {
    case "reading":
      state.status = "reading";
      return;

    case "start":
      state.status = "searching";
      state.target = event.target;
      state.queries = event.queries.length;
      state.costs.profile = event.profileCost;
      state.startedAt = now;
      return;

    case "search":
      state.costs.search += event.cost;
      return;

    case "skipped":
      state.read++;
      return;

    case "decision": {
      const { tweet, route, signals } = event;
      state.read++;
      state.decided++;
      state.tally[route]++;
      state.costs.jev += event.cost;
      state.authors.add(tweet.author.handle);

      const rank = ROUTE_STYLES[route].rank;
      if (!state.leadNext || rank >= ROUTE_STYLES[state.leadNext.route].rank) {
        state.leadNext = event;
      }
      state.waiting.push(event);
      if (state.waiting.length > 2) state.waiting.shift();

      const aside = asideFor(signals);
      if (aside) {
        state.aside.unshift({ handle: `@${tweet.author.handle}`, ...aside });
        state.aside.length = Math.min(state.aside.length, ASIDE_ROWS);
      }
      state.ticker.unshift({
        ini: initials(tweet.author.name, tweet.author.handle),
        cls: ROUTE_STYLES[route].avatar,
      });
      state.ticker.length = Math.min(state.ticker.length, TICKER_SIZE);
      return;
    }

    case "done":
      state.status = "done";
      state.doneReason = event.reason;
      state.endedAt = now;
      return;

    case "error":
      state.status = "error";
      state.message = event.message;
      state.endedAt = now;
      return;
  }
}

export function markStopped(state: RunState, now: number) {
  if (!isRunning(state)) return;
  state.status = "stopped";
  state.endedAt = now;
}

/**
 * Move the paced parts of the display forward. Returns whether anything moved,
 * so a finished run can stop repainting once the last cards have landed.
 */
export function advance(state: RunState, now: number): boolean {
  let moved = false;

  if (
    state.leadNext &&
    (state.lead === null || now - state.leadAt >= LEAD_HOLD_MS)
  ) {
    state.lead = state.leadNext;
    state.leadNext = null;
    state.leadAt = now;
    moved = true;
  }

  const [a, b] = state.columns;
  if (state.waiting.length > 0 && now - Math.max(a.at, b.at) >= COLUMN_STEP_MS) {
    // Feed whichever column has waited longest, so a lone arrival alternates.
    const order = a.at <= b.at ? [a, b] : [b, a];
    for (const column of order) {
      const next = state.waiting.shift();
      if (!next) break;
      column.rows.unshift(next);
      column.rows.length = Math.min(column.rows.length, COLUMN_ROWS);
      column.at = now;
    }
    moved = true;
  }

  return moved;
}

/* ── Frame ───────────────────────────────────────────────────────────────── */

export type SignalRow = {
  k: string;
  v: string;
  /** Where the returned probability sits on the 0–1 track. */
  at: string;
  /** Where the decision threshold sits on that same track. */
  th: string;
  hi: boolean;
  p: string;
};

export type LeadCard = {
  ini: string;
  handle: string;
  meta: string;
  url: string;
  ms: number;
  tokens: string;
  route: Route;
  text: string;
  rows: SignalRow[];
  chip: string;
};

export type Brief = {
  id: string;
  ini: string;
  handle: string;
  text: string;
  signals: { w: string; hi: boolean }[];
  dot: string;
  /** Freshly decided briefs get an orange top rule and fade in. */
  rule: string;
  opacity: number;
};

export type RunFrame = {
  status: RunStatus;
  running: boolean;
  /** What the lead panel says while there is no decision to show yet. */
  note: string;
  /** How the run ended, for the footer. Empty while it is still going. */
  outcome: string;
  target: string;
  read: string;
  decisions: string;
  authors: string;
  elapsed: string;
  cost: string;
  progress: number;
  lead: LeadCard | null;
  colA: Brief[];
  colB: Brief[];
  tally: { a: number; b: number; c: string; wA: string; wB: string };
  ledger: { k: string; v: string }[];
  aside: { handle: string; why: string; n: string }[];
  ticker: { ini: string; cls: string }[];
};

function buildLead(d: Decision, wallNow: number): LeadCard {
  const { tweet, signals: s } = d;
  const rows: SignalRow[] = [
    {
      k: "IS ICP",
      v:
        s.icp >= THRESHOLDS.icp
          ? "true"
          : s.icp >= THRESHOLDS.icpFloor
            ? "unclear"
            : "false",
      at: pct(s.icp),
      th: pct(THRESHOLDS.icp),
      hi: true,
      p: bare(s.icp),
    },
    {
      k: "PAIN",
      v: s.painName,
      at: pct(s.pain),
      th: pct(0),
      hi: true,
      p: bare(s.pain),
    },
    {
      k: "REPLY VALUE",
      v: `${(s.val * 3).toFixed(1)} / 3`,
      at: pct(s.val),
      th: pct(THRESHOLDS.val),
      hi: true,
      p: bare(s.val),
    },
    {
      k: "NEEDS HUMAN",
      v: s.hum >= 0.5 ? "true" : "false",
      at: pct(s.hum),
      th: pct(THRESHOLDS.hum),
      hi: false,
      p: bare(s.hum),
    },
    {
      k: "INJECTION",
      v: s.inj >= THRESHOLDS.inj ? "true" : "false",
      at: pct(s.inj),
      th: pct(THRESHOLDS.inj),
      hi: false,
      p: bare(s.inj),
    },
  ];

  const age = ago(tweet.createdAt, wallNow);
  return {
    ini: initials(tweet.author.name, tweet.author.handle),
    handle: `@${tweet.author.handle}`,
    meta: `${comma(tweet.author.followers)} followers${age && ` — ${age}`}`,
    url: tweet.url,
    ms: d.ms,
    tokens: comma(d.tokens),
    route: d.route,
    text: tweet.text,
    rows,
    chip: ROUTE_STYLES[d.route].chip,
  };
}

function buildBrief(d: Decision, newest: boolean, phase: number): Brief {
  const s = d.signals;
  const signals = [
    { v: s.icp, hi: true },
    { v: s.pain, hi: true },
    { v: s.val, hi: true },
    { v: s.hum, hi: false },
    { v: s.inj, hi: false },
  ];

  return {
    id: d.tweet.id,
    ini: initials(d.tweet.author.name, d.tweet.author.handle),
    handle: `@${d.tweet.author.handle}`,
    text: d.tweet.text,
    signals: signals.map((x) => ({ w: pct(x.v), hi: x.hi })),
    dot: ROUTE_STYLES[d.route].dot,
    rule: newest ? "border-primary" : "border-border",
    opacity: newest ? 0.3 + 0.7 * phase : 1,
  };
}

function buildColumn(column: Column, now: number, running: boolean): Brief[] {
  const phase = Math.min(1, (now - column.at) / COLUMN_STEP_MS);
  return column.rows.map((d, i) =>
    buildBrief(d, running && i === 0, i === 0 ? phase : 1),
  );
}

function note(state: RunState) {
  switch (state.status) {
    case "connecting":
    case "reading":
      return `reading ${state.domain} and writing the searches…`;
    case "searching":
      return `searching X with ${state.queries} queries…`;
    case "error":
      return state.message ?? "something went wrong";
    case "stopped":
      return "stopped before the first decision";
    case "done":
      return "X had nothing for these searches this week";
  }
}

function outcome(state: RunState) {
  if (state.status === "stopped") return "stopped — what was scored is kept";
  if (state.status === "error") return "the run ended early";
  if (state.status !== "done") return "";
  if (state.doneReason === "budget") return "stopped at today's budget";
  if (state.doneReason === "exhausted") {
    return `X ran dry at ${comma(state.read)} — that is the whole week`;
  }
  return "finished";
}

/** `now` is the pacing clock (`performance.now`); `wallNow` dates the tweets. */
export function toFrame(state: RunState, now: number, wallNow: number): RunFrame {
  const running = isRunning(state);
  const { costs, tally } = state;
  const total = costs.profile + costs.search + costs.jev;
  const elapsedMs =
    state.startedAt === null ? 0 : (state.endedAt ?? now) - state.startedAt;

  const a = tally["IN THE QUEUE"];
  const b = tally["NEEDS A HUMAN"];
  const share = (n: number) => `${((n / state.target) * 100).toFixed(1)}%`;

  return {
    status: state.status,
    running,
    note: note(state),
    outcome: outcome(state),
    target: comma(state.target),
    read: comma(state.read),
    decisions: comma(state.decided * 5),
    authors: comma(state.authors.size),
    elapsed: (elapsedMs / 1000).toFixed(1),
    cost: `$${total.toFixed(4)}`,
    progress: Math.min(100, Math.round((state.read / state.target) * 100)),
    lead: state.lead && buildLead(state.lead, wallNow),
    colA: buildColumn(state.columns[0], now, running),
    colB: buildColumn(state.columns[1], now, running),
    tally: {
      a,
      b,
      c: comma(tally.ARCHIVED),
      wA: share(a),
      wB: share(b),
    },
    ledger: [
      { k: "site read and profile", v: money(costs.profile) },
      { k: "tweet search", v: money(costs.search) },
      { k: "jev decisions", v: money(costs.jev) },
      // Authors arrive with the search results, so this line stays at zero.
      { k: "author lookups", v: money(0) },
      { k: "drafts written", v: money(0) },
      { k: "sending", v: money(0) },
    ],
    aside: [...state.aside],
    ticker: [...state.ticker],
  };
}
