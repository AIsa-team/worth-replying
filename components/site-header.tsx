import Link from "next/link";
import Image from "next/image";
import { cn } from "cn";

/**
 * The masthead rule that opens every screen: wordmark on the left, whatever
 * the screen wants to say on the right.
 */
function SiteHeader({ className, children }: React.ComponentProps<"header">) {
  return (
    <header
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-3.5 border-b border-border px-5 py-3 md:h-12 md:flex-nowrap md:py-0 md:px-10",
        className,
      )}
    >
      <div
        className="flex shrink-0 items-center gap-2.5 font-mono text-[11.5px] font-medium tracking-[0.22em] text-foreground"
      >
        <a
          href="https://aisa.one/"
          title="Visit AIsa website"
          className="flex items-center gap-2.5 text-sm tracking-normal transition-colors hover:text-primary"
        >
          <Image
            src="/icon.svg"
            alt=""
            width={83}
            height={98}
            className="h-6 w-auto shrink-0"
          />
          <span>AIsa</span>
        </a>
        <span aria-hidden className="h-[15px] w-px bg-border" />
        <Link href="/" className="transition-colors hover:text-primary">
          WORTH REPLYING
        </Link>
      </div>
      {children}
    </header>
  );
}

/** Hairline tick between two pieces of header metadata. */
function HeaderDivider({ className }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      className={cn(
        "hidden h-[15px] w-px shrink-0 bg-border sm:block",
        className,
      )}
    />
  );
}

/** Small mono metadata, muted by default. */
function HeaderMeta({ className, children }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "hidden font-mono text-[11.5px] text-muted-foreground sm:block",
        className,
      )}
    >
      {children}
    </span>
  );
}

export { SiteHeader, HeaderDivider, HeaderMeta };
