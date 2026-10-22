import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RCSS_PROPERTY_CATALOG } from '../rcss-matrix.ts';

test('RCSS compatibility documentation includes every property from the source catalog', () => {
  const markdown = readFileSync(resolve(import.meta.dirname, '../../../docs/rcss-compatibility.md'), 'utf8');
  assert.ok(markdown.includes('<!-- BEGIN GENERATED RCSS PROPERTY MATRIX -->'));
  assert.ok(markdown.includes('<!-- END GENERATED RCSS PROPERTY MATRIX -->'));
  for (const property of Object.keys(RCSS_PROPERTY_CATALOG)) {
    assert.ok(markdown.includes(`\`${property}\``), `compatibility docs are missing ${property}`);
  }
});
