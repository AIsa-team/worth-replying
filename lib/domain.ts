/** The domain every screen falls back to when the URL names none. */
export const DEFAULT_DOMAIN = "aisa.one";

const HOSTNAME =
  /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Reduce whatever was typed — a URL, a host with a path — to a bare public
 * hostname, or null when it is not one. Everything server-side keys off this.
 */
export function parseDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const host = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/^www\./, "");
  return HOSTNAME.test(host) ? host : null;
}
