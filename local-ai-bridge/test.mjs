import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalBridgeServer, validateTargetBaseUrl } from './server.mjs';

const TOKEN = '0123456789abcdef0123456789abcdef0123456789abcdef';

test('bridge only allows localhost and private IPv4 model targets', () => {
  assert.equal(validateTargetBaseUrl('http://192.168.1.22:1234/v1'), 'http://192.168.1.22:1234');
  assert.equal(validateTargetBaseUrl('http://127.0.0.1:1234'), 'http://127.0.0.1:1234');
  assert.throws(() => validateTargetBaseUrl('http://8.8.8.8:1234'), /частным адресам/);
  assert.throws(() => validateTargetBaseUrl('https://192.168.1.22:1234'), /частным адресам/);
});

test('bridge requires token for model access and supports the browser preflight', async t => {
  const server = createLocalBridgeServer({
    token: TOKEN,
    fetcher: async input => {
      assert.equal(String(input), 'http://192.168.1.22:1234/v1/models');
      return new Response(JSON.stringify({ data: [{ id: 'qwen-vl-test' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
    analyzer: async () => ({ width: 10, height: 20, elements: [], notes: [], model: 'fake' }),
    reviewer: async payload => ({ score: 80, verdict: 'needs-fixes', summary: 'checked', issues: [], matches: [], limitations: [], model: 'fake', baseUrl: payload.baseUrl }),
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const options = await fetch(`${base}/status`, { method: 'OPTIONS', headers: { Origin: 'https://preview.example', 'Access-Control-Request-Private-Network': 'true' } });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('access-control-allow-origin'), '*');
  assert.equal(options.headers.get('access-control-allow-private-network'), 'true');

  const noToken = await fetch(`${base}/status?baseUrl=${encodeURIComponent('http://192.168.1.22:1234/v1')}`);
  assert.equal(noToken.status, 401);

  const ok = await fetch(`${base}/status?baseUrl=${encodeURIComponent('http://192.168.1.22:1234/v1')}`, { headers: { 'X-Local-Bridge-Token': TOKEN } });
  assert.equal(ok.status, 200);
  const status = await ok.json();
  assert.equal(status.available, true);
  assert.deepEqual(status.models, ['qwen-vl-test']);

  const analyze = await fetch(`${base}/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Local-Bridge-Token': TOKEN },
    body: JSON.stringify({ baseUrl: 'http://192.168.1.22:1234/v1', imageBase64: 'QUJDRA==', mimeType: 'image/png', width: 10, height: 20 }),
  });
  assert.equal(analyze.status, 200);
  assert.equal((await analyze.json()).via, 'local-bridge');

  const review = await fetch(`${base}/visual-review`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Local-Bridge-Token': TOKEN },
    body: JSON.stringify({ baseUrl: 'http://192.168.1.22:1234/v1', imageBase64: 'QUJDRA==', mimeType: 'image/png' }),
  });
  assert.equal(review.status, 200);
  const reviewBody = await review.json();
  assert.equal(reviewBody.via, 'local-bridge');
  assert.equal(reviewBody.score, 80);
});
