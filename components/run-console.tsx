"use client";

import Link from "next/link";
import { cn } from "cn";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { useRun } from "@/components/use-run";
import type { Brief, SignalRow } from "@/lib/run-frame";

function Stat({
  value,
  label,
  accent,
  first,
}: {
  value: string;
  label: string;
  accent?: boolean;
  first?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-px",
        !first && "lg:ml-[22px] lg:border-l lg:border-border lg:pl-[22px]",
      )}
    >
      <span
        className={cn(
          "text-[32px] leading-none font-medium tracking-[-0.03em] tabular-nums md:text-[44px]",
          accent && "text-primary",
        )}
      >
        {value}
      </span>
      <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

/** One typed answer: the value jev returned, plotted against its threshold. */
function SignalTrack({ row }: { row: SignalRow }) {
  return (
    <div className="flex items-center gap-[9px]">
      <span className="w-20 shrink-0 font-mono text-[9px] tracking-[0.08em] text-muted-foreground">
        {row.k}
      </span>
      <span className="w-[54px] shrink-0 text-[13.5px]">{row.v}</span>
      <div className="relative h-3 grow">
        <div className="absolute inset-x-0 top-[5.5px] h-px bg-rule-soft" />
        <div
          className="absolute inset-y-0 w-px bg-dim"
          style={{ left: row.th }}
          aria-hidden
        />
        <div
          className={cn(
            "absolute top-0.5 -ml-1 size-2 rounded-full",
            row.hi ? "bg-primary" : "bg-muted-foreground",
          )}
          style={{ left: row.at }}
        />
      </div>
      <span className="w-[30px] shrink-0 text-right text-[12.5px] tabular-nums text-muted-foreground">
        {row.p}
      </span>
    </div>
  );
}

function BriefCard({ brief }: { brief: Brief }) {
  return (
    <article
      className={cn("flex flex-col gap-1 border-t pt-1.5", brief.rule)}
      style={{ opacity: brief.opacity }}
    >
      <div className="flex items-center gap-1.5">
        <Avatar face={brief.face} px={17} />
        <a
          href={brief.url}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[9.5px] underline-offset-2 hover:underline"
        >
          {brief.handle}
        </a>
        <span className="grow" />
        <span className={cn("size-2 shrink-0 rounded-full", brief.dot)} />
      </div>
      <a
        href={brief.url}
        target="_blank"
        rel="noreferrer"
        className="line-clamp-3 text-[13px] leading-[1.4] transition-colors hover:text-ember"
      >
        {brief.text}
      </a>
      <div className="flex gap-[3px]">
        {brief.signals.map((s, i) => (
          <div key={i} className="h-[3px] grow bg-track">
            <div
              className={cn("h-[3px]", s.hi ? "bg-primary" : "bg-dim")}
              style={{ width: s.w }}
            />
          </div>
        ))}
      </div>
    </article>
  );
}

function SectionLabel({ className, children }: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "font-mono text-[9px] tracking-[0.18em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </h2>
  );
}

function RunConsole({ domain, target }: { domain: string; target: number }) {
  const { frame: f, stop, again } = useRun(domain, target);
  const reviewHref = `/review?${new URLSearchParams({ domain, target: String(target) })}`;

  return (
    <>
      <main className="flex grow flex-col gap-3 px-5 pt-5 md:px-10">
        {/* Run counters */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:flex lg:items-end">
          <Stat first value={f.read} label={`TWEETS READ OF ${f.target}`} />
          <Stat value={f.decisions} label="TYPED DECISIONS BY JEV" />
          <Stat value={f.authors} label="AUTHORS" />
          <Stat value={f.elapsed} label="SECONDS ELAPSED" />
          <Stat value={f.cost} label="SPENT SO FAR" accent />
        </div>

        <div
          className="h-0.5 w-full bg-border"
          role="progressbar"
          aria-label="Tweets read"
          aria-valuenow={f.progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-0.5 bg-primary"
            style={{ width: `${f.progress}%` }}
          />
        </div>

        <div className="grid grow gap-4 pb-6 md:grid-cols-2 xl:grid-cols-[minmax(0,380px)_minmax(0,230px)_minmax(0,230px)_minmax(0,1fr)]">
          {/* The tweet jev is deciding on right now */}
          <section className="flex flex-col gap-[9px] xl:border-r xl:border-border xl:pr-4">
            <div className="flex items-baseline">
              <SectionLabel className="text-ember">
                {f.running ? "JEV IS DECIDING — LIVE" : "JEV'S LAST DECISION"}
              </SectionLabel>
              <span className="grow" />
              {f.lead && (
                <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                  {f.lead.ms} MS
                </span>
              )}
            </div>

            {f.status === "error" && f.lead && (
              <p
                role="alert"
                className="font-mono text-[10px] text-destructive"
              >
                {f.note}
              </p>
            )}

            {f.lead ? (
              <>
                <div className="flex items-center gap-[9px]">
                  <Avatar key={f.lead.face.id} face={f.lead.face} px={30} />
                  <div className="flex flex-col gap-px">
                    <a
                      href={f.lead.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[11.5px] underline-offset-2 hover:underline"
                    >
                      {f.lead.handle}
                    </a>
                    <span className="font-mono text-[9px] text-muted-foreground">
                      {f.lead.meta}
                    </span>
                  </div>
                </div>

                <p className="line-clamp-6 text-[17px] leading-[1.45]">
                  {f.lead.text}
                </p>

                <div className="flex flex-col gap-2 pt-0.5">
                  {f.lead.rows.map((row) => (
                    <SignalTrack key={row.k} row={row} />
                  ))}
                </div>

                <div className="mt-auto flex items-center gap-[9px] pt-3">
                  <span
                    className={cn(
                      "inline-flex rounded-lg border px-[9px] py-1 font-mono text-[9px] tracking-[0.08em]",
                      f.lead.chip,
                    )}
                  >
                    {f.lead.route}
                  </span>
                  <span className="grow" />
                  <span className="font-mono text-[9px] text-muted-foreground">
                    {f.lead.tokens} tokens in — values out
                  </span>
                </div>
              </>
            ) : (
              <p
                role="status"
                className={cn(
                  "text-[17px] leading-[1.45]",
                  f.status === "error"
                    ? "text-destructive"
                    : "text-muted-foreground",
                  f.running && "animate-pulse",
                )}
              >
                {f.note}
              </p>
            )}
          </section>

          {/* Two columns of decisions, newest on top */}
          <section className="flex flex-col gap-2">
            <SectionLabel>JEV JUST DECIDED</SectionLabel>
            {f.colA.map((brief) => (
              <BriefCard key={brief.id} brief={brief} />
            ))}
          </section>

          <section className="flex flex-col gap-2">
            <SectionLabel className="sr-only">More decisions</SectionLabel>
            <span aria-hidden className="hidden h-[13px] xl:block" />
            {f.colB.map((brief) => (
              <BriefCard key={brief.id} brief={brief} />
            ))}
          </section>

          {/* Where everything landed, and what it cost */}
          <section className="flex flex-col gap-[11px] xl:border-l xl:border-border xl:pl-[18px]">
            <div className="flex flex-col gap-[7px]">
              <SectionLabel>WHERE THEY WENT</SectionLabel>
              <div className="flex h-2.5 gap-0.5">
                <div className="bg-primary" style={{ width: f.tally.wA }} />
                <div className="bg-foreground" style={{ width: f.tally.wB }} />
                <div className="grow bg-border" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="size-[7px] rounded-full bg-primary" />
                <span className="grow text-sm">worth replying</span>
                <span className="text-lg font-medium tabular-nums">
                  {f.tally.a}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="size-[7px] rounded-full border-2 border-foreground" />
                <span className="grow text-sm">needs a human</span>
                <span className="text-lg font-medium tabular-nums">
                  {f.tally.b}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="size-[7px] rounded-full bg-faint" />
                <span className="grow text-sm text-muted-foreground">
                  archived
                </span>
                <span className="text-lg font-medium tabular-nums text-muted-foreground">
                  {f.tally.c}
                </span>
              </div>
            </div>

            <div className="h-px w-full bg-border" />

            <div className="flex flex-col gap-1.5">
              <SectionLabel>RUNNING LEDGER</SectionLabel>
              {f.ledger.map((line) => (
                <div
                  key={line.k}
                  className="flex items-baseline gap-[7px] font-mono text-[10px]"
                >
                  <span className="text-muted-foreground">{line.k}</span>
                  <span className="-translate-y-[3px] grow border-b border-dotted border-rule-soft" />
                  <span className="tabular-nums">{line.v}</span>
                </div>
              ))}
              <div className="my-0.5 h-[3px] border-y border-rule" />
              <div className="flex items-baseline">
                <span className="text-sm">so far</span>
                <span className="grow" />
                <span className="text-[22px] font-medium tabular-nums">
                  {f.cost}
                </span>
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-1.5 pt-3">
              <SectionLabel>SET ASIDE FOR A PERSON</SectionLabel>
              {f.aside.map((row) => (
                <div key={row.handle} className="flex items-baseline gap-2">
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                    className="w-24 shrink-0 truncate font-mono text-[10px] underline-offset-2 hover:underline"
                  >
                    {row.handle}
                  </a>
                  <span className="grow text-[12.5px] text-muted-foreground">
                    {row.why}
                  </span>
                  <span className="font-mono text-[10.5px] tabular-nums text-ember">
                    {row.n}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Every author the run has walked past */}
        <div className="flex shrink-0 flex-col gap-1.5 pb-4">
          <div className="rule-strong" />
          <div className="flex items-center gap-3.5">
            <span className="hidden shrink-0 font-mono text-[9px] tracking-[0.14em] text-muted-foreground sm:block">
              EVERYONE WHO CAME PAST
            </span>
            <div className="h-[30px] grow overflow-hidden" aria-hidden>
              <div className="flex h-full w-max items-center gap-1.5 pl-0.5">
                {f.ticker.map((face) => (
                  <a
                    key={face.id}
                    href={face.url}
                    target="_blank"
                    rel="noreferrer"
                    title={face.handle}
                    tabIndex={-1}
                  >
                    <Avatar face={face} px={24} />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="flex shrink-0 flex-wrap items-center gap-4 border-t border-border px-5 py-4 md:h-[76px] md:px-10 md:py-0">
        <Button
          variant="outline"
          onClick={f.running ? stop : again}
          className="h-11 border-foreground px-[18px] font-mono text-xs tracking-[0.1em]"
        >
          {f.running ? "STOP — KEEP WHAT IS SCORED" : "RUN IT AGAIN"}
        </Button>
        <button
          type="button"
          onClick={() => document.documentElement.requestFullscreen?.()}
          className="font-mono text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
        >
          Present — full screen, no chrome
        </button>
        <span className="grow" />
        <p className="hidden font-mono text-[11.5px] text-muted-foreground lg:block">
          {f.outcome || "you can start reading before it finishes"}
        </p>
        {/* Open from the first hit: reading does not stop the run. */}
        {f.tally.a + f.tally.b > 0 ? (
          <Button
            nativeButton={false}
            render={
              <Link href={reviewHref}>REVIEW {f.tally.a} CANDIDATES</Link>
            }
            className="h-[46px] px-[22px] font-mono text-[12.5px] font-medium tracking-[0.12em] tabular-nums"
          />
        ) : (
          <Button
            disabled
            className="h-[46px] px-[22px] font-mono text-[12.5px] font-medium tracking-[0.12em] tabular-nums"
          >
            REVIEW 0 CANDIDATES
          </Button>
        )}
      </footer>
    </>
  );
}

export { RunConsole };
