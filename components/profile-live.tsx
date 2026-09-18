"use client";

import { useEffect, useReducer, useState } from "react";
import Link from "next/link";
import { cn } from "cn";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { comma } from "@/lib/format";
import { postNdjson } from "@/lib/ndjson";
import type {
  PageRead,
  ProfileDraft,
  ProfileEvent,
  SearchPlan,
  SiteRead,
} from "@/lib/run-types";

/* ── The stream, folded into state ───────────────────────────────────────── */

type Live = {
  pages: PageRead[] | null;
  draft: ProfileDraft | null;
  read: SiteRead | null;
  queries: ({ q?: string; k?: string } | undefined)[];
  samples: Record<number, string>;
  plan: SearchPlan | null;
  error: string | null;
};

const EMPTY: Live = {
  pages: null,
  draft: null,
  read: null,
  queries: [],
  samples: {},
  plan: null,
  error: null,
};

function fold(live: Live, event: ProfileEvent): Live {
  switch (event.type) {
    case "pages":
      return { ...live, pages: event.pages };
    case "profile":
      return { ...live, draft: event.draft };
    case "read":
      return { ...live, read: event.read, pages: event.read.pages };
    case "queries":
      return { ...live, queries: event.draft };
    case "sample":
      return { ...live, samples: { ...live.samples, [event.index]: event.n } };
    case "plan":
      return { ...live, plan: event.plan };
    case "error":
      return { ...live, error: event.message };
  }
}

/** Results this quick came from cache — nothing was watched being written. */
const INSTANT_MS = 700;

/**
 * Follows `/api/profile/stream` for `domain` (the screen is keyed on it, so a
 * new domain starts from a fresh mount). `seconds` ticks while the site
 * is being read and stops for good once the read lands; `instant` says the
 * whole thing arrived at once, so the screen should stage its own entrance.
 */
function useProfileStream(domain: string) {
  const [live, dispatch] = useReducer(fold, EMPTY);
  const [seconds, setSeconds] = useState(0);
  const [instant, setInstant] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const startedAt = performance.now();
    let reading = true;

    const clock = setInterval(() => {
      if (reading) setSeconds((performance.now() - startedAt) / 1000);
    }, 100);
    const stopClock = () => {
      reading = false;
      clearInterval(clock);
    };

    const onEvent = (event: ProfileEvent) => {
      if (event.type === "read") {
        stopClock();
        setInstant(performance.now() - startedAt < INSTANT_MS);
      }
      if (event.type === "error") stopClock();
      dispatch(event);
    };

    // Deferred a tick so Strict Mode's throwaway first mount never connects.
    const begin = setTimeout(() => {
      postNdjson<ProfileEvent>(
        "/api/profile/stream",
        { domain },
        controller.signal,
        onEvent,
      ).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : String(error);
        onEvent({ type: "error", message });
      });
    }, 0);

    return () => {
      clearTimeout(begin);
      stopClock();
      controller.abort();
    };
  }, [domain]);

  return { live, seconds, instant };
}

/* ── Small pieces ────────────────────────────────────────────────────────── */

/** Left-hand label column: mono caps, fixed width so values line up. */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 font-mono text-[9.5px] tracking-[0.14em] text-muted-foreground sm:w-[116px]">
      {children}
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <Badge
      variant="outline"
      className="h-[30px] rounded-full bg-card px-[13px] text-base font-normal"
    >
      {children}
    </Badge>
  );
}

/** The cursor at the end of whatever the model is writing right now. */
function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-[0.95em] w-[2px] translate-y-[0.12em] animate-pulse bg-primary"
    />
  );
}

/** What a section says while the work behind it is still going on. */
function Working({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="animate-pulse text-[17px] leading-[1.45] text-muted-foreground"
    >
      {children}
    </p>
  );
}

function ChipRow({
  label,
  items,
  writing,
  delay,
}: {
  label: string;
  items: string[];
  writing: boolean;
  delay: number;
}) {
  if (items.length === 0) return null;
  return (
    <Reveal delay={delay} className="flex flex-col gap-2 sm:flex-row sm:gap-5">
      <FieldLabel>
        <span className="sm:inline-block sm:pt-1.5">{label}</span>
      </FieldLabel>
      <div className="flex grow flex-wrap gap-[7px]">
        {items.map((item, i) => (
          <Chip key={i}>
            {item}
            {writing && i === items.length - 1 && <Caret />}
          </Chip>
        ))}
      </div>
    </Reveal>
  );
}

const present = (value: string | undefined): value is string => Boolean(value);

/* ── The screen ──────────────────────────────────────────────────────────── */

function ProfileLive({ domain, target }: { domain: string; target: number }) {
  const { live, seconds, instant } = useProfileStream(domain);
  const { pages, read, plan, error } = live;

  // The finished profile once there is one; until then, whatever is written.
  const whatYouDo = read?.profile.whatYouDo ?? live.draft?.whatYouDo ?? "";
  const whoBuysIt =
    read?.profile.whoBuysIt ?? live.draft?.whoBuysIt?.filter(present) ?? [];
  const whatHurts =
    read?.profile.whatHurts.map((pain) => pain.label) ??
    live.draft?.whatHurts?.map((pain) => pain?.label).filter(present) ??
    [];
  const whoElse =
    read?.profile.whoElse ?? live.draft?.whoElse?.filter(present) ?? [];

  // The caret sits on the last field to have anything in it.
  const writing = !read && !error;
  const active = whoElse.length
    ? "whoElse"
    : whatHurts.length
      ? "whatHurts"
      : whoBuysIt.length
        ? "whoBuysIt"
        : "whatYouDo";

  const queries = plan
    ? plan.queries
    : live.queries.map((query, i) => ({
        q: query?.q ?? "",
        k: query?.k ?? "",
        n: live.samples[i] ?? "",
      }));
  // The volume samples only start once the last query is written.
  const sampling = Object.keys(live.samples).length > 0;
  const writingQueries = Boolean(read) && !plan && !error && !sampling;

  // A cached result arrives whole, so it gets the staged entrance instead.
  const stagger = (ms: number) => (instant ? ms : 0);
  const characters = pages?.reduce((sum, page) => sum + page.characters, 0);

  return (
    <>
      <main className="flex grow flex-col gap-5 px-5 pt-6 md:px-10">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-[28px] font-medium tracking-[-0.02em] md:text-[34px]">
            {domain}
          </h1>
          <p className="font-mono text-[11.5px] tabular-nums text-muted-foreground">
            {read ? (
              <>
                read {read.pages.length}{" "}
                {read.pages.length === 1 ? "page" : "pages"} —{" "}
                {comma(read.characters)} characters — {read.seconds.toFixed(1)}s
              </>
            ) : error ? null : pages ? (
              <>
                read {pages.length} {pages.length === 1 ? "page" : "pages"} —{" "}
                {comma(characters ?? 0)} characters — writing the profile —{" "}
                {seconds.toFixed(1)}s
              </>
            ) : (
              <>reading the site — {seconds.toFixed(1)}s</>
            )}
          </p>
          <span className="grow" />
          {read && (
            <p className="font-mono text-[11.5px] tabular-nums text-muted-foreground">
              ${(read.cost + (plan?.cost ?? 0)).toFixed(2)} spent so far
            </p>
          )}
        </div>

        <div className="rule-strong" />

        <div className="grid grow gap-10 pb-8 lg:grid-cols-[minmax(0,760px)_minmax(0,1fr)]">
          {/* 1 — what it worked out from the site alone */}
          <section className="flex flex-col gap-[18px]">
            <div className="flex items-baseline gap-3">
              <h2 className="font-mono text-[10px] tracking-[0.18em] text-ember">
                1 — WHAT IT WORKED OUT ABOUT YOU
              </h2>
              <span className="grow" />
              <span className="font-mono text-[10px] text-muted-foreground">
                from the site alone
              </span>
            </div>

            {error ? (
              <p
                role="alert"
                className="text-[17px] leading-[1.45] text-destructive"
              >
                {error}
              </p>
            ) : !whatYouDo ? (
              <Working>
                {pages
                  ? "writing the profile…"
                  : `reading ${domain}, a few pages deep…`}
              </Working>
            ) : (
              <>
                <Reveal
                  delay={stagger(80)}
                  className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-5"
                >
                  <FieldLabel>WHAT YOU DO</FieldLabel>
                  <p className="grow text-xl leading-[1.35] md:text-[23px]">
                    {whatYouDo}
                    {writing && active === "whatYouDo" && <Caret />}
                  </p>
                </Reveal>

                <ChipRow
                  label="WHO BUYS IT"
                  items={whoBuysIt}
                  writing={writing && active === "whoBuysIt"}
                  delay={stagger(220)}
                />
                <ChipRow
                  label="WHAT HURTS"
                  items={whatHurts}
                  writing={writing && active === "whatHurts"}
                  delay={stagger(360)}
                />

                {(whoElse.length > 0 || read) && (
                  <Reveal
                    delay={stagger(500)}
                    className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-5"
                  >
                    <FieldLabel>WHO ELSE</FieldLabel>
                    <p className="grow text-[17px]">
                      {whoElse.join(" · ") || "nobody it could name"}
                      {writing && active === "whoElse" && <Caret />}
                    </p>
                  </Reveal>
                )}
              </>
            )}

            <div className="mt-auto flex flex-col gap-[18px]">
              {/* The pages behind the profile, as soon as they are in hand */}
              {pages && (
                <div className="flex flex-col gap-1.5">
                  <h3 className="font-mono text-[9px] tracking-[0.18em] text-muted-foreground">
                    PAGES READ
                  </h3>
                  {pages.map((page, i) => (
                    <Reveal
                      key={page.path}
                      delay={stagger(620) + i * 90}
                      className="flex items-baseline gap-[7px] font-mono text-[10px]"
                    >
                      <span className="max-w-[70%] truncate">{page.path}</span>
                      <span className="-translate-y-[3px] grow border-b border-dotted border-rule-soft" />
                      <span className="tabular-nums text-muted-foreground">
                        {comma(page.characters)}
                      </span>
                    </Reveal>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-2 border-l-2 border-primary bg-accent px-4 py-[13px] sm:flex-row sm:items-baseline sm:gap-4">
                <span className="shrink-0 font-mono text-[9.5px] tracking-[0.14em] text-ember">
                  EDITABLE
                </span>
                <p className="grow text-[15.5px] leading-[1.5]">
                  Change any line here and the searches below rewrite
                  themselves. Most bad results trace back to this block, not to
                  the model.
                </p>
              </div>
            </div>
          </section>

          {/* 2 — the searches it wrote for itself off that profile */}
          <section className="flex flex-col gap-3.5">
            <div className="flex items-baseline gap-3">
              <h2 className="font-mono text-[10px] tracking-[0.18em] text-ember">
                2 — HOW IT WILL GO LOOKING
              </h2>
              <span className="grow" />
              <span className="font-mono text-[10px] text-muted-foreground">
                it wrote these itself
              </span>
            </div>

            {queries.length === 0 && !error && (
              <Working>
                {read ? "writing the searches…" : "first the profile…"}
              </Working>
            )}

            <ul className="flex flex-col gap-3.5">
              {queries.map((query, i) => {
                const last = i === queries.length - 1;
                return (
                  <li key={i}>
                    <Reveal
                      delay={stagger(i * 120)}
                      className="flex flex-col gap-[5px] border-t border-border pt-[11px]"
                    >
                      <code className="font-mono text-[11.5px] leading-[1.5] break-words text-foreground">
                        {query.q}
                        {writingQueries && last && !query.k && <Caret />}
                      </code>
                      <div className="flex min-h-5 items-baseline gap-2.5">
                        <span className="grow text-sm text-muted-foreground">
                          {query.k}
                          {writingQueries && last && query.k && <Caret />}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 font-mono text-[11px] text-muted-foreground",
                            !query.n && "animate-pulse",
                          )}
                        >
                          {query.n ||
                            (query.k && (!last || sampling)
                              ? "measuring…"
                              : "")}
                        </span>
                      </div>
                    </Reveal>
                  </li>
                );
              })}
            </ul>

            {plan && (
              <Reveal
                delay={stagger(plan.queries.length * 120 + 120)}
                className="mt-auto border-t border-border pt-[11px] font-mono text-[10.5px] leading-[1.8] text-muted-foreground"
              >
                applied to all: {plan.filter} — last 7 days
              </Reveal>
            )}
          </section>
        </div>
      </main>

      <footer className="flex shrink-0 flex-wrap items-center gap-4 border-t border-border px-5 py-4 md:h-[76px] md:px-10 md:py-0">
        <p className="text-[17px]">
          About <strong className="font-medium">{comma(target)}</strong> tweets,
          roughly a minute, <strong className="font-medium">$0.05</strong> to{" "}
          <strong className="font-medium">$0.10</strong>.
        </p>
        <span className="grow" />
        <p className="hidden font-mono text-[11.5px] text-muted-foreground lg:block">
          nothing has been posted, and nothing will be
        </p>
        {plan ? (
          <Button
            nativeButton={false}
            render={
              <Link
                href={`/run?domain=${encodeURIComponent(domain)}`}
                prefetch={false}
              >
                FIND THE CONVERSATIONS
              </Link>
            }
            className="h-12 px-6 font-mono text-[13px] font-medium tracking-[0.12em]"
          />
        ) : (
          // Nothing to go looking with until the searches are written.
          <Button
            disabled
            className="h-12 px-6 font-mono text-[13px] font-medium tracking-[0.12em]"
          >
            FIND THE CONVERSATIONS
          </Button>
        )}
      </footer>
    </>
  );
}

export { ProfileLive };
