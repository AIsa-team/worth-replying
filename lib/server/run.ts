import "server-only";

import type { Profile, RunEvent, Tweet } from "@/lib/run-types";
import { searchTweets } from "./aisa";
import { assertBudget, overBudget, spend } from "./budget";
import { decide } from "./jev";
import { getSearchPlan, getSiteRead, planSearch, searchString } from "./profile";

/** Tweets one run reads. The console's "of 1,000" comes from here. */
export const RUN_TARGET = Number(process.env.RUN_TWEET_TARGET ?? 1000);
/** jev calls in flight at once — "8 in parallel" on the step bar. */
const JEV_PARALLEL = 8;
/** If jev fails this many times before succeeding once, it is not the tweets. */
const JEV_FAILURES_FATAL = 8;

export type RunInput = {
  domain: string;
  /** An edited profile; omit to use the one read from the site. */
  profile?: Profile;
  /** Edited queries; omit to use the ones written from the profile. */
  queries?: string[];
  target?: number;
};

/**
 * The whole of step 3 as a stream of events: search X with every query, hand
 * each new tweet to jev, report each decision as it lands. Aborting `signal`
 * stops new work at once; whatever was already scored has already been sent.
 */
export function run(input: RunInput, signal: AbortSignal): AsyncIterable<RunEvent> {
  const events = channel<RunEvent>();
  drive(input, signal, events.push).then(
    (reason) => {
      events.push({ type: "done", reason });
      events.close();
    },
    (error: unknown) => {
      if (!signal.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        events.push({ type: "error", message });
      }
      events.close();
    },
  );
  return events;
}

type Lane = {
  q: string;
  cursor?: string;
  live: boolean;
  busy: boolean;
  accepted: number;
  /** Consecutive pages that held nothing new. */
  stale: number;
};

async function drive(
  input: RunInput,
  outer: AbortSignal,
  emit: (event: RunEvent) => void,
): Promise<"complete" | "exhausted" | "budget"> {
  const { domain } = input;
  const target = Math.max(1, Math.min(input.target ?? RUN_TARGET, RUN_TARGET));

  // Step 2's work, reused from cache when the profile screen already paid for it.
  emit({ type: "reading", domain });
  const read = input.profile ? null : await getSiteRead(domain);
  const profile = input.profile ?? read!.profile;
  const plan = input.queries
    ? null
    : input.profile
      ? await planSearch(profile)
      : await getSearchPlan(domain);
  const queries = input.queries ?? plan!.queries.map((query) => query.q);

  assertBudget();
  emit({
    type: "start",
    domain,
    target,
    handle: profile.handle,
    queries,
    profileCost: (read?.cost ?? 0) + (plan?.cost ?? 0),
  });

  // Anything fatal halts every search and every jev call still in flight.
  const halt = new AbortController();
  const signal = AbortSignal.any([outer, halt.signal]);
  let fatal: unknown;
  const fail = (error: unknown) => {
    fatal ??= error;
    halt.abort();
  };

  /* jev: every accepted tweet, eight at a time */
  const limit = limiter(JEV_PARALLEL);
  const judging: Promise<void>[] = [];
  let decided = 0;
  let failures = 0;

  const judge = (tweet: Tweet) =>
    limit(async () => {
      if (signal.aborted) return;
      try {
        const decision = await decide(profile, tweet, signal);
        spend(decision.cost);
        decided++;
        emit({ type: "decision", ...decision });
      } catch (error) {
        if (signal.aborted) return;
        if (++failures >= JEV_FAILURES_FATAL && decided === 0) return fail(error);
        const reason = error instanceof Error ? error.message : String(error);
        emit({ type: "skipped", id: tweet.id, reason });
      }
    });

  /* search: one page in flight per query, always feeding the emptiest lane */
  const lanes: Lane[] = queries.map((q) => ({
    q,
    live: true,
    busy: false,
    accepted: 0,
    stale: 0,
  }));
  const seen = new Set<string>();
  let accepted = 0;
  let searchError: unknown;
  // Once the target is met, pages still in flight are not worth waiting for.
  const enough = new AbortController();
  const searching = AbortSignal.any([signal, enough.signal]);

  const searcher = async () => {
    while (!signal.aborted && accepted < target && !overBudget()) {
      const lane = lanes
        .filter((l) => l.live && !l.busy)
        .sort((a, b) => a.accepted - b.accepted)[0];
      if (!lane) return;

      lane.busy = true;
      try {
        const page = await searchTweets(searchString(lane.q), {
          cursor: lane.cursor,
          signal: searching,
        });
        spend(page.cost);

        let fresh = 0;
        for (const tweet of page.data.tweets) {
          if (accepted >= target) break;
          if (seen.has(tweet.id)) continue;
          seen.add(tweet.id);
          accepted++;
          lane.accepted++;
          fresh++;
          judging.push(judge(tweet));
        }
        if (accepted >= target) enough.abort();
        emit({
          type: "search",
          query: lanes.indexOf(lane),
          found: page.data.tweets.length,
          fresh,
          cost: page.cost,
        });

        lane.cursor = page.data.nextCursor ?? undefined;
        lane.stale = fresh === 0 ? lane.stale + 1 : 0;
        // Out of pages, or two pages running of tweets another lane already had.
        if (!lane.cursor || lane.stale >= 2) lane.live = false;
      } catch (error) {
        if (searching.aborted) return;
        searchError = error;
        lane.live = false;
      } finally {
        lane.busy = false;
      }
    }
  };

  await Promise.all(lanes.map(searcher));
  await Promise.all(judging);

  if (fatal) throw fatal;
  if (accepted === 0 && searchError) throw searchError;
  if (accepted >= target) return "complete";
  return overBudget() ? "budget" : "exhausted";
}

/* ── Small concurrency tools ─────────────────────────────────────────────── */

/** Run at most `max` tasks at once; the rest wait their turn in order. */
function limiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];

  return async <T>(task: () => Promise<T>): Promise<T> => {
    // A finishing task hands its slot straight to the next in line, so the
    // count never has a gap for a newcomer to slip through.
    if (active >= max) await new Promise<void>((r) => waiting.push(r));
    else active++;
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

/** Many producers, one consumer: push from anywhere, iterate in order. */
function channel<T>() {
  const buffer: T[] = [];
  let wake: (() => void) | null = null;
  let closed = false;

  const notify = () => {
    wake?.();
    wake = null;
  };

  return {
    push(value: T) {
      if (closed) return;
      buffer.push(value);
      notify();
    },
    close() {
      closed = true;
      notify();
    },
    async *[Symbol.asyncIterator]() {
      for (;;) {
        while (buffer.length > 0) yield buffer.shift()!;
        if (closed) return;
        await new Promise<void>((r) => (wake = r));
      }
    },
  };
}
