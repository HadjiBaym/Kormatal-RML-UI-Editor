# VaCuus UI Converter v37 — Import Crash Audit

Date: 2026-10-18

## Summary

This iteration hardens the HTML/CSS/JS import path and moves project conversion off the React UI thread. The changes are preventative fixes based on source inspection and targeted regression tests; they do not prove the user's original crash root cause because no crash log or browser stack trace was supplied.

## Changes

- Project conversion now runs in a dedicated Vite module Web Worker, debounced by 120 ms; a superseded worker is terminated. Runtime errors and message-clone errors are surfaced in the UI. Export is blocked while conversion is running or has failed, preventing stale results from being packaged.
- The main React UI no longer imports the full `project-converter` just to split inline assets or initialize the blank result. HTML splitting and empty conversion state are in small, lightweight modules.
- ZIP import filters out `node_modules`, `.git`, `dist`, `build`, `.next`, `.cache`, `coverage`, `.turbo`, OS metadata, unsafe traversal/absolute paths and unsupported file extensions before content extraction.
- Import guardrails cap direct file count at 500 and total selected data at 60 MiB; HTML at 10 MiB, CSS/RCSS at 8 MiB, JS at 5 MiB, other text at 4 MiB and images/fonts at 20 MiB each. Accepted archive payload is capped at 80 MiB expanded. Oversized/rejected files are reported in the sidebar rather than throwing out of the import handler.
- Binary assets are base64-encoded in aligned chunks instead of creating one huge temporary binary string.
- Deeply nested HTML tree walks (`firstDescendant`, `descendants`, `collectText`) are iterative, avoiding recursion stack overflow on pathological markup. The parser also avoids repeated full-source lowercasing when checking embedded blocks.
- Multi-source import routing first checks file extensions and avoids converting all images into data URLs when the selected set is an ordinary HTML/CSS/JS project.
- Project folder sync compares file `size` and `lastModified` before rereading content. Poll frequency changed from 1.2 seconds to 2.5 seconds. Folder import observes the same count/size limits.
- Added import status messages, disabled the import button while reading, caught per-file/ZIP failures, and reset the file input in `finally`.

## Tests run

- `npm run test:imports`: 14 passed, 0 failed.
- `node --experimental-strip-types --test src/core/tests/ui-layout-regressions.test.ts`: 4 passed, 0 failed.
- `node --experimental-strip-types scripts/sync-rcss-matrix.mts --check`: pass, 103 properties in sync.
- TypeScript transpile/syntax pass: 54 production TS/TSX/MTS files, 0 syntax diagnostics.
- `npm run build`: BLOCKED because the project dependencies were not installed in this environment (`vite: not found`). This is not a failed Vite compile; Vite could not start.

## Remaining verification

- The original user crash was not accompanied by a browser console trace, so the exact triggering file and root cause remain unproven.
- Full app build, browser interaction test and UE5/VaCuus runtime test were not performed.
- Tests from `src/core/tests/html-parser.test.ts` require dependencies such as `postcss`; the full dependency tree is not present in this packaging environment.
- To verify locally: run `npm install`, `npm run test:imports`, `npm run test:ui-layout`, then `npm run build`. Import the same HTML/CSS/JS project that previously crashed and check the sidebar import-status text and browser DevTools console if an error remains.
