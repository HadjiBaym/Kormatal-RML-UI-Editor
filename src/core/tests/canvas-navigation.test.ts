import test from 'node:test';
import assert from 'node:assert/strict';
import { panCanvasByPointer, panCanvasByWheel, zoomCanvasAtPoint } from '../canvas-navigation.ts';

test('cursor-anchored zoom keeps the design point under the cursor stationary', () => {
  const before = { zoom: 0.5, pan: { x: 120, y: 80 } };
  const cursor = { x: 340, y: 260 };
  const worldBefore = { x: (cursor.x - before.pan.x) / before.zoom, y: (cursor.y - before.pan.y) / before.zoom };
  const after = zoomCanvasAtPoint(before, cursor, -180);
  const worldAfter = { x: (cursor.x - after.pan.x) / after.zoom, y: (cursor.y - after.pan.y) / after.zoom };
  assert.ok(after.zoom > before.zoom);
  assert.ok(Math.abs(worldAfter.x - worldBefore.x) < 1e-9);
  assert.ok(Math.abs(worldAfter.y - worldBefore.y) < 1e-9);
});

test('cursor-anchored zoom clamps to safe min and max values', () => {
  const initial = { zoom: 0.5, pan: { x: 0, y: 0 } };
  assert.equal(zoomCanvasAtPoint(initial, { x: 0, y: 0 }, 100000).zoom, 0.1);
  assert.equal(zoomCanvasAtPoint(initial, { x: 0, y: 0 }, -100000).zoom, 3);
});

test('wheel pan preserves expected direction for trackpads and shift-wheel', () => {
  assert.deepEqual(panCanvasByWheel({ x: 20, y: 30 }, 5, -12), { x: 15, y: 42 });
});

test('iframe pointer pan converts document deltas to host pixels at current canvas zoom', () => {
  assert.deepEqual(panCanvasByPointer({ x: 20, y: 30 }, 100, -50, 0.5, 0.5), { x: 70, y: 5 });
});
