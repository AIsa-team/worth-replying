"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  advance,
  applyEvent,
  createRunState,
  isRunning,
  markStopped,
  toFrame,
  type RunFrame,
  type RunState,
} from "@/lib/run-frame";
import type { RunEvent } from "@/lib/run-types";

/** How often the console repaints. Events arrive far faster than this. */
const PAINT_MS = 100;

/** Read `/api/run`'s newline-delimited JSON, one event per line. */
async function readEvents(
  domain: string,
  target: number,
  signal: AbortSignal,
  onEvent: (event: RunEvent) => void,
) {
  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, target }),
    signal,
  });

  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `The run could not start (${res.status}).`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += value;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (line) onEvent(JSON.parse(line) as RunEvent);
    }
  }
}

/**
 * Starts a run for `domain` on mount and returns the frame to draw, plus a
 * way to stop it. Events fold into a mutable state as they arrive; a steady
 * timer turns that state into frames, so a burst of forty decisions a second
 * costs ten renders, not forty.
 */
function useRun(domain: string, target: number) {
  const [frame, setFrame] = useState<RunFrame>(() =>
    toFrame(createRunState(domain, target), 0, 0),
  );
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    const state: RunState = createRunState(domain, target);
    const controller = new AbortController();
    let dirty = true;

    const paint = () => {
      const now = performance.now();
      const moved = advance(state, now);
      if (!moved && !dirty && !isRunning(state)) return;
      dirty = false;
      setFrame(toFrame(state, now, Date.now()));
    };
    const timer = setInterval(paint, PAINT_MS);

    const fold = (event: RunEvent) => {
      applyEvent(state, event, performance.now());
      dirty = true;
    };

    // Deferred a tick so that Strict Mode's mount–unmount–mount in development
    // cancels the first attempt before it ever reaches the server.
    const begin = setTimeout(() => {
      readEvents(domain, target, controller.signal, fold).then(
        () => {
          // The stream closing without a verdict means the connection dropped.
          if (isRunning(state)) {
            fold({ type: "error", message: "The connection to the run was lost." });
          }
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          const message = error instanceof Error ? error.message : String(error);
          fold({ type: "error", message });
        },
      );
    }, 0);

    stopRef.current = () => {
      controller.abort();
      markStopped(state, performance.now());
      dirty = true;
      paint();
    };

    return () => {
      clearTimeout(begin);
      clearInterval(timer);
      controller.abort();
    };
  }, [domain, target]);

  const stop = useCallback(() => stopRef.current(), []);
  return { frame, stop };
}

export { useRun };
