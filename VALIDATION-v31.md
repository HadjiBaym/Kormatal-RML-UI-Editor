# VaCuus UI Converter v31 — Build and export refactor

Date: 2026-10-18

## Confirmed issues from source audit

1. The ZIP exporter fetched CSS-referenced external images and bundled fonts/licenses without timeouts. If a remote server stalled after starting a request, the UI could remain on “Упаковка шрифтов и файлов...” with no meaningful indication of which step was waiting.
2. `vite.config.ts` eagerly imported local vision analysis, visual review, and model-client modules even for the production `vite build` command. Those modules are needed only by the Vite dev server middleware.
3. The package archive had `bun.lock` but no `package-lock.json`, making npm dependency resolution non-reproducible across machines unless the lockfile was generated and preserved after `npm install`.
4. The `clean` script used POSIX `rm -rf`, which is not a portable npm script on Windows `cmd.exe` without a compatible shell.

## Changes

- Added `src/core/export-resources.ts` with bounded `fetchResourceWithTimeout` and `promiseWithTimeout` helpers.
- Export stops with an actionable timeout when external image requests take more than 15 seconds, response body reads exceed 15 seconds, bundled font/license requests take more than 10 seconds, or local SVG/image decoding exceeds 15 seconds.
- Export button now displays the current stage and progress through SVG conversion, external image processing, fonts/licenses, and ZIP generation. ZIP download object URL revocation is delayed briefly to reduce premature revocation risk.
- Extracted Vite local-AI middleware to `src/server/vite-local-ai-plugin.ts` and dynamically loads it only for `command === 'serve'`.
- `npm run build` retains Vite console output; `npm run build:debug` enables diagnostic logs.
- Added `npm run diagnose:build`, Node engine constraints and `scripts/clean.mjs` for Windows-safe cleanup.
- Added four automated tests for successful, stalled, and invalid-timeout resource fetch/body-read cases.

## Checks performed

- Resource timeout tests: **4 passed, 0 failed**.
- Layout PNG request validation, source import routing, layout pipeline and Knowledge Engine regression tests: **24 passed, 0 failed**.
- Local AI Bridge tests: **2 passed, 0 failed**.
- RCSS matrix sync check: passed, 103 properties.
- TypeScript/TSX/MTS syntax transpilation: **76 files, 0 syntax diagnostics**.
- JavaScript syntax checks for build diagnostics, cleanup script, bridge and Figma plugin: passed.
- Archive integrity: checked after packaging.

## Not confirmed in this environment

- `node_modules` is not present in the supplied source archive. `npm run build` therefore cannot start (`vite: not found`) until dependencies are installed.
- `npm install --no-audit --no-fund --ignore-scripts` did not complete in the execution environment within 120 seconds, so a full Vite production bundle and whole-project semantic type check could not be run here.
- The actual machine-specific build stall on the user's Windows PC cannot be attributed to one exact Vite phase without its terminal output. Use `npm run diagnose:build` and then `npm run build:debug`; the last printed phase will distinguish dependency installation from Vite config loading, Tailwind scanning, client transforms, and bundle generation.
- No Unreal Engine/VaCuus runtime is available in this environment.

## Recommended diagnostics on Windows

```bat
node --version
npm --version
npm run diagnose:build
npm install
npm run build:debug
```

Use `npm run dev` only to run the development server; it is expected to stay open. Preserve the final 30–50 terminal lines if `npm run build:debug` genuinely stops progressing.
