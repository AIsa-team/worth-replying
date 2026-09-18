"use client";

import { useState } from "react";
import { cn } from "cn";
import type { Face } from "@/lib/run-frame";

/** X serves `_normal` at 48px; `_bigger` is 73px, enough for retina at 30. */
function sized(src: string, px: number) {
  return px > 24 ? src.replace(/_normal(\.\w+)$/, "_bigger$1") : src;
}

/**
 * An author's picture, with their initials underneath — so a missing or
 * blocked image degrades to the initials disc rather than a broken icon.
 */
function Avatar({
  face,
  px,
  className,
}: {
  face: Face;
  px: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const showImage = face.src && !broken;

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary font-mono text-muted-foreground",
        face.cls,
        className,
      )}
      style={{ width: px, height: px, fontSize: Math.max(7, px / 3) }}
    >
      {face.ini}
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element -- tiny remote avatars; the optimizer adds nothing here
        <img
          src={sized(face.src, px)}
          alt=""
          width={px}
          height={px}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  );
}

export { Avatar };
