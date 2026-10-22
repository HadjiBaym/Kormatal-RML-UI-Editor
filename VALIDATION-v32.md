# VaCuus UI Converter v0.32.0 — Original Preview Audit

## Summary
Fixed the source/original browser preview so it no longer strips the original HTML head and styles/scripts or applies VaCuus-emulation CSS rewrites to the source pane. Added static and runtime diagnostics and expanded regression coverage for resource resolution and source execution semantics.

## Checks
- Original preview tests: 21 passed, 0 failed.
- Related converter/parser/resource/source-order/editor test suites: 105 passed, 0 failed.
- TypeScript/TSX/MTS syntax transpilation: 78 files, 0 syntax errors (not a semantic type-check). Generated bootstrap and imported inline LAMGUARD JS passed `node --check`.
- RCSS matrix: in sync, 103 properties.
- Real supplied LAMGUARD `index.html` smoke: head/style/script preserved; CSS `box-shadow` preserved; one source warning for an unmatched closing `</div>` inside the profile button.
- `npm run build`: blocked with `vite: not found`; dependencies are not installed in this workspace.
- Live Chromium render / UE5 / VaCuus render: not verified. Headless Chromium did not complete in this environment.

## Main files
- `src/core/original-preview.ts` — faithful-source document builder, path-aware resource localization, JS/CSS validation and warnings.
- `src/core/tests/original-preview.test.ts` — 21 regression tests.
- `src/components/PreviewPanel.tsx` — use builder in source browser, expose diagnostics in browser-only and dual modes, and report runtime diagnostics only over the source artboard.
- `src/App.tsx` — passes active HTML path and project files into the preview.

CSS `@import` with `layer()` / `supports()` conditions is preserved using an embedded stylesheet data URL; SVG sprite fragment IDs are retained when embedding SVG assets. CSS `background-image` URLs receive a bounded runtime load check (up to 100 unique URL probes).

## Known limits
ES-module relative import graphs, relative fetch/XHR hosting, exact async timing, real storage persistence, relative multipage routing and strict CSP execution cannot be perfectly reproduced in a sandboxed `srcdoc`. The preview emits warnings for many detectable cases. External URLs still require network. See `docs/original-preview-fidelity-audit.md`.
