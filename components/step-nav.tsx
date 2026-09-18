import Link from "next/link";
import { cn } from "cn";

type Step = {
  n: number;
  label: string;
  /** Steps the run has not reached yet are inert rather than dead links. */
  href?: string;
};

const STEPS: Step[] = [
  { n: 1, label: "DOMAIN", href: "/" },
  { n: 2, label: "PROFILE", href: "/profile" },
  { n: 3, label: "QUERIES", href: "/run" },
  { n: 4, label: "REVIEW" },
  { n: 5, label: "SENT" },
];

/** The five-step run progress bar, underlined in orange at the current step. */
function StepNav({
  current,
  domain,
  className,
}: {
  current: number;
  /** Carried on every link, so stepping back stays on the same company. */
  domain?: string;
  className?: string;
}) {
  const query = domain ? `?domain=${encodeURIComponent(domain)}` : "";

  return (
    <nav
      aria-label="Run progress"
      className={cn(
        "flex shrink-0 items-center overflow-x-auto border-b border-border px-5 md:h-[46px] md:px-10",
        className,
      )}
    >
      {STEPS.map((step, i) => {
        const isCurrent = step.n === current;
        const body = (
          <>
            {step.n} {step.label}
          </>
        );

        return (
          <div key={step.n} className="flex shrink-0 items-center">
            {i > 0 && (
              <span
                aria-hidden
                className="px-4 font-mono text-[11px] text-faint md:px-5"
              >
                —
              </span>
            )}
            {step.href && !isCurrent ? (
              <Link
                href={step.href === "/" ? step.href : step.href + query}
                prefetch={false}
                className="flex h-[46px] items-center font-mono text-[11px] tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground"
              >
                {body}
              </Link>
            ) : (
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex h-[46px] items-center font-mono text-[11px] tracking-[0.1em]",
                  isCurrent
                    ? "border-b-2 border-primary text-foreground"
                    : "text-faint",
                )}
              >
                {body}
              </span>
            )}
          </div>
        );
      })}
      <span className="grow" />
      <span className="hidden shrink-0 pl-6 font-mono text-[11px] whitespace-nowrap text-ember lg:block">
        every decision by jev — 8 in parallel
      </span>
    </nav>
  );
}

export { StepNav };
