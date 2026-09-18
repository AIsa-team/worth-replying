import "server-only";

import type { ProfileEvent } from "@/lib/run-types";

/**
 * A side channel out of the cached profile work. `readSite` and `planSearch`
 * run inside Next's data cache, which hands back only a final value — so while
 * they work they `report` here, and `/api/profile/stream` `watch`es to show the
 * pages landing and the model writing. On a cache hit nothing runs, nothing is
 * reported, and the watcher simply gets the finished result at once.
 */
type Listener = (event: ProfileEvent) => void;

type Flight = {
  listeners: Set<Listener>;
  /** The latest event of each kind, replayed to anyone who joins midway. */
  latest: Map<string, ProfileEvent>;
};

const store = globalThis as typeof globalThis & {
  __progress?: Map<string, Flight>;
};
const flights = (store.__progress ??= new Map());

function flight(domain: string): Flight {
  let entry = flights.get(domain);
  if (!entry) {
    entry = { listeners: new Set(), latest: new Map() };
    flights.set(domain, entry);
  }
  return entry;
}

export function report(domain: string, event: ProfileEvent) {
  const entry = flight(domain);
  const slot = event.type === "sample" ? `sample:${event.index}` : event.type;
  entry.latest.set(slot, event);
  for (const listener of entry.listeners) listener(event);
}

/** Subscribe, catching up on what was already reported. Returns the unsubscribe. */
export function watch(domain: string, listener: Listener) {
  const entry = flight(domain);
  for (const event of entry.latest.values()) listener(event);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
    release(domain, entry);
  };
}

/**
 * The work behind these event kinds has finished (or failed): its result now
 * comes from the cache, so drop the replay rather than show it to a later
 * visitor as if it were happening again.
 */
export function settle(domain: string, kinds: ProfileEvent["type"][]) {
  const entry = flights.get(domain);
  if (!entry) return;
  for (const slot of [...entry.latest.keys()]) {
    if (kinds.some((kind) => slot === kind || slot.startsWith(`${kind}:`))) {
      entry.latest.delete(slot);
    }
  }
  release(domain, entry);
}

function release(domain: string, entry: Flight) {
  if (entry.listeners.size === 0 && entry.latest.size === 0) {
    flights.delete(domain);
  }
}
