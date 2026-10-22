import test from 'node:test';
import assert from 'node:assert/strict';
import { getRasterSourceDataUrl, planLayoutImport } from '../layout-import-router.ts';
import type { ProjectFile } from '../types.ts';

const file = (overrides: Partial<ProjectFile> & Pick<ProjectFile, 'id' | 'path' | 'content'>): ProjectFile => ({
  type: 'asset', contentEncoding: 'base64', ...overrides,
});

test('a single imported screenshot routes to the design generator with a MIME-correct data URL', () => {
  const screenshot = file({ id: 'shot', path: 'MainMenu.webp', content: 'UklGRg==', mimeType: 'image/webp' });
  assert.equal(getRasterSourceDataUrl(screenshot), 'data:image/webp;base64,UklGRg==');
  const plan = planLayoutImport([screenshot]);
  assert.ok(plan);
  assert.equal(plan.kind, 'image');
  assert.equal(plan.name, 'MainMenu');
  assert.equal(plan.content, 'data:image/webp;base64,UklGRg==');
});

test('SVG plus image plus Figma JSON creates one coherent source plan', () => {
  const json: ProjectFile = { id: 'json', path: 'screen.json', content: '{"document":{}}', type: 'asset', contentEncoding: 'text' };
  const svg: ProjectFile = { id: 'svg', path: 'screen.svg', content: '<svg viewBox="0 0 100 50"></svg>', type: 'asset', contentEncoding: 'text', mimeType: 'image/svg+xml' };
  const png = file({ id: 'png', path: 'screen.png', content: 'iVBORw0KGgo=', mimeType: 'image/png' });
  const plan = planLayoutImport([json, svg, png]);
  assert.ok(plan);
  assert.equal(plan.kind, 'figma');
  assert.equal(plan.name, 'screen');
  assert.equal(plan.companionSvg?.content, svg.content);
  assert.equal(plan.companionPng?.dataUrl, 'data:image/png;base64,iVBORw0KGgo=');
  assert.deepEqual(plan.supplementalFiles.map(item => item.id), ['svg', 'png']);
});

test('an SVG and its PNG reference routes as a shared layout job', () => {
  const svg: ProjectFile = { id: 'svg', path: 'screen.svg', content: '<svg/>', type: 'asset', contentEncoding: 'text' };
  const png = file({ id: 'png', path: 'screen.jpg', content: '/9j/4AAQ', mimeType: 'image/jpeg' });
  const plan = planLayoutImport([svg, png]);
  assert.equal(plan?.kind, 'svg');
  assert.equal(plan?.companionPng?.dataUrl, 'data:image/jpeg;base64,/9j/4AAQ');
});

test('HTML/CSS projects are not accidentally routed as image-layout imports', () => {
  const html: ProjectFile = { id: 'html', path: 'index.html', content: '<html/>', type: 'html', contentEncoding: 'text' };
  const css: ProjectFile = { id: 'css', path: 'style.css', content: 'body { color: red }', type: 'css', contentEncoding: 'text' };
  assert.equal(planLayoutImport([html, css]), null);
});

test('invalid or unsupported binary assets are not treated as screenshots', () => {
  const font = file({ id: 'font', path: 'font.ttf', content: 'AAECAw==', mimeType: 'font/ttf' });
  const malformed = file({ id: 'bad', path: 'screen.png', content: 'not base64 %%%', mimeType: 'image/png' });
  assert.equal(getRasterSourceDataUrl(font), null);
  assert.equal(getRasterSourceDataUrl(malformed), null);
  assert.equal(planLayoutImport([font]), null);
  assert.equal(planLayoutImport([malformed]), null);
});


test('mixed HTML/CSS/JS projects bypass layout routing before converting image resources to data URLs', () => {
  const html: ProjectFile = { id: 'html', path: 'index.html', content: '<html/>', type: 'html', contentEncoding: 'text' };
  const css: ProjectFile = { id: 'css', path: 'style.css', content: 'body { color: red }', type: 'css', contentEncoding: 'text' };
  const js: ProjectFile = { id: 'js', path: 'main.js', content: 'console.log(1)', type: 'js', contentEncoding: 'text' };
  const assets = Array.from({ length: 150 }, (_, i) => file({ id: `asset-${i}`, path: `assets/${i}.png`, content: 'a'.repeat(4096), mimeType: 'image/png' }));
  assert.equal(planLayoutImport([html, css, js, ...assets]), null);
});
