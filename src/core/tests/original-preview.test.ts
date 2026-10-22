import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOriginalPreviewDocument } from '../original-preview.ts';
import type { ProjectFile } from '../types.ts';

const file = (id: string, path: string, type: ProjectFile['type'], content: string, extra: Partial<ProjectFile> = {}): ProjectFile => ({ id, path, type, content, ...extra });

test('original preview preserves the document head and the browser CSS instead of applying VaCuus emulation rules', () => {
  const result = buildOriginalPreviewDocument(
    '<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width"><title>Source Title</title><link rel="stylesheet" href="styles.css"></head><body style="background:#112233"><div class="card">Hello</div></body></html>',
    'screen/index.html',
    [file('html', 'screen/index.html', 'html', ''), file('css', 'screen/styles.css', 'css', '@font-face { font-family: Custom; src: url("font.woff2"); } .card { box-shadow: 0 0 8px red; font-family: Custom; background: url("cover.png"); }'), file('font', 'screen/font.woff2', 'asset', 'Zm9udA==', { contentEncoding: 'base64', mimeType: 'font/woff2' }), file('img', 'screen/cover.png', 'asset', 'aW1hZ2U=', { contentEncoding: 'base64', mimeType: 'image/png' })],
  );
  assert.match(result.html, /<title>Source Title<\/title>/);
  assert.match(result.html, /name="viewport"/);
  assert.match(result.html, /background:#112233/);
  assert.match(result.html, /box-shadow:\s*0 0 8px red/);
  assert.match(result.html, /font-family:\s*Custom/);
  assert.match(result.html, /data:image\/png;base64,aW1hZ2U=/);
  assert.match(result.html, /data:font\/woff2;base64,Zm9udA==/);
  assert.doesNotMatch(result.html, /radial-gradient\(circle at 50% 50%/);
  assert.equal(result.resources.stylesheets, 1);
  assert.equal(result.resources.localAssets, 2);
  assert.equal(result.diagnostics.length, 0);
});

test('original preview follows linked CSS cascade order and does not load unreferenced CSS/JS project files', () => {
  const html = '<html><head><link rel="stylesheet" href="first.css"><style>.inline { color: green; }</style><link rel="stylesheet" href="nested/last.css"><script src="first.js"></script><script>window.inlineMarker = true;</script><script src="last.js"></script></head><body><div class="app">UI</div></body></html>';
  const result = buildOriginalPreviewDocument(html, 'ui/index.html', [
    file('html', 'ui/index.html', 'html', html),
    file('c1', 'ui/first.css', 'css', '.first { color:red }'),
    file('c2', 'ui/nested/last.css', 'css', '.last { color:blue }'),
    file('unused-css', 'ui/unused.css', 'css', '.unused { color:hotpink }'),
    file('j1', 'ui/first.js', 'js', 'window.firstMarker = 1;'),
    file('j2', 'ui/last.js', 'js', 'window.lastMarker = 1;'),
    file('unused-js', 'ui/unused.js', 'js', 'window.unusedMarker = 1;'),
  ]);
  const firstCss = result.html.indexOf('.first { color:red }');
  const inlineCss = result.html.indexOf('.inline { color: green; }');
  const lastCss = result.html.indexOf('.last { color:blue }');
  const firstJs = result.html.indexOf('window.firstMarker = 1;');
  const inlineJs = result.html.indexOf('window.inlineMarker = true;');
  const lastJs = result.html.indexOf('window.lastMarker = 1;');
  assert.ok(firstCss < inlineCss && inlineCss < lastCss, 'stylesheet order must follow HTML document order');
  assert.ok(firstJs < inlineJs && inlineJs < lastJs, 'classic script order must follow HTML document order');
  assert.doesNotMatch(result.html, /unusedMarker|\.unused \{/);
  assert.equal(result.resources.stylesheets, 3);
  assert.equal(result.resources.scripts, 3);
});

test('original preview recursively inlines local CSS @import while preserving import order and relative assets', () => {
  const result = buildOriginalPreviewDocument(
    '<html><head><link rel="stylesheet" href="css/main.css"></head><body><div>Hi</div></body></html>',
    'app/index.html',
    [
      file('html', 'app/index.html', 'html', ''),
      file('main', 'app/css/main.css', 'css', '@import "parts/reset.css"; .main { background:url("../images/bg.png"); }'),
      file('reset', 'app/css/parts/reset.css', 'css', '.reset { color:black; }'),
      file('img', 'app/images/bg.png', 'asset', 'Ymcu', { contentEncoding: 'base64', mimeType: 'image/png' }),
    ],
  );
  assert.ok(result.html.indexOf('.reset') < result.html.indexOf('.main'));
  assert.match(result.html, /data:image\/png;base64,Ymcu/);
  assert.equal(result.diagnostics.length, 0);
});

test('original preview reports missing local HTML dependencies instead of silently showing a blank stylesheet/script', () => {
  const result = buildOriginalPreviewDocument('<html><head><link rel="stylesheet" href="missing.css"><script src="missing.js"></script></head><body>UI</body></html>', 'index.html', []);
  assert.match(result.html, /missing stylesheet missing\.css/);
  assert.match(result.html, /missing script missing\.js/);
  assert.equal(result.diagnostics.filter(item => item.severity === 'error').length, 2);
});

test('original preview keeps external absolute resources intact and preserves media attributes', () => {
  const result = buildOriginalPreviewDocument('<html><head><link rel="stylesheet" media="print" href="theme.css"><link rel="stylesheet" href="https://cdn.example/theme.css"></head><body><img src="https://cdn.example/a.png"></body></html>', 'index.html', [file('css', 'theme.css', 'css', '.print { color: black; }')]);
  assert.match(result.html, /<style[^>]*media="print"/);
  assert.match(result.html, /href="https:\/\/cdn\.example\/theme\.css"/);
  assert.match(result.html, /src="https:\/\/cdn\.example\/a\.png"/);
  assert.equal(result.diagnostics.length, 0);
});

test('original preview preserves defer source position and runs deferred classic scripts after DOM parsing', () => {
  const result = buildOriginalPreviewDocument('<html><head><script defer src="app.js"></script></head><body><div id="ready">Ready</div></body></html>', 'index.html', [file('js', 'app.js', 'js', 'window.readyAtDeferredRun = !!document.getElementById("ready");')]);
  assert.ok(result.html.indexOf('window.__vacuusDeferredScripts.push') < result.html.indexOf('id="ready"'), 'the queue entry remains at the original script position');
  assert.match(result.html, /DOMContentLoaded/);
  assert.match(result.html, /ORIGINAL_PREVIEW_DIAGNOSTIC/);
  assert.equal(result.resources.scripts, 1);
});

test('original preview warns when a local ES module has relative imports that cannot be resolved as a plain inline script', () => {
  const result = buildOriginalPreviewDocument('<html><head><script type="module" src="main.mjs"></script></head><body></body></html>', 'index.html', [file('js', 'main.mjs', 'js', 'import { helper } from "./helper.mjs"; helper();')]);
  assert.ok(result.diagnostics.some(item => item.category === 'javascript' && item.message.includes('import/export')));
});

test('original preview does not rewrite url() or @import-like text inside CSS strings/comments', () => {
  const result = buildOriginalPreviewDocument(
    '<html><head><style>.sample::after { content: "url(missing.png) and @import \\\"fake.css\\\";"; background:url(real.png); } /* url(comment.png) @import \\\"comment.css\\\"; */</style></head><body>Text</body></html>',
    'index.html',
    [file('html', 'index.html', 'html', ''), file('image', 'real.png', 'asset', 'aW1hZ2U=', { contentEncoding: 'base64', mimeType: 'image/png' })],
  );
  assert.match(result.html, /content:\s*"url\(missing\.png\) and @import/);
  assert.match(result.html, /background:url\("data:image\/png;base64,aW1hZ2U="\)/);
  assert.match(result.html, /url\(comment\.png\) @import/);
  assert.equal(result.diagnostics.length, 0);
});

test('original preview handles common srcset URLs with descriptors and preserves data URLs', () => {
  const result = buildOriginalPreviewDocument(
    '<html><body><img srcset="small.png 1x, large.png 2x, data:image/png;base64,AAAB 3x" src="small.png"></body></html>',
    'index.html',
    [file('small', 'small.png', 'asset', 'c21hbGw=', { contentEncoding: 'base64', mimeType: 'image/png' }), file('large', 'large.png', 'asset', 'bGFyZ2U=', { contentEncoding: 'base64', mimeType: 'image/png' })],
  );
  assert.match(result.html, /data:image\/png;base64,c21hbGw= 1x/);
  assert.match(result.html, /data:image\/png;base64,bGFyZ2U= 2x/);
  assert.match(result.html, /data:image\/png;base64,AAAB 3x/);
  assert.equal(result.diagnostics.length, 0);
});

test('original preview inlines JSON script data files without treating them as executable JS', () => {
  const result = buildOriginalPreviewDocument(
    '<html><head><script type="application/json" id="settings" src="settings.json"></script><script src="main.js"></script></head><body></body></html>',
    'index.html',
    [file('settings', 'settings.json', 'asset', '{"enabled":true}'), file('js', 'main.js', 'js', 'window.settings = JSON.parse(document.getElementById("settings").textContent);')],
  );
  assert.match(result.html, /<script type="application\/json" id="settings">\{"enabled":true\}/);
  assert.ok(result.html.indexOf('{"enabled":true}') < result.html.indexOf('window.settings ='));
  assert.equal(result.diagnostics.length, 0);
});

test('original preview shows parser warnings for malformed HTML', () => {
  const result = buildOriginalPreviewDocument('<html><body><button>Go</div></button></body></html>', 'index.html', []);
  assert.ok(result.diagnostics.some(item => item.category === 'preview' && item.message.includes('HTML-парсер')));
});


test('original preview uses a local base href for resource resolution and neutralizes the virtual base tag', () => {
  const html = '<html><head><base href="./public/"><link rel="stylesheet" href="css/app.css"></head><body><img src="img/card.png"></body></html>';
  const result = buildOriginalPreviewDocument(html, 'project/index.html', [
    file('css', 'project/public/css/app.css', 'css', '.card { background:url("../img/bg.png"); }'),
    file('img1', 'project/public/img/card.png', 'asset', 'Y2FyZA==', { contentEncoding: 'base64', mimeType: 'image/png' }),
    file('img2', 'project/public/img/bg.png', 'asset', 'YmFja2dyb3VuZA==', { contentEncoding: 'base64', mimeType: 'image/png' }),
  ]);
  assert.doesNotMatch(result.html, /<base href="\.\/public\/">/);
  assert.match(result.html, /data:image\/png;base64,Y2FyZA==/);
  assert.match(result.html, /data:image\/png;base64,YmFja2dyb3VuZA==/);
  assert.ok(result.diagnostics.some(item => item.message.includes('локальный <base')));
});

test('original preview does not replace project files when an external base href controls URL resolution', () => {
  const html = '<html><head><base href="https://site.example/app/"><link rel="stylesheet" href="theme.css"></head><body><img src="hero.png"></body></html>';
  const result = buildOriginalPreviewDocument(html, 'index.html', [file('css', 'theme.css', 'css', 'body{color:red}'), file('hero', 'hero.png', 'asset', 'aGVybw==', { contentEncoding: 'base64', mimeType: 'image/png' })]);
  assert.match(result.html, /href="theme\.css"/);
  assert.match(result.html, /src="hero\.png"/);
  assert.ok(result.diagnostics.some(item => item.message.includes('внешний <base')));
});

test('original preview diagnoses JavaScript syntax errors in inline and linked source files', () => {
  const html = '<html><head><script>const x = ;</script><script src="broken.js"></script></head><body></body></html>';
  const result = buildOriginalPreviewDocument(html, 'index.html', [file('js', 'broken.js', 'js', 'function broken( {')]);
  const syntaxErrors = result.diagnostics.filter(item => item.severity === 'error' && item.category === 'javascript');
  assert.equal(syntaxErrors.length, 2);
  assert.ok(syntaxErrors.some(item => item.file.includes('inline script')));
  assert.ok(syntaxErrors.some(item => item.file === 'broken.js'));
});

test('original preview warns when CSP may block preview instrumentation', () => {
  const result = buildOriginalPreviewDocument(`<html><head><meta http-equiv="Content-Security-Policy" content="script-src 'self'"></head><body></body></html>`, 'index.html', []);
  assert.ok(result.diagnostics.some(item => item.message.includes('Content-Security-Policy')));
});

test('original preview omits local style/script preloads when their source files are embedded', () => {
  const html = '<html><head><link rel="preload" as="style" href="app.css"><link rel="stylesheet" href="app.css"><link rel="preload" as="script" href="app.js"><script src="app.js"></script></head><body></body></html>';
  const result = buildOriginalPreviewDocument(html, 'index.html', [file('css', 'app.css', 'css', 'body{color:blue}'), file('js', 'app.js', 'js', 'window.appStarted = true;')]);
  assert.match(result.html, /preload style app\.css omitted/);
  assert.match(result.html, /preload script app\.js omitted/);
  assert.match(result.html, /body\{color:blue\}/);
  assert.match(result.html, /window\.appStarted = true/);
  assert.equal(result.diagnostics.length, 0);
});


test('original preview reports invalid CSS syntax and leaves the source text inspectable', () => {
  const html = '<html><head><style>.broken { color: red</style></head><body>UI</body></html>';
  const result = buildOriginalPreviewDocument(html, 'index.html', []);
  assert.ok(result.diagnostics.some(item => item.severity === 'error' && item.category === 'resource' && item.message.includes('Синтаксическая ошибка CSS')));
  assert.match(result.html, /\.broken \{ color: red/);
});

test('original preview warns when scripts depend on temporary storage or dynamic relative fetch', () => {
  const html = '<html><head><script>const token = localStorage.getItem("token"); fetch("api/data.json");</script></head><body></body></html>';
  const result = buildOriginalPreviewDocument(html, 'index.html', []);
  assert.ok(result.diagnostics.some(item => item.category === 'javascript' && item.message.includes('localStorage/sessionStorage')));
  assert.ok(result.diagnostics.some(item => item.category === 'javascript' && item.message.includes('fetch/XMLHttpRequest')));
});


test('original preview includes a runtime probe for CSS background-image failures', () => {
  const result = buildOriginalPreviewDocument('<html><head><style>.hero{background-image:url(https://cdn.example/hero.jpg)}</style></head><body><div class="hero"></div></body></html>', 'index.html', []);
  assert.match(result.html, /checkBackgroundImages/);
  assert.match(result.html, /Не удалось загрузить CSS background-image/);
  assert.match(result.html, /url\(https:\/\/cdn\.example\/hero\.jpg\)/);
});


test('original preview keeps layer/supports CSS @import semantics in a self-contained data stylesheet', () => {
  const html = '<html><head><link rel="stylesheet" href="css/main.css"></head><body></body></html>';
  const result = buildOriginalPreviewDocument(html, 'index.html', [
    file('main', 'css/main.css', 'css', '@import url("parts/theme.css") layer(theme) supports(display: grid); .main{color:red}'),
    file('theme', 'css/parts/theme.css', 'css', '.theme { background-image: url("../../assets/icon.svg"); }'),
    file('icon', 'assets/icon.svg', 'asset', '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="arrow" viewBox="0 0 10 10"><path d="M0 0L10 5L0 10Z"/></symbol></svg>', { mimeType: 'image/svg+xml' }),
  ]);
  assert.match(result.html, /@import url\(\"data:text\/css;charset=utf-8,/);
  assert.match(result.html, /layer\(theme\) supports\(display: grid\)/);
  const encodedStylesheet = /@import url\(\"data:text\/css;charset=utf-8,([^"]+)\"\)/.exec(result.html)?.[1];
  assert.ok(encodedStylesheet, 'conditioned import must contain an embedded stylesheet');
  assert.match(decodeURIComponent(encodedStylesheet), /data:image\/svg\+xml;charset=utf-8,/);
  assert.equal(result.diagnostics.length, 0);
});

test('original preview preserves local SVG fragment identifiers when embedding sprite resources', () => {
  const html = '<html><body><svg><use href="assets/icons.svg#arrow"></use></svg></body></html>';
  const result = buildOriginalPreviewDocument(html, 'index.html', [file('icons', 'assets/icons.svg', 'asset', '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="arrow"></symbol></svg>', { mimeType: 'image/svg+xml' })]);
  assert.match(result.html, /data:image\/svg\+xml;charset=utf-8,[^"]+#arrow/);
  assert.equal(result.diagnostics.length, 0);
});
