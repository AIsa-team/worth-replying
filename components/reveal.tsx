import { cn } from "cn";

/**
 * Staged fade-in. The design cascades the profile fields and then the
 * queries, so each block just declares how late it arrives. Pure CSS —
 * no client JS, and `prefers-reduced-motion` collapses it in globals.css.
 */
function Reveal({
  delay = 0,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { delay?: number }) {
  return (
    <div
      className={cn(
        "animate-in fade-in fill-mode-both duration-700",
        className,
      )}
      style={{ animationDelay: `${delay}ms` }}
      {...props}
    >
      {children}
    </div>
  );
}

export { Reveal };
