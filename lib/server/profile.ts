import "server-only";

import { type Caller } from "./auth";
import { createHash } from "node:crypto";
import type {
  Profile,
  Query,
  SearchPlan,
  SiteRead,
  Tweet,
} from "@/lib/run-types";
import { AisaError, crawlSite, extractPages, searchTweets } from "./aisa";
import { assertBudget, spend, spendData } from "./budget";
import { clipSite, writeProfile, writeQueries } from "./llm";
import { report, settle } from "./progress";

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

async function readSite(caller: Caller, domain: string): Promise<SiteRead> {
  assertBudget(caller);
  const started = performance.now();

  const crawl = await crawlSite(caller, domain);
  spendData(caller, crawl.cost);
  let pages = crawl.data;

  // Some sites give a crawler nothing to walk; the homepage alone will do.
  if (pages.length === 0) {
    assertBudget(caller);
    const homepage = await extractPages(caller, [`https://${domain}`]);
    spendData(caller, homepage.cost);
    pages = homepage.data;
  }
  if (pages.length === 0) throw new UnreadableSiteError(domain);

  const site = clipSite(pages);
  const sources = site.map((page) => ({
    path: new URL(page.url).pathname,
    characters: page.content.length,
  }));
  report(progressKey(caller, domain), { type: "pages", pages: sources });

  assertBudget(caller);
  const written = await writeProfile(domain, site, (draft) =>
    report(progressKey(caller, domain), { type: "profile", draft }),
  );
  spend(caller, written.cost);

  return {
    profile: written.profile,
    pages: sources,
    characters: sources.reduce((sum, page) => sum + page.characters, 0),
    seconds: (performance.now() - started) / 1000,
    cost: written.cost,
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

export async function planSearch(caller: Caller, profile: Profile, broadcast = true): Promise<SearchPlan> {
  assertBudget(caller);
  const { domain } = profile;
  const written = await writeQueries(profile, (draft) =>
    broadcast && report(progressKey(caller, domain), { type: "queries", draft }),
  );
  spend(caller, written.cost);

  // One page per query: enough to measure the rate, and to catch a query
  // that returns nothing before a whole run is spent on it.
  // Sequential samples stop at the first auth/balance failure, without launching
  // the other paid samples or swallowing the failure as an empty result.
  const queries: Query[] = [];
  for (const [index, { q, k }] of written.queries.entries()) {
    assertBudget(caller);
    let n = "not measured";
    try {
      const sample = await searchTweets(caller, searchString(q));
      spendData(caller, sample.cost);
      n = volume(sample.data.tweets, sample.data.nextCursor === null);
    } catch (error) {
      if (!(error instanceof AisaError) || [401, 402, 403].includes(error.status)) throw error;
    }
    if (broadcast) report(progressKey(caller, domain), { type: "sample", index, n });
    queries.push({ q, k, n });
  }

  return { queries, filter: QUERY_FILTER, cost: written.cost };
}

/* One bounded, process-local cache: no Next persistent cache and no token in
 * keys, settled entries or disk. A login owns its own work, including flights.
 * Entries expire with that short session. Cold instances can repeat work.
 */
type Entry<T> = { expiresAt: number; value: T };
const store = globalThis as typeof globalThis & {
  __callerProfiles?: Map<string, Entry<Promise<SiteRead | SearchPlan>>>;
};
const cache = (store.__callerProfiles ??= new Map());
export function progressKey(caller: Caller, domain: string) { return `${caller.id}:${domain}`; }

function shared<T extends SiteRead | SearchPlan>(caller: Caller, key: string, load: () => Promise<T>, landed: () => void): Promise<T> {
  assertBudget(caller);
  for (const [k, entry] of cache) if (entry.expiresAt <= Date.now()) cache.delete(k);
  const existing = cache.get(key);
  if (existing) return existing.value as Promise<T>;
  // Refuse overflow rather than evict an in-flight request and charge twice.
  if (cache.size >= 256) throw new Error("The website is busy. Please try again later.");
  const pending = load();
  cache.set(key, { expiresAt: caller.expiresAt, value: pending });
  pending.then(landed, () => { cache.delete(key); landed(); });
  return pending;
}

export function getSiteRead(caller: Caller, domain: string): Promise<SiteRead> {
  const key = progressKey(caller, domain);
  return shared(caller, `read:${key}`, () => readSite(caller, domain), () => settle(key, ["pages", "profile"]));
}

export async function getSearchPlan(caller: Caller, domain: string): Promise<SearchPlan> {
  const profile = (await getSiteRead(caller, domain)).profile;
  const key = progressKey(caller, domain);
  const digest = createHash("sha256").update(JSON.stringify(profile)).digest("hex");
  return shared(caller, `plan:${key}:${digest}`, () => planSearch(caller, profile), () => settle(key, ["queries", "sample"]));
}
