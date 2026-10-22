import test from 'node:test';
import assert from 'node:assert/strict';
import {
  combineLayoutPipelineDocuments,
  layoutDocumentFromAi,
  scaleLayoutDocumentTo,
  validateLayoutPipelineDocument,
  type LayoutDocument,
} from '../layout-generator.ts';

function doc(sourceKind: LayoutDocument['sourceKind'], nodes: LayoutDocument['nodes'] = [], width = 800, height = 600): LayoutDocument {
  return { name: 'fixture', sourceKind, width, height, nodes, diagnostics: [] };
}

test('pipeline works with only SVG/JSON geometry when local AI is disabled', () => {
  const svg = doc('svg', [{ id: 'panel', name: 'Panel', kind: 'container', x: 20, y: 20, width: 300, height: 200, fill: '#202020' }]);
  const merged = combineLayoutPipelineDocuments(svg, null);
  assert.ok(merged);
  assert.equal(merged.nodes.length, 1);
  assert.equal(validateLayoutPipelineDocument(merged).valid, true);
});

test('pipeline warns when JSON text cannot be mapped without a final PNG vision pass', () => {
  const svg = doc('svg', [{ id: 'outlined-label', name: 'Outlined label', kind: 'raster', x: 50, y: 40, width: 120, height: 28, sourceType: 'path' }]);
  const json = doc('figma-json', [{ id: 'play-text', name: 'Play', kind: 'text', x: 0, y: 0, width: 60, height: 20, text: 'PLAY', fontFamily: 'Onest' }]);
  const merged = combineLayoutPipelineDocuments(svg, null, json);
  assert.ok(merged);
  assert.equal(merged.nodes.some(node => node.kind === 'text' && node.text === 'PLAY'), false);
  assert.ok(merged.diagnostics.some(item => item.includes('текстовые подписи') && item.includes('PNG-анализатор')));
});

test('final PNG vision stage adds a missing component but does not duplicate an existing one', () => {
  const base = doc('svg', [
    { id: 'bg', name: 'Background', kind: 'shape', x: 0, y: 0, width: 800, height: 600 },
    { id: 'play', name: 'PLAY', kind: 'text', x: 300, y: 400, width: 100, height: 32, text: 'PLAY' },
  ]);
  const vision = layoutDocumentFromAi(800, 600, [
    { name: 'Play label', kind: 'text', text: 'PLAY', x: 300, y: 400, width: 100, height: 32, confidence: 0.91 },
    { name: 'Main card', kind: 'panel', x: 220, y: 160, width: 360, height: 260, confidence: 0.88 },
  ]);
  const merged = combineLayoutPipelineDocuments(base, vision);
  assert.ok(merged);
  assert.equal(merged.nodes.filter(node => node.kind === 'text' && node.text === 'PLAY').length, 1);
  assert.equal(merged.nodes.filter(node => node.name === 'Main card').length, 1);
  assert.equal(merged.nodes.length, 3);
});

test('Figma JSON semantic text enriches a PNG-detected label when exact string is recognized', () => {
  const svg = doc('svg', [{ id: 'outline', name: 'outlined-text', kind: 'raster', x: 100, y: 100, width: 100, height: 30, sourceType: 'path' }]);
  const json = doc('figma-json', [{ id: 'label', name: 'Start Button Label', kind: 'text', x: 100, y: 100, width: 100, height: 30, text: 'START', fontFamily: 'Onest', fontWeight: 700 }]);
  const vision = layoutDocumentFromAi(800, 600, [{ name: 'Button caption', kind: 'text', text: 'START', x: 100, y: 100, width: 100, height: 30, confidence: 0.9 }]);
  const merged = combineLayoutPipelineDocuments(svg, vision, json);
  assert.ok(merged);
  const textNode = merged.nodes.find(node => node.kind === 'text' && node.text === 'START');
  assert.ok(textNode);
  assert.equal(textNode.fontFamily, 'Onest');
  assert.equal(textNode.fontWeight, 700);
});

test('supplemental SVG geometry is merged into a coordinate-complete JSON tree without exact duplicates', () => {
  const json = doc('figma-json', [{ id: 'card', name: 'Card', kind: 'container', x: 20, y: 20, width: 250, height: 140 }]);
  const svg = doc('svg', [
    { id: 'card-svg', name: 'Card', kind: 'container', x: 20, y: 20, width: 250, height: 140 },
    { id: 'decoration', name: 'Decoration', kind: 'raster', x: 30, y: 30, width: 20, height: 20, sourceType: 'path' },
  ]);
  const merged = combineLayoutPipelineDocuments(json, null, null, svg);
  assert.ok(merged);
  assert.equal(merged.nodes.filter(node => node.name === 'Card').length, 1);
  assert.equal(merged.nodes.filter(node => node.name === 'Decoration').length, 1);
});

test('validation blocks empty IR and invalid geometry but accepts usable partial output', () => {
  assert.equal(validateLayoutPipelineDocument(doc('png', [])).valid, false);
  const invalid = doc('svg', [{ id: 'bad', name: 'Bad', kind: 'shape', x: NaN, y: 0, width: 20, height: 20 }]);
  assert.equal(validateLayoutPipelineDocument(invalid).valid, false);
  const valid = doc('png', [{ id: 'button', name: 'Button', kind: 'container', x: 2, y: 2, width: 100, height: 50 }]);
  assert.equal(validateLayoutPipelineDocument(valid).valid, true);
});


test('secondary SVG geometry is scaled to authoritative JSON canvas before merge', () => {
  const svg = doc('svg', [{ id: 'svg-box', name: 'Box', kind: 'shape', x: 10, y: 10, width: 100, height: 40, radius: 4, fontSize: 10 }], 1000, 500);
  const scaled = scaleLayoutDocumentTo(svg, 1920, 1080);
  assert.equal(scaled.width, 1920);
  assert.equal(scaled.height, 1080);
  assert.equal(scaled.nodes[0].x, 19.2);
  assert.equal(scaled.nodes[0].y, 21.6);
  assert.ok(scaled.diagnostics.some(item => item.includes('масштабированы')));
});
