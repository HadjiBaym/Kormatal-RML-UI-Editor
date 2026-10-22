import fs from 'node:fs';
import path from 'node:path';
import { convertProject, splitMonolithicHtmlProject, DEFAULT_CONVERSION_OPTIONS } from './src/core/project-converter.ts';

const inputArg = process.argv[2];
if (!inputArg) {
  console.error('Usage: node --experimental-strip-types run-conversion.mts <input.html> [output-directory]');
  process.exitCode = 2;
  throw new Error('Missing input HTML path.');
}
const input = path.resolve(inputArg);
const out = path.resolve(process.argv[3] || './converted-output');
fs.mkdirSync(out, { recursive: true });
const content = fs.readFileSync(input, 'utf8');
const htmlFile = { id: 'uploaded-html', path: 'index.html', content, type: 'html' as const, isEntry: true };
const result = convertProject([htmlFile], 'LamguardPlayTest', DEFAULT_CONVERSION_OPTIONS);
fs.writeFileSync(path.join(out, 'main_menu.rml'), result.rml, 'utf8');
fs.writeFileSync(path.join(out, 'main_menu.rcss'), result.rcss, 'utf8');
fs.writeFileSync(path.join(out, 'main_menu.js'), result.js, 'utf8');
fs.writeFileSync(path.join(out, 'vacuus-base.rcss'), result.vacuusBaseRcss, 'utf8');
fs.writeFileSync(path.join(out, 'conversion-report.md'), result.conversionReportMd, 'utf8');
fs.writeFileSync(path.join(out, 'compatibility.json'), result.compatibilityJson, 'utf8');
fs.writeFileSync(path.join(out, 'diagnostics.json'), JSON.stringify(result.diagnostics, null, 2), 'utf8');
fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(result.metrics, null, 2), 'utf8');
// Keep exportable source assets alongside the conversion when using this script for
// diagnostics or regression tests; the web exporter rasterizes these to PNG.
fs.writeFileSync(path.join(out, 'svg-assets.json'), JSON.stringify(result.svgAssets || [], null, 2), 'utf8');
fs.writeFileSync(path.join(out, 'external-image-assets.json'), JSON.stringify(result.externalImageAssets || [], null, 2), 'utf8');
console.log(JSON.stringify({
  inputBytes: Buffer.byteLength(content),
  outputs: fs.readdirSync(out),
  metrics: result.metrics,
  diagnosticsCount: result.diagnostics.length,
  diagnosticsBySeverity: result.diagnostics.reduce((acc, d) => { acc[d.severity] = (acc[d.severity] || 0) + 1; return acc; }, {} as Record<string, number>),
  diagnosticHighlights: result.diagnostics.slice(0, 20).map(({severity,category,file,line,message,recommendedAction}) => ({severity,category,file,line,message,recommendedAction})),
}, null, 2));
