// Test-process preload only. Production imports no fixtures or endpoint overrides.
import { appendFileSync, readFileSync } from 'node:fs';
const original = globalThis.fetch;
const directory = process.env.WORTH_TEST_FIXTURES;
if (!directory) throw new Error('Mock upstream preload requires fixture directory');
const config = () => JSON.parse(readFileSync(`${directory}/config.json`, 'utf8'));
const record = (event) => appendFileSync(`${directory}/calls.ndjson`, `${JSON.stringify(event)}\n`);
const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers });
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
  const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
  const cfg = config();
  if (url.href === 'https://clerk.aisa.one/oauth/token') {
    const body = new URLSearchParams(init.body);
    const code = body.get('code');
    record({ kind: 'oauth', code, verifier: body.get('code_verifier'), redirect: body.get('redirect_uri'), client: body.get('client_id'), basic: headers.has('authorization') });
    if (cfg.pkce && cfg.pkce !== body.get('code_verifier')) return json({ error: 'invalid_grant' }, 400);
    if (code === 'bad-code') return json({ error: 'invalid_grant', private_detail: 'NEVER_EXPOSE' }, 400);
    return json({ access_token: code === 'oversize' ? 'x'.repeat(4000) : `mock-access-${code}`, refresh_token: 'NEVER_KEEP_REFRESH', token_type: 'Bearer', expires_in: cfg.expiresIn ?? 3600 });
  }
  if (url.hostname === 'api.aisa.one') {
    const caller = headers.get('authorization')?.replace('Bearer mock-access-', '');
    record({ kind: 'aisa', path: url.pathname, caller, query: url.search });
    if (!caller || caller.startsWith('Bearer ')) throw new Error('Caller OAuth bearer was not forwarded');
    if (cfg.delay) await pause(cfg.delay);
    const status = url.pathname.includes('advanced_search') ? cfg.searchStatus : cfg.crawlStatus;
    if (status) return json({ error: { code: 'private_backend_detail', message: `NEVER_EXPOSE ${caller}` } }, status);
    const cost = { 'x-aisa-customer-cost-micros-usd': String(cfg.dataMicros ?? 1000) };
    if (url.pathname.includes('advanced_search')) return json({ tweets: cfg.tweets ? [{ id: `tweet-${caller}`, text: 'Need help with inference', createdAt: '2026-10-23T10:00:00Z', author: { userName: `author${caller}`, name: 'Sample' } }] : [], has_next_page: false }, 200, cost);
    const body = JSON.parse(init.body);
    return json({ results: cfg.emptyCrawl && url.pathname.endsWith('/crawl') ? [] : [{ url: `${body.url ?? body.urls[0]}/${caller}`, raw_content: `Site for ${caller}` }] }, 200, cost);
  }
  if (url.hostname === 'ai-gateway.vercel.sh') {
    record({ kind: 'gateway', path: url.pathname, authorization: headers.get('authorization') === 'Bearer mock-site-gateway' ? 'site' : 'unexpected' });
    if (url.pathname.endsWith('/config')) return json({ models: [] });
    const body = JSON.parse(init.body);
    if (url.pathname.endsWith('/evaluation-model')) return json({
      answers: { isIcp: { type: 'boolean', probability: 0.9 }, pain: { type: 'choice', choice: 'cost', probabilities: { cost: 0.9, none: 0.1 } }, replyValue: { type: 'score', score: 2.5 }, needsHuman: { type: 'boolean', probability: 0.1 }, injection: { type: 'boolean', probability: 0.1 } },
      usage: { inputTokens: 10, outputTokens: 5 }, providerMetadata: { gateway: { cost: '0.001' } },
    });
    const prompt = JSON.stringify(body.prompt);
    const caller = prompt.match(/Site for ([A-Za-z0-9-]+)/)?.[1] ?? 'edited';
    const output = prompt.includes('You read a company') ? {
      whatYouDo: `Profile for ${caller}`, whoBuysIt: ['builders'], whatHurts: [{ key: 'cost', label: 'bills too high' }], whoElse: [], handle: null,
    } : { queries: [{ q: 'inference cost', k: 'cost' }, { q: 'api bills', k: 'bills' }, { q: 'model choice', k: 'choice' }] };
    const parts = [
      { type: 'stream-start', warnings: [] }, { type: 'text-start', id: 'text' },
      { type: 'text-delta', id: 'text', delta: JSON.stringify(output) }, { type: 'text-end', id: 'text' },
      { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 10 }, outputTokens: { total: 5 } }, providerMetadata: { gateway: { cost: '0.01' } } },
    ];
    return new Response(parts.map(part => `data: ${JSON.stringify(part)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });
  }
  if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return original(input, init);
  throw new Error(`Unexpected external request blocked in mock test: ${url.origin}`);
};
