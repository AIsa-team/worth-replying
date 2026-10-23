// Real AIsa integration: no mocks. Default skipped; credentials never printed.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const token = process.env.AISA_REAL_ACCESS_TOKEN;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
async function balance() {
  const response = await fetch('https://api.aisa.one/v1/credits/balance', { headers, cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200, `Balance access failed (HTTP ${response.status}); check OAuth account access.`);
  const value = await response.json();
  assert.ok(value && typeof value === 'object');
  return value;
}
test('REAL nonbillable personal AIsa OAuth balance access', { skip: !token }, async () => { await balance(); });
test('REAL one billable AIsa /apis/v1 extraction with OAuth', { skip: !token || process.env.AISA_REAL_DATA_SMOKE !== '1' }, async () => {
  await balance();
  const response = await fetch('https://api.aisa.one/apis/v1/tavily/extract', {
    method: 'POST', headers, cache: 'no-store', signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({ urls: ['https://example.com'], format: 'markdown' }),
  });
  assert.equal(response.status, 200, `Extraction failed (HTTP ${response.status}); check personal balance and account access.`);
  const cost = Number(response.headers.get('x-aisa-customer-cost-micros-usd'));
  assert.ok(Number.isFinite(cost) && cost >= 0);
  const body = await response.json(); assert.ok(Array.isArray(body.results));
  await balance();
});
