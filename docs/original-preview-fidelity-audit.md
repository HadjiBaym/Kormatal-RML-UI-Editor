# Original HTML preview fidelity audit — v32

## Finding

Before v32, the pane labelled as the original/source browser was not a faithful source preview. `PreviewPanel.tsx` stripped the imported `<head>`, linked stylesheets, inline `<style>`, and scripts, then assembled a replacement document from extracted/concatenated code. The original-browser path also used CSS normalization intended for the VaCuus emulation pane: it removed `@font-face` and `font` declarations, replaced font families, and applied `rewriteRcssForBrowser`, which suppresses `box-shadow` and rewrites VaCuus-only CSS. This made the “original” a modified approximation.

## v32 changes

- Original browser preview is produced by `buildOriginalPreviewDocument` and preserves the full source document whenever possible: doctype, head, body, metadata, inline CSS and inline JS.
- Local `<link rel="stylesheet">` dependencies are resolved relative to the actual HTML file and embedded exactly where the link occurred, preserving cascade order/media/title. Unreferenced project CSS is not automatically appended.
- CSS `@import` files are recursively resolved. Ordinary imports are expanded in place; imports with `layer()` / `supports()` modifiers are embedded as self-contained data stylesheets so the browser can retain their conditions. Missing imports, import cycles and CSS syntax errors are diagnosed.
- Local CSS `url()` and HTML image/font/media references are mapped to imported project data URLs. `srcset` candidates, common icon/preload links, inline `style` URL values and path resolution with local `<base href>` are handled. External absolute URLs remain external. External `<base href>` intentionally controls URL resolution, so local project references are not substituted in that case.
- Local `<script src>` files are loaded only when referenced by the source HTML; their ordering relative to inline scripts is retained. JSON/template data scripts are kept as data rather than executed. Classic `defer` scripts are queued at their original document position and executed after parsing, before the page's later `DOMContentLoaded` handlers.
- Acorn validates executable inline/local JS syntax; PostCSS validates inline/linked CSS syntax. CSP, local base URL, temporary storage use, `fetch`/XHR paths, `document.currentScript.src`, `import.meta.url`, module imports and async timing limitations produce diagnostics.
- Runtime errors, unhandled Promise rejections, failed element resource loads, and failures of CSS `background-image` URLs (checked by a bounded runtime probe of up to 100 unique URLs) are sent from the sandboxed iframe to the diagnostics panel. The diagnostics control is available in both dual-artboard and browser-only modes, and its overlay is shown only on the original browser artboard. No `allow-same-origin` was added. The original HTML source itself is not auto-fixed.
- `sourceHtmlPath` was added to the diagnostics listener dependencies so reported fallback file paths follow the active entry file.

## Known limitations

- This is a browser `srcdoc` virtualized preview, not the original site hosting environment. Runtime code that depends on relative network endpoints, cross-page routing, a real origin, the original storage persistence, or URL identity of `document.currentScript` may differ; the preview emits warnings for detectable cases.
- Relative ES-module imports are not packaged into a module graph yet. `async` scripts are embedded synchronously and this cannot preserve the original network race. The preview flags these cases when detectable.
- A strict source Content-Security-Policy may block injected instrumentation and/or locally rewritten script resources. The panel warns when a CSP meta tag exists.
- External scripts/styles/images remain network dependencies and need internet access.
- Static HTML parser warnings describe likely markup issues, but the original markup is not repaired. Browser-native HTML parsing may recover malformed HTML differently than the lightweight diagnostic parser.
- A pixel-level browser render comparison and live Unreal Engine/VaCuus rendering require runtime dependencies not available in the build sandbox. The code changes and regression tests do not by themselves prove pixel-identical rendering on every imported web app.

## Validation performed

- `node --experimental-strip-types --test src/core/tests/original-preview.test.ts` — 21 passed, 0 failed.
- Related converter/editor regression group — 105 passed, 0 failed.
- TypeScript transpile/syntax check — 78 TS/TSX/MTS files, 0 syntax errors. The generated bootstrap and imported inline LAMGUARD JS scripts also passed `node --check`. This is not a complete semantic type-check.
- `node --experimental-strip-types scripts/sync-rcss-matrix.mts --check` — 103 catalog properties in sync.
- Actual supplied LAMGUARD `index.html` processed through the source-preview builder: source 18,667 chars; generated preview 22,379 chars; one diagnostic: unmatched `</div>` inside the profile button. Head, inline stylesheet, inline script and source visual CSS such as `box-shadow` remain present; one linked executable script was recognized; both inline bootstrap/user scripts passed `node --check`. There were no unresolved local assets because that standalone smoke test intentionally passed only the HTML file and it references an external Unsplash image.
- `npm run build` was attempted and stopped with `vite: not found` because npm dependencies are not installed in the validation workspace. A full Vite build was not claimed as passing. Headless Chromium did not complete in this environment; live browser render and UE5/VaCuus runtime checks remain unverified.
