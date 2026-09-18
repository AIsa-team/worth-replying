import "server-only";

import type { Tweet } from "@/lib/run-types";

/**
 * AIsa data APIs — https://aisa.one/docs/api-reference. One Bearer key covers
 * every endpoint; each response reports what it cost in a header, so callers
 * get the real charge back instead of an estimate.
 */
const BASE_URL = "https://api.aisa.one/apis/v1";
const COST_HEADER = "x-aisa-customer-cost-micros-usd";
const RETRIES = 2;

export class AisaError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AisaError";
  }
}

type CallOptions = {
  method?: "GET" | "POST";
  query?: Record<string, string | undefined>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
};

type Costed<T> = { data: T; cost: number };

async function call<T>(
  path: string,
  { method = "GET", query, body, signal, timeoutMs = 30_000 }: CallOptions,
): Promise<Costed<T>> {
  const key = process.env.AISA_API_KEY;
  if (!key) throw new AisaError(500, "AISA_API_KEY is not set");

  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, v);
  }

  for (let attempt = 0; ; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: "no-store",
    });

    if (res.ok) {
      const micros = Number(res.headers.get(COST_HEADER) ?? 0);
      return { data: (await res.json()) as T, cost: micros / 1_000_000 };
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < RETRIES) {
      await res.body?.cancel();
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
      continue;
    }
    const detail = (await res.text()).slice(0, 300);
    throw new AisaError(res.status, `AIsa ${path} → ${res.status}: ${detail}`);
  }
}

/* ── Website ─────────────────────────────────────────────────────────────── */

export type SitePage = { url: string; content: string };

type CrawlResponse = {
  results?: { url: string; raw_content?: string | null }[];
};

type ExtractResponse = {
  results?: { url: string; raw_content?: string | null }[];
  failed_results?: unknown[];
};

/** Walk a site from its root and return the pages worth reading. */
export async function crawlSite(
  domain: string,
  { limit = 5, signal }: { limit?: number; signal?: AbortSignal } = {},
): Promise<Costed<SitePage[]>> {
  const { data, cost } = await call<CrawlResponse>("/tavily/crawl", {
    method: "POST",
    body: {
      url: `https://${domain}`,
      instructions:
        "Pages that explain what the product does, who it is for, pricing, use cases and how it compares to alternatives",
      max_depth: 1,
      limit,
      allow_external: false,
      format: "markdown",
    },
    signal,
    timeoutMs: 60_000,
  });
  return { data: toPages(data.results), cost };
}

/** Fetch pages you can already name. Cheaper than a crawl. */
export async function extractPages(
  urls: string[],
  { signal }: { signal?: AbortSignal } = {},
): Promise<Costed<SitePage[]>> {
  const { data, cost } = await call<ExtractResponse>("/tavily/extract", {
    method: "POST",
    body: { urls, format: "markdown" },
    signal,
    timeoutMs: 45_000,
  });
  return { data: toPages(data.results), cost };
}

function toPages(results: CrawlResponse["results"]): SitePage[] {
  return (results ?? [])
    .map((r) => ({ url: r.url, content: (r.raw_content ?? "").trim() }))
    .filter((p) => p.content.length > 0);
}

/* ── X / Twitter ─────────────────────────────────────────────────────────── */

type RawTweet = {
  id: string;
  url?: string;
  text?: string;
  createdAt?: string;
  likeCount?: number;
  replyCount?: number;
  isReply?: boolean;
  author?: {
    userName?: string;
    name?: string;
    description?: string;
    followers?: number;
  };
};

type SearchResponse = {
  tweets?: RawTweet[];
  has_next_page?: boolean;
  next_cursor?: string;
};

/** X dates arrive as "Fri Sep 18 04:02:35 +0000 2026". */
function toIso(value: string | undefined) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? "" : new Date(time).toISOString();
}

export type TweetPage = {
  tweets: Tweet[];
  /** Null once the search has nothing further to give. */
  nextCursor: string | null;
};

/**
 * One page (about 20 tweets) of X advanced search, newest first. `query` takes
 * X's own operators — `"quoted phrase"`, `OR`, `min_faves:`, `since:`.
 */
export async function searchTweets(
  query: string,
  { cursor, signal }: { cursor?: string; signal?: AbortSignal } = {},
): Promise<Costed<TweetPage>> {
  const { data, cost } = await call<SearchResponse>(
    "/twitter/tweet/advanced_search",
    { query: { query, queryType: "Latest", cursor }, signal, timeoutMs: 20_000 },
  );

  const tweets = (data.tweets ?? []).flatMap((t) => {
    const handle = t.author?.userName;
    if (!t.id || !t.text || !handle) return [];
    // The filter already excludes these; the API does not always agree.
    if (t.isReply || t.text.startsWith("RT @")) return [];
    return [
      {
        id: t.id,
        url: t.url ?? `https://x.com/${handle}/status/${t.id}`,
        text: t.text,
        createdAt: toIso(t.createdAt),
        likes: t.likeCount ?? 0,
        replies: t.replyCount ?? 0,
        author: {
          handle,
          name: t.author?.name ?? handle,
          bio: t.author?.description ?? "",
          followers: t.author?.followers ?? 0,
        },
      } satisfies Tweet,
    ];
  });

  return {
    data: {
      tweets,
      nextCursor:
        data.has_next_page && data.next_cursor ? data.next_cursor : null,
    },
    cost,
  };
}
