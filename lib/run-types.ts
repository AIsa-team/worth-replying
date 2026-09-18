/**
 * Shapes shared by the server pipeline and the screens that render it.
 * Nothing in here touches a key or the network, so it is safe on the client.
 */

export type Pain = {
  /** One lowercase word — the option jev chooses between, e.g. "cost". */
  key: string;
  /** The same pain in the buyer's words, e.g. "model bills too high". */
  label: string;
};

export type Profile = {
  domain: string;
  whatYouDo: string;
  whoBuysIt: string[];
  whatHurts: Pain[];
  whoElse: string[];
  /** The company's own X handle, when the site links to one. */
  handle: string | null;
};

export type SiteRead = {
  profile: Profile;
  pages: number;
  characters: number;
  seconds: number;
  /** Crawl plus the profile call, in USD. */
  cost: number;
};

export type Query = {
  /** The search exactly as written, before the shared filter is appended. */
  q: string;
  /** What this search is fishing for, in plain words. */
  k: string;
  /** Measured volume from a one-page sample, e.g. "~140 a day". */
  n: string;
};

export type SearchPlan = {
  queries: Query[];
  /** Operators appended to every query when it is sent to X. */
  filter: string;
  /** Query writing plus the volume samples, in USD. */
  cost: number;
};

export type Route = "IN THE QUEUE" | "NEEDS A HUMAN" | "ARCHIVED";

export type Tweet = {
  id: string;
  url: string;
  text: string;
  createdAt: string;
  likes: number;
  replies: number;
  author: {
    handle: string;
    name: string;
    bio: string;
    followers: number;
  };
};

/** jev's five typed answers, each already reduced to a 0–1 position. */
export type Signals = {
  icp: number;
  pain: number;
  painName: string;
  val: number;
  hum: number;
  inj: number;
};

export type Decision = {
  tweet: Tweet;
  signals: Signals;
  route: Route;
  /** How long jev took to return all five typed answers. */
  ms: number;
  tokens: number;
  cost: number;
};

/** One line of the NDJSON stream `/api/run` writes. */
export type RunEvent =
  | { type: "reading"; domain: string }
  | {
      type: "start";
      domain: string;
      target: number;
      handle: string | null;
      queries: string[];
      /** Everything spent before the first search: site read and the plan. */
      profileCost: number;
    }
  | { type: "search"; query: number; found: number; fresh: number; cost: number }
  | ({ type: "decision" } & Decision)
  | { type: "skipped"; id: string; reason: string }
  | { type: "done"; reason: "complete" | "exhausted" | "budget" }
  | { type: "error"; message: string };
