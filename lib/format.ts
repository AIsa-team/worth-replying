export function comma(n: number) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Ledger money: cents once there are cents, finer than that until then. */
export function money(usd: number) {
  return `$${usd.toFixed(usd > 0 && usd < 0.01 ? 4 : 2)}`;
}

/** Two letters for an avatar: from the display name, else from the handle. */
export function initials(name: string, handle: string) {
  const [first, second] = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  const letters =
    first && second
      ? [...first][0] + [...second][0]
      : [...(first ?? handle.replace(/\W/g, ""))].slice(0, 2).join("");
  return (letters || "??").toUpperCase();
}

/** "40m", "2h", "3d" — how long ago an ISO timestamp was. */
export function ago(iso: string, now = Date.now()) {
  const minutes = Math.max(1, Math.round((now - Date.parse(iso)) / 60_000));
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / (60 * 24))}d`;
}
