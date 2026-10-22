import test from 'node:test';
import assert from 'node:assert/strict';
import { convertProject, DEFAULT_CONVERSION_OPTIONS, splitMonolithicHtmlProject } from '../project-converter.ts';
import { convertCssToRcss } from '../css-to-rcss.ts';
import { convertHtmlToRml } from '../html-to-rml.ts';
import type { ProjectFile } from '../types.ts';

const file = (id: string, path: string, type: ProjectFile['type'], content: string): ProjectFile => ({ id, path, type, content });

test('project conversion preserves order of external and inline classic scripts', () => {
  const html = `<html><head>
    <script src="first.js"></script>
    <script>const inlineBefore = "INLINE_BEFORE_MARKER";</script>
    <script src="nested/last.js"></script>
    <script>const inlineAfter = "INLINE_AFTER_MARKER";</script>
  </head><body><div>Test</div></body></html>`;
  const converted = convertProject([
    file('html', 'Content/DevUI/Hud/index.html', 'html', html),
    file('first', 'Content/DevUI/Hud/first.js', 'js', 'const firstExternal = "FIRST_EXTERNAL_MARKER";'),
    file('last', 'Content/DevUI/Hud/nested/last.js', 'js', 'const lastExternal = "LAST_EXTERNAL_MARKER";'),
  ], 'OrderedScripts', DEFAULT_CONVERSION_OPTIONS);

  const indexes = [
    converted.js.indexOf('FIRST_EXTERNAL_MARKER'),
    converted.js.indexOf('INLINE_BEFORE_MARKER'),
    converted.js.indexOf('LAST_EXTERNAL_MARKER'),
    converted.js.indexOf('INLINE_AFTER_MARKER'),
  ];
  assert.ok(indexes.every(index => index >= 0), `all markers should survive: ${indexes.join(', ')}`);
  assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b), 'script contents should follow HTML source order');
});

test('split mode replaces each inline script in place rather than moving all code to the end', () => {
  const html = `<html><body>
    <script src="pre.js"></script>
    <script>const inline1 = "INLINE_ONE";</script>
    <script src="post.js"></script>
    <script>const inline2 = "INLINE_TWO";</script>
  </body></html>`;
  const files = splitMonolithicHtmlProject(html, 'menu.html');
  const htmlOutput = files.find(item => item.type === 'html')?.content || '';
  const srcs = [...htmlOutput.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(srcs, ['pre.js', 'menu.inline-1.js', 'post.js', 'menu.inline-2.js']);
  assert.ok(files.some(item => item.path === 'menu.inline-1.js' && item.content.includes('INLINE_ONE')));
  assert.ok(files.some(item => item.path === 'menu.inline-2.js' && item.content.includes('INLINE_TWO')));
});

test('CSS @import is recursively expanded in place relative to each source stylesheet', () => {
  const converted = convertProject([
    file('html', 'Content/DevUI/Hud/index.html', 'html', '<html><head><link rel="stylesheet" href="styles/main.css"></head><body><div class="main">UI</div></body></html>'),
    file('main-css', 'Content/DevUI/Hud/styles/main.css', 'css', '@import "./parts/reset.css"; .main { color: red; }'),
    file('reset-css', 'Content/DevUI/Hud/styles/parts/reset.css', 'css', '@import "../tokens.css"; .reset { margin: 0; }'),
    file('tokens-css', 'Content/DevUI/Hud/styles/tokens.css', 'css', '.tokens { color: blue; }'),
  ], 'CssImports', DEFAULT_CONVERSION_OPTIONS);

  const tokens = converted.rcss.indexOf('.tokens');
  const reset = converted.rcss.indexOf('.reset');
  const main = converted.rcss.indexOf('.main');
  assert.ok(tokens >= 0 && reset >= 0 && main >= 0, 'all imported rules should be included');
  assert.ok(tokens < reset && reset < main, 'nested imports should keep their original cascade position');
  assert.equal(converted.diagnostics.some(item => item.message.includes('could not be resolved to an imported project stylesheet')), false);
});

test('CSS @import media is preserved and import cycles are diagnosed without recursion failure', () => {
  const media = convertProject([
    file('html', 'index.html', 'html', '<link rel="stylesheet" href="main.css"><div class="child">X</div>'),
    file('main', 'main.css', 'css', '@import "child.css" screen and (max-width: 600px); .main { color: red; }'),
    file('child', 'child.css', 'css', '.child { color: blue; }'),
  ], 'MediaImport', DEFAULT_CONVERSION_OPTIONS);
  assert.match(media.rcss, /@media\s+screen and \(max-width:\s*600px\)/i);
  assert.ok(media.rcss.indexOf('@media') < media.rcss.indexOf('.main'));

  const cycle = convertProject([
    file('html', 'index.html', 'html', '<link rel="stylesheet" href="a.css"><div>A</div>'),
    file('a', 'a.css', 'css', '@import "b.css"; .a { color: red; }'),
    file('b', 'b.css', 'css', '@import "a.css"; .b { color: blue; }'),
  ], 'ImportCycle', DEFAULT_CONVERSION_OPTIONS);
  assert.ok(cycle.diagnostics.some(item => item.message.includes('CSS @import cycle detected')));
  assert.ok(cycle.rcss.includes('.a') && cycle.rcss.includes('.b'));
});

test('CSS @import external and missing sources are diagnosed and do not survive as live imports', () => {
  const converted = convertProject([
    file('html', 'index.html', 'html', '<link rel="stylesheet" href="main.css"><div>X</div>'),
    file('main', 'main.css', 'css', '@import url("https://example.test/theme.css"); @import "missing.css"; .x { color: red; }'),
  ], 'BadImports', DEFAULT_CONVERSION_OPTIONS);
  assert.ok(converted.diagnostics.some(item => item.message.includes('External CSS @import')));
  assert.ok(converted.diagnostics.some(item => item.message.includes('could not be resolved to an imported project stylesheet')));
  assert.doesNotMatch(converted.rcss, /@import\s+(?:url\()?\s*["']?(?:https?:|missing\.css)/i);
});

test('VaCuus native backdrop blur is preserved without an undocumented same-rule shader requirement', () => {
  const result = convertCssToRcss(`.glass { decorator: shader(glass-panel); backdrop-filter: blur(12px); }
.ordinary { backdrop-filter: blur(6px); }
.unsupported { backdrop-filter: blur(6px) contrast(1.2); }`);
  assert.match(result.rcss, /\.glass\s*\{[^}]*backdrop-filter:\s*blur\(12px\)/s);
  assert.match(result.rcss, /\.ordinary\s*\{[^}]*backdrop-filter:\s*blur\(6px\)/s);
  assert.ok(result.diagnostics.some(item => item.message.includes('Preserved native VaCuus backdrop-filter: blur')));
  assert.ok(result.diagnostics.some(item => item.message.includes('other backdrop-filter functions are refused')));
  assert.match(result.rcss, /VaCuus unsupported backdrop-filter function/);
});

test('unknown named HTML entities generate a warning instead of silently appearing as entity text', () => {
  const result = convertHtmlToRml('<span>Known: &mdash; unknown: &hearts;</span>', 'entity.html');
  assert.ok(result.rml.includes('Known: — unknown: &amp;hearts;'));
  const issue = result.diagnostics.find(item => item.id.includes('html-unknown-entity') && item.message.includes('&hearts;'));
  assert.equal(issue?.severity, 'warning');
});


test('CSS pseudo-element state rules reuse one generated RML node instead of duplicating content', () => {
  const converted = convertProject([
    file('html', 'index.html', 'html', '<html><head><link rel="stylesheet" href="style.css"></head><body><button class="play">Play</button></body></html>'),
    file('css', 'style.css', 'css', '.play::before { content: "★"; color: #fff; } .play:hover::before { content: "★"; color: #0ff; }'),
  ], 'PseudoStates', DEFAULT_CONVERSION_OPTIONS);

  const helperClasses = [...converted.rml.matchAll(/class="([^"]*vacuus-pseudo-before-[^"]*)"/g)];
  assert.equal(helperClasses.length, 1, 'base and hover state should share a single real RML span');
  const classList = helperClasses[0][1].split(/\s+/);
  const helperClass = classList.find(name => name.startsWith('vacuus-pseudo-before-'));
  assert.ok(helperClass, 'a stable pseudo helper class should be generated');
  assert.ok(classList.includes('vacuus-pseudo-helper'), 'generated helper is hidden when no source pseudo selector matches');
  assert.ok(converted.rcss.includes(`.play .${helperClass}`), 'base selector should target the shared helper');
  assert.ok(converted.rcss.includes(`.play:hover .${helperClass}`), 'hover selector should target the same shared helper');
  assert.match(converted.vacuusBaseRcss, /\.vacuus-pseudo-helper \{\s*display: none;/);
});

test('CSS pseudo-element state with conflicting generated text is warned and not duplicated', () => {
  const converted = convertProject([
    file('html', 'index.html', 'html', '<html><head><link rel="stylesheet" href="style.css"></head><body><button class="play">Play</button></body></html>'),
    file('css', 'style.css', 'css', '.play::before { content: "PLAY"; } .play:hover::before { content: "HOVER"; }'),
  ], 'PseudoContentConflict', DEFAULT_CONVERSION_OPTIONS);

  assert.equal([...converted.rml.matchAll(/class="[^"]*vacuus-pseudo-before-[^"]*"/g)].length, 1);
  assert.ok(converted.diagnostics.some(issue => issue.id.includes('css-pseudo-element-content-conflict')));
});

test('CSS structural pseudo-elements are attached only to matching first/last source children', () => {
  const converted = convertProject([
    file('html', 'index.html', 'html', '<html><head><link rel="stylesheet" href="style.css"></head><body><div class="row">A</div><div class="row">B</div><div class="row">C</div></body></html>'),
    file('css', 'style.css', 'css', '.row:first-child::before { content: "FIRST"; } .row:last-child::before { content: "LAST"; }'),
  ], 'StructuralPseudo', DEFAULT_CONVERSION_OPTIONS);

  assert.match(converted.rml, /<div class="row"><span class="vacuus-pseudo-before-[^"]+ vacuus-pseudo-helper" aria-hidden="true">FIRST<\/span><span class="vacuus-text-run">A<\/span><\/div>/);
  assert.match(converted.rml, /<div class="row">B<\/div>/, 'middle row should not receive pseudo-element helpers');
  assert.match(converted.rml, /<div class="row"><span class="vacuus-pseudo-before-[^"]+ vacuus-pseudo-helper" aria-hidden="true">LAST<\/span><span class="vacuus-text-run">C<\/span><\/div>/);
  assert.equal([...converted.rml.matchAll(/vacuus-pseudo-helper/g)].length, 2);
});
