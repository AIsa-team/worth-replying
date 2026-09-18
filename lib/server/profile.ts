import "server-only";

import { unstable_cache } from "next/cache";
import type {
  Profile,
  Query,
  SearchPlan,
  SiteRead,
  Tweet,
} from "@/lib/run-types";
import { crawlSite, extractPages, searchTweets } from "./aisa";
import { assertBudget, spend } from "./budget";
import { clipSite, writeProfile, writeQueries } from "./llm";

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 7;

/** Operators every query is sent with. The date window is added at call time. */
const QUERY_FILTER = "-filter:replies min_faves:2 lang:en";

/** The exact string X receives for a query. */
export function searchString(q: string) {
  const since = new Date(Date.now() - WINDOW_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);
  return `${q} ${QUERY_FILTER} since:${since}`;
}

/* ── Step 2a: read the site ──────────────────────────────────────────────── */

export class UnreadableSiteError extends Error {
  constructor(domain: string) {
    super(`Could not read anything from ${domain}.`);
    this.name = "UnreadableSiteError";
  }
}

async function readSite(domain: string): Promise<SiteRead> {
  assertBudget();
  const started = performance.now();

  let { data: pages, cost } = await crawlSite(domain);
  spend(cost);

  // Some sites give a crawler nothing to walk; the homepage alone will do.
  if (pages.length === 0) {
    const homepage = await extractPages([`https://${domain}`]);
    spend(homepage.cost);
    pages = homepage.data;
    cost += homepage.cost;
  }
  if (pages.length === 0) throw new UnreadableSiteError(domain);

  const site = clipSite(pages);
  const written = await writeProfile(domain, site);
  spend(written.cost);

  return {
    profile: written.profile,
    pages: site.length,
    characters: site.reduce((sum, page) => sum + page.content.length, 0),
    seconds: (performance.now() - started) / 1000,
    cost: cost + written.cost,
  };
}

/* ── Step 2b: write the searches ─────────────────────────────────────────── */

/** Turn one page of newest-first results into a rate a person can read. */
function volume(tweets: Tweet[], exhausted: boolean): string {
  if (tweets.length === 0) return "nothing this week";
  if (exhausted) return `${tweets.length} this week`;

  const times = tweets.map((t) => Date.parse(t.createdAt)).filter(Boolean);
  const span = Math.max(Math.max(...times) - Math.min(...times), DAY_MS / 24);
  const perDay = (tweets.length / span) * DAY_MS;

  if (perDay < 1) return `~${Math.max(1, Math.round(perDay * 7))} a week`;
  const step = perDay < 10 ? 1 : perDay < 100 ? 5 : 10;
  return `~${Math.round(perDay / step) * step} a day`;
}

export async function planSearch(profile: Profile): Promise<SearchPlan> {
  assertBudget();
  const written = await writeQueries(profile);
  spend(written.cost);

  // One page per query: enough to measure the rate, and to catch a query
  // that returns nothing before a whole run is spent on it.
  let cost = written.cost;
  const queries = await Promise.all(
    written.queries.map(async ({ q, k }): Promise<Query> => {
      try {
        const sample = await searchTweets(searchString(q));
        spend(sample.cost);
        cost += sample.cost;
        return {
          q,
          k,
          n: volume(sample.data.tweets, sample.data.nextCursor === null),
        };
      } catch (error) {
        console.warn(`Volume sample failed for ${q}:`, error);
        return { q, k, n: "not measured" };
      }
    }),
  );

  return { queries, filter: QUERY_FILTER, cost };
}

/* ── Caching ─────────────────────────────────────────────────────────────── */

/**
 * Reading a site costs a few cents and ten seconds, and the profile and run
 * screens both need the result. Two layers keep it to one read: a promise map
 * so concurrent callers share the read in flight, and Next's data cache so the
 * result outlives this process.
 */
const REVALIDATE_SECONDS = 24 * 60 * 60;

const inflight = globalThis as typeof globalThis & {
  __reads?: Map<string, Promise<SiteRead>>;
  __plans?: Map<string, Promise<SearchPlan>>;
};
const reads = (inflight.__reads ??= new Map());
const plans = (inflight.__plans ??= new Map());

/*
 * `unstable_cache` folds the callback's source text into the key, and the
 * bundler compiles `readSite` differently for pages and for route handlers
 * (its imports get layer-specific names). Passed directly, the profile screen
 * and `/api/run` would each keep a private cache — and the run would search
 * with queries nobody was shown. These one-line wrappers read the same in
 * every bundle; bump the version tag when the work behind them changes.
 */
const cachedRead = unstable_cache(
  (domain: string) => readSite(domain),
  ["site-read-v1"],
  { revalidate: REVALIDATE_SECONDS },
);

// Keyed on the profile itself: a site that reads differently gets new searches.
const cachedPlan = unstable_cache(
  (profile: Profile) => planSearch(profile),
  ["search-plan-v1"],
  { revalidate: REVALIDATE_SECONDS },
);

function shared<T>(
  map: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  let pending = map.get(key);
  if (!pending) {
    pending = load();
    map.set(key, pending);
    // Only the flight is shared here; once it lands, the data cache answers.
    const clear = () => map.delete(key);
    pending.then(clear, clear);
  }
  return pending;
}

export function getSiteRead(domain: string): Promise<SiteRead> {
  return shared(reads, domain, () => cachedRead(domain));
}

export function getSearchPlan(domain: string): Promise<SearchPlan> {
  // The read is awaited out here — a cached function calling another cached
  // function re-runs the inner one, and the site gets read (and paid for) twice.
  return shared(plans, domain, async () =>
    cachedPlan((await getSiteRead(domain)).profile),
  );
}
