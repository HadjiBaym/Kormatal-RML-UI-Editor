import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeNativeRcssFiles } from '../native-rcss-diagnostics.ts';
import type { ProjectFile } from '../types.ts';

const source = (path: string, content: string): ProjectFile => ({ id: path, path, type: 'css', content });

test('native RCSS diagnostics flag known unsupported and not-rendered properties', () => {
  const diagnostics = analyzeNativeRcssFiles([
    source('main.rcss', '.panel { display: grid; box-shadow: 0 0 8px #000; width: 320dp; }'),
  ]);
  assert.ok(diagnostics.some(issue => issue.message.includes('display') && issue.severity === 'warning'));
  assert.ok(diagnostics.some(issue => issue.message.includes('box-shadow') && issue.severity === 'warning'));
  assert.ok(!diagnostics.some(issue => issue.message.includes('width')));
});

test('native RCSS diagnostics flag unverified properties and unsafe browser timing values', () => {
  const diagnostics = analyzeNativeRcssFiles([
    source('main.rcss', '.panel { proprietary-glow: 1; transition: opacity .3s ease-in-out; }'),
  ]);
  assert.ok(diagnostics.some(issue => issue.severity === 'unverified' && issue.message.includes('proprietary-glow')));
  assert.ok(diagnostics.some(issue => issue.severity === 'warning' && issue.message.includes('timing')));
});

test('native RCSS diagnostics surface parse errors with their source location', () => {
  const diagnostics = analyzeNativeRcssFiles([source('main.rcss', '.panel { width: 12dp')]);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].severity, 'error');
  assert.equal(diagnostics[0].file, 'main.rcss');
});


test('native RCSS diagnostics use the exact VaCuus release matrix instead of the browser CSS import catalogue', () => {
  const diagnostics = analyzeNativeRcssFiles([
    source('main.rcss', '.table { display: table; } .cell { display: table-cell; } .grid { display: grid; } .glass { backdrop-filter: blur(8px); }'),
  ]);
  assert.ok(!diagnostics.some(issue => issue.message.includes('table') && issue.severity === 'warning'));
  assert.ok(diagnostics.some(issue => issue.message.includes('display') && issue.severity === 'warning' && issue.originalSnippet.includes('grid')));
  assert.ok(!diagnostics.some(issue => issue.message.includes('backdrop-filter')));
});
