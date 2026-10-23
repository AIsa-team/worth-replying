import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { sealData, unsealData } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type Caller = { id: string; accessToken: string; expiresAt: number };
type Transaction = { state: string; verifier: string; returnTo: string; expiresAt: number };
const SESSION = "worth-session";
const TRANSACTION = "worth-oauth";
const TRANSACTION_SECONDS = 600;
export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export class AuthError extends Error {
  constructor() { super("Sign in to AIsa again to continue."); }
}

function appOrigin() {
  const origin = new URL(process.env.APP_ORIGIN ?? "http://localhost:3000");
  if (origin.origin !== origin.href.replace(/\/$/, "") ||
      (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)))) {
    throw new Error("APP_ORIGIN must be an HTTPS origin (HTTP is allowed only for local development).");
  }
  if (process.env.NODE_ENV === "production" && !process.env.APP_ORIGIN) throw new Error("APP_ORIGIN is required.");
  return origin;
}

export function authConfig() {
  const origin = appOrigin();
  const password = process.env.AISA_AUTH_SECRET;
  const clientId = process.env.AISA_OAUTH_CLIENT_ID;
  if (!password || password.length < 32 || !clientId) throw new Error("AIsa sign-in is not configured.");
  return { origin: origin.origin, secure: origin.protocol === "https:", password, clientId };
}

function cookieName(name: string) {
  return appOrigin().protocol === "https:" ? `__Host-${name}` : name;
}

function options(maxAge: number) {
  return { httpOnly: true, secure: authConfig().secure, sameSite: "lax" as const, path: "/", maxAge };
}

// Only app pages are return destinations; reject protocol-relative, encoded and auth URLs.
export function safeReturn(value: string | null) {
  if (!value || /[\\\u0000-\u0020%#]/.test(value)) return "/";
  const url = new URL(value, appOrigin().origin);
  return value.startsWith("/") && url.origin === appOrigin().origin &&
    ["/", "/profile", "/run", "/review"].includes(url.pathname) ? url.pathname + url.search : "/";
}

export function sameOrigin(request: Request) {
  return request.headers.get("origin") === authConfig().origin;
}

export async function session(): Promise<Caller | null> {
  const value = (await cookies()).get(cookieName(SESSION))?.value;
  if (!value) return null;
  const data = await unsealData<Caller>(value, { password: authConfig().password });
  return typeof data.id === "string" && typeof data.accessToken === "string" &&
    Number.isFinite(data.expiresAt) && data.expiresAt > Date.now() ? data : null;
}

export function assertActive(caller: Caller) {
  if (caller.expiresAt <= Date.now()) throw new AuthError();
}

export async function requirePage(returnTo = "/") {
  const caller = await session();
  if (!caller) redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  return caller;
}

// Runs before body parsing, any stream, cache, model or data operation.
export async function authorize(request: Request): Promise<Caller | Response> {
  const caller = await session();
  if (!caller) return Response.json({ error: "Sign in to AIsa to continue.", signIn: "/auth/login" }, { status: 401, headers: PRIVATE_HEADERS });
  if (!sameOrigin(request)) return Response.json({ error: "Use this app from its configured origin." }, { status: 403, headers: PRIVATE_HEADERS });
  const expected = request.headers.get("x-worth-session");
  if (expected && expected !== caller.id) return Response.json({ error: "Your account changed. Reload and sign in again." }, { status: 401, headers: PRIVATE_HEADERS });
  return caller;
}

export async function beginLogin(returnTo: string | null) {
  const config = authConfig();
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const transaction: Transaction = { state, verifier, returnTo: safeReturn(returnTo), expiresAt: Date.now() + TRANSACTION_SECONDS * 1000 };
  const sealed = await sealData(transaction, { password: config.password, ttl: TRANSACTION_SECONDS });
  (await cookies()).set(cookieName(TRANSACTION), sealed, options(TRANSACTION_SECONDS));
  const url = new URL("https://clerk.aisa.one/oauth/authorize");
  url.search = new URLSearchParams({ response_type: "code", client_id: config.clientId,
    redirect_uri: `${config.origin}/auth/callback`, scope: "openid profile email", state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
  return url;
}

export async function finishLogin(url: URL) {
  const config = authConfig();
  const jar = await cookies();
  const sealed = jar.get(cookieName(TRANSACTION))?.value;
  jar.set(cookieName(TRANSACTION), "", options(0));
  const tx = sealed ? await unsealData<Transaction>(sealed, { password: config.password }) : null;
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!tx || !state || !Number.isFinite(tx.expiresAt) || typeof tx.verifier !== "string" || typeof tx.returnTo !== "string" || typeof tx.state !== "string" || tx.expiresAt <= Date.now() ||
      state.length !== tx.state.length || !timingSafeEqual(Buffer.from(state), Buffer.from(tx.state)) ||
      !code || (url.searchParams.has("iss") && url.searchParams.get("iss") !== "https://clerk.aisa.one") || url.searchParams.has("error") || url.searchParams.getAll("state").length !== 1 || url.searchParams.getAll("code").length !== 1) {
    throw new AuthError();
  }
  const secret = process.env.AISA_OAUTH_CLIENT_SECRET;
  const form = new URLSearchParams({ grant_type: "authorization_code", code,
    redirect_uri: `${config.origin}/auth/callback`, code_verifier: tx.verifier, client_id: config.clientId });
  const res = await fetch("https://clerk.aisa.one/oauth/token", {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...(secret ? {
      Authorization: `Basic ${Buffer.from(`${encodeURIComponent(config.clientId)}:${encodeURIComponent(secret)}`).toString("base64")}`,
    } : {}) }, body: form,
  });
  if (!res.ok) { await res.body?.cancel(); throw new AuthError(); }
  const token = await res.json();
  if (typeof token.access_token !== "string" || !token.access_token || token.token_type?.toLowerCase() !== "bearer" ||
      typeof token.expires_in !== "number" || !Number.isFinite(token.expires_in) || token.expires_in <= 30) throw new AuthError();
  // No refresh token or ID token is retained. The trusted token exchange grants data access;
  // this app does not use unverified JWT claims as identity or billing authority.
  const seconds = Math.min(3600, Math.floor(token.expires_in) - 30);
  const caller: Caller = { id: randomBytes(24).toString("base64url"), accessToken: token.access_token, expiresAt: Date.now() + seconds * 1000 };
  const value = await sealData(caller, { password: config.password, ttl: seconds });
  if (Buffer.byteLength(value) > 3800) throw new AuthError(); // stay below browser cookie limits
  jar.set(cookieName(SESSION), value, options(seconds));
  return safeReturn(tx.returnTo);
}

export async function clearSession() {
  const jar = await cookies();
  jar.set(cookieName(SESSION), "", options(0));
  jar.set(cookieName(TRANSACTION), "", options(0));
}
