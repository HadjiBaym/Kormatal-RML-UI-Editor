import test from 'node:test';
import assert from 'node:assert/strict';
import { convertHtmlToRml } from '../html-to-rml.ts';
import type { DiagnosticIssue, ProjectFile } from '../types.ts';
import { applySafeSourceAutoFixes, getSafeSourceAutoFixes, isSafeSourceAutoFix } from '../safe-auto-fix.ts';

function aliasIssue(html: string) {
  const result = convertHtmlToRml(html, 'screen.html');
  const issue = result.diagnostics.find(item => item.id.startsWith('html-data-for-alias-'));
  assert.ok(issue, 'test HTML should produce the reserved alias diagnostic');
  return issue;
}

test('Fix All renames reserved alias and its binding references only inside that loop', () => {
  const html = `<div data-model="InventoryModel">\n  <div data-for="t : Items">\n    <span>{{t.Name}}</span>\n    <span>{{ t.Count }}</span>\n  </div>\n  <span>{{t.TranslationKey}}</span>\n</div>`;
  const issue = aliasIssue(html);
  const files: ProjectFile[] = [
    { id: 'html', path: 'screen.html', type: 'html', content: html },
    { id: 'css', path: 'style.css', type: 'css', content: '.card { display: grid; box-shadow: 0 0 10px red; transition: opacity .2s ease; }' },
    { id: 'js', path: 'script.js', type: 'js', content: 'localStorage.setItem("x", value); window.alert(value);' },
  ];

  const result = applySafeSourceAutoFixes(files, [issue]);
  assert.deepEqual(result.appliedIssueIds, [issue.id]);
  assert.deepEqual(result.skippedIssueIds, []);
  assert.match(result.files[0].content, /data-for="item\s*:\s*Items"/);
  assert.match(result.files[0].content, /\{\{item\.Name\}\}/);
  assert.match(result.files[0].content, /\{\{ item\.Count \}\}/);
  assert.match(result.files[0].content, /\{\{t\.TranslationKey\}\}/, 'unrelated translation binding outside the loop must remain unchanged');
  assert.equal(result.files[1].content, files[1].content, 'CSS source must not be rewritten by Fix All');
  assert.equal(result.files[2].content, files[2].content, 'JavaScript source must not be rewritten by Fix All');
});

test('Fix All skips loop aliases when t-dot references occur in arbitrary JavaScript', () => {
  const html = `<div data-for="t : Items">\n  <span>{{t.Name}}</span>\n  <script>const x = t.value;</script>\n</div>`;
  const issue = aliasIssue(html);
  const files: ProjectFile[] = [{ id: 'html', path: 'screen.html', type: 'html', content: html }];
  const result = applySafeSourceAutoFixes(files, [issue]);
  assert.deepEqual(result.appliedIssueIds, []);
  assert.deepEqual(result.skippedIssueIds, [issue.id]);
  assert.equal(result.files[0].content, html);
});

test('Fix All chooses a non-conflicting alias and handles nested elements', () => {
  const html = `<div data-for='t : Items'>\n  <div class="inner"><span>{{t.Name}}</span></div>\n</div>`;
  const issue = aliasIssue(html);
  const result = applySafeSourceAutoFixes([{ id: 'html', path: 'screen.html', type: 'html', content: html }], [issue]);
  assert.equal(result.appliedIssueIds.length, 1);
  assert.match(result.files[0].content, /data-for='item\s*:\s*Items'/);
  assert.match(result.files[0].content, /\{\{item\.Name\}\}/);
});

test('Only scoped reserved-alias diagnostics are offered as source auto-fixes', () => {
  const base: DiagnosticIssue = {
    id: 'css-grid-3', severity: 'warning', category: 'css', file: 'style.css', line: 3, column: 1,
    originalSnippet: 'display: grid', message: 'Grid needs a fallback.', impact: 'Grid tracks may differ.',
    autoFixAvailable: true, fixed: false, recommendedAction: 'Review child sizing.',
  };
  const sourceAlias = { ...base, id: 'html-data-for-alias-3', category: 'html' as const, file: 'screen.html' };
  assert.equal(isSafeSourceAutoFix(base), false);
  assert.equal(isSafeSourceAutoFix(sourceAlias), true);
  assert.deepEqual(getSafeSourceAutoFixes([base, sourceAlias]).map(item => item.id), [sourceAlias.id]);
});

test('Fix All processes nested reserved aliases inside-out even when both appear on one line', () => {
  const html = '<div data-for="t : Parents"><span>{{t.Name}}</span><div data-for="t : Children"><span>{{t.Name}}</span></div></div>';
  const diagnostics = convertHtmlToRml(html, 'screen.html').diagnostics.filter(item => item.id.startsWith('html-data-for-alias-'));
  assert.equal(diagnostics.length, 2);
  const result = applySafeSourceAutoFixes([{ id: 'html', path: 'screen.html', type: 'html', content: html }], diagnostics);
  assert.equal(result.appliedIssueIds.length, 2);
  assert.match(result.files[0].content, /data-for="entry : Parents"/);
  assert.match(result.files[0].content, /data-for="item : Children"/);
  assert.match(result.files[0].content, /\{\{entry\.Name\}\}/);
  assert.match(result.files[0].content, /\{\{item\.Name\}\}/);
});
