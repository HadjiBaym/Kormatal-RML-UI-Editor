import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { bundleVaCuusModuleGraph, JsModuleBundleError } from '../js-module-bundler.ts';

test('bundles an in-memory local ESM graph to one classic IIFE and preserves behavior', async () => {
  const result = await bundleVaCuusModuleGraph({
    entryPath: 'src/main.js',
    files: [
      { path: 'src/main.js', content: 'import { add } from "./math.js"; export const total = add(19, 23); globalThis.bundleResult = total;' },
      { path: 'src/math.js', content: 'export function add(a, b) { return a + b; }' },
    ],
  });

  assert.match(result.js, /\(\(\) => \{/);
  assert.doesNotMatch(result.js, /^\s*import\s/m);
  assert.doesNotMatch(result.js, /^\s*export\s/m);
  assert.deepEqual(result.includedFiles, ['src/main.js', 'src/math.js']);
  const context: Record<string, unknown> = {};
  vm.runInNewContext(result.js, context);
  assert.equal(context.bundleResult, 42);
});

test('bundles side-effect CSS imports as empty JS modules for the separate RCSS pipeline', async () => {
  const result = await bundleVaCuusModuleGraph({
    entryPath: 'ui/main.mjs',
    files: [
      { path: 'ui/main.mjs', content: 'import "./style.css"; globalThis.ready = true;' },
      { path: 'ui/style.css', content: '.button { color: red; }' },
    ],
  });
  const context: Record<string, unknown> = {};
  vm.runInNewContext(result.js, context);
  assert.equal(context.ready, true);
  assert.ok(!result.includedFiles.includes('ui/style.css'));
});

test('refuses package imports instead of resolving outside the uploaded project', async () => {
  await assert.rejects(() => bundleVaCuusModuleGraph({
    entryPath: 'main.js',
    files: [{ path: 'main.js', content: 'import { h } from "@vacuus/preact"; globalThis.h = h;' }],
  }), (error: unknown) => error instanceof JsModuleBundleError && /официальный VaCuus Web CLI/.test(error.message));
});

test('rejects a project path that escapes the in-memory root', async () => {
  await assert.rejects(() => bundleVaCuusModuleGraph({
    entryPath: '../outside.js',
    files: [{ path: '../outside.js', content: 'globalThis.unsafe = true;' }],
  }), (error: unknown) => error instanceof JsModuleBundleError && /выходит за пределы/.test(error.message));
});
