"use client";

import { useCallback, useEffect, useState } from "react";
import { advance, createRunState, isRunning, toFrame } from "@/lib/run-frame";
import { ensureRun, restartRun, stopRun, watchRun } from "@/lib/run-store";

/** How often the console repaints. Events arrive far faster than this. */
const PAINT_MS = 100;

/**
 * The frame to draw for `domain`'s run, plus ways to stop it and to run it
 * again. The run itself lives in `run-store` — this joins the one in progress
 * or starts one — and a steady timer turns its state into frames, so a burst
 * of forty decisions a second costs ten renders, not forty.
 */
function useRun(domain: string, target: number) {
  const [frame, setFrame] = useState(() =>
    toFrame(createRunState(domain, target), 0, 0),
  );

  useEffect(() => {
    const unwatch = watchRun();
    let painted = -1;

    const paint = () => {
      // Looked up each time: "run again" swaps the session underneath us.
      const run = ensureRun(domain, target);
      const now = performance.now();
      const moved = advance(run.state, now);
      if (!moved && run.version === painted && !isRunning(run.state)) return;
      painted = run.version;
      setFrame(toFrame(run.state, now, Date.now()));
    };

    paint();
    const timer = setInterval(paint, PAINT_MS);
    return () => {
      clearInterval(timer);
      unwatch();
    };
  }, [domain, target]);

  const again = useCallback(() => {
    restartRun(domain, target);
  }, [domain, target]);

  return { frame, stop: stopRun, again };
}

export { useRun };
