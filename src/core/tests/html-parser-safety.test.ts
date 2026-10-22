import test from 'node:test';
import assert from 'node:assert/strict';
import { collectText, descendants, firstDescendant, parseHtmlTree } from '../html-parser.ts';

test('HTML tree walks deeply nested markup without JavaScript recursion', () => {
  const depth = 1500;
  const html = '<div>'.repeat(depth) + '<span>safe</span>' + '</div>'.repeat(depth);
  const tree = parseHtmlTree(html);
  const all = descendants(tree.children);
  assert.equal(all.filter(node => node.type === 'element').length, depth + 1);
  assert.equal(collectText(tree.children[0]), 'safe');
  assert.equal(firstDescendant(tree, node => node.type === 'element' && node.name === 'span')?.name, 'span');
});
