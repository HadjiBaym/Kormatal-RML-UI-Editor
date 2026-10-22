import test from 'node:test';
import assert from 'node:assert/strict';
import { convertHtmlToRml } from '../html-to-rml.ts';
import { descendants, parseHtmlTree } from '../html-parser.ts';

test('HTML parser: serializes nested markup and quoted attributes structurally', () => {
  const html = `<!doctype html><html lang="en"><head><title>Ops &amp; Status</title></head><body data-model="hud">
    <div id="panel" data-label="x > y" class="panel"><span>Health &lt; 100%</span><img src="data:image/svg+xml,%3Csvg%3E" alt="A &amp; B"></div>
  </body></html>`;
  const result = convertHtmlToRml(html, 'nested.html');

  assert.ok(result.rml.includes('<title>Ops &amp; Status</title>'));
  assert.ok(result.rml.includes('<body data-model="hud">'));
  assert.ok(result.rml.includes('data-label="x &gt; y"'));
  assert.ok(result.rml.includes('<span>Health &lt; 100%</span>'));
  assert.ok(result.rml.includes('src="data:image/svg+xml,%3Csvg%3E"'));
  assert.ok(result.rml.includes('alt="A &amp; B"'));
  assert.equal(result.metrics.voidTagsClosed, 1);
});

test('HTML parser records exact attribute ranges for source-preserving CSS conversion', () => {
  const html = `<div id='panel' style = 'color: red; width: 20px' data-x=ok></div>`;
  const element = descendants(parseHtmlTree(html).children).find(node => node.type === 'element');
  const style = element?.attrs?.find(attribute => attribute.name === 'style');

  assert.ok(style?.sourceStart !== undefined && style.sourceEnd !== undefined);
  assert.equal(html.slice(style!.sourceStart, style!.sourceEnd), "style = 'color: red; width: 20px'");
});

test('HTML parser: ignores fake unsupported tags in comments, scripts, CSS strings, and quoted attributes', () => {
  const html = `<div title="literal <video> token">
<!-- <video src="fake.mp4"></video> -->
<script>const example = "<canvas id='fake'></canvas>";</script>
<style>.test::after { content: "<iframe>"; }</style>
<span>Real UI</span></div>`;
  const result = convertHtmlToRml(html, 'false-positives.html');

  assert.equal(result.diagnostics.some(d => /HTML5 <video>|HTML5 <canvas>|<iframe>/.test(d.message)), false);
  assert.ok(result.rml.includes('title="literal &lt;video&gt; token"'));
  assert.ok(result.rml.includes('<span>Real UI</span>'));
});

test('HTML parser: normalizes boolean attributes and common optional list-item end tags', () => {
  const html = `<ul>\n  <li class="item" selected>First\n  <li class="item">Second\n</ul>\n<video src="clip.mp4"></video>`;
  const result = convertHtmlToRml(html, 'list.html');

  assert.match(result.rml, /<li class="item" selected="">First\s*<\/li>/);
  assert.match(result.rml, /<li class="item">Second\s*<\/li>/);
  const videoDiagnostic = result.diagnostics.find(d => d.message.includes('HTML5 <video>'));
  assert.equal(videoDiagnostic?.line, 5);
});

test('HTML parser: extracts data-model, mustache bindings, and data-for collection metadata', () => {
  const html = `<body><div data-model="scoreboard"><div data-for="player : Players"><span>{{player.Name}}</span><b>{{player.Score}}</b></div></div></body>`;
  const result = convertHtmlToRml(html, 'binding.html');

  assert.ok(result.dataModelInfo);
  assert.equal(result.dataModelInfo?.modelName, 'scoreboard');
  assert.deepEqual(result.dataModelInfo?.bindings, ['player.Name', 'player.Score']);
  assert.deepEqual(result.dataModelInfo?.collections, [{ name: 'Players', alias: 'player', properties: ['Name', 'Score'] }]);
});

test('HTML asset extractor: extracts real style and script nodes but ignores tag-like text', async () => {
  const { extractEmbeddedAssetsFromHtml } = await import('../html-embedded-extractor.ts');
  const html = `<div data-template="<style>.fake { color:red }</style>">Keep</div>
<!-- <style>.comment { color:blue }</style> -->
<script>const sample = '<style>.jsFake { color:green }</style>';</script>
<style>.real { color: white; }</style>
<script>const realValue = 42;</script>
<script type="application/json">{"keep":true}</script>
<script src="external.js"></script>`;
  const result = extractEmbeddedAssetsFromHtml(html, 'embedded.html');

  assert.ok(result.extractedCss.includes('.real'));
  assert.equal(result.extractedCss.includes('.fake'), false);
  assert.equal(result.extractedCss.includes('.comment'), false);
  assert.equal(result.extractedCss.includes('.jsFake'), false);
  assert.ok(result.extractedJs.includes('const realValue = 42'));
  assert.ok(result.extractedJs.includes('const sample ='));
  assert.ok(result.cleanedHtml.includes('type="application/json"'));
  assert.ok(result.cleanedHtml.includes('src="external.js"'));
  assert.equal(result.embeddedCssBlocksCount, 1);
  assert.equal(result.embeddedJsBlocksCount, 2);
  assert.deepEqual(result.cssResources.map(resource => resource.kind), ['inline']);
  const inlineResource = result.cssResources[0];
  assert.equal(inlineResource.kind, 'inline');
  if (inlineResource.kind === 'inline') assert.equal(inlineResource.content, '.real { color: white; }');
});

test('HTML parser: stray div close inside a button does not detach the outer app container', () => {
  const html = '<div class=app><header class=topbar><button class=user><div class=user-label><strong>Metascript</strong></div></div><div class=rank>RANK</div></button></header><main><section id=screen-play>PLAY</section></main></div>';
  const result = convertHtmlToRml(html, 'broken-nesting.html');
  const appStart = result.rml.indexOf('<div class="app">');
  const mainStart = result.rml.indexOf('<main>');
  const appClose = result.rml.indexOf('</div>', appStart);
  assert.ok(appStart >= 0 && mainStart > appStart, 'main should remain in the app tree');
  assert.ok(result.rml.includes('<div class="rank">RANK</div>'), 'rank node should be preserved');
  assert.ok(result.diagnostics.some(d => d.id.includes('mismatched-end-tag')), 'source markup error should be reported');
  assert.ok(appClose < mainStart, 'contains root app start; detailed nesting is checked by the tree order above');
});


test('HTML to RML: replaces inline SVG with a PNG asset reference and emits rasterizable SVG source', () => {
  const html = '<div class="stat"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg><span>10 MIN</span></div>';
  const result = convertHtmlToRml(html, 'svg-icon.html');
  assert.match(result.rml, /<img src="\.\.\/Assets\/inline-svg-001\.png" class="vacuus-svg-raster" alt="Converted vector icon"\s*\/>/);
  assert.equal(result.svgAssets.length, 1);
  assert.match(result.svgAssets[0].sourceSvg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(result.svgAssets[0].sourceSvg, /viewBox="0 0 24 24"/);
  assert.match(result.svgAssets[0].sourceSvg, /width="96"/);
  assert.deepEqual(result.svgAssets[0].parentClasses, ['stat']);
});


test('HTML parser: wraps mixed direct text in explicit RML spans and matches adjacent-sibling pseudo targets', async () => {
  const htmlToRml = await import('../html-to-rml.ts');
  const html = '<div class="quickbar"><button class="quick">A</button><button class="quick">B</button></div><button class="change">CHANGE GAMEMODE <span class="chevron">›</span></button>';
  const pseudoElements = [
    { targetSelector: '.quick+.quick', position: 'before' as const, className: 'vacuus-separator', contentText: '' },
  ];
  const result = htmlToRml.convertHtmlToRml(html, 'mixed-text.html', { pseudoElements });

  assert.ok(result.rml.includes('<span class="vacuus-text-run">CHANGE GAMEMODE </span>'));
  assert.match(result.rml, /<button class="quick"><span class="vacuus-separator vacuus-pseudo-helper" aria-hidden="true"><\/span><span class="vacuus-text-run">B<\/span><\/button>/);
});


test('HTML parser: warns when visible emoji may be missing from the bundled font', () => {
  const result = convertHtmlToRml('<button>PROFILE 🪖</button>', 'emoji.html');
  const diagnostic = result.diagnostics.find(item => item.id.includes('html-emoji-glyph'));
  assert.ok(diagnostic, 'Should flag emoji glyphs that may render as tofu in VaCuus');
  assert.equal(diagnostic?.severity, 'warning');
  assert.match(diagnostic?.recommendedAction || '', /packaged PNG/i);
});
