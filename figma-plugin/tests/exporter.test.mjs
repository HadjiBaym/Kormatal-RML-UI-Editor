import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const exporterPath = new URL('../code.js', import.meta.url);

function makeNode(id, name, type, fields = {}) {
  const box = fields.absoluteBoundingBox || { x: 0, y: 0, width: 20, height: 20 };
  const values = {
    id, name, type, visible: true, x: box.x, y: box.y, width: box.width, height: box.height,
    rotation: 0, absoluteBoundingBox: box, exportAsync: async () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    ...fields,
  };
  if (Array.isArray(values.children)) values.children = values.children;
  return new Proxy(values, {
    has(target, key) { return Reflect.has(target, key); },
    get(target, key, receiver) {
      if (typeof key === 'string' && !Reflect.has(target, key)) throw new TypeError(`unsupported property ${key} on ${type}`);
      return Reflect.get(target, key, receiver);
    },
  });
}

test('Figma exporter safely serializes GROUP and SLICE nodes and embeds raster/reference PNGs', async () => {
  const slice = makeNode('slice:1', 'Slice', 'SLICE', { absoluteBoundingBox: { x: 1, y: 2, width: 1, height: 2 } });
  const vector = makeNode('vector:1', 'Logo', 'VECTOR', { fills: [], absoluteBoundingBox: { x: 10, y: 10, width: 32, height: 36 } });
  const group = makeNode('group:1', 'Toolbar group', 'GROUP', { children: [vector, slice], absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 } });
  const frame = makeNode('frame:1', 'Screen', 'FRAME', {
    fills: [{ type: 'SOLID', visible: true, opacity: 1, color: { r: 0, g: 0, b: 0 } }],
    layoutMode: 'NONE', children: [group], absoluteBoundingBox: { x: 0, y: 0, width: 1920, height: 1080 },
  });
  const posted = [];
  const figma = {
    mixed: Symbol('mixed'),
    showUI() {},
    closePlugin() {},
    currentPage: { name: 'Canvas', selection: [frame] },
    ui: { postMessage: message => posted.push(message), onmessage: undefined },
  };
  const code = await readFile(exporterPath, 'utf8');
  const globals = {
    figma, __html__: '', TextEncoder,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
  };
  runInNewContext(code, globals);
  await figma.ui.onmessage({ type: 'EXPORT_SELECTED' });

  const ready = posted.find(message => message.type === 'EXPORT_READY');
  assert.ok(ready, posted.map(message => message.message).join('\n'));
  assert.equal(ready.assets, 1);
  assert.equal(ready.referenceImages, 1);
  const payload = JSON.parse(ready.json);
  const exportedFrame = payload.document.children[0].children[0];
  const exportedGroup = exportedFrame.children[0];
  const exportedVector = exportedGroup.children.find(node => node.type === 'VECTOR');
  const exportedSlice = exportedGroup.children.find(node => node.type === 'SLICE');
  assert.equal(exportedGroup.fills, undefined);
  assert.equal(exportedSlice.opacity, undefined);
  assert.equal(exportedVector.embeddedAsset.mimeType, 'image/png');
  assert.ok(exportedVector.embeddedAsset.contentBase64.startsWith('iVBORw0KGgo'));
  assert.ok(exportedFrame.referenceImage.contentBase64.startsWith('iVBORw0KGgo'));
});
