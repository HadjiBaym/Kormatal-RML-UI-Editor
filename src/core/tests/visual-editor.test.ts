import test from 'node:test';
import assert from 'node:assert/strict';
import { applyVisualEditToProject, sanitizeVisualDeclarations, upsertVisualOverride, validateVisualDeclarationsForRmlUi } from '../visual-editor.ts';
import type { ProjectFile } from '../types.ts';
import { convertProject, DEFAULT_CONVERSION_OPTIONS } from '../project-converter.ts';

test('upsertVisualOverride updates existing declarations without duplicating them', () => {
  const before = '.button { background: #123456; width: 100px; }';
  const after = upsertVisualOverride(before, '.button', { width: '144px', color: '#ffffff' });
  assert.match(after, /width:\s*144px/);
  assert.match(after, /background:\s*#123456/);
  assert.match(after, /color:\s*#ffffff/);
  assert.equal((after.match(/width\s*:/g) || []).length, 1);
});

test('upsertVisualOverride appends an override for a selector not in the source', () => {
  const after = upsertVisualOverride('.button { color: white; }', '#play', { 'background-color': '#00d4b5' });
  assert.match(after, /#play\s*\{[^}]*background-color:\s*#00d4b5/s);
});

test('sanitizeVisualDeclarations rejects unsafe or non-style properties', () => {
  const clean = sanitizeVisualDeclarations({
    width: '120px',
    onclick: 'alert(1)',
    color: 'red; body { display:none',
    background: 'url(javascript:alert(1))',
    'background-color': '#112233',
  });
  assert.deepEqual(clean, { width: '120px', 'background-color': '#112233' });
  assert.deepEqual(sanitizeVisualDeclarations({ background: '#00d4b5' }), { background: '#00d4b5' });
  assert.deepEqual(sanitizeVisualDeclarations({ background: 'linear-gradient(red, blue)' }), {});
});


test('visual editor only allows the three bundled font families', () => {
  assert.deepEqual(sanitizeVisualDeclarations({ 'font-family': 'Tektur' }), { 'font-family': 'Tektur' });
  assert.deepEqual(sanitizeVisualDeclarations({ 'font-family': 'JetBrains Mono' }), { 'font-family': 'JetBrains Mono' });
  assert.deepEqual(sanitizeVisualDeclarations({ 'font-family': 'Comic Sans MS' }), {});
});

test('applyVisualEditToProject creates an override stylesheet and links it from HTML', () => {
  const files: ProjectFile[] = [
    { id: 'html', path: 'index.html', type: 'html', content: '<html><head><title>UI</title></head><body><button class="play">PLAY</button></body></html>' },
    { id: 'css', path: 'main.css', type: 'css', content: '.play { width: 100px; }' },
  ];
  const edited = applyVisualEditToProject(files, '.play', { width: '140px', 'background-color': '#00d4b5' });
  const override = edited.find(f => f.path === 'visual-editor-overrides.css');
  assert.ok(override);
  assert.match(override!.content, /\.play/);
  assert.match(override!.content, /width:\s*140px/);
  assert.match(edited.find(f => f.path === 'index.html')!.content, /href="visual-editor-overrides\.css"/);
});

test('subsequent visual edits reuse the override stylesheet and preserve earlier properties', () => {
  const files: ProjectFile[] = [
    { id: 'html', path: 'index.html', type: 'html', content: '<html><head></head><body><button id="play">PLAY</button></body></html>' },
  ];
  const first = applyVisualEditToProject(files, '#play', { width: '140px' });
  const second = applyVisualEditToProject(first, '#play', { color: '#ffffff' });
  assert.equal(second.filter(f => f.path === 'visual-editor-overrides.css').length, 1);
  const css = second.find(f => f.path === 'visual-editor-overrides.css')!.content;
  assert.match(css, /width:\s*140px/);
  assert.match(css, /color:\s*#ffffff/);
  assert.equal((css.match(/#play\s*\{/g) || []).length, 1);
});


test('nested HTML pages get their visual override stylesheet beside the entry document', () => {
  const files: ProjectFile[] = [
    { id: 'html', path: 'screens/combat/index.html', type: 'html', content: '<html><head></head><body><button class="play">PLAY</button></body></html>' },
  ];
  const edited = applyVisualEditToProject(files, '.play', { width: '150px' });
  assert.ok(edited.some(f => f.path === 'screens/combat/visual-editor-overrides.css'));
  assert.match(edited.find(f => f.path === 'screens/combat/index.html')!.content, /href="visual-editor-overrides\.css"/);
});


test('viewport edits flow through project conversion into generated RCSS', () => {
  const files: ProjectFile[] = [
    { id: 'html', path: 'index.html', type: 'html', content: '<html><head><link rel="stylesheet" href="main.css"></head><body><button class="play">PLAY</button></body></html>' },
    { id: 'css', path: 'main.css', type: 'css', content: '.play { width: 100px; color: white; }' },
  ];
  const edited = applyVisualEditToProject(files, '.play', { width: '160px', 'background-color': '#00d4b5' });
  const converted = convertProject(edited, 'visualeditortest', DEFAULT_CONVERSION_OPTIONS);
  assert.match(converted.rcss, /\.play\s*\{[^}]*width:\s*160px/s);
  assert.match(converted.rcss, /\.play\s*\{[^}]*background-color:\s*#00d4b5/s);
});


test('RmlUi visual validation flags known unsupported properties and risky layout values', () => {
  const issues = validateVisualDeclarationsForRmlUi({
    display: 'grid',
    'grid-template-columns': '1fr 1fr',
    width: '-12px',
    height: '50%',
    color: '#ffffff',
  });
  assert.ok(issues.some(issue => issue.property === 'display' && issue.severity === 'error'));
  assert.ok(issues.some(issue => issue.property === 'grid-template-columns' && issue.severity === 'error'));
  assert.ok(issues.some(issue => issue.property === 'width' && issue.severity === 'error'));
  assert.ok(issues.some(issue => issue.property === 'height' && issue.severity === 'warning'));
  assert.equal(issues.some(issue => issue.property === 'color'), false);
});


test('visual editor permits native backdrop-filter blur and rejects unsupported filter chains', () => {
  const issues = validateVisualDeclarationsForRmlUi({ 'backdrop-filter': 'blur(12px)' });
  assert.equal(issues.length, 0);
  assert.deepEqual(sanitizeVisualDeclarations({ 'backdrop-filter': 'blur(12px)' }), { 'backdrop-filter': 'blur(12px)' });
  const unsupported = validateVisualDeclarationsForRmlUi({ 'backdrop-filter': 'blur(12px) contrast(1.2)' });
  assert.equal(unsupported.length, 1);
  assert.equal(unsupported[0].severity, 'error');
  assert.match(unsupported[0].message, /blur\(\.\.\.\) path only/i);
  assert.deepEqual(sanitizeVisualDeclarations({ 'backdrop-filter': 'blur(12px) contrast(1.2)' }), {});
});

test('visual overrides reject selectors that could break the stylesheet structure', () => {
  const before = '.play { width: 100px; }';
  assert.equal(upsertVisualOverride(before, '.play } body', { width: '200px' }), before);
  const files: ProjectFile[] = [{ id: 'html', path: 'index.html', type: 'html', content: '<html><head></head><body><button>Play</button></body></html>' }];
  assert.equal(applyVisualEditToProject(files, 'button; body', { width: '200px' }), files);
});
