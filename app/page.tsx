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
          className="flex items-center gap-1.5 font-mono text-[11px] text-ember underline underline-offset-4 transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ember"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-[13px] fill-current"
          >
            <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.05c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.84 2.8 1.31 3.49 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23A11.5 11.5 0 0 1 12 6.9c1.02 0 2.05.14 3.01.42 2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18a4.7 4.7 0 0 1 1.24 3.22c0 4.61-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z" />
          </svg>
          Open source on GitHub <span aria-hidden>↗</span>
        </a>
      </footer>
    </>
  );
}
