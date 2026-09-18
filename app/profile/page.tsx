import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DEFAULT_DOMAIN, parseDomain } from "@/lib/domain";
import { comma } from "@/lib/format";
import { explain } from "@/lib/server/http";
import { getSearchPlan, getSiteRead } from "@/lib/server/profile";
import { RUN_TARGET } from "@/lib/server/run";

export const metadata = {
  title: "Profile — Worth Replying",
};

// Reading a site and writing its searches takes longer than the default allows.
export const maxDuration = 120;

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

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-[17px] leading-[1.45] text-destructive">
      {children}
    </p>
  );
}

/*
 * The page streams in the order the work finishes: the site read lands first
 * and fills section 1, the searches land a few seconds later and fill
 * section 2. Each piece below awaits only what it prints, and catches its own
 * failure so the rest of the page still stands.
 */

async function ReadLine({ domain }: { domain: string }) {
  const read = await getSiteRead(domain).catch(() => null);
  if (!read) return null;
  return (
    <Reveal>
      read {read.pages} {read.pages === 1 ? "page" : "pages"} —{" "}
      {comma(read.characters)} characters — {read.seconds.toFixed(1)}s
    </Reveal>
  );
}

async function SpentLine({ domain }: { domain: string }) {
  const spent = await Promise.all([
    getSiteRead(domain),
    getSearchPlan(domain),
  ]).catch(() => null);
  if (!spent) return null;
  const [read, plan] = spent;
  return <Reveal>${(read.cost + plan.cost).toFixed(2)} spent so far</Reveal>;
}

async function ProfileFields({ domain }: { domain: string }) {
  let profile;
  try {
    ({ profile } = await getSiteRead(domain));
  } catch (error) {
    return <Problem>{explain(error)}</Problem>;
  }

  return (
    <>
      <Reveal
        delay={80}
        className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-5"
      >
        <FieldLabel>WHAT YOU DO</FieldLabel>
        <p className="grow text-xl leading-[1.35] md:text-[23px]">
          {profile.whatYouDo}
        </p>
      </Reveal>

      <Reveal delay={220} className="flex flex-col gap-2 sm:flex-row sm:gap-5">
        <FieldLabel>
          <span className="sm:inline-block sm:pt-1.5">WHO BUYS IT</span>
        </FieldLabel>
        <div className="flex grow flex-wrap gap-[7px]">
          {profile.whoBuysIt.map((item) => (
            <Chip key={item}>{item}</Chip>
          ))}
        </div>
      </Reveal>

      <Reveal delay={360} className="flex flex-col gap-2 sm:flex-row sm:gap-5">
        <FieldLabel>
          <span className="sm:inline-block sm:pt-1.5">WHAT HURTS</span>
        </FieldLabel>
        <div className="flex grow flex-wrap gap-[7px]">
          {profile.whatHurts.map((pain) => (
            <Chip key={pain.key}>{pain.label}</Chip>
          ))}
        </div>
      </Reveal>

      <Reveal
        delay={500}
        className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-5"
      >
        <FieldLabel>WHO ELSE</FieldLabel>
        <p className="grow text-[17px]">
          {profile.whoElse.join(" · ") || "nobody it could name"}
        </p>
      </Reveal>
    </>
  );
}

async function QueryList({ domain }: { domain: string }) {
  let plan;
  try {
    plan = await getSearchPlan(domain);
  } catch (error) {
    // When the read itself failed, section 1 has already said so.
    const readFailed = await getSiteRead(domain).then(
      () => false,
      () => true,
    );
    return readFailed ? null : <Problem>{explain(error)}</Problem>;
  }

  return (
    <>
      <ul className="flex flex-col gap-3.5">
        {plan.queries.map((query, i) => (
          <li key={query.q}>
            <Reveal
              delay={i * 120}
              className="flex flex-col gap-[5px] border-t border-border pt-[11px]"
            >
              <code className="font-mono text-[11.5px] leading-[1.5] break-words text-foreground">
                {query.q}
              </code>
              <div className="flex items-baseline gap-2.5">
                <span className="grow text-sm text-muted-foreground">
                  {query.k}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {query.n}
                </span>
              </div>
            </Reveal>
          </li>
        ))}
      </ul>

      <Reveal
        delay={plan.queries.length * 120 + 120}
        className="mt-auto border-t border-border pt-[11px] font-mono text-[10.5px] leading-[1.8] text-muted-foreground"
      >
        applied to all: {plan.filter} — last 7 days
      </Reveal>
    </>
  );
}

export default async function ProfilePage({
  searchParams,
}: PageProps<"/profile">) {
  const { domain } = await searchParams;
  const host = parseDomain(domain ?? DEFAULT_DOMAIN);
  if (!host) redirect("/");

  return (
    <>
      <SiteHeader>
        <span className="grow" />
        <span className="hidden font-mono text-[10.5px] tracking-[0.08em] text-ember md:block">
          EVERY DECISION BY JEV — TYPESAFE&apos;S SYSTEM ONE MODEL
        </span>
      </SiteHeader>

      <main className="flex grow flex-col gap-5 px-5 pt-6 md:px-10">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-[28px] font-medium tracking-[-0.02em] md:text-[34px]">
            {host}
          </h1>
          <div className="font-mono text-[11.5px] text-muted-foreground">
            <Suspense fallback={<span className="animate-pulse">reading…</span>}>
              <ReadLine domain={host} />
            </Suspense>
          </div>
          <span className="grow" />
          <div className="font-mono text-[11.5px] text-muted-foreground">
            <Suspense>
              <SpentLine domain={host} />
            </Suspense>
          </div>
        </div>

        <div className="rule-strong" />

        <div className="grid grow gap-10 pb-8 lg:grid-cols-[minmax(0,760px)_minmax(0,1fr)]">
          {/* 1 — what the crawler worked out from the site alone */}
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

            <Suspense
              fallback={<Working>reading {host}, a few pages deep…</Working>}
            >
              <ProfileFields domain={host} />
            </Suspense>

            <div className="mt-auto flex flex-col gap-2 border-l-2 border-primary bg-accent px-4 py-[13px] sm:flex-row sm:items-baseline sm:gap-4">
              <span className="shrink-0 font-mono text-[9.5px] tracking-[0.14em] text-ember">
                EDITABLE
              </span>
              <p className="grow text-[15.5px] leading-[1.5]">
                Change any line here and the searches below rewrite themselves.
                Most bad results trace back to this block, not to the model.
              </p>
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

            <Suspense
              fallback={
                <Working>writing the searches, then trying each one…</Working>
              }
            >
              <QueryList domain={host} />
            </Suspense>
          </section>
        </div>
      </main>

      <footer className="flex shrink-0 flex-wrap items-center gap-4 border-t border-border px-5 py-4 md:h-[76px] md:px-10 md:py-0">
        <p className="text-[17px]">
          About <strong className="font-medium">{comma(RUN_TARGET)}</strong>{" "}
          tweets, roughly a minute,{" "}
          <strong className="font-medium">$0.30</strong> to{" "}
          <strong className="font-medium">$0.45</strong>.
        </p>
        <span className="grow" />
        <p className="hidden font-mono text-[11.5px] text-muted-foreground lg:block">
          nothing has been posted, and nothing will be
        </p>
        <Button
          nativeButton={false}
          render={
            <Link
              href={`/run?domain=${encodeURIComponent(host)}`}
              prefetch={false}
            >
              FIND THE CONVERSATIONS
            </Link>
          }
          className="h-12 px-6 font-mono text-[13px] font-medium tracking-[0.12em]"
        />
      </footer>
    </>
  );
}
