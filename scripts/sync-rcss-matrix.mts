import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RCSS_PROPERTY_CATALOG } from '../src/core/rcss-matrix.ts';

const root = resolve(import.meta.dirname, '..');
const docPath = resolve(root, 'docs/rcss-compatibility.md');
const startMarker = '<!-- BEGIN GENERATED RCSS PROPERTY MATRIX -->';
const endMarker = '<!-- END GENERATED RCSS PROPERTY MATRIX -->';

const statusLabel: Record<string, string> = {
  supported: 'Supported',
  'supported-with-limits': 'Supported with limits',
  convertible: 'Convertible',
  unsupported: 'Unsupported',
  'parses-not-rendered': 'Parses / not rendered',
};
const escapeCell = (value: string) => value.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

const rows = Object.values(RCSS_PROPERTY_CATALOG).map(entry => {
  const values = entry.allowedValues?.length ? `Allowed values: ${entry.allowedValues.join(', ')}. ` : '';
  const notes = `${values}${entry.notes}`;
  const fix = entry.autoFixAvailable ? 'Yes (review result)' : 'No';
  return `| \`${escapeCell(entry.property)}\` | ${statusLabel[entry.status] || entry.status} | ${escapeCell(notes)} | ${escapeCell(entry.conversionRule || '—')} | ${fix} |`;
});
const generated = [
  startMarker,
  '| Property | Status | Values and constraints | Conversion rule | Source auto-fix |',
  '| :--- | :--- | :--- | :--- | :--- |',
  ...rows,
  endMarker,
].join('\n');

const original = await readFile(docPath, 'utf8');
const start = original.indexOf(startMarker);
const end = original.indexOf(endMarker);
if (start < 0 || end < 0 || end <= start) {
  throw new Error(`Missing or invalid generated-matrix markers in ${docPath}`);
}
const updated = `${original.slice(0, start)}${generated}${original.slice(end + endMarker.length)}`;
if (process.argv.includes('--check')) {
  if (updated !== original) {
    console.error('docs/rcss-compatibility.md is out of sync with src/core/rcss-matrix.ts. Run: node --experimental-strip-types scripts/sync-rcss-matrix.mts');
    process.exitCode = 1;
  } else {
    console.log(`RCSS matrix is in sync (${rows.length} catalog properties).`);
  }
} else {
  await writeFile(docPath, updated, 'utf8');
  console.log(`Updated docs/rcss-compatibility.md with ${rows.length} catalog properties.`);
}
