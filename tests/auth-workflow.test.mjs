// Mock E2E: real Next HTTP routing/cookies/streams, mocked OAuth, AIsa and AI Gateway.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { sealData, unsealData } from 'iron-session';

const fixtures = mkdtempSync(join(tmpdir(), 'worth-auth-test-'));
const distDir = ".next-auth-test";
const password = 'mock-encryption-secret-at-least-32-characters';
let server, origin, output = '';
const setConfig = (value = {}) => writeFileSync(join(fixtures, 'config.json'), JSON.stringify(value));
const calls = () => readFileSync(join(fixtures, 'calls.ndjson'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const request = (path, options = {}) => fetch(origin + path, { redirect: 'manual', ...options });
const post = (path, cookie, body = { domain: 'example.com' }, extra = {}) => request(path, { method: 'POST', headers: { Origin: origin, Cookie: cookie ?? '', 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });
const cookieFrom = (response, name) => response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(';')[0];
const unpack = (cookie) => unsealData(cookie.slice(cookie.indexOf('=') + 1), { password });
const events = async response => (await response.text()).trim().split('\n').filter(Boolean).map(JSON.parse);
async function login(code = 'A', returnTo = '/profile?domain=example.com') {
  const start = await request(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  assert.equal(start.status, 307);
  const txCookie = cookieFrom(start, 'worth-oauth');
  const tx = await unpack(txCookie);
  const url = new URL(start.headers.get('location'));
  assert.equal(url.origin, 'https://clerk.aisa.one');
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(tx.verifier).digest('base64url'));
  assert.equal(url.searchParams.get('scope'), 'openid profile email');
  const callback = await request(`/auth/callback?code=${code}&state=${tx.state}`, { headers: { Cookie: txCookie } });
  return { start, txCookie, tx, callback, cookie: cookieFrom(callback, 'worth-session') };
}

before(async () => {
  setConfig(); writeFileSync(join(fixtures, 'calls.ndjson'), '');
  const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: resolve('.'), env: { ...process.env, APP_ORIGIN: origin, AISA_AUTH_SECRET: password, AISA_OAUTH_CLIENT_ID: 'mock-stable-client', AI_GATEWAY_API_KEY: 'mock-site-gateway', AISA_API_KEY: 'SHARED_KEY_MUST_NEVER_BE_USED', WORTH_TEST_FIXTURES: fixtures, WORTH_TEST_DIST_DIR: distDir, NODE_OPTIONS: `--import=${resolve('tests/mock-upstreams.mjs')}` }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', data => { output += data; }); server.stderr.on('data', data => { output += data; });
  for (let n = 0; n < 120; n++) {
    if (server.exitCode !== null) throw new Error(`Next exited: ${output}`);
    try { if ((await request('/auth/session')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Next did not start: ${output}`);
});
after(async () => {
  server?.kill('SIGTERM');
  if (server && server.exitCode === null) await once(server, 'exit');
  // Only dummy fixture values are ever logged. Print server errors only on failure via test runner.
  rmSync(distDir, { recursive: true, force: true });
  rmSync(fixtures, { recursive: true, force: true });
});

test('public home is accessible, protected pages redirect and ALL paid APIs reject before parsing or creating a stream; zero upstream calls', async () => {
  const count = calls().length;
  const home = await request('/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Give it a domain/);
  for (const path of ['/profile', '/run', '/review']) {
    const response = await request(path);
    assert.equal(response.status, 307, path);
    assert.match(response.headers.get('location'), /^\/sign-in/);
  }
  for (const path of ['/api/profile', '/api/profile/stream', '/api/queries', '/api/run']) {
    const response = await post(path);
    assert.equal(response.status, 401, path);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
  assert.equal(calls().length, count);
});

test('PKCE callback binds cookie, state, configured client and redirect; opaque HttpOnly cookie stores access token only', async () => {
  const { start, tx, callback, cookie } = await login();
  assert.equal(callback.status, 307);
  assert.equal(callback.headers.get('location'), `${origin}/profile?domain=example.com`);
  assert.ok(cookie.length < 4000); assert.ok(!cookie.includes('mock-access-A'));
  assert.match(start.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(start.headers.get('set-cookie'), /SameSite=lax/i);
  const session = await unpack(cookie);
  assert.equal(session.accessToken, 'mock-access-A');
  assert.equal(session.refreshToken, undefined);
  assert.equal(session.expiresAt > Date.now(), true);
  assert.equal(calls().findLast(call => call.kind === 'oauth').verifier, tx.verifier);
  assert.equal(calls().findLast(call => call.kind === 'oauth').redirect, `${origin}/auth/callback`);
  const page = await request('/', { headers: { Cookie: cookie } });
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.ok(!html.includes('mock-access-A') && !html.includes(cookie.slice(14)) && !html.includes('NEVER_KEEP_REFRESH'));
  assert.match(html, /personal AIsa balance/);
});

test('missing/mismatched/tampered/expired transaction, PKCE denial, replay without cookie, oversized token fail closed', async () => {
  for (const kind of ['missing', 'mismatch', 'tampered', 'expired', 'bad-code', 'pkce', 'oversize']) {
    setConfig();
    const start = await request('/auth/login'); let cookie = cookieFrom(start, 'worth-oauth'); const tx = await unpack(cookie);
    let state = tx.state;
    if (kind === 'missing') cookie = '';
    if (kind === 'mismatch') state = 'wrong';
    if (kind === 'tampered') cookie = cookie.slice(0, -8) + 'tampered';
    if (kind === 'expired') cookie = `worth-oauth=${await sealData({ ...tx, expiresAt: Date.now() - 1000 }, { password, ttl: 600 })}`;
    if (kind === 'pkce') setConfig({ pkce: 'different-verifier' });
    const response = await request(`/auth/callback?code=${kind === 'bad-code' ? 'bad-code' : kind === 'oversize' ? 'oversize' : 'A'}&state=${state}`, { headers: { Cookie: cookie } });
    assert.equal(response.headers.get('location'), `${origin}/sign-in?error=callback`, kind);
    assert.equal(cookieFrom(response, 'worth-session'), undefined, kind);
    assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  }
  setConfig();
});

test('return destinations and spoofed Host cannot redirect outside the configured app', async () => {
  for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', '/auth/logout', '/%2f%2fevil.example', '/run\nX']) {
    const { callback } = await login('redirect', value);
    assert.equal(callback.headers.get('location'), `${origin}/`, value);
  }
  const response = await request('/auth/login', { headers: { Host: 'evil.example' } });
  assert.equal(new URL(response.headers.get('location')).searchParams.get('redirect_uri'), `${origin}/auth/callback`);
});

test('protected-page sign-in preserves domain and bounded target through the callback', async () => {
  const count = calls().filter(call => call.kind !== 'oauth').length;
  for (const path of ['/profile?domain=resend.com', '/run?domain=resend.com&target=40', '/review?domain=resend.com&target=40']) {
    const gate = await request(path);
    assert.equal(gate.status, 307);
    const signIn = new URL(gate.headers.get('location'), origin);
    const returnTo = signIn.searchParams.get('returnTo');
    assert.equal(returnTo, path);
    const { callback } = await login('return-parameters', returnTo);
    assert.equal(callback.headers.get('location'), origin + path);
  }
  assert.equal(calls().filter(call => call.kind !== 'oauth').length, count);
});

test('expired/tampered sessions reject every paid route without calls; cookie auth cannot be used cross-origin', async () => {
  const { cookie } = await login('expiry'); const data = await unpack(cookie);
  for (const invalid of [cookie.slice(0, -8) + 'tampered', `worth-session=${await sealData({ ...data, expiresAt: Date.now() - 1 }, { password })}`]) {
    const count = calls().length;
    for (const path of ['/api/profile', '/api/profile/stream', '/api/queries', '/api/run']) assert.equal((await post(path, invalid)).status, 401);
    assert.equal(calls().length, count);
  }
  assert.equal((await post('/api/profile', cookie, undefined, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post('/api/profile', cookie, undefined, { 'X-Worth-Session': 'different-login' })).status, 401);
});

test('two callers get independent tokens/cache/progress; concurrent same-caller streams reuse work without a second data charge', async () => {
  setConfig({ delay: 80 });
  const a = await login('A'); const b = await login('B');
  const before = calls().length;
  const responses = await Promise.all([post('/api/profile/stream', a.cookie), post('/api/profile/stream', a.cookie), post('/api/profile/stream', b.cookie)]);
  const [ea, ea2, eb] = await Promise.all(responses.map(events));
  assert.equal(ea.find(event => event.type === 'read')?.read.profile.whatYouDo, 'Profile for A', JSON.stringify(ea));
  assert.equal(ea2.find(event => event.type === 'read')?.read.profile.whatYouDo, 'Profile for A');
  assert.equal(eb.find(event => event.type === 'read')?.read.profile.whatYouDo, 'Profile for B');
  assert.ok(!JSON.stringify(ea).includes('/B') && !JSON.stringify(eb).includes('/A'));
  const dataCalls = calls().slice(before).filter(call => call.kind === 'aisa');
  for (const caller of ['A', 'B']) {
    assert.equal(dataCalls.filter(call => call.caller === caller && call.path.endsWith('/crawl')).length, 1);
    assert.equal(dataCalls.filter(call => call.caller === caller && call.path.includes('advanced_search')).length, 3);
  }
  const count = calls().length;
  const cached = await post('/api/profile', a.cookie); assert.equal(cached.status, 200);
  assert.equal(calls().length, count);
  const payload = await cached.json(); assert.equal(payload.spentToday, 0.02);
  assert.ok(calls().filter(call => call.kind === 'gateway').every(call => call.authorization === 'site'));
  assert.ok(!JSON.stringify([ea, eb, payload]).includes('mock-access-'));
  setConfig();
});

const editedProfile = { domain: 'edited.example', whatYouDo: 'tools', whoBuysIt: ['builders'], whatHurts: [{ key: 'cost', label: 'bills too high' }], whoElse: [], handle: null };
test('crawl 401/402 preserve actionable status, redact upstream and start no extraction/model work', async () => {
  for (const status of [401, 402]) {
    const { cookie } = await login(`crawl${status}`); setConfig({ crawlStatus: status }); const count = calls().length;
    const response = await post('/api/profile', cookie);
    assert.equal(response.status, status);
    const body = await response.text(); assert.ok(!body.includes('NEVER_EXPOSE'));
    assert.match(body, status === 402 ? /personal AIsa balance/ : /Sign in again/);
    assert.equal(calls().length - count, 1);
  }
  setConfig();
});

test('query sampling 401/402 halts remaining paid samples and is not swallowed', async () => {
  for (const status of [401, 402]) {
    const { cookie } = await login(`sample${status}`); setConfig({ searchStatus: status }); const count = calls().length;
    const response = await post('/api/queries', cookie, { profile: editedProfile });
    assert.equal(response.status, status, await response.clone().text());
    assert.equal(calls().slice(count).filter(call => call.kind === 'aisa').length, 1);
  }
  setConfig();
});

test('run auth/balance search failure terminates stream and prevents jev follow-on work/retries', async () => {
  for (const status of [401, 402]) {
    const { cookie } = await login(`run${status}`); setConfig({ searchStatus: status }); const count = calls().length;
    const response = await post('/api/run', cookie, { domain: 'edited.example', profile: editedProfile, queries: ['one'], target: 2 });
    const result = await events(response);
    assert.equal(result.at(-1).type, 'error');
    assert.match(result.at(-1).message, status === 402 ? /personal AIsa balance/ : /Sign in again/);
    assert.equal(calls().slice(count).filter(call => call.kind === 'aisa').length, 1);
    assert.equal(calls().slice(count).filter(call => call.kind === 'gateway').length, 0);
  }
  setConfig();
});

test('personal data spend does not consume another caller budget; model output is caller scoped', async () => {
  const a = await login('budgetA'); const b = await login('budgetB'); setConfig({ dataMicros: 6000000 });
  const response = await post('/api/profile', a.cookie, { domain: 'budget.example' }); assert.equal(response.status, 402);
  setConfig();
  const other = await post('/api/profile', b.cookie, { domain: 'budget.example' }); assert.equal(other.status, 200, await other.clone().text());
  assert.equal((await other.json()).spentToday, 0.02);
});

test('POST logout is same-origin only, clears both cookies/storage, and subsequent anonymous requests are rejected', async () => {
  const { cookie } = await login('logout');
  assert.equal((await request('/auth/logout')).status, 405);
  assert.equal((await post('/auth/logout', cookie, {}, { Origin: 'https://evil.example' })).status, 403);
  const response = await post('/auth/logout', cookie);
  assert.equal(response.status, 303); assert.equal(response.headers.get('location'), `${origin}/sign-in`);
  assert.equal(response.headers.getSetCookie().filter(value => /Max-Age=0/.test(value)).length, 2);
  assert.match(response.headers.get('clear-site-data'), /storage/);
  assert.equal((await post('/api/profile')).status, 401);
  assert.ok(!output.includes('mock-access-') && !output.includes('NEVER_KEEP_REFRESH'), 'server logs must not contain credentials');
});
