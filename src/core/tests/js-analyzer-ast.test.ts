import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { analyzeAndConvertJs } from '../js-analyzer.ts';

test('JS AST analyzer ignores API-looking text inside comments and string literals', () => {
  const source = [
    `const note = "fetch('/api'); localStorage.getItem('x'); .innerHTML";`,
    '// window.alert("not a call"); document.cookie;',
    '/* new MutationObserver(() => {}); */',
  ].join('\n');
  const result = analyzeAndConvertJs(source, 'strings.js');

  assert.equal(result.diagnostics.filter(d => d.category === 'js' && d.severity !== 'info').length, 0);
  assert.ok(result.convertedJs.includes("fetch('/api')"));
  assert.ok(result.convertedJs.includes('.innerHTML'));
});

test('JS AST analyzer detects actual forbidden browser API references with source locations', () => {
  const source = [
    'function save() {',
    '  localStorage.setItem("score", 12);',
    '  fetch("/api/score");',
    '  window.alert("Saved");',
    '  document.cookie = "x=y";',
    '}',
  ].join('\n');
  const result = analyzeAndConvertJs(source, 'real-apis.js');

  assert.ok(result.diagnostics.some(d => d.id.includes('localStorage') && d.line === 2));
  assert.ok(result.diagnostics.some(d => d.id.includes('fetch') && d.line === 3));
  assert.ok(result.diagnostics.some(d => d.id.includes('window-alert') && d.line === 4));
  assert.ok(result.diagnostics.some(d => d.id.includes('document-cookie') && d.line === 5));
  assert.equal(result.metrics.browserApisFlagged, 4);
});

test('JS AST analyzer flags browser window members absent from the VaCuus runtime', () => {
  const source = [
    'window.matchMedia("(min-width: 800px)");',
    'window.location.pathname;',
    'function readViewport(window) { return window.innerWidth; }',
  ].join('\n');
  const result = analyzeAndConvertJs(source, 'browser-window.js');

  assert.ok(result.diagnostics.some(d => d.id.includes('js-window-') && d.line === 1));
  assert.ok(result.diagnostics.some(d => d.id.includes('location-navigation') && d.line === 2));
  assert.equal(result.diagnostics.some(d => d.id.includes('js-window-') && d.line === 3), false, 'Locally shadowed window is not the browser global');
});

test('JS AST analyzer skips browser-global warnings when names are locally shadowed', () => {
  const source = [
    'function run(fetch, localStorage) {',
    '  fetch("local endpoint");',
    '  localStorage.getItem("in-memory");',
    '}',
  ].join('\n');
  const result = analyzeAndConvertJs(source, 'shadowed.js');

  assert.equal(result.diagnostics.filter(d => ['fetch()', 'localStorage'].some(name => d.id.includes(name.replace(/[^a-zA-Z0-9]/g, '-')))).length, 0);
});

test('JS AST innerHTML rewrite only edits member properties, including computed string properties', () => {
  const source = [
    'const text = ".innerHTML"; // element.innerHTML should remain in this comment',
    'el.innerHTML = "<span>ok</span>";',
    'el["innerHTML"] = "<b>ok</b>";',
  ].join('\n');
  const result = analyzeAndConvertJs(source, 'inner-html.js', { sanitizeBrowserJs: true });

  assert.ok(result.convertedJs.includes('el.innerRML = "<span>ok</span>";'));
  assert.ok(result.convertedJs.includes('el["innerRML"] = "<b>ok</b>";'));
  assert.ok(result.convertedJs.includes('const text = ".innerHTML"; // element.innerHTML should remain in this comment'));
  assert.equal(result.diagnostics.filter(d => d.id.includes('innerhtml')).length, 2);
});

test('JS AST analyzer does not rewrite source when parsing fails (e.g. JSX)', () => {
  const source = 'const view = <div>{user.name}</div>; el.innerHTML = "x";';
  const result = analyzeAndConvertJs(source, 'screen.jsx');

  assert.ok(result.diagnostics.some(d => d.id.includes('parse-failed')));
  assert.equal(result.diagnostics.some(d => d.id.includes('innerhtml')), false);
  assert.ok(result.convertedJs.includes(source));
});

test('JS AST analyzer adapts plain textContent writes through VaCuus literal text nodes', () => {
  const source = [
    'const label = node.textContent;',
    'var assigned = (node.textContent = userInput);',
    'textNode.textContent = userInput;',
    'documentNode.textContent = userInput;',
    'const rawText = textNode.nodeValue;',
  ].join('\n');
  const result = analyzeAndConvertJs(source, 'text-content.js');

  const unsupported = result.diagnostics.filter(d => d.id.includes('textContent'));
  assert.equal(unsupported.length, 4);
  assert.equal(unsupported.find(d => d.id.startsWith('js-textContent-'))?.severity, 'manual-fix', 'Reads remain a manual fix');
  const writes = unsupported.filter(d => d.id.startsWith('js-textContent-write-'));
  assert.equal(writes.length, 3);
  assert.ok(writes.every(write => write.severity === 'warning' && write.fixed));
  assert.ok(result.convertedJs.includes('__vacuusSetTextContent(node, userInput)'), 'Assignment should use the text-node adapter');
  assert.ok(result.convertedJs.includes('document.createTextNode(text)'));
  assert.ok(!result.convertedJs.includes('node.textContent = userInput'), 'No unsupported property assignment should remain');
  assert.ok(result.convertedJs.includes('textNode.nodeValue'));

  const literal = '{{not RML}} <b>still text</b>';
  type MockTextNode = { nodeType: number; nodeValue: string };
  type MockElement = {
    nodeType: number;
    childNodes: Array<{ nodeType: number; tagName?: string; nodeValue?: string }>;
    innerRML: string;
    appendChild: (textNode: MockTextNode) => MockTextNode;
  };
  const node: MockElement = {
    nodeType: 1,
    childNodes: [{ nodeType: 1, tagName: 'old' }],
    set innerRML(value: string) {
      assert.equal(value, '');
      this.childNodes = [];
    },
    appendChild(textNode: { nodeType: number; nodeValue: string }) {
      this.childNodes.push(textNode);
      return textNode;
    },
  };
  const context = vm.createContext({
    document: { createTextNode: (text: string) => ({ nodeType: 3, nodeValue: text }) },
    node,
    textNode: { nodeType: 3, nodeValue: 'existing text' },
    documentNode: { nodeType: 9, nodeValue: 'document sentinel' },
    userInput: literal,
  });
  vm.runInContext(result.convertedJs, context);
  assert.equal(context.assigned, literal, 'The assignment expression still returns its RHS');
  assert.deepEqual(node.childNodes, [{ nodeType: 3, nodeValue: literal }], 'Markup-looking input remains one literal text node');
  assert.equal(context.textNode.nodeValue, literal, 'Text-node assignments use nodeValue');
  assert.equal(context.documentNode.nodeValue, 'document sentinel', 'Document textContent writes remain no-ops');
});

test('JS AST analyzer leaves textContent writes manual when sanitizing is disabled or document is shadowed', () => {
  const unsanitized = analyzeAndConvertJs('node.textContent = value;', 'text-content.js', { sanitizeBrowserJs: false });
  const issue = unsanitized.diagnostics.find(d => d.id.includes('textContent'));
  assert.equal(issue?.severity, 'manual-fix');
  assert.equal(issue?.fixed, false);
  assert.ok(unsanitized.convertedJs.includes('node.textContent = value;'));

  const shadowed = analyzeAndConvertJs('function update(document, node) { node.textContent = value; }', 'text-content.js');
  const shadowedIssue = shadowed.diagnostics.find(d => d.id.includes('textContent'));
  assert.equal(shadowedIssue?.severity, 'manual-fix');
  assert.equal(shadowedIssue?.fixed, false);
  assert.ok(shadowed.convertedJs.includes('node.textContent = value;'));

  const compound = analyzeAndConvertJs('node.textContent += suffix;', 'text-content.js');
  const compoundIssue = compound.diagnostics.find(d => d.id.includes('textContent'));
  assert.equal(compoundIssue?.severity, 'manual-fix');
  assert.equal(compoundIssue?.fixed, false);
  assert.ok(compound.convertedJs.includes('node.textContent += suffix;'));

  const collision = analyzeAndConvertJs('function __vacuusSetTextContent() {} node.textContent = value;', 'text-content.js');
  assert.ok(collision.convertedJs.includes('function __vacuusSetTextContent_('));
  assert.ok(collision.convertedJs.includes('__vacuusSetTextContent_(node, value)'));
});

test('JS AST analyzer marks module graphs for bundling before classic RML script output', () => {
  const source = [
    'import { formatScore } from "./format.js";',
    'export function renderScore(score) { return formatScore(score); }',
    'import("./optional.js");',
  ].join('\n');
  const result = analyzeAndConvertJs(source, 'screen.js');

  const moduleIssues = result.diagnostics.filter(d => d.id.includes('ES-module-syntax'));
  assert.equal(moduleIssues.length, 3);
  assert.ok(moduleIssues.every(d => d.severity === 'manual-fix'));
  assert.ok(result.convertedJs.includes('import { formatScore }'));
  assert.ok(result.convertedJs.includes('export function renderScore'));
});

test('JS AST analyzer recommends bounded nodes for append calls, but ignores similar text in comments', () => {
  const source = [
    '// rows.appendChild(row) followed by rows.children.length > LIMIT',
    'function add(rows, row) { rows.appendChild(row); }',
  ].join('\n');
  const result = analyzeAndConvertJs(source, 'growth.js');
  assert.ok(result.diagnostics.some(d => d.id.includes('unbounded-list')));

  const safe = analyzeAndConvertJs('function add(rows, row) { rows.appendChild(row); while (rows.children.length > 52) rows.children[0].remove(); }', 'bounded.js');
  assert.equal(safe.diagnostics.some(d => d.id.includes('unbounded-list')), false);
});
