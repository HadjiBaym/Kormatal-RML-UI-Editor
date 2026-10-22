import test from 'node:test';
import assert from 'node:assert/strict';
import { bundleVaCuusModuleGraph } from '../js-module-bundler.ts';
import { DEFAULT_CONVERSION_OPTIONS } from '../../core/conversion-options.ts';

test('conversion worker replaces a single local module entrypoint with a classic VaCuus IIFE', async () => {
  type WorkerResponse = { ok: boolean; result?: { js: string; diagnostics: Array<{ id: string; severity: string }>; readiness: { status: string } }; error?: string };
  const globalScope = globalThis as unknown as Record<string, unknown>;
  const originalSelf = globalScope.self;
  const originalOnmessage = globalScope.onmessage;
  const originalPostMessage = globalScope.postMessage;
  globalScope.self = globalThis;
  const workerScope = globalThis as unknown as {
    onmessage: ((event: MessageEvent) => void) | null;
    postMessage: (message: unknown) => void;
  };
  workerScope.onmessage = null;
  workerScope.postMessage = () => {};

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body || '{}'));
    const bundle = await bundleVaCuusModuleGraph(request);
    return new Response(JSON.stringify(bundle), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const workerUrl = new URL('../../workers/project-conversion.worker.ts?module-bundle-test', import.meta.url).href;
    await import(workerUrl);
    const handler = workerScope.onmessage as unknown as (event: MessageEvent) => Promise<void>;
    const convert = async (requestId: number, files: Array<Record<string, unknown>>) => {
      const responsePromise = new Promise<WorkerResponse>(resolve => {
        workerScope.postMessage = message => resolve(message as WorkerResponse);
      });
      await handler({ data: { requestId, screenName: 'Play', options: DEFAULT_CONVERSION_OPTIONS, files } } as MessageEvent);
      return responsePromise;
    };
    const response = await convert(913, [
      { id: 'html', path: 'index.html', type: 'html', content: '<html><head><script type="module" src="./src/main.js"></script></head><body><div id="app"></div></body></html>' },
      { id: 'entry', path: 'src/main.js', type: 'js', content: 'import { start } from "./start.js"; start();' },
      { id: 'start', path: 'src/start.js', type: 'js', content: 'export function start() { globalThis.vacuusModuleRan = true; }' },
    ]);

    assert.equal(response.ok, true, response.error);
    assert.ok(response.result);
    assert.match(response.result.js, /\(\(\) => \{/);
    assert.doesNotMatch(response.result.js, /^\s*(?:import|export)\s/m);
    assert.ok(response.result.diagnostics.some(issue => issue.id === 'js-module-bundled' && issue.severity === 'info'));
    assert.equal(response.result.diagnostics.some(issue => issue.id.includes('ES-module-syntax')), false);

    const inlineResponse = await convert(914, [
      { id: 'html', path: 'index.html', type: 'html', content: '<html><head><script type="module">globalThis.inlineModuleRan = true;</script></head><body></body></html>' },
    ]);
    assert.equal(inlineResponse.ok, true, inlineResponse.error);
    assert.ok(inlineResponse.result);
    assert.match(inlineResponse.result.js, /\(\(\) => \{/);
    assert.ok(inlineResponse.result.diagnostics.some(issue => issue.id === 'js-module-bundled'));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSelf === undefined) delete globalScope.self;
    else globalScope.self = originalSelf;
    if (originalOnmessage === undefined) delete globalScope.onmessage;
    else globalScope.onmessage = originalOnmessage;
    if (originalPostMessage === undefined) delete globalScope.postMessage;
    else globalScope.postMessage = originalPostMessage;
  }
});
