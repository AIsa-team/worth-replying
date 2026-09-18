"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "cn";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { bare } from "@/lib/decision";
import { ago, comma } from "@/lib/format";
import { chipFor, faceOf, isRunning } from "@/lib/run-frame";
import { currentRun, loadSnapshot, watchRun } from "@/lib/run-store";
import type { Decision, Route } from "@/lib/run-types";

/* ── Where the list comes from ───────────────────────────────────────────── */

type Review = {
  /** `live` follows a run still in memory; `saved` is one restored after a reload. */
  source: "loading" | "live" | "saved" | "none";
  hits: Decision[];
  read: number;
  running: boolean;
};

const REFRESH_MS = 500;

/**
 * The tweets worth answering for `domain`. While the run is still going —
 * stepping here does not stop it — the list keeps growing; after a reload it
 * comes back from the saved snapshot rather than from a new, paid-for run.
 */
function useReview(domain: string): Review {
  const [review, setReview] = useState<Review>({
    source: "loading",
    hits: [],
    read: 0,
    running: false,
  });

  useEffect(() => {
    const unwatch = watchRun();
    let seen = -1;

    const refresh = () => {
      const run = currentRun(domain);
      if (run) {
        if (run.version === seen) return;
        seen = run.version;
        setReview({
          source: "live",
          hits: [...run.state.hits],
          read: run.state.read,
          running: isRunning(run.state),
        });
      } else if (seen === -1) {
        seen = 0;
        const saved = loadSnapshot(domain);
        setReview({
          source: saved ? "saved" : "none",
          hits: saved?.hits ?? [],
          read: saved?.read ?? 0,
          running: false,
        });
      }
    };

    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      clearInterval(timer);
      unwatch();
    };
  }, [domain]);

  return review;
}

/* ── One conversation ────────────────────────────────────────────────────── */

/** X opens its composer already replying to this tweet. */
const replyUrl = (id: string) => `https://x.com/intent/post?in_reply_to=${id}`;

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-muted-foreground">{k}</span> {v}
    </span>
  );
}

function Conversation({ decision }: { decision: Decision }) {
  const { tweet, signals: s, route } = decision;
  const { author } = tweet;
  const age = ago(tweet.createdAt);

  return (
    <article className="flex flex-col gap-3 border-t border-border pt-4">
      <header className="flex items-center gap-3">
        <Avatar face={{ ...faceOf(decision), cls: "" }} px={38} />
        <div className="flex min-w-0 grow flex-col">
          <span className="truncate text-[17px] leading-tight font-medium">
            {author.name}
          </span>
          <span className="truncate font-mono text-[10.5px] text-muted-foreground">
            <a
              href={`https://x.com/${author.handle}`}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:text-foreground hover:underline"
            >
              @{author.handle}
            </a>{" "}
            — {comma(author.followers)} followers{age && ` — ${age}`}
          </span>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-lg border px-[9px] py-1 font-mono text-[9px] tracking-[0.08em]",
            chipFor(route),
          )}
        >
          {route}
        </span>
      </header>

      <p className="line-clamp-[9] text-[17px] leading-[1.45] whitespace-pre-line">
        {tweet.text}
      </p>

      <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] tracking-[0.04em] tabular-nums">
        <Fact k="REPLY VALUE" v={`${(s.val * 3).toFixed(1)} / 3`} />
        <Fact k="PAIN" v={s.painName} />
        <Fact k="IS ICP" v={bare(s.icp)} />
        <Fact k="NEEDS HUMAN" v={bare(s.hum)} />
        <Fact k="INJECTION" v={bare(s.inj)} />
      </p>

      <div className="flex items-center gap-4 pb-1">
        <Button
          nativeButton={false}
          render={
            <a href={replyUrl(tweet.id)} target="_blank" rel="noreferrer">
              REPLY ON X →
            </a>
          }
          className="h-9 px-4 font-mono text-[11px] font-medium tracking-[0.12em]"
        />
        <a
          href={tweet.url}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[11px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
        >
          open the tweet
        </a>
        <span className="grow" />
        <span className="font-mono text-[10px] text-muted-foreground">
          {comma(tweet.likes)} likes — {comma(tweet.replies)} replies
        </span>
      </div>
    </article>
  );
}

/* ── The screen ──────────────────────────────────────────────────────────── */

type Filter = "ALL" | Exclude<Route, "ARCHIVED">;

const FILTERS: Filter[] = ["ALL", "IN THE QUEUE", "NEEDS A HUMAN"];

function ReviewList({ domain, runHref }: { domain: string; runHref: string }) {
  const review = useReview(domain);
  const [filter, setFilter] = useState<Filter>("ALL");

  const counts: Record<Filter, number> = {
    ALL: review.hits.length,
    "IN THE QUEUE": review.hits.filter((d) => d.route === "IN THE QUEUE")
      .length,
    "NEEDS A HUMAN": review.hits.filter((d) => d.route === "NEEDS A HUMAN")
      .length,
  };

  // Best opening first; between equals, the larger audience.
  const shown = useMemo(
    () =>
      review.hits
        .filter((d) => filter === "ALL" || d.route === filter)
        .sort(
          (a, b) =>
            b.signals.val - a.signals.val ||
            b.tweet.author.followers - a.tweet.author.followers,
        ),
    [review.hits, filter],
  );

  return (
    <>
      <main className="flex grow flex-col gap-5 px-5 pt-6 md:px-10">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-[28px] font-medium tracking-[-0.02em] md:text-[34px]">
            {review.source === "loading" ? (
              <>&nbsp;</>
            ) : (
              <>
                <span className="text-primary tabular-nums">
                  {review.hits.length}
                </span>{" "}
                {review.hits.length === 1 ? "conversation" : "conversations"}{" "}
                worth answering
              </>
            )}
          </h1>
          <p className="font-mono text-[11.5px] tabular-nums text-muted-foreground">
            {review.source !== "loading" &&
              review.source !== "none" &&
              `out of ${comma(review.read)} tweets read`}
            {review.running && (
              <span className="animate-pulse text-ember">
                {" "}
                — still reading, more will arrive
              </span>
            )}
          </p>
        </div>

        <div className="rule-strong" />

        {review.source === "none" ? (
          <p className="text-[17px] leading-[1.45] text-muted-foreground">
            There is no run for {domain} in this tab yet. Start one and come
            back — the list fills in while it is still reading.
          </p>
        ) : (
          <>
            <div
              role="tablist"
              aria-label="Which conversations to show"
              className="flex flex-wrap items-center gap-x-6 gap-y-2"
            >
              {FILTERS.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={filter === name}
                  onClick={() => setFilter(name)}
                  className={cn(
                    "border-b-2 pb-1 font-mono text-[11px] tracking-[0.1em] tabular-nums transition-colors",
                    filter === name
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {name} — {counts[name]}
                </button>
              ))}
              <span className="grow" />
              <span className="font-mono text-[10.5px] text-muted-foreground">
                best opening first
              </span>
            </div>

            <div className="grid gap-x-12 gap-y-6 pb-8 lg:grid-cols-2">
              {shown.map((decision) => (
                <Conversation key={decision.tweet.id} decision={decision} />
              ))}
            </div>

            {shown.length === 0 && review.source !== "loading" && (
              <p className="text-[17px] leading-[1.45] text-muted-foreground">
                {review.running
                  ? "Nothing here yet — jev is still deciding."
                  : "Nothing landed here on this run."}
              </p>
            )}
          </>
        )}
      </main>

      <footer className="flex shrink-0 flex-wrap items-center gap-4 border-t border-border px-5 py-4 md:h-[76px] md:px-10 md:py-0">
        <p className="text-[17px]">
          Replying opens X&apos;s composer, already addressed to the tweet — you
          write it, you send it.
        </p>
        <span className="grow" />
        <p className="hidden font-mono text-[11.5px] text-muted-foreground lg:block">
          nothing has been posted, and nothing will be
        </p>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={runHref}>BACK TO THE RUN</Link>}
          className="h-11 border-foreground px-[18px] font-mono text-xs tracking-[0.1em]"
        />
      </footer>
    </>
  );
}

export { ReviewList };
