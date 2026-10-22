# VaCuus UI Converter Validation Strategy

This document details the multi-tiered validation strategy ensuring output artifacts operate correctly in Unreal Engine 5.

---

## 1. Automated Static Verification (Unit & Regression Tests)
- Native Node.js test runner (`node:test`, `node:assert/strict`).
- Validates XML well-formedness of all generated RML.
- Validates timing function lowercasing (`Cubic-Out` -> `cubic-out`).
- Validates CSS Grid -> Flexbox conversions.
- Validates `@font-face` root-relative path rewrites.
- Validates forbidden browser API detection using JavaScript AST nodes (ignores comments and strings, respects basic lexical shadowing).
- Validates `innerHTML` → `innerRML` codemod for direct/computed member access and ensures text/comments remain unchanged.
- Validates parse-failure behavior: JSX or invalid JavaScript gets a manual-fix diagnostic and is not rewritten.
- Validates dynamic-node growth and fixed-pool hints against parsed call expressions.
- Validates `calc()` detection and warnings.
- Validates `vacuus-base.rcss` inclusion.

---

## 2. In-Browser Emulation & Visual Feedback
- Playwright CLI automated browser test suite.
- Sandboxed iframe execution isolates user code from the converter host.
- RmlUi emulation mode suppresses `box-shadow` and `mask-image` in the visual preview to prevent false expectations.
- Viewport switcher (1080p, 1440p, 4K, 720p, Ultrawide).

---

## 3. Native Unreal Engine 5 Runtime Validation
When Unreal Engine 5 and the VaCuus plugin are available:
1. Copy exported ZIP contents to `<Project>/Content/DevUI/`.
2. Launch offscreen test run:
   ```bash
   <UE5EditorPath> <Project>.uproject \
     -game -RenderOffscreen -ForceRes -resx=1920 -resy=1080 \
     -ExecCmds="vacuus.ReloadUI, vacuus.Click test-btn 1.0, Automation RunTests VaCuus; Quit,"
   ```
3. Inspect `Saved/Logs/<Project>.log` for `LogVaCuus` entries.
4. Verify screenshot outputs in `Saved/Screenshots/`.
