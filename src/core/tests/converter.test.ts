import test from 'node:test';
import assert from 'node:assert/strict';

import { convertHtmlToRml } from '../html-to-rml.ts';
import { convertCssToRcss } from '../css-to-rcss.ts';
import { analyzeAndConvertJs } from '../js-analyzer.ts';
import { convertProject, splitMonolithicHtmlProject, DEFAULT_CONVERSION_OPTIONS } from '../project-converter.ts';
import { extractEmbeddedAssetsFromHtml } from '../html-embedded-extractor.ts';
import { RCSS_PROPERTY_CATALOG } from '../rcss-matrix.ts';
import { VACUUS_BASE_RCSS } from '../vacuus-base.ts';
import { buildPreviewAssetUrlMap, normalizeCssFontFamilies, rewriteHtmlResourceUrls, rewriteRcssForBrowser } from '../preview-assets.ts';
import { prepareProjectAssets } from '../project-assets.ts';
import type { ProjectFile } from '../types.ts';
import { generateFontsReadme } from '../ue-integration-generator.ts';


test('project asset preparation packages local images and custom font files for VaCuus @font-face', () => {
  const files: ProjectFile[] = [
    { id: 'html', path: 'Content/DevUI/Hud/hud.html', type: 'html', content: '<img src="/Assets/map.png">' },
    { id: 'css', path: 'Content/DevUI/Hud/hud.css', type: 'css', content: '@font-face { font-family: "Game Sans"; src: url(../Fonts/GameSans.ttf); } .map { background-image: url(../Assets/map.png); }' },
    { id: 'map', path: 'Content/DevUI/Assets/map.png', type: 'asset', content: 'AQID', contentEncoding: 'base64', mimeType: 'image/png' },
    { id: 'font', path: 'Content/DevUI/Fonts/GameSans.ttf', type: 'asset', content: 'BAUG', contentEncoding: 'base64', mimeType: 'font/ttf' },
  ];
  const prepared = prepareProjectAssets(files);
  const html = prepared.rewriteHtml(files[0].content, files[0].path);
  const css = prepared.rewriteCss(files[1].content, files[1].path);
  assert.match(html, /src="\.\.\/Assets\/map\.png"/);
  assert.match(css, /url\("\.\.\/Assets\/map\.png"\)/i);
  assert.equal(prepared.assets.length, 2);
  assert.deepEqual(prepared.assets.map(asset => asset.directory).sort(), ['Assets', 'Fonts']);
  assert.ok(prepared.assets.some(asset => asset.directory === 'Fonts' && asset.filename === 'gamesans.ttf'));
  assert.ok(prepared.diagnostics.some(issue => issue.message.includes('GameSans.ttf') && issue.message.includes('will be packaged')));
  assert.match(css, /src:\s*url\(\"Fonts\/gamesans\.ttf\"\)/i);
});

test('project conversion packages custom @font-face files, keeps declared families and diagnoses missing JS references', () => {
  const files: ProjectFile[] = [
    { id: 'html', path: 'Content/DevUI/CombatHUD/combathud.html', type: 'html', content: '<html><head><link rel="stylesheet" href="combathud.css"><script src="combathud.js"></script><script src="index (3).js"></script></head><body><img src="/Assets/map.png"><div class="mode">Играть</div><script src="index (3).js"></script></body></html>' },
    { id: 'css', path: 'Content/DevUI/CombatHUD/combathud.css', type: 'css', content: '@font-face { font-family: "Game Sans"; src: url(../Fonts/GameSans.ttf); } body { font-family: Arial, sans-serif; } .mode { background-image: url(../Assets/map.png); }' },
    { id: 'js', path: 'Content/DevUI/CombatHUD/combathud.js', type: 'js', content: 'console.log("ready");' },
    { id: 'map', path: 'Content/DevUI/Assets/map.png', type: 'asset', content: 'AQID', contentEncoding: 'base64', mimeType: 'image/png' },
    { id: 'font', path: 'Content/DevUI/Fonts/GameSans.ttf', type: 'asset', content: 'BAUG', contentEncoding: 'base64', mimeType: 'font/ttf' },
  ];
  const result = convertProject(files, 'CombatHUD');
  assert.match(result.rml, /src="\.\.\/Assets\/map\.png"/);
  assert.doesNotMatch(result.rml, /index \(3\)\.js/);
  assert.match(result.rcss, /decorator:\s*image\(\.\.\/Assets\/map\.png\)/);
  assert.match(result.rcss, /@font-face\s*\{[^}]*font-family:\s*\"Game Sans\"[^}]*src:\s*Fonts\/gamesans\.ttf/s);
  assert.match(result.rcss, /body\s*\{[^}]*font-family:\s*Onest/s);
  assert.deepEqual(result.projectAssets?.map(asset => asset.directory).sort(), ['Assets', 'Fonts']);
  assert.equal(result.diagnostics.filter(issue => issue.message.includes('does not match any imported JS file')).length, 1);
  assert.ok(result.diagnostics.some(issue => issue.message.includes('GameSans.ttf') && issue.message.includes('will be packaged')));
  assert.ok(!result.diagnostics.some(issue => issue.message.includes('Cyrillic text')));
});

test('project asset preparation rewrites local CSS image paths inside HTML style blocks and style attributes', () => {
  const files: ProjectFile[] = [
    { id: 'html', path: 'Content/DevUI/Hud/index.html', type: 'html', content: '<html><head><style>.card { background-image: url(\"/Assets/card.png\"); }</style></head><body><div style=\"background-image:url(/Assets/card.png)\"></div></body></html>' },
    { id: 'card', path: 'Content/DevUI/Assets/card.png', type: 'asset', content: 'AQID', contentEncoding: 'base64', mimeType: 'image/png' },
  ];
  const prepared = prepareProjectAssets(files);
  const html = prepared.rewriteHtml(files[0].content, files[0].path);
  assert.match(html, /url\(\"\.\.\/Assets\/card\.png\"\)/);
  assert.match(html, /style=\"background-image:url\(&quot;\.\.\/Assets\/card\.png&quot;\)\"/);
});

test('project conversion transforms inline style attributes through the RCSS compatibility pipeline', () => {
  const result = convertProject([
    {
      id: 'html', path: 'Content/DevUI/Inline/index.html', type: 'html',
      content: '<html><body><div id="card" style="display: grid; grid-template-columns: repeat(2, 1fr); background: linear-gradient(90deg, #123456, #abcdef); transition: opacity 200ms ease-in-out"></div></body></html>',
    },
  ], 'InlineStyles');

  assert.match(result.rml, /style="display:\s*flex;/);
  assert.match(result.rml, /flex-wrap:\s*wrap/);
  assert.match(result.rml, /decorator:\s*linear-gradient\(90deg, #123456, #abcdef\)/);
  assert.match(result.rml, /transition:\s*opacity 200ms cubic-in-out/);
  assert.match(result.rml, /VaCuus manual grid conversion required/);
  assert.ok(result.diagnostics.some(issue => issue.id.includes('inline-style-') && issue.id.includes('css-grid')));
  assert.ok(result.metrics.cssDeclarationsAnalyzed >= 4);
  assert.ok(result.metrics.cssUnsupportedFeatures > 0);
  assert.equal(result.readiness.status, 'blocked');
  assert.equal(result.readiness.nativeRuntimeVerified, false);
  assert.equal(JSON.parse(result.compatibilityJson).readiness.status, 'blocked');
  assert.match(result.conversionReportMd, /Blocked/);
  assert.doesNotMatch(result.conversionReportMd, /Ready for Unreal Engine 5/);
});

test('project conversion can preserve a declared custom Cyrillic font and package its file', () => {
  const html = '<html><body><div>Привет</div></body></html>';
  const font: ProjectFile = { id: 'font', path: 'Content/DevUI/Fonts/GameSans.ttf', type: 'asset', content: 'BAUG', contentEncoding: 'base64', mimeType: 'font/ttf' };
  const result = convertProject([
    { id: 'html', path: 'index.html', type: 'html', content: html },
    { id: 'css', path: 'style.css', type: 'css', content: '@font-face { font-family: "Game Sans"; src: url(Fonts/GameSans.ttf); } body { font-family: "Game Sans"; }' },
    font,
  ]);
  assert.match(result.rcss, /font-family:\s*\"Game Sans\"/);
  assert.match(result.rcss, /src:\s*Fonts\/gamesans\.ttf/);
  assert.deepEqual(result.projectAssets?.map(asset => asset.directory), ['Fonts']);
  assert.ok(!result.diagnostics.some(issue => issue.message.includes('GameSans.ttf') && issue.message.includes('excluded')));
});

test('project conversion warns when an imported output package contains no source HTML entry', () => {
  const result = convertProject([{ id: 'rml', path: 'Content/DevUI/Hud/hud.rml', type: 'asset', content: '<rml></rml>', contentEncoding: 'text' }], 'Hud');
  assert.ok(result.diagnostics.some(issue => issue.id === 'project-html-entry-missing'));
});

test('preview maps imported images and packaged custom fonts for browser preview', () => {
  const files: ProjectFile[] = [
    { id: 'img', path: 'Assets/card.png', type: 'asset', content: 'AQID', contentEncoding: 'base64', mimeType: 'image/png' },
    { id: 'font', path: 'Fonts/Inter.ttf', type: 'asset', content: 'BAUG', contentEncoding: 'base64', mimeType: 'font/ttf' },
  ];
  const prepared = prepareProjectAssets(files);
  const map = buildPreviewAssetUrlMap(prepared.assets);
  assert.equal(map['../Assets/card.png'], 'data:image/png;base64,AQID');
  assert.equal(map['Fonts/inter.ttf'], 'data:font/ttf;base64,BAUG', 'packaged custom fonts must be available to the target/preview pipeline');
  assert.match(rewriteHtmlResourceUrls('<img src="../Assets/card.png">', map), /data:image\/png;base64,AQID/);
  const bundledFontCss = rewriteRcssForBrowser('@font-face { font-family: Onest; src: Fonts/Onest-Regular.ttf; }', map);
  const sourceCss = rewriteRcssForBrowser(normalizeCssFontFamilies('.x { decorator: image(../Assets/card.png); font-family: Arial, sans-serif; }'), map);
  assert.match(bundledFontCss, /src: url\("\/fonts\/Onest-Regular\.ttf"\)/);
  assert.match(sourceCss, /background-image: url\("data:image\/png;base64,AQID"\)/);
  assert.match(sourceCss, /font-family: Onest/);
  assert.doesNotMatch(sourceCss, /Arial|\bInter\b|sans-serif/);
});

test('VaCuus base stylesheet defaults to Onest Regular and registers exactly three bundled families', () => {
  assert.match(VACUUS_BASE_RCSS, /font-family:\s*Onest/);
  assert.match(VACUUS_BASE_RCSS, /font-weight:\s*400/);
  assert.match(VACUUS_BASE_RCSS, /font-family:\s*"Onest"[\s\S]*?font-family:\s*"Tektur"[\s\S]*?font-family:\s*"JetBrains Mono"/);
  assert.doesNotMatch(VACUUS_BASE_RCSS, /LatoLatin|Noto Sans|\bInter\b/);
});

test('HTML to RML: converts <html> envelope to <rml> and includes vacuus-base.rcss', () => {
  const html = '<!DOCTYPE html><html><head><title>My Screen</title></head><body><div id="content">Hello</div></body></html>';
  const result = convertHtmlToRml(html, 'index.html', {
    includeVacuusBase: true,
    targetRcssName: 'mainui.rcss',
    targetJsName: 'mainui.js',
  });

  assert.ok(result.rml.includes('<rml>'));
  assert.ok(result.rml.includes('</rml>'));
  assert.ok(result.rml.includes('<link type="text/rcss" href="vacuus-base.rcss"/>'));
  assert.ok(result.rml.includes('<link type="text/rcss" href="mainui.rcss"/>'));
  assert.ok(result.rml.includes('<script src="mainui.js"></script>'));
  assert.ok(!result.rml.includes('<!DOCTYPE html>'));
});

test('HTML to RML: emits inline SVG asset references relative to the screen folder and omits source script tags', () => {
  const result = convertHtmlToRml('<html><head></head><body><script src="missing.js"></script><svg viewBox="0 0 12 12"><path d="M0 0h12v12H0z"/></svg></body></html>', 'Content/DevUI/Hud/index.html');
  assert.match(result.rml, /src="\.\.\/Assets\/inline-svg-001\.png"/);
  assert.doesNotMatch(result.rml, /missing\.js/);
});

test('HTML to RML: ensures void tags are self-closing for XML parser compliance', () => {
  const html = '<div><img src="avatar.png"><input type="text"><br></div>';
  const result = convertHtmlToRml(html, 'test.html');

  assert.ok(result.rml.includes('<img src="avatar.png" />'));
  assert.ok(result.rml.includes('<input type="text" />'));
  assert.ok(result.rml.includes('<br />'));
  assert.ok(result.metrics.voidTagsClosed >= 3);
});

test('HTML to RML: detects unsupported tags (<video>, <canvas>) and creates error diagnostics', () => {
  const html = '<div><video src="clip.mp4"></video><canvas id="gameCanvas"></canvas></div>';
  const result = convertHtmlToRml(html, 'test.html');

  const videoDiag = result.diagnostics.find(d => d.id.includes('video'));
  const canvasDiag = result.diagnostics.find(d => d.id.includes('canvas'));

  assert.ok(videoDiag, 'Should flag <video>');
  assert.equal(videoDiag?.severity, 'error');
  assert.ok(canvasDiag, 'Should flag <canvas>');
  assert.equal(canvasDiag?.severity, 'error');
});

test('CSS to RCSS: normalizes transition timing functions and fixes casing', () => {
  const css = `
    .btn {
      transition: background-color 0.3s ease-in-out;
    }
    .panel {
      transition: opacity 0.2s Cubic-Out;
    }
  `;
  const result = convertCssToRcss(css, 'style.css', { autoFixTransitions: true });

  assert.ok(result.rcss.includes('cubic-in-out'), 'Should replace ease-in-out with cubic-in-out');
  assert.ok(result.rcss.includes('cubic-out'), 'Should replace Cubic-Out with lowercase cubic-out');
  assert.ok(!result.rcss.includes('Cubic-Out'), 'Should not leave uppercase Cubic-Out');
  assert.ok(result.metrics.autoFixesApplied >= 2);
});

test('CSS to RCSS: converts display: grid to display: flex with warning', () => {
  const css = `
    .container {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-gap: 16px;
    }
  `;
  const result = convertCssToRcss(css, 'layout.css', { convertGridToFlex: true });

  assert.match(result.rcss, /display:\s*flex;\s*flex-wrap:\s*wrap/);
  assert.ok(result.rcss.includes('gap: 16px'));
  const gridDiag = result.diagnostics.find(d => d.id.includes('grid'));
  assert.ok(gridDiag, 'Should have grid diagnostic');
  assert.equal(gridDiag?.severity, 'warning');
});

test('CSS to RCSS: flags box-shadow as parses-not-rendered gotcha', () => {
  const css = `
    .card {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    }
  `;
  const result = convertCssToRcss(css, 'style.css');

  const shadowDiag = result.diagnostics.find(d => d.id.includes('box-shadow'));
  assert.ok(shadowDiag, 'Should diagnose box-shadow');
  assert.ok(shadowDiag?.message.includes('does NOT render'));
});

test('CSS to RCSS: preserves a valid custom @font-face and rewrites its source to a DevUI-rooted path', () => {
  const css = `@font-face { font-family: "CustomFont"; src: url("./Fonts/CustomFont.ttf"); font-weight: 400; } body { font-family: CustomFont, sans-serif; }`;
  const result = convertCssToRcss(css, 'style.css', { rootRelativeFonts: true });
  assert.match(result.rcss, /@font-face\s*\{[^}]*font-family:\s*['\"]?CustomFont['\"]?[^}]*src:\s*Fonts\/CustomFont\.ttf/s);
  assert.match(result.rcss, /body\s*\{[^}]*font-family:\s*CustomFont/s);
  assert.ok(result.diagnostics.some(d => d.id.includes('css-font-path')));
  assert.doesNotMatch(result.rcss, /css-font-face-restricted/);
});

test('CSS to RCSS: preserves native VaCuus "dp" units and converts unsupported "sp"', () => {
  const css = `
    .badge {
      font-size: 14sp;
      margin: 24dp;
      width: 420dp;
    }
  `;
  const result = convertCssToRcss(css, 'style.css');

  assert.ok(result.rcss.includes('font-size: 14dp;'), 'sp should be converted to dp');
  assert.ok(result.rcss.includes('margin: 24dp;'), 'dp should be preserved per M5 spec');
  assert.ok(result.rcss.includes('width: 420dp;'), 'dp should be preserved per M5 spec');
});

test('CSS to RCSS: normalizes unregistered browser font stacks to Onest', () => {
  const result = convertCssToRcss("body { font-family: 'Inter', Arial, sans-serif; }", 'style.css');
  assert.match(result.rcss, /font-family:\s*Onest/);
  assert.doesNotMatch(result.rcss, /Inter|Arial|LatoLatin|Noto Sans/);
  assert.ok(result.diagnostics.some(d => d.id.includes('font-family-normalized')));
});

test('CSS to RCSS: preserves only exact supported font-family names', () => {
  const result = convertCssToRcss('h1 { font-family: Tektur; } code { font-family: JetBrains Mono; } p { font-family: "Some Other Font"; }', 'style.css');
  assert.match(result.rcss, /font-family:\s*Tektur/);
  assert.match(result.rcss, /font-family:\s*"JetBrains Mono"/);
  assert.match(result.rcss, /font-family:\s*Onest/);
  assert.doesNotMatch(result.rcss, /Some Other Font/);
});

test('CSS to RCSS: expands inset and keeps a renderable fallback for clamp, min, and calc', () => {
  const css = `
    .screen { position: absolute; inset: 60px 0 0; }
    .mode-card { position: absolute; left: clamp(14px, 1.52vw, 25px); bottom: clamp(92px, 10.4vh, 108px); width: min(398px, 42vw); max-width: calc(100vw - 28px); }
  `;
  const result = convertCssToRcss(css, 'responsive.css');

  assert.ok(result.rcss.includes('top: 60px'));
  assert.ok(result.rcss.includes('right: 0'));
  assert.ok(result.rcss.includes('bottom: 0'));
  assert.ok(result.rcss.includes('left: 0'));
  assert.ok(result.rcss.includes('left: 25px'));
  assert.ok(result.rcss.includes('bottom: 108px'));
  assert.ok(result.rcss.includes('width: 398px'));
  assert.ok(result.rcss.includes('max-width: 100%'));
  assert.ok(!/clamp\(|min\(|calc\(/i.test(result.rcss), 'Unsupported responsive functions must not leak into generated RCSS');
});

test('CSS to RCSS: converts place-items:center into flex-compatible alignment', () => {
  const result = convertCssToRcss('.icon { display:grid; place-items:center; }', 'icons.css');
  assert.match(result.rcss, /align-items:\s*center/);
  assert.match(result.rcss, /justify-content:\s*center/);
  assert.ok(!result.rcss.includes('place-items'));
});

test('JS Analyzer: detects forbidden browser APIs (localStorage, fetch, alert)', () => {
  const js = `
    function saveScore(score) {
      localStorage.setItem('score', score);
      fetch('/api/score', { method: 'POST' });
      window.alert('Saved!');
    }
  `;
  const result = analyzeAndConvertJs(js, 'main.js', { sanitizeBrowserJs: true });

  assert.ok(result.diagnostics.some(d => d.id.includes('localStorage')));
  assert.ok(result.diagnostics.some(d => d.id.includes('fetch')));
  assert.ok(result.diagnostics.some(d => d.id.includes('alert')));
  assert.ok(result.convertedJs.includes('VaCuusBridge'));
  assert.ok(!result.convertedJs.includes('var localStorage ='));
  assert.equal(result.metrics.shimsInjected, 0, 'Unsupported persistence must not be replaced with an in-memory shim');
});

test('Project Converter: converts multi-file project and produces full reports and artifacts', () => {
  const files: ProjectFile[] = [
    {
      id: 'f1',
      path: 'index.html',
      type: 'html',
      content: '<div class="hud"><button id="btn">Click</button></div>',
    },
    {
      id: 'f2',
      path: 'style.css',
      type: 'css',
      content: '.hud { display: block; transition: opacity 0.2s ease; }',
    },
    {
      id: 'f3',
      path: 'main.js',
      type: 'js',
      content: 'document.getElementById("btn").addEventListener("click", () => {});',
    },
  ];

  const result = convertProject(files, 'MainHUD');

  assert.ok(result.rml.includes('<rml>'));
  assert.ok(result.rml.includes('vacuus-base.rcss'));
  assert.ok(result.rcss.includes('cubic-in-out'));
  assert.ok(result.readmeMd.includes('Unreal Engine 5 Integration Guide'));
  assert.ok(result.conversionReportMd.includes('Compatibility Report'));
  assert.ok(result.projectManifestJson.includes('MainHUD/mainhud.rml'));
  assert.ok(result.compatibilityJson.includes('VaCuus / RmlUi'));
  assert.equal(result.metrics.htmlTagsProcessed >= 1, true);
});

test('Embedded Extractor: extracts <style> and inline <script> from monolithic HTML', () => {
  const monolithicHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Monolithic Screen</title>
        <style>
          .hud-panel { display: flex; color: #38bdf8; }
        </style>
      </head>
      <body>
        <div class="hud-panel"><button id="fireBtn">Fire</button></div>
        <script>
          document.getElementById('fireBtn').addEventListener('click', function() {
            console.log('Fired!');
          });
        </script>
      </body>
    </html>
  `;

  // Test extraction
  const files: ProjectFile[] = [
    {
      id: 'mono',
      path: 'index.html',
      type: 'html',
      content: monolithicHtml,
    },
  ];

  const result = convertProject(files, 'PauseMenu');

  // Verify extracted CSS is inside the generated RCSS
  assert.ok(result.rcss.includes('.hud-panel'));
  assert.ok(result.rcss.includes('color: #38bdf8'));

  // Verify extracted JS is inside the generated JS
  assert.ok(result.js.includes('fireBtn'));
  assert.ok(result.js.includes('Fired!'));

  // Verify RML body does NOT retain inline <style> or inline <script>
  assert.ok(!result.rml.includes('<style>'));
  assert.ok(!result.rml.includes('console.log(\'Fired!\')'));
  assert.ok(result.rml.includes('<link type="text/rcss" href="pausemenu.rcss"/>'));
  assert.ok(result.rml.includes('<script src="pausemenu.js"></script>'));

  // Verify extraction diagnostics were logged
  assert.ok(result.diagnostics.some(d => d.id.includes('embedded-css')));
  assert.ok(result.diagnostics.some(d => d.id.includes('embedded-js')));
});

test('splitMonolithicHtmlProject: separates single HTML file into 3 discrete files with mutual links', () => {
  const html = `<!DOCTYPE html>
<html>
  <head>
    <title>Combat Status</title>
    <style>
      .health-bar { width: 100px; height: 16px; background-color: #22c55e; }
    </style>
  </head>
  <body>
    <div class="health-bar" id="hb"></div>
    <script>
      console.log('Health initialized');
    </script>
  </body>
</html>`;

  const files = splitMonolithicHtmlProject(html, 'combat.html');

  assert.equal(files.length, 3, 'Should produce exactly 3 files: HTML, CSS, JS');

  const htmlFile = files.find(f => f.type === 'html');
  const cssFile = files.find(f => f.type === 'css');
  const jsFile = files.find(f => f.type === 'js');

  assert.ok(htmlFile, 'HTML file must exist');
  assert.ok(cssFile, 'CSS file must exist');
  assert.ok(jsFile, 'JS file must exist');

  assert.equal(htmlFile?.path, 'combat.html');
  assert.equal(cssFile?.path, 'combat.css');
  assert.equal(jsFile?.path, 'combat.js');

  // Verify extracted CSS content
  assert.ok(cssFile?.content.includes('.health-bar'));
  assert.ok(cssFile?.content.includes('#22c55e'));

  // Verify extracted JS content
  assert.ok(jsFile?.content.includes('Health initialized'));

  // Verify HTML has links to the newly created files
  assert.ok(htmlFile?.content.includes('<link rel="stylesheet" href="combat.css">'));
  assert.ok(htmlFile?.content.includes('<script src="combat.js"></script>'));

  // Verify style and script contents are removed from HTML body/head
  assert.ok(!htmlFile?.content.includes('.health-bar {'));
  assert.ok(!htmlFile?.content.includes("console.log('Health initialized')"));
});

test('extractEmbeddedAssetsFromHtml: correctly merges multiple <style> and <script> blocks', () => {
  const html = `<div>
    <style>body { margin: 0; }</style>
    <p>Content</p>
    <style>.btn { color: red; }</style>
    <script>var a = 1;</script>
    <script>var b = 2;</script>
  </div>`;

  const extracted = extractEmbeddedAssetsFromHtml(html, 'multi.html');

  assert.equal(extracted.embeddedCssBlocksCount, 2);
  assert.equal(extracted.embeddedJsBlocksCount, 2);
  assert.ok(extracted.extractedCss.includes('body { margin: 0; }'));
  assert.ok(extracted.extractedCss.includes('.btn { color: red; }'));
  assert.ok(extracted.extractedJs.includes('var a = 1;'));
  assert.ok(extracted.extractedJs.includes('var b = 2;'));
});

test('Embedded Extractor: ignores fake style/script tags inside HTML comments and CSS text', () => {
  const html = `<!--
    <style>.commented { color: red; }</style>
    <script>var commented = true;</script>
  -->
  <style>.active { content: "<script>not-a-script</script>"; color: blue; }</style>
  <script>var active = true;</script>`;

  const extracted = extractEmbeddedAssetsFromHtml(html, 'comments.html');

  assert.equal(extracted.embeddedCssBlocksCount, 1);
  assert.equal(extracted.embeddedJsBlocksCount, 1);
  assert.ok(extracted.extractedCss.includes('.active'));
  assert.ok(!extracted.extractedCss.includes('.commented'));
  assert.ok(extracted.extractedJs.includes('var active = true'));
  assert.ok(!extracted.extractedJs.includes('var commented = true'));
  assert.ok(!extracted.extractedJs.includes('not-a-script'));
  assert.ok(extracted.cleanedHtml.includes('<style>.commented { color: red; }</style>'));
  assert.ok(extracted.cleanedHtml.includes('<script>var commented = true;</script>'));
  assert.ok(!extracted.cleanedHtml.includes('<style>.active'));
  assert.ok(!extracted.cleanedHtml.includes('<script>var active = true;</script>'));
});

test('Gotchas & Matrix: detects pseudo-elements (::before) and layout thrashing in CSS', () => {
  const css = `
    .badge::before { content: "*"; }
    .slider { transition: width 0.3s cubic-in-out; }
    .card { filter: blur(4px); clip-path: polygon(0 0, 100% 0); }
  `;
  const result = convertCssToRcss(css, 'style.css');

  assert.ok(result.diagnostics.some(d => d.id.includes('css-pseudo-element')), 'Must flag ::before pseudo-element');
  assert.ok(result.diagnostics.some(d => d.id.includes('css-perf-layout-thrashing')), 'Must flag layout thrashing transition on width');
  assert.ok(result.diagnostics.some(d => d.id.includes('css-filter')), 'Must flag unsupported filter');
  assert.ok(result.diagnostics.some(d => d.id.includes('css-clip-path')), 'Must flag unsupported clip-path');
});

test('Localization & Perf Guide: detects non-ASCII glyphs and DOM element budget in HTML', () => {
  const html = `<div>
    <h1>Добро пожаловать в игру</h1>
    <p>Нажмите Старт для продолжения</p>
  </div>`;
  const result = convertHtmlToRml(html, 'menu.html');

  assert.ok(result.diagnostics.some(d => d.id.includes('html-localization-font')), 'Must flag localized Cyrillic text requiring unicode fonts');
});


test('CSS to RCSS: rewrites :root custom properties for the RML body without false undefined-var warnings', () => {
  const css = ':root { --teal: #00d4b5; --panel: #070d0e; } .active { color: var(--teal); background: var(--panel); }';
  const result = convertCssToRcss(css, 'theme.css');

  assert.match(result.rcss, /body\s*\{[^}]*--teal:\s*#00d4b5/s);
  assert.ok(result.rcss.includes('color: var(--teal)'));
  assert.ok(!result.diagnostics.some(d => d.id.includes('css-var-fallback')), 'Declared custom properties should not be reported as undefined');
});

test('CSS to RCSS: materializes quoted pseudo-elements as display:block helper spans', () => {
  const result = convertProject([{ id: 'p-html', path: 'index.html', type: 'html', content: '<div class="brand"><button class="active">PLAY</button></div>' }, { id: 'p-css', path: 'style.css', type: 'css', content: '.brand:before { content: ""; position: absolute; width: 12px; height: 20px; background: teal; } .brand button.active:after { content: ""; position:absolute; height:4px; background:#00d4b5; }' }], 'PseudoTest');

  assert.ok(result.rml.includes('vacuus-pseudo-before-brand'));
  assert.ok(result.rml.includes('vacuus-pseudo-after-brand-button-active'));
  assert.match(result.rcss, /\.brand \.vacuus-pseudo-before-brand[^\{]*\{\s*display:\s*block/s);
  assert.match(result.rcss, /\.brand button\.active \.vacuus-pseudo-after-brand-button-active[^\{]*\{\s*display:\s*block/s);
});

test('Active UI & Unreal Engine 5 Package: generates C++ integration and active UI manifests', () => {
  const files: ProjectFile[] = [
    {
      id: 'f1',
      path: 'index.html',
      type: 'html',
      content: '<div class="inventory"><button id="btnEquip">Equip</button></div>',
    },
    {
      id: 'f2',
      path: 'style.css',
      type: 'css',
      content: '.inventory { display: flex; }',
    },
    {
      id: 'f3',
      path: 'script.js',
      type: 'js',
      content: 'document.getElementById("btnEquip").addEventListener("click", () => {});',
    },
  ];

  const result = convertProject(files, 'InventoryScreen');

  assert.ok(result.cppHeader, 'Must generate C++ header');
  assert.ok(result.cppSource, 'Must generate C++ source');
  assert.ok(result.cppHeader.includes('UVaCuusInventoryScreenView'), 'Header must contain component class');
  assert.ok(result.cppHeader.includes('InitializeActiveUI'), 'Header must declare InitializeActiveUI');
  assert.ok(result.cppSource.includes('FInputModeGameAndUI'), 'Source must configure FInputModeGameAndUI');
  assert.ok(result.cppSource.includes('LoadDocument'), 'Source must load document');
  assert.ok(result.projectManifestJson.includes('"activeUI": true'), 'Manifest must flag activeUI: true');
  assert.ok(result.projectManifestJson.includes('"inputMode": "GameAndUI"'), 'Manifest must include inputMode');
});

test('VaCuus 1.1.0 adapter delegates to the native API and preserves the mount element', () => {
  const js = `
    const health = vacuus.model("hud").get("Health");
    const label = vacuus.translate("Health");
    vacuus.emit("sim_kill", { by: "button" });
  `;
  const result = analyzeAndConvertJs(js, 'hud_bundle.js', { sanitizeBrowserJs: true });

  assert.ok(result.convertedJs.includes('return vacuus.emit(eventName, payload);'), 'Adapter must delegate to the plugin native event queue');
  assert.ok(result.convertedJs.includes('vacuus.model(name).get(path)'), 'Adapter must delegate model reads to the native API');
  assert.ok(!result.convertedJs.includes('var vacuus = {'), 'Do not replace the plugin-provided vacuus global');
  assert.ok(!result.convertedJs.includes('window.ue'), 'Do not emit the unrelated browser window.ue bridge');
  assert.ok(!result.convertedJs.includes('window.__vacuus_models'), 'Do not emulate native data models through a fake window global');
  assert.equal(result.metrics.shimsInjected, 0, 'No behavior-changing browser shims are injected');

  // Verify RML mount point
  const html = '<!DOCTYPE html><html><head><title>M5 HUD</title></head><body><div id="mount"></div></body></html>';
  const rmlRes = convertHtmlToRml(html, 'm5_hud.html');
  assert.ok(rmlRes.rml.includes('<div id="mount" />') || rmlRes.rml.includes('<div id="mount"></div>'), 'Must preserve mount element');
  assert.ok(rmlRes.rml.includes('vacuus-base.rcss'), 'Must link vacuus-base.rcss first');
});

test('VaCuus JS adapter can be disabled when the project supplies its own bridge', () => {
  const result = analyzeAndConvertJs('console.log("native");', 'main.js', { generateUeBindings: false });

  assert.ok(!result.convertedJs.includes('const VaCuusBridge'));
  assert.ok(!result.convertedJs.includes('window.ue'));
});

test('RCSS Matrix & Debug Inspector: accurately maps CSS properties to RmlUi support tiers and gotchas', () => {
  // 1. Supported core layout & flex properties
  assert.equal(RCSS_PROPERTY_CATALOG['flex'].status, 'supported');
  assert.equal(RCSS_PROPERTY_CATALOG['width'].status, 'supported');
  assert.equal(RCSS_PROPERTY_CATALOG['color'].status, 'supported');
  assert.equal(RCSS_PROPERTY_CATALOG['font-family'].status, 'supported');

  // 2. Critical Gotchas: renderer refusal is explicitly warned in VaCuus 1.1.0
  assert.equal(RCSS_PROPERTY_CATALOG['box-shadow'].status, 'parses-not-rendered');
  assert.ok(RCSS_PROPERTY_CATALOG['box-shadow'].notes.includes('box-shadow'), 'Must explain box-shadow gotcha');
  assert.equal(RCSS_PROPERTY_CATALOG['mask-image'].status, 'parses-not-rendered');

  // 3. Supported with limits (display has table-layout keywords but excludes CSS Grid)
  assert.equal(RCSS_PROPERTY_CATALOG['display'].status, 'supported-with-limits');
  assert.ok(RCSS_PROPERTY_CATALOG['display'].notes.includes('Grid'), 'Must warn about Grid');
  assert.ok(RCSS_PROPERTY_CATALOG['display'].allowedValues?.includes('table'), 'Official VaCuus 1.1.0 matrix includes display: table');
  assert.ok(RCSS_PROPERTY_CATALOG['display'].allowedValues?.includes('table-cell'), 'Official VaCuus 1.1.0 matrix includes display: table-cell');
});


test('CSS to RCSS: uses parsed declarations and does not rewrite comments or strings', () => {
  const css = `
    /* transition: opacity 0.2s ease-in-out; */
    .btn {
      content: "ease-in-out";
      transition: background-color 0.3s ease-in-out;
    }
  `;
  const result = convertCssToRcss(css, 'comments.css');
  assert.ok(result.rcss.includes('/* transition: opacity 0.2s ease-in-out; */'));
  assert.ok(result.rcss.includes('content: "ease-in-out"'));
  assert.ok(result.rcss.includes('transition: background-color 0.3s cubic-in-out'));
  assert.ok(!result.rcss.includes('cubic-in-out-in-out'));
});

test('CSS to RCSS: optionally maps browser px lengths and media breakpoints to DPI-aware dp', () => {
  const css = `
    @media (max-width: 1200px) {
      .panel { width: 398px; transform: translateX(-8.5px); padding: 10px 16px; }
    }
    .asset { background-image: url("https://example.test/asset-20px.png"); content: "literal 16px"; }
  `;
  const result = convertCssToRcss(css, 'dpi-units.css', { cssPixelsAsDp: true });

  assert.match(result.rcss, /@media\s*\(max-width:\s*1200dp\)/);
  assert.match(result.rcss, /width:\s*398dp/);
  assert.match(result.rcss, /translateX\(-8\.5dp\)/);
  assert.match(result.rcss, /padding:\s*10dp 16dp/);
  assert.equal(result.externalImageAssets[0]?.url, 'https://example.test/asset-20px.png', 'px-like text inside URLs must remain unchanged before asset extraction');
  assert.ok(result.rcss.includes('content: "literal 16px"'), 'quoted text must remain unchanged');
  assert.ok(result.diagnostics.some(d => d.id.includes('css-px-to-dp')));
});

test('CSS to RCSS: px-to-dp conversion keeps diagnostic snippets in original CSS units', () => {
  const result = convertCssToRcss('.panel { box-shadow: 0 4px 12px rgba(0,0,0,.5); width: 20px; }', 'source-units.css', { cssPixelsAsDp: true });
  const shadow = result.diagnostics.find(d => d.id.includes('css-box-shadow'));
  assert.ok(shadow);
  assert.ok(shadow?.originalSnippet.includes('4px'), 'diagnostic should quote the original source, not the converted dp values');
  assert.match(result.rcss, /width:\s*20dp/);
});

test('CSS to RCSS: px-to-dp mapping is opt-in for physical-pixel/world-panel layouts', () => {
  const result = convertCssToRcss('.panel { width: 398px; }', 'world-panel.css', { cssPixelsAsDp: false });
  assert.match(result.rcss, /width:\s*398px/);
  assert.equal(result.diagnostics.some(d => d.id.includes('css-px-to-dp')), false);
});

test('VaCuus base stylesheet uses physical px and inline mixed-text runs to preserve inline flow', () => {
  const result = convertProject([
    { id: 'html', path: 'index.html', type: 'html', content: '<div>Base styles</div>' },
  ], 'BaseDpiStyles');
  assert.match(result.vacuusBaseRcss, /font-size:\s*16px/);
  assert.match(result.vacuusBaseRcss, /h1 \{ font-size: 28px/);
  assert.match(result.vacuusBaseRcss, /padding: 8px 16px/);
  assert.match(result.vacuusBaseRcss, /\.vacuus-text-run \{\s*display: inline;/);
  assert.match(result.vacuusBaseRcss, /\.vacuus-pseudo-helper \{\s*display: none;/);
});

test('CSS to RCSS: omits unsupported at-rules with diagnostics and preserves native at-rules', () => {
  const css = `
    @charset "UTF-8";
    .base { color: #ffffff; }
    @supports (display: grid) { .enhanced { display: grid; grid-template-columns: 1fr 1fr; } }
    @container card (min-width: 320px) { .card { gap: 12px; } }
    @media (max-width: 700px) { .base { color: #cccccc; } }
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  `;
  const result = convertCssToRcss(css, 'at-rules.css');

  assert.match(result.rcss, /\.base\s*\{/);
  assert.match(result.rcss, /@media\s*\(max-width:\s*700px\)/);
  assert.match(result.rcss, /@keyframes\s+fade-in/);
  assert.doesNotMatch(result.rcss, /@charset\s|@supports\s*\(|@container\s+card\s*\(/);
  assert.equal(result.diagnostics.filter(issue => issue.id.includes('css-unsupported-at-rule')).length, 2);
  assert.ok(result.diagnostics.some(issue => issue.id.includes('css-charset-removed')));
  assert.equal(result.metrics.unsupportedEncountered, 2);
});

test('Project conversion: preserves browser CSS px by default for screen-space visual parity', () => {
  const result = convertProject([
    { id: 'html', path: 'index.html', type: 'html', content: '<div class="panel">Panel</div>' },
    { id: 'css', path: 'style.css', type: 'css', content: '.panel { width: 398px; font-size: 18px; }' },
  ], 'DpiSizing');
  assert.match(result.rcss, /width:\s*398px/);
  assert.match(result.rcss, /font-size:\s*18px/);
  assert.equal(result.diagnostics.some(d => d.id.includes('css-px-to-dp')), false);
});

test('CSS to RCSS: percentage radius heuristic does not rewrite border width properties', () => {
  const css = `.panel { border-top-width: 10%; border-radius: 50%; }`;
  const result = convertCssToRcss(css, 'radius.css');
  assert.ok(result.rcss.includes('border-top-width: 10%'));
  assert.ok(result.rcss.includes('border-radius: 9999px'));
  assert.ok(!result.diagnostics.some(d => d.id.includes('border-radius-percent') && d.originalSnippet.includes('border-top-width')));
});

test('CSS to RCSS: malformed stylesheets produce a parse diagnostic instead of partial rewrites', () => {
  const css = `.panel { color: red;\n width: calc(100% - 10px);`;
  const result = convertCssToRcss(css, 'malformed.css');
  assert.ok(result.diagnostics.some(d => d.id.includes('css-parse-error')));
  assert.equal(result.metrics.propertiesAnalyzed, 0);
  assert.equal(result.rcss, css);
});

test('Project conversion: explicit option maps browser px to DPI-aware dp', () => {
  const result = convertProject([
    { id: 'html', path: 'index.html', type: 'html', content: '<div class="panel">Panel</div>' },
    { id: 'css', path: 'style.css', type: 'css', content: '.panel { width: 398px; font-size: 18px; }' },
  ], 'DpiSizingOptIn', { ...DEFAULT_CONVERSION_OPTIONS, cssPixelsAsDp: true });
  assert.match(result.rcss, /width:\s*398dp/);
  assert.match(result.rcss, /font-size:\s*18dp/);
  assert.ok(result.diagnostics.some(d => d.id.includes('css-px-to-dp')));
});

test('Project conversion: preserves CSS cascade order from stylesheet links and inline style blocks', () => {
  const html = `<!doctype html>
<html><head>
  <link rel="stylesheet" href="styles/base.css">
  <style>.inline-rule { color: #22cc88; }</style>
  <link href="./styles/theme.css?v=1" rel="stylesheet">
</head><body><div class="base-rule inline-rule theme-rule orphan-rule">UI</div></body></html>`;
  // Deliberately pass CSS files in a different order from the HTML declarations.
  const files: ProjectFile[] = [
    { id: 'page', path: 'screens/main.html', type: 'html', content: html, isEntry: true },
    { id: 'theme', path: 'screens/styles/theme.css', type: 'css', content: '.theme-rule { color: #334455; }' },
    { id: 'orphan', path: 'screens/extra.css', type: 'css', content: '.orphan-rule { color: #556677; }' },
    { id: 'base', path: 'screens/styles/base.css', type: 'css', content: '.base-rule { color: #112233; }' },
  ];

  const result = convertProject(files, 'CascadeTest');
  const baseIndex = result.rcss.indexOf('.base-rule');
  const inlineIndex = result.rcss.indexOf('.inline-rule');
  const themeIndex = result.rcss.indexOf('.theme-rule');
  const orphanIndex = result.rcss.indexOf('.orphan-rule');

  assert.ok(baseIndex >= 0, 'linked base stylesheet is included');
  assert.ok(inlineIndex > baseIndex, 'inline style follows the preceding linked stylesheet');
  assert.ok(themeIndex > inlineIndex, 'the later linked stylesheet remains later in the cascade');
  assert.ok(orphanIndex > themeIndex, 'unlinked uploaded CSS is appended after HTML-referenced styles');
  assert.ok(result.diagnostics.some(d => d.id.includes('css-unlinked-orphan')),
    'unlinked CSS should be reported instead of silently assuming browser order');
});

test('Project conversion: reports unresolved and media-constrained stylesheet links', () => {
  const html = `<html><head>
    <link rel="stylesheet" media="print" href="missing.css">
  </head><body><div>UI</div></body></html>`;
  const files: ProjectFile[] = [
    { id: 'page2', path: 'nested/index.html', type: 'html', content: html },
    { id: 'unused', path: 'nested/unused.css', type: 'css', content: '.unused { color: red; }' },
  ];

  const result = convertProject(files, 'MissingCss');
  assert.ok(result.diagnostics.some(d => d.message.includes('missing.css') && d.message.includes('no matching CSS project file')));
  assert.ok(result.diagnostics.some(d => d.message.includes('media="print"')));
  assert.ok(result.diagnostics.some(d => d.message.includes('unused.css') && d.message.includes('not referenced')));
});

test('splitMonolithicHtmlProject: keeps inline style links at source positions and resolves generated assets beside nested HTML', () => {
  const html = `<html><head>
    <link rel="stylesheet" href="base.css">
    <style>.first-inline { color: red; }</style>
    <link rel="stylesheet" href="theme.css">
    <style media="screen">.second-inline { color: blue; }</style>
  </head><body><div>UI</div><script>window.ready = true;</script></body></html>`;

  const files = splitMonolithicHtmlProject(html, 'screens/combat.html');
  const htmlFile = files.find(file => file.type === 'html');
  const cssFiles = files.filter(file => file.type === 'css');

  assert.equal(cssFiles.length, 2, 'each inline style block has its own CSS file to preserve cascade order');
  assert.equal(cssFiles[0].path, 'screens/combat.inline-1.css');
  assert.equal(cssFiles[1].path, 'screens/combat.inline-2.css');
  assert.ok(htmlFile);
  const content = htmlFile!.content;
  const baseLink = content.indexOf('href="base.css"');
  const inlineOneLink = content.indexOf('href="combat.inline-1.css"');
  const themeLink = content.indexOf('href="theme.css"');
  const inlineTwoLink = content.indexOf('href="combat.inline-2.css"');
  assert.ok(baseLink >= 0 && baseLink < inlineOneLink);
  assert.ok(inlineOneLink < themeLink);
  assert.ok(themeLink < inlineTwoLink);
  assert.ok(content.includes('href="combat.inline-2.css" media="screen"'));
  assert.ok(content.includes('<script src="combat.js"></script>'));
  assert.ok(files.some(file => file.path === 'screens/combat.js'));
});

test('Project conversion: alternate stylesheets are not re-added by the unlinked CSS fallback', () => {
  const html = `<html><head><link rel="alternate stylesheet" href="alternate.css"><link rel="stylesheet" href="main.css"></head><body>UI</body></html>`;
  const files: ProjectFile[] = [
    { id: 'alt-page', path: 'index.html', type: 'html', content: html },
    { id: 'alternate', path: 'alternate.css', type: 'css', content: '.alternate-only { color: red; }' },
    { id: 'main', path: 'main.css', type: 'css', content: '.main-only { color: blue; }' },
  ];

  const result = convertProject(files, 'AlternateStyles');
  assert.ok(!result.rcss.includes('.alternate-only'));
  assert.ok(result.rcss.includes('.main-only'));
  assert.ok(result.diagnostics.some(d => d.id.includes('css-alternate')));
  assert.equal(result.diagnostics.some(d => d.id.includes('css-unlinked-alternate')), false);
});


test('CSS to RCSS: rasterized SVG selectors and layered remote backgrounds are preserved as decorators', () => {
  const css = `.stat svg { width: 19px; height: 19px; stroke: #cbd2d2; fill: none; }\n.mode-visual { background: linear-gradient(90deg, rgba(0,0,0,.9), transparent), linear-gradient(0deg, rgba(0,0,0,.7), transparent 60%), url('https://example.test/panel.jpg') center/cover; background-color: #283538; }`;
  const result = convertCssToRcss(css, 'style.css');
  assert.match(result.rcss, /\.stat img\.vacuus-svg-raster/);
  assert.match(result.rcss, /decorator:\s*linear-gradient\(90deg, rgba\(0,0,0,.9\), transparent\), linear-gradient\(0deg, rgba\(0,0,0,.7\), transparent 60%\), image\(\.\.\/Assets\/remote-image-[a-f0-9]+\.png\)/);
  assert.equal(result.externalImageAssets.length, 1);
  assert.equal(result.externalImageAssets[0].url, 'https://example.test/panel.jpg');
  assert.ok(result.diagnostics.some(d => d.id.includes('remote-background')));
});

test('CSS to RCSS: converts a standalone linear-gradient background to an RCSS decorator', () => {
  const result = convertCssToRcss('.play { background: linear-gradient(100deg, #002e29, #00483e); }', 'style.css');
  assert.match(result.rcss, /decorator:\s*linear-gradient\(100deg, #002e29, #00483e\)/);
  assert.doesNotMatch(result.rcss, /background:\s*linear-gradient/i);
  assert.ok(result.diagnostics.some(d => d.id.includes('background-gradient')));
});

test('CSS to RCSS: removes font: inherit and preserves natural inheritance for controls', () => {
  const result = convertCssToRcss('body { font-family: "Inter"; font-size: 16px; } button { font: inherit; } .user { font: inherit; } .nav button { font-size: 18px; }', 'style.css');
  assert.doesNotMatch(result.rcss, /font:\s*inherit/i);
  assert.doesNotMatch(result.rcss, /font-(?:family|size|style|weight|stretch|variant):\s*inherit/i);
  assert.match(result.rcss, /body\s*\{[^}]*font-family:\s*Onest[^}]*font-size:\s*16px/s);
  assert.match(result.rcss, /\.nav button\s*\{\s*font-size:\s*18px/s);
  assert.equal(result.diagnostics.filter(d => d.id.includes('font-inherit')).length, 2);
});


test('UE export font README distinguishes bundled defaults from engine-supported custom faces', () => {
  const readme = generateFontsReadme();
  assert.match(readme, /bundles these three font families by default/i);
  assert.match(readme, /Imported custom @font-face declarations can be retained and packaged/i);
  assert.match(readme, /not the full set of font families supported by the VaCuus runtime/i);
  assert.doesNotMatch(readme, /Other @font-face declarations are removed/i);
});
