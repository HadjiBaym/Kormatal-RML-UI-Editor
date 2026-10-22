# VaCuus UI Converter v33 — source-grounded knowledge validation

Date: 2026-10-18

## Scope

The converter target profile and active knowledge documents were checked against the user-supplied `VaCuus-1.1.0-UE5.8.zip` for UE 5.8. `VaCuus-master.zip` was separately compared and is not used as target truth because its RmlUi and VaCuus integration files differ from the release despite the same `VersionName`.

## Changes

- Added `src/core/vacuus-1.1.0-ue5.8-profile.ts`, pinned to the official RCSS matrix SHA-256 `3ffc91eb288fa93d5c5868f88ec85348ea7e7126876bfdcc2deeac3db1adad34`. Official matrix: 99 properties, 20 shorthand rules, 16 decorators, 10 filter types, 4 font effects. The 103-entry converter catalog remains a separate source CSS conversion catalog.
- Added target fact `public-font-api`: the public `UVaCuusSubsystem::LoadFontFace(VfsPath, bFallbackFace)` API exists; the source matrix contains a stale contradictory sentence denying a public font-loading API. The Knowledge Engine records the code-level provenance and is instructed to prefer the public header and newer gotchas doc for this point.
- Updated the v33 font export README so it does not claim the three bundled font families are the complete engine limit or that custom `@font-face` is removed.
- Updated localization, current docs and the Knowledge Engine guidance so native `backdrop-filter: blur(...)` does not incorrectly require `decorator: shader(glass-panel)` in the same selector.
- Marked v7 editor material historical; old v9-v11 editor snapshots and the prior converter audit remain excluded from live Markdown retrieval.
- Added regression coverage for Knowledge Engine retrieval of the public font API and generated font-readme wording.
- Raised the default code-generation Knowledge Engine context budget to 6,400 characters (layout analysis stays at 4,800; visual review at 7,000) so a query-matched runtime font/API rule is not silently skipped at the tail of the context. The regression test checks this using default options, not an expanded test-only budget.
- Updated `docs/vacuus-source-audit-1.1.0-ue5.8.md` and README with the release-vs-master result and source-backed RCSS/runtime constraints.

## Checks

- Full converter Node test run: **249 passed, 0 failed** (final run after the default code-generation context adjustment).
  Command: `node --experimental-strip-types --test --test-reporter=tap src/core/tests/*.test.ts src/server/tests/*.test.ts local-ai-bridge/test.mjs`
- RCSS catalog synchronization: **passed**, 103 converter catalog entries in sync.
  Command: `node --experimental-strip-types scripts/sync-rcss-matrix.mts --check`
- TypeScript syntax transpilation: **79 `.ts`/`.tsx`/`.mts` files, 0 syntax errors**. This is transpile/syntax validation, not a full semantic TypeScript check.
- `npm run diagnose:build`: ran and correctly reported Vite is missing and the npm lockfile is absent (archive has `bun.lock`).
- `npm run build`: not executable in this environment; fails immediately with `vite: not found` because `node_modules` are not bundled and dependency install was not available here.
- ZIP integrity: checked after packaging; no `node_modules` are included.

## Not performed

No UE 5.8 plugin compilation, editor/PIE/cooked render, native screenshot capture, live LM Studio/Qwen inference or commercial license validation was performed. The source audit and converter tests cannot prove target-runtime visual fidelity; run a smoke test in the actual UE5.8 project.
