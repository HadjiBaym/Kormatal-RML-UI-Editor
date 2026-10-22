import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import {
  createManualLayoutNode,
  listFigmaFrames,
  generateLayoutSources,
  generateReferenceScreenSources,
  generateLayoutInteractionJs,
  validateGeneratedLayoutBundle,
  getLayoutSourcePipeline,
  layoutDocumentFromAi,
  parseFigmaJsonLayout,
  parseFigmaJsonReferenceImage,
  parseSvgLayout,
  renderLayoutDocumentSvg,
  updateLayoutNode,
} from '../layout-generator.ts';

test('SVG import reads viewBox, inherited group transform, fill and text', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240" viewBox="0 0 400 240"><g transform="translate(10 20)" fill="#112233"><rect id="card" x="5" y="6" width="100" height="60" rx="8"/><text id="title" x="20" y="50" font-size="18">Main menu</text></g></svg>`;
  const parsed = parseSvgLayout(svg, 'Main menu');
  assert.equal(parsed.width, 400);
  assert.equal(parsed.height, 240);
  assert.equal(parsed.nodes.length, 2);
  assert.equal(parsed.nodes[0].x, 15);
  assert.equal(parsed.nodes[0].y, 26);
  assert.equal(parsed.nodes[0].fill, '#112233');
  assert.equal(parsed.nodes[0].radius, 8);
  assert.equal(parsed.nodes[1].text, 'Main menu');
  assert.equal(parsed.nodes[1].fontSize, 18);
});

test('SVG Path is represented as a raster-backed node with a renderable isolated SVG', () => {
  const parsed = parseSvgLayout(`<svg width="100" height="80" viewBox="0 0 100 80"><path id="shape" d="M10 10 l40 0 l0 30 z" fill="#ff0000"/></svg>`);
  assert.equal(parsed.nodes.length, 1);
  assert.equal(parsed.nodes[0].kind, 'raster');
  assert.ok(parsed.nodes[0].rasterSvg?.includes('<path'));
  assert.ok(parsed.nodes[0].rasterSvg?.includes('xmlns:xlink="http://www.w3.org/1999/xlink"'));
  assert.ok(parsed.nodes[0].width >= 40);
  assert.ok(parsed.nodes[0].height >= 30);
});

test('SVG scripts are rejected while non-executable Figma foreignObject placeholders are removed with diagnostics', () => {
  assert.throws(() => parseSvgLayout(`<svg width="20" height="20"><script>alert(1)</script><rect width="10" height="10"/></svg>`), /script|active content/i);
  const parsed = parseSvgLayout(`<svg width="20" height="20"><foreignObject x="0" y="0" width="20" height="20"><div xmlns="http://www.w3.org/1999/xhtml" style="backdrop-filter:blur(10px)"></div></foreignObject><rect width="10" height="10"/></svg>`);
  assert.equal(parsed.nodes.length, 1);
  assert.ok(parsed.diagnostics.some(item => item.includes('foreignObject')));
});

test('generated RML/RCSS uses bundled font defaults and stable local asset references', () => {
  const document = {
    name: 'Figma screen', width: 1920, height: 1080, sourceKind: 'svg' as const, diagnostics: [],
    nodes: [
      { id: 'title', name: 'Title', kind: 'text' as const, x: 16, y: 12, width: 260, height: 32, text: 'LAMGUARD', fontFamily: 'Tektur' as const, fontSize: 24, fill: '#ffffff' },
      { id: 'icon', name: 'Icon', kind: 'raster' as const, x: 8, y: 50, width: 24, height: 24, assetPath: 'Assets/vector-001.png' },
    ],
  };
  const output = generateLayoutSources(document);
  assert.ok(output.rml.includes('href="layout.rcss"'));
  assert.ok(output.rml.includes('src="Assets/vector-001.png"'));
  assert.ok(output.rcss.includes('font-family: "Tektur"'));
  assert.ok(!output.rcss.includes('object-fit'), 'generated RCSS must not rely on properties absent from the compatibility matrix');
  assert.ok(output.rcss.includes('width: 1920px'));
  assert.ok(!output.rcss.includes('Inter'));
});

test('Figma JSON import selects the largest frame, carries background, coordinates, fonts, and text', () => {
  const figma = {
    document: { type: 'DOCUMENT', children: [{ type: 'CANVAS', children: [
      { id: 'small', name: 'Small', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 }, fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }], children: [] },
      { id: 'big', name: 'MainMenu', type: 'FRAME', absoluteBoundingBox: { x: 20, y: 40, width: 1920, height: 1080 }, fills: [{ type: 'SOLID', color: { r: 0.05, g: 0.06, b: 0.08 } }], children: [
        { id: 'txt', name: 'Title', type: 'TEXT', absoluteBoundingBox: { x: 100, y: 120, width: 600, height: 72 }, characters: 'LAMGUARD', fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }], style: { fontFamily: 'Tektur', fontSize: 64, fontWeight: 700, textAlignHorizontal: 'LEFT' } },
      ] },
    ] }] },
  };
  const parsed = parseFigmaJsonLayout(JSON.stringify(figma));
  assert.equal(parsed.name, 'MainMenu');
  assert.equal(parsed.width, 1920);
  assert.equal(parsed.nodes.length, 1);
  assert.equal(parsed.backgroundColor, '#0d0f14');
  assert.equal(parsed.nodes[0].text, 'LAMGUARD');
  assert.equal(parsed.nodes[0].x, 80);
  assert.equal(parsed.nodes[0].fontFamily, 'Tektur');
});

test('Figma exporter PNG assets, reference image, text metrics, and background blur survive the RML pipeline', () => {
  const png = 'iVBORw0KGgoAAA=';
  const raw = JSON.stringify({ schema: 'kormatal-figma-layout-v1', document: { children: [{ children: [{
    id: 'screen', name: 'Play', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 1920, height: 1080 },
    referenceImage: { mimeType: 'image/png', contentBase64: png },
    children: [
      { id: 'logo:1', name: 'Logo', type: 'VECTOR', absoluteBoundingBox: { x: 30, y: 20, width: 32, height: 36 }, fills: [], embeddedAsset: { mimeType: 'image/png', contentBase64: png }, children: [] },
      { id: 'glass', name: 'Header glass', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 1920, height: 64 }, fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.7 }], effects: [{ type: 'BACKGROUND_BLUR', visible: true, radius: 12 }], children: [] },
      { id: 'label', name: 'Label', type: 'TEXT', absoluteBoundingBox: { x: 40, y: 80, width: 100, height: 24 }, characters: 'Hello', fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }], style: { fontFamily: 'Inter', fontSize: 16, fontWeight: 500, lineHeight: { value: 125, unit: 'PERCENT' }, letterSpacing: { value: 2, unit: 'PIXELS' }, textCase: 'UPPER', textDecoration: 'UNDERLINE' } },
    ],
  }] }] } });
  const frame = listFigmaFrames(raw)[0];
  const reference = parseFigmaJsonReferenceImage(raw, frame.id);
  assert.equal(reference?.mimeType, 'image/png');
  assert.equal(reference?.contentBase64, png);
  const parsed = parseFigmaJsonLayout(raw, 'Play', frame.id);
  const logo = parsed.nodes.find(node => node.id === 'logo-1');
  const glass = parsed.nodes.find(node => node.id === 'glass');
  const label = parsed.nodes.find(node => node.id === 'label');
  assert.equal(logo?.kind, 'raster');
  assert.equal(logo?.assetPath, 'Assets/figma-logo-1.png');
  assert.equal(logo?.assetContentBase64, png);
  assert.equal(glass?.backdropBlur, 12);
  assert.equal(glass?.fill, 'rgba(0, 0, 0, 0.7)');
  assert.equal(label?.fontFamily, 'Inter');
  assert.equal(label?.lineHeight, 20);
  assert.equal(label?.letterSpacing, 2);
  assert.equal(label?.textTransform, 'uppercase');
  assert.equal(label?.textDecoration, 'underline');
  const generated = generateLayoutSources(parsed);
  assert.ok(generated.rml.includes('src="Assets/figma-logo-1.png"'));
  assert.ok(generated.rcss.includes('backdrop-filter: blur(12px)'));
  assert.ok(generated.rcss.includes('font-family: "Inter"'));
  assert.ok(generated.rcss.includes('line-height: 20px'));
  assert.ok(generated.rcss.includes('letter-spacing: 2px'));
  assert.ok(renderLayoutDocumentSvg(parsed).includes(`data:image/png;base64,${png}`));
  assert.equal(parseFigmaJsonReferenceImage(JSON.stringify({ referenceImage: { mimeType: 'image/png', contentBase64: 'not-a-png' } })), undefined);
});

test('Figma non-solid frame backgrounds and unsupported root effects are reported for the editable export', () => {
  const parsed = parseFigmaJsonLayout(JSON.stringify({
    document: {
      children: [{ children: [{
        id: 'gradient-frame', name: 'Gradient Screen', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 600 },
        fills: [{ type: 'GRADIENT_LINEAR', visible: true, gradientStops: [] }],
        effects: [{ type: 'DROP_SHADOW', visible: true, radius: 12 }],
        children: [{ id: 'title', name: 'Title', type: 'TEXT', absoluteBoundingBox: { x: 20, y: 20, width: 120, height: 24 }, characters: 'Play', fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }], style: { fontFamily: 'Onest', fontSize: 18 } }],
      }] }],
    },
  }));
  assert.ok(parsed.diagnostics.some(item => item.includes('градиентную/изображенческую заливку')));
  assert.ok(parsed.diagnostics.some(item => item.includes('эффекты Figma')));
});

test('PNG AI layout result clamps invalid coordinates and maps unknown fonts to Onest', () => {
  const parsed = layoutDocumentFromAi(100, 100, [
    { name: 'Too far', kind: 'text', x: 120, y: -3, width: 40, height: 20, text: 'Title', confidence: 0.8 },
    { name: 'Invalid', kind: 'shape', x: Number.NaN, y: 0, width: 20, height: 20 },
  ]);
  assert.equal(parsed.nodes.length, 1);
  assert.equal(parsed.nodes[0].x, 99);
  assert.equal(parsed.nodes[0].width, 1);
  assert.equal(parsed.nodes[0].y, 0);
  assert.equal(parsed.nodes[0].fontFamily, 'Onest');
  assert.ok(parsed.diagnostics.some(item => item.includes('пропущен')));
});

test('manual layout edits update only the selected item and add a valid node', () => {
  const node = createManualLayoutNode('text', 1, 1920, 1080);
  const updated = updateLayoutNode([node], node.id, { x: 250, text: 'Новая кнопка' });
  assert.equal(updated[0].x, 250);
  assert.equal(updated[0].text, 'Новая кнопка');
  assert.equal(updated[0].id, node.id);
});


test('Figma JSON preserves nested containers and Auto Layout settings as a flex hierarchy', () => {
  const figma = {
    document: { type: 'DOCUMENT', children: [{ type: 'CANVAS', children: [{
      id: 'frame', name: 'Settings', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 640, height: 480 },
      layoutMode: 'VERTICAL', itemSpacing: 12, paddingTop: 20, paddingRight: 24, paddingBottom: 20, paddingLeft: 24,
      primaryAxisAlignItems: 'MIN', counterAxisAlignItems: 'CENTER', fills: [{ type: 'SOLID', color: { r: 0.05, g: 0.05, b: 0.08 } }],
      children: [
        { id: 'toolbar', name: 'Toolbar', type: 'FRAME', absoluteBoundingBox: { x: 24, y: 20, width: 592, height: 56 }, layoutMode: 'HORIZONTAL', itemSpacing: 8, paddingTop: 4, paddingRight: 8, paddingBottom: 4, paddingLeft: 8, children: [
          { id: 'save', name: 'Save button', type: 'RECTANGLE', absoluteBoundingBox: { x: 32, y: 24, width: 100, height: 40 }, fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.4, b: 0.8 } }] },
          { id: 'close', name: 'Close button', type: 'RECTANGLE', absoluteBoundingBox: { x: 140, y: 24, width: 100, height: 40 }, fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }], layoutSizingHorizontal: 'FILL' },
        ] },
        { id: 'title', name: 'Title', type: 'TEXT', absoluteBoundingBox: { x: 24, y: 92, width: 300, height: 30 }, characters: 'Settings', fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }], style: { fontFamily: 'Onest', fontSize: 24 } },
      ],
    }] }] },
  };
  const parsed = parseFigmaJsonLayout(JSON.stringify(figma));
  const toolbar = parsed.nodes.find(node => node.id === 'toolbar');
  const save = parsed.nodes.find(node => node.id === 'save');
  assert.equal(parsed.layoutMode, 'vertical');
  assert.equal(parsed.layoutItemSpacing, 12);
  assert.equal(toolbar?.layoutMode, 'horizontal');
  assert.equal(toolbar?.layoutItemSpacing, 8);
  assert.equal(save?.parentId, 'toolbar');
  assert.equal(save?.layoutPositioning, 'flow');
  const output = generateLayoutSources(parsed);
  assert.ok(output.rml.indexOf('id="toolbar"') < output.rml.indexOf('id="save"'));
  assert.ok(output.rcss.includes('flex-direction: column'));
  assert.ok(output.rcss.includes('flex-direction: row'));
  assert.ok(output.rcss.includes('gap: 12px'));
  assert.ok(output.rcss.includes('padding: 20px 24px 20px 24px'));
  assert.ok(output.rcss.includes('position: static'));
});

test('Figma frame listing exposes available screens and selected frame parsing honors its ID', () => {
  const raw = JSON.stringify({ document: { children: [{ children: [
    { id: 'a', name: 'Small screen', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 200 }, children: [] },
    { id: 'b', name: 'Login', type: 'FRAME', absoluteBoundingBox: { x: 10, y: 20, width: 800, height: 600 }, children: [] },
  ] }] } });
  const options = listFigmaFrames(raw);
  assert.equal(options[0].id, 'b');
  assert.equal(parseFigmaJsonLayout(raw, 'all', 'a').name, 'Small screen');
});


test('nested Auto Layout does not get overridden by a later display:block rule', () => {
  const parsed = parseFigmaJsonLayout(JSON.stringify({ document: { children: [{ children: [{
    id: 'screen', name: 'Screen', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 }, layoutMode: 'VERTICAL', itemSpacing: 10,
    children: [{ id: 'toolbar', name: 'Toolbar', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 40 }, layoutMode: 'HORIZONTAL', itemSpacing: 8, children: [
      { id: 'a', name: 'A', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 40, height: 30 }, fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] },
    ] }],
  }] }] } }));
  const output = generateLayoutSources(parsed);
  const nestedRule = /\.layout-1\s*\{([\s\S]*?)\}/.exec(output.rcss)?.[1] || '';
  assert.match(nestedRule, /display: flex/);
  assert.match(nestedRule, /position: relative/);
  assert.match(nestedRule, /flex-direction: row/);
  assert.doesNotMatch(nestedRule, /display: block/);
});

test('Layout IR preview escapes text and accumulates nested frame coordinates', () => {
  const svg = renderLayoutDocumentSvg({
    name: 'Nested', width: 400, height: 300, sourceKind: 'figma-json', diagnostics: [], nodes: [
      { id: 'parent', name: 'Panel', kind: 'container', x: 80, y: 50, width: 200, height: 160, fill: '#222222', layoutMode: 'none' },
      { id: 'label', parentId: 'parent', name: 'Label', kind: 'text', x: 12, y: 16, width: 100, height: 24, text: '<Start & go>', fill: '#ffffff', fontFamily: 'Onest', fontSize: 16 },
    ],
  });
  assert.match(svg, /x="92" y="84\.4"/);
  assert.match(svg, /&lt;Start &amp; go&gt;/);
  assert.doesNotMatch(svg, /<Start & go>/);
});

test('manual nodes remain absolute so they do not unexpectedly enter an Auto Layout flow', () => {
  const node = createManualLayoutNode('shape', 1, 800, 600);
  assert.equal(node.layoutPositioning, 'absolute');
});

test('PNG AI layout accepts only valid earlier container parents and converts absolute coordinates to local', () => {
  const parsed = layoutDocumentFromAi(800, 600, [
    { name: 'Main panel', kind: 'container', x: 100, y: 80, width: 400, height: 300, layoutMode: 'vertical', layoutItemSpacing: 12 },
    { name: 'Title', kind: 'text', x: 130, y: 110, width: 180, height: 28, text: 'Settings', parentIndex: 0 },
    { name: 'Invalid parent', kind: 'text', x: 10, y: 10, width: 40, height: 20, parentIndex: 1 },
  ]);
  assert.equal(parsed.nodes[1].parentId, parsed.nodes[0].id);
  assert.equal(parsed.nodes[1].x, 30);
  assert.equal(parsed.nodes[1].y, 30);
  assert.equal(parsed.nodes[1].layoutPositioning, 'flow');
  assert.equal(parsed.nodes[2].parentId, undefined);
  assert.ok(parsed.diagnostics.some(item => item.includes('недопустимого родителя')));
  const output = generateLayoutSources(parsed);
  assert.ok(output.rcss.includes('flex-direction: column'));
  assert.ok(output.rcss.includes('gap: 12px'));
});


test('Figma Grid layout emits an explicit diagnostic instead of silently pretending it is Flexbox', () => {
  const raw = JSON.stringify({ document: { children: [{ children: [{
    id: 'grid-screen', name: 'Grid Screen', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 600 }, layoutMode: 'GRID', children: [
      { id: 'grid-card', name: 'Card', type: 'FRAME', absoluteBoundingBox: { x: 20, y: 20, width: 180, height: 120 }, layoutMode: 'GRID', children: [] },
    ],
  }] }] } });
  const parsed = parseFigmaJsonLayout(raw);
  const warnings = parsed.diagnostics.filter(message => message.includes('Grid Layout'));
  assert.equal(warnings.length, 2);
  assert.ok(warnings.some(message => message.includes('Grid Screen')));
  assert.ok(warnings.some(message => message.includes('Card')));
  assert.equal(parsed.layoutMode, 'none');
});


test('source workflow documentation explains distinct SVG, Figma JSON and PNG reconstruction paths', () => {
  const svg = getLayoutSourcePipeline('svg');
  const figma = getLayoutSourcePipeline('figma-json');
  const png = getLayoutSourcePipeline('png');
  assert.match(svg.summary, /AI не нужен/);
  assert.match(svg.steps[1].description, /PNG-ресурс/);
  assert.match(figma.steps[1].description, /локальные/);
  assert.match(figma.steps[2].description, /Auto Layout/);
  assert.match(png.summary, /AI необязателен/);
  assert.match(png.steps[3].description, /вручную/);
});

test('generated report explains source-to-RML pipeline and element kind counts', () => {
  const document = {
    name: 'Example', width: 320, height: 200, sourceKind: 'png' as const, diagnostics: [],
    nodes: [
      { id: 'panel', name: 'Panel', kind: 'container' as const, x: 0, y: 0, width: 320, height: 200 },
      { id: 'label', name: 'Title', kind: 'text' as const, x: 10, y: 10, width: 100, height: 24, text: 'Settings' },
    ],
  };
  const output = generateLayoutSources(document);
  assert.match(output.report, /Как источник преобразован/);
  assert.match(output.report, /PNG не содержит/);
  assert.match(output.report, /Контейнеры: 1; текст: 1/);
  assert.match(output.report, /RML-элемент/);
});


test('Figma to JSON Exporter compact schema is accepted with a clear approximate-geometry warning', () => {
  const compact = { metadata: { plugin: 'Figma to JSON Exporter' }, designTokens: {}, structure: { name: 'Play', type: 'FRAME', size: { w: 1920, h: 1080 }, styles: { layout: { direction: 'row' } }, children: [
    { name: 'background', type: 'RECTANGLE', size: { w: 1920, h: 1080 }, styles: { bg: 'rgb(20, 31, 36)' } },
    { name: 'topbar', type: 'FRAME', size: { w: 1920, h: 64 }, children: [] },
    { name: 'play-button', type: 'GROUP', size: { w: 398, h: 70 }, children: [{ name: 'PLAY', type: 'TEXT', size: { w: 85, h: 38 }, content: 'PLAY', styles: { text: { family: 'Onest', size: 32, weight: '700' } } }] },
  ] }, summary: { frames: 1 } };
  const frames = listFigmaFrames(JSON.stringify(compact));
  assert.ok(frames.some(frame => frame.name === 'Play' && frame.width === 1920));
  const parsed = parseFigmaJsonLayout(JSON.stringify(compact));
  assert.equal(parsed.width, 1920);
  assert.equal(parsed.height, 1080);
  assert.ok(parsed.nodes.some(node => node.text === 'PLAY'));
  assert.ok(parsed.diagnostics.some(item => item.includes('не содержит x/y')));
});

test('SVG raster extraction keeps only referenced defs rather than embedding every large resource into every node', () => {
  const source = `<svg width="100" height="50" viewBox="0 0 100 50"><defs><linearGradient id="needed"><stop offset="0" stop-color="red"/></linearGradient><image id="large-unused" href="data:image/png;base64,${'A'.repeat(2048)}" width="1" height="1"/><clipPath id="clip"><rect width="50" height="30"/></clipPath></defs><path d="M0 0 H40 V30 Z" fill="url(#needed)"/><path d="M60 0 H90 V30 Z" fill="#fff"/></svg>`;
  const parsed = parseSvgLayout(source);
  assert.equal(parsed.nodes.length, 2);
  assert.ok(parsed.nodes[0].rasterSvg?.includes('id="needed"'));
  assert.ok(!parsed.nodes[0].rasterSvg?.includes('large-unused'));
  assert.ok(!parsed.nodes[1].rasterSvg?.includes('large-unused'));
  assert.ok((parsed.nodes[1].rasterSvg || '').length < 1500);
});


test('SVG root presentation attributes such as fill=none are inherited into rasterized path nodes', () => {
  const parsed = parseSvgLayout(`<svg width="100" height="50" viewBox="0 0 100 50" fill="none"><path d="M10 10 H90 V40 H10 Z" stroke="#ffffff"/></svg>`);
  assert.equal(parsed.nodes.length, 1);
  assert.equal(parsed.nodes[0].kind, 'raster');
  assert.match(parsed.nodes[0].rasterSvg || '', /fill:none/i);
});

test('SVG use references are converted with their own geometry and keep referenced gradients', () => {
  const parsed = parseSvgLayout(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60" viewBox="0 0 100 60"><defs><linearGradient id="shade"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.9"/></linearGradient><path id="card-outline" d="M10 10 H90 V50 H10 Z"/></defs><use href="#card-outline" fill="url(#shade)"/></svg>`);
  assert.equal(parsed.nodes.length, 1);
  assert.equal(parsed.nodes[0].kind, 'raster');
  assert.equal(parsed.nodes[0].x, 10);
  assert.equal(parsed.nodes[0].y, 10);
  assert.equal(parsed.nodes[0].width, 80);
  assert.equal(parsed.nodes[0].height, 40);
  assert.match(parsed.nodes[0].rasterSvg || '', /<use/);
  assert.match(parsed.nodes[0].rasterSvg || '', /id="shade"/);
  assert.match(parsed.nodes[0].rasterSvg || '', /id="card-outline"/);
});

test('clipped SVG groups rasterize as a whole subtree and preserve nested gradients/use children', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"><defs><clipPath id="clip-card"><rect x="10" y="10" width="80" height="40"/></clipPath><linearGradient id="shade"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.8"/></linearGradient><path id="outline" d="M10 10 H90 V50 H10 Z"/></defs><g id="complex-card" clip-path="url(#clip-card)"><rect x="10" y="10" width="80" height="40" fill="#999999"/><use href="#outline" fill="url(#shade)"/><path d="M20 20 H40" stroke="#ffffff"/></g></svg>`;
  const parsed = parseSvgLayout(svg);
  assert.equal(parsed.nodes.length, 1);
  assert.equal(parsed.nodes[0].kind, 'raster');
  assert.equal(parsed.nodes[0].x, 10);
  assert.equal(parsed.nodes[0].y, 10);
  assert.equal(parsed.nodes[0].width, 80);
  assert.equal(parsed.nodes[0].height, 40);
  assert.match(parsed.nodes[0].rasterSvg || '', /<g[\s\S]*<rect/);
  assert.match(parsed.nodes[0].rasterSvg || '', /id="clip-card"/);
  assert.match(parsed.nodes[0].rasterSvg || '', /id="shade"/);
  assert.match(parsed.nodes[0].rasterSvg || '', /<use/);
  assert.ok(parsed.diagnostics.some(item => item.includes('составные слои')));
});


test('decorative text labels do not become clickable gameplay controls without semantic evidence', () => {
  const parsed = parseSvgLayout('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><text id="play" x="20" y="40">PLAY</text></svg>');
  assert.equal(parsed.nodes.length, 1);
  assert.equal(parsed.nodes[0].kind, 'text');
  assert.equal(parsed.nodes[0].interaction, undefined);
  const generated = generateLayoutInteractionJs(parsed.nodes);
  assert.match(generated, /Interactive controls generated: 0/);
});

test('generated screen includes layout.js in the RML head and initializes actions after root exists', () => {
  const document = {
    name: 'Play', width: 1920, height: 1080, sourceKind: 'figma-json' as const, diagnostics: [],
    nodes: [
      { id: 'play', name: 'PLAY', kind: 'container' as const, x: 100, y: 200, width: 220, height: 64, interaction: 'button' as const, actionName: 'play_match' },
    ],
  };
  const generated = generateLayoutSources(document);
  assert.ok(generated.rml.indexOf('<script src="layout.js"></script>') < generated.rml.indexOf('</head>'));
  assert.match(generated.rml, /<button[\s\S]*data-layout-action="button"[\s\S]*data-layout-action-name="play_match"/);
  assert.match(generated.js, /function bindLayoutActions\(\)/);
  assert.match(generated.js, /setTimeout\(bindLayoutActions, 0\)/);
  assert.match(generated.js, /vacuus\.emit\("layout_ui_action", payload\)/);
  assert.match(generated.js, /data-layout-action-bound/);
  assert.doesNotMatch(generated.rcss, /color:\s*inherit|text-align:\s*inherit/);
  assert.match(generated.rcss, /\.layout-action\.is-active \{ border-width: 1px; border-color: #20ab8e; \}/);
  const reference = generateReferenceScreenSources(document);
  const gate = validateGeneratedLayoutBundle([
    { path: 'Play/main.rml', content: reference.rml },
    { path: 'Play/reference.rcss', content: reference.rcss },
    { path: 'Play/main-editable.rml', content: generated.rml },
    { path: 'Play/layout.rcss', content: generated.rcss },
    { path: 'Play/layout.js', content: generated.js },
    { path: 'Play/vacuus-base.rcss', content: 'body { display: block; }\nbutton { tab-index: auto; }\ninput { tab-index: auto; }' },
    { path: 'Play/layout-report.md', content: generated.report },
    { path: 'Play/Assets/design-reference.png', content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', contentEncoding: 'base64' as const },
  ]);
  assert.equal(gate.valid, true, gate.errors.join('\n'));
});

test('pixel-reference export preserves source-image pixels as a single image and includes selectable native hit zones', () => {
  const document = {
    name: 'Play', width: 1920, height: 1080, sourceKind: 'png' as const, diagnostics: [],
    nodes: [
      { id: 'panel', name: 'Panel', kind: 'container' as const, x: 0, y: 0, width: 1920, height: 1080 },
      { id: 'play', name: 'PLAY', kind: 'container' as const, x: 100, y: 200, width: 220, height: 64, interaction: 'button' as const, actionName: 'play_match' },
    ],
  };
  const generated = generateReferenceScreenSources(document);
  assert.ok(generated.rml.includes('<img id="design-reference" src="Assets/design-reference.png"'));
  assert.ok(generated.rml.includes('id="hit-play"'));
  assert.ok(generated.rml.indexOf('<script src="layout.js"></script>') < generated.rml.indexOf('</head>'));
  assert.match(generated.rcss, /\.reference-hitbox-1\s*\{\s*left:\s*100px;\s*top:\s*200px;\s*width:\s*220px;\s*height:\s*64px;/);
  assert.match(generated.js, /layout_ui_action/);
  assert.equal(generated.diagnostics.length, 0);
});

test('pixel-reference export clearly warns when layout has no explicit interactive controls', () => {
  const generated = generateReferenceScreenSources({
    name: 'Reference', width: 100, height: 80, sourceKind: 'svg', diagnostics: [],
    nodes: [{ id: 'background', name: 'Background', kind: 'shape', x: 0, y: 0, width: 100, height: 80, fill: '#000000' }],
  });
  assert.ok(generated.diagnostics.some(item => item.includes('не содержит поведения')));
  assert.ok(!generated.rml.includes('class="reference-hitbox '));
});


test('generated layout package gate accepts native VaCuus tab-index and still catches missing assets and duplicate paths', () => {
  const files = [
    { path: 'Play/main.rml', content: '<rml><head><link type="text/rcss" href="vacuus-base.rcss"/><link type="text/rcss" href="reference.rcss"/><script src="layout.js"></script></head><body><div id="reference-root"><img id="design-reference" src="Assets/design-reference.png"/></div></body></rml>' },
    { path: 'Play/reference.rcss', content: '#reference-root { width: 100px; height: 80px; }\n.reference-hitbox { position: absolute; opacity: 0.001; background-color: transparent; }' },
    { path: 'Play/main-editable.rml', content: '<rml><head><link type="text/rcss" href="vacuus-base.rcss"/><link type="text/rcss" href="layout.rcss"/><script src="layout.js"></script></head><body><div id="layout-root"/></body></rml>' },
    { path: 'Play/layout.rcss', content: '#layout-root { width: 100px; height: 80px; }' },
    { path: 'Play/layout.js', content: 'vacuus.emit("layout_ui_action", {});' },
    { path: 'Play/vacuus-base.rcss', content: 'body { display: block; }\nbutton { tab-index: auto; }\ninput { tab-index: auto; }' },
    { path: 'Play/layout-report.md', content: 'Report' },
    { path: 'Play/Assets/design-reference.png', content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', contentEncoding: 'base64' as const, mimeType: 'image/png' },
  ];
  const good = validateGeneratedLayoutBundle(files);
  assert.equal(good.valid, true, good.errors.join('\n'));
  assert.ok(files.find(file => file.path === 'Play/vacuus-base.rcss')?.content.includes('tab-index: auto'), 'Regression fixture must contain the native VaCuus property that previously blocked export');
  assert.equal(good.checkedReferences, 7);
  const missing = validateGeneratedLayoutBundle(files.filter(file => file.path !== 'Play/layout.js'));
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some(item => item.includes('отсутствует обязательный файл «layout.js»')));
  assert.ok(missing.errors.some(item => item.includes('отсутствующий ресурс «layout.js»')));
  const duplicate = validateGeneratedLayoutBundle([...files, files[0]]);
  assert.ok(duplicate.errors.some(item => item.includes('Дублируется путь файла')));
  const unsupportedStyle = validateGeneratedLayoutBundle(files.map(file => file.path === 'Play/reference.rcss' ? { ...file, content: '#reference-root { width: 100px; grid-template-columns: 1fr 1fr; }' } : file));
  assert.ok(unsupportedStyle.errors.some(item => item.includes('grid-template-columns') && item.includes('unsupported')));
  const brokenImage = validateGeneratedLayoutBundle(files.map(file => file.path === 'Play/Assets/design-reference.png' ? { ...file, content: 'not-a-png' } : file));
  assert.ok(brokenImage.errors.some(item => item.includes('сигнатуры PNG')));
});


test('generated layout.js binds after a late RML root appears and dispatches real click events', () => {
  const nodes = [
    { id: 'play', name: 'PLAY', kind: 'container' as const, x: 0, y: 0, width: 80, height: 32, interaction: 'button' as const, actionName: 'play_match' },
    { id: 'mute', name: 'Mute', kind: 'container' as const, x: 90, y: 0, width: 80, height: 32, interaction: 'toggle' as const, actionName: 'toggle_mute' },
  ];
  const listeners = new Map<string, (event?: unknown) => void>();
  const activeClasses = new Set<string>();
  const events: Array<{ name: string; payload: unknown }> = [];
  const elementAttributes = new Map<string, Map<string, string>>();
  const controls = nodes.map(node => {
    const attributes = new Map<string, string>();
    elementAttributes.set(node.id, attributes);
    return {
      addEventListener: (name: string, callback: (event?: unknown) => void) => { listeners.set(`${node.id}:${name}`, callback); },
      getAttribute: (name: string) => name === 'id' ? node.id : name === 'data-layout-action' ? node.interaction : name === 'data-layout-action-name' ? node.actionName : attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => { attributes.set(name, value); },
      classList: { toggle: (value: string) => { if (activeClasses.has(`${node.id}:${value}`)) activeClasses.delete(`${node.id}:${value}`); else activeClasses.add(`${node.id}:${value}`); } },
    };
  });
  let deferred: (() => void) | null = null;
  let rootAvailable = false;
  const root = { querySelectorAll: (selector: string) => selector === '[data-layout-action]' ? controls : [] };
  const generatedJs = generateLayoutInteractionJs(nodes);
  runInNewContext(generatedJs, {
    document: { getElementById: (id: string) => rootAvailable && ['layout-root', 'reference-root'].includes(id) ? root : null },
    setTimeout: (callback: () => void) => { deferred = callback; },
    vacuus: { emit: (name: string, payload: unknown) => events.push({ name, payload }) },
    console: { log: () => {}, warn: () => {} },
  });
  assert.equal(deferred !== null, true, 'head-linked JS should defer if the RML body root is not available yet');
  rootAvailable = true;
  deferred!();
  assert.equal(listeners.size, 2);
  listeners.get('play:click')!();
  listeners.get('mute:click')!();
  assert.deepEqual(events.map(event => event.name), ['layout_ui_action', 'layout_ui_action']);
  assert.deepEqual(events.map(event => JSON.parse(JSON.stringify(event.payload))), [
    { id: 'play', action: 'button', label: 'play_match' },
    { id: 'mute', action: 'toggle', label: 'toggle_mute' },
  ]);
  assert.ok(activeClasses.has('mute:is-active'));
  assert.equal(elementAttributes.get('play')?.get('data-layout-action-bound'), 'true');
  assert.equal(elementAttributes.get('mute')?.get('data-layout-action-bound'), 'true');
});

test('screenshot-only without AI creates a valid manual reconstruction starter', async () => {
  const { createImageReferenceStarter, validateLayoutPipelineDocument } = await import('../layout-generator.ts');
  const starter = createImageReferenceStarter(1366, 768, 'Screenshot.png');
  assert.equal(starter.width, 1366);
  assert.equal(starter.height, 768);
  assert.equal(starter.sourceKind, 'png');
  assert.equal(starter.manualReconstructionStarter, true);
  assert.equal(starter.nodes.length, 0);
  const validation = validateLayoutPipelineDocument(starter);
  assert.equal(validation.valid, true, validation.errors.join('\n'));
  assert.ok(validation.warnings.some(item => item.includes('добавьте хотя бы один слой')));
});

test('ordinary empty Layout IR is still rejected; only the marked screenshot starter is allowed', async () => {
  const { validateLayoutPipelineDocument } = await import('../layout-generator.ts');
  const empty = { name: 'Empty', width: 100, height: 100, sourceKind: 'png' as const, nodes: [], diagnostics: [] };
  const validation = validateLayoutPipelineDocument(empty);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some(item => item.includes('нет элементов')));
});
