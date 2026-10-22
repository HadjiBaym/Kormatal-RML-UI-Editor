import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchResourceWithTimeout, promiseWithTimeout } from '../export-resources.ts';

test('fetchResourceWithTimeout returns a successful response before its deadline', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('ok', { status: 200 })) as typeof fetch;
  try {
    const response = await fetchResourceWithTimeout('http://local.test/resource', {}, 100, 'test resource');
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'ok');
  } finally { globalThis.fetch = originalFetch; }
});

test('fetchResourceWithTimeout aborts and rejects a fetch that never resolves', async () => {
  const originalFetch = globalThis.fetch;
  let signal: AbortSignal | undefined;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    signal = init?.signal as AbortSignal | undefined;
    return new Promise<Response>(() => {});
  }) as typeof fetch;
  try {
    await assert.rejects(
      fetchResourceWithTimeout('http://local.test/hang', {}, 15, 'external image'),
      /Тайм-аут загрузки external image: ожидание превысило 15 мс\./,
    );
    assert.equal(signal?.aborted, true);
  } finally { globalThis.fetch = originalFetch; }
});

test('fetchResourceWithTimeout rejects invalid timeout values', async () => {
  await assert.rejects(fetchResourceWithTimeout('http://local.test/resource', {}, 0), RangeError);
});


test('promiseWithTimeout prevents a stalled response body from hanging export', async () => {
  let cancelled = false;
  await assert.rejects(
    promiseWithTimeout(new Promise<string>(() => {}), 15, 'font body', () => { cancelled = true; }),
    /Тайм-аут чтения font body: ожидание превысило 15 мс\./,
  );
  assert.equal(cancelled, true);
});
