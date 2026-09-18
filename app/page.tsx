import { DomainForm } from "@/components/domain-form";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <>
      <SiteHeader>
        <span className="grow" />
        <span className="hidden font-mono text-[10.5px] tracking-[0.08em] text-ember md:block">
          EVERY DECISION BY JEV — TYPESAFE&apos;S SYSTEM ONE MODEL
        </span>
      </SiteHeader>

      <main className="flex grow flex-col items-center justify-center gap-8 px-5 py-16 md:gap-[34px] md:px-10">
        <div className="flex flex-col items-center gap-4">
          <p className="text-center font-mono text-[11px] tracking-[0.22em] text-ember">
            NO KEYWORDS — NO FORMS — NOTHING TO SET UP
          </p>
          <h1 className="text-center text-[clamp(2.75rem,8vw,76px)] leading-none font-normal tracking-[-0.03em]">
            Give it a domain.
          </h1>
          <p className="max-w-[660px] text-center text-lg leading-[1.55] text-muted-foreground md:text-xl">
            It reads your site, works out who you are for, then reads X and
            comes back with the handful of conversations worth answering.
          </p>
        </div>

        <DomainForm />

        <div className="flex w-full max-w-[660px] flex-col gap-[9px] pt-1">
          <div className="rule-strong" />
          <div className="flex flex-wrap items-baseline gap-x-[9px] gap-y-1">
            <span className="text-3xl font-medium tracking-[-0.02em] md:text-[40px]">
              1,000
            </span>
            <span className="text-[17px] text-muted-foreground">
              tweets read in
            </span>
            <span className="text-3xl font-medium tracking-[-0.02em] text-primary md:text-[40px]">
              58s
            </span>
            <span className="text-[17px] text-muted-foreground">for</span>
            <span className="text-3xl font-medium tracking-[-0.02em] md:text-[40px]">
              $0.03
            </span>
          </div>
          <p className="font-mono text-[10.5px] tracking-[0.1em] text-muted-foreground">
            LAST RUN ON AISA.ONE — 18 SEP 2026
          </p>
        </div>
      </main>

      <footer className="flex shrink-0 flex-col items-center gap-3 px-5 pb-7 md:px-10">
        <p className="max-w-[820px] text-center font-mono text-[11px] leading-[1.7] text-muted-foreground">
          The call on each tweet is made by{" "}
          <span className="text-ember">jev</span>: five typed questions in one
          request, each with a calibrated probability, in 70 to 500 milliseconds
          — values, never sentences.
        </p>
        <a
          href="https://github.com/AIsa-team/worth-replying"
          className="font-mono text-[11px] text-ember underline underline-offset-4 transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ember"
        >
          Open source on GitHub <span aria-hidden>↗</span>
        </a>
      </footer>
    </>
  );
}
