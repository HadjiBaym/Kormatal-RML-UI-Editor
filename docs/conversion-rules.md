# Conversion Rules & Transformation Registry

This document catalogs every automated and manual transformation rule implemented by **VaCuus UI Converter**.

---

## 1. HTML to RML Rules

### Rule H-01: Document Envelope Conversion
- **Precondition**: Document contains `<!DOCTYPE html>` or `<html>...</html>`.
- **Transformation**: Replace root with `<rml>`, keep `<head>` and `<body>`, drop HTML5 doctype.
- **Auto-Fix**: Yes (Automatic).
- **Diagnostics**: `INFO` logged.

### Rule H-02: Strict XML Void Tag Closing
- **Precondition**: Document contains unclosed void tags (`<img>`, `<input>`, `<br>`, `<hr>`).
- **Transformation**: Append self-closing slash (`<img ... />`, `<input ... />`, `<br />`, `<hr />`).
- **Auto-Fix**: Yes (Automatic).
- **Diagnostics**: `INFO` / `AUTO-FIXED`.

### Rule H-03: Mandatory Base Reset Injection
- **Precondition**: RML `<head>` does not include `vacuus-base.rcss`.
- **Transformation**: Inject `<link type="text/rcss" href="vacuus-base.rcss"/>` as the very first `<link>`.
- **Auto-Fix**: Yes.
- **Diagnostics**: `INFO` / `AUTO-FIXED`.

### Rule H-04: Unsupported Media Elements Detection
- **Precondition**: Document contains `<video>`, `<audio>`, `<canvas>`, or `<iframe>`.
- **Transformation**: Do not silently drop; log critical error diagnostic with UE5 architectural alternative (e.g. `UMediaTexture`, `MetaSounds`, `UTextureRenderTarget2D`).
- **Auto-Fix**: No (Manual action required).
- **Diagnostics**: `ERROR`.

### Rule H-05: Inline CSS Uses the RCSS Conversion Pipeline
- **Precondition**: An HTML element has a `style` attribute.
- **Transformation**: Parse and normalize its declarations through the same PostCSS-based rules as linked and embedded stylesheets, then keep the converted declarations inline to retain their source specificity.
- **Diagnostics**: CSS compatibility findings are attached to the HTML source location; conversion metrics include inline declarations and auto-fixes.
- **Fallback**: If an inline declaration cannot be recovered from the generated RCSS, keep the source value but mark conversion as blocked rather than claiming a clean export.

---

## 2. CSS to RCSS Rules

### Rule C-01: CSS Grid to Flexbox Fallback
- **Precondition**: Declaration has `display: grid` or `display: inline-grid`.
- **Transformation**: Replace with `display: flex; flex-wrap: wrap;`. Convert `grid-gap` to `gap`.
- **Auto-Fix**: Yes.
- **Diagnostics**: `WARNING`.

### Rule C-02: Transition Timing Function Normalization
- **Precondition**: `transition` or `animation-timing-function` contains non-standard keywords (`ease`, `ease-in`, `ease-out`, `ease-in-out`) or capitalized tweens (`Cubic-Out`).
- **Transformation**: Translate to lowercase `cubic-in`, `cubic-out`, `cubic-in-out`, or `linear`.
- **Auto-Fix**: Yes.
- **Diagnostics**: `WARNING` (Silent drop prevention).

### Rule C-03: `calc()` Prohibition
- **Precondition**: Declaration contains `calc(...)`.
- **Transformation**: Flag with critical warning explaining that RmlUi core has no `calc()` parser. Provide fallback recommendation using flex-basis or custom properties.
- **Auto-Fix**: Partial.
- **Diagnostics**: `ERROR` / `MANUAL-FIX`.

### Rule C-04: Non-Compositing Opacity Guard
- **Precondition**: Nested child element declares `opacity` inside an ancestor that also has `opacity`.
- **Transformation**: Warn developer that in RmlUi child opacity overwrites ancestor opacity. Recommend `image-color` for images or alpha channel on `color`/`background-color`.
- **Auto-Fix**: No (Architectural choice).
- **Diagnostics**: `WARNING`.

### Rule C-05: Root-Relative Font Face Paths
- **Precondition**: `@font-face { src: url(...) }` uses relative path (`./Fonts/...` or `../Fonts/...`).
- **Transformation**: Convert to a DevUI-rooted bare path `Fonts/...` without a leading slash or `url()` wrapper.
- **Auto-Fix**: Yes.
- **Diagnostics**: `WARNING` / `AUTO-FIXED`.

### Rule C-06: Box-Shadow & Mask-Image Warnings
- **Precondition**: Declaration contains `box-shadow` or `mask-image`.
- **Transformation**: Preserve declaration for parser compatibility, append warning comment `/* [VaCuus: parses but not rendered] */`.
- **Auto-Fix**: Flagged with alternative advice (borders, image decorators).
- **Diagnostics**: `WARNING`.

---

## 3. JavaScript Rules

### Rule J-01: Storage Subsystem Replacement
- **Precondition**: Code references `localStorage` or `sessionStorage`.
- **Transformation**: Flag error, inject safe mock shim for testing, recommend UE5 `SaveGame` object or data model binding.
- **Auto-Fix**: Injects shim.
- **Diagnostics**: `ERROR`.

### Rule J-02: Network Request Isolation
- **Precondition**: Code calls `fetch()` or creates `XMLHttpRequest`.
- **Transformation**: Flag error, explain that HTTP requests belong in Unreal C++ `FHttpModule`.
- **Auto-Fix**: No.
- **Diagnostics**: `ERROR`.

### Rule J-03: Modal Dialog Prohibition
- **Precondition**: Code calls `window.alert()`, `confirm()`, or `prompt()`.
- **Transformation**: Replace with safe `console.log` fallback to prevent crash in headless engine.
- **Auto-Fix**: Yes.
- **Diagnostics**: `ERROR` / `AUTO-FIXED`.



## Source edits versus generated-output fixes

The rules above describe the compatibility transformations applied by the **conversion pipeline** to generated RML/RCSS/JS. They do not imply that the source HTML/CSS/JS should be rewritten. The editor's **Fix All** applies only source edits that can be proven safe, currently the scoped rename of the reserved `data-for="t : ..."` iterator and matching template bindings. Grid fallbacks, transition normalization, resource path resolution, storage shims, and unsupported effects are handled in generated output or require manual review; they are not broad text replacements against source files.

## Project inputs and runtime resources

Import the original HTML entry file plus associated CSS/JS, images, and font files. A package ZIP containing only generated RML/RCSS/JS output is an export artifact, not a source HTML project; the editor now warns when it has to fall back to a placeholder HTML screen.

Local raster resources are copied byte-for-byte to `Content/DevUI/Assets/` and referenced from the screen subfolder as `../Assets/<filename>`. Local project images used as RCSS backgrounds are converted to `decorator: image(../Assets/<filename>)`. SVG resources are rasterized to PNG during export. Missing image/font files and missing `<script src>` targets are shown in Diagnostics.

The new-font picker for newly authored elements offers three bundled families: Onest, Tektur and JetBrains Mono. The importer also preserves valid source `@font-face` registrations and packages local TTF/OTF resources under `Content/DevUI/Fonts/`; custom declared families are retained in the generated RCSS. Unregistered generic browser stacks still normalize to a safe bundled fallback. VaCuus `@font-face src` must be a bare DevUI/VFS-root-relative path (no `url()` wrapper or leading slash), e.g. `Fonts/GameSans.ttf`. Imported custom faces and font paths still need runtime verification in UE5/VaCuus.

The editor's RML emulation translates VaCuus-specific image decorators and root-relative font paths to browser CSS/data URLs for the preview only. Exported RML/RCSS are not rewritten into browser syntax. `px→dp` is an explicit conversion option: disabled means physical `px` (default); enabled converts CSS pixel dimensions/breakpoints into DPI-aware `dp` for a screen-space widget that should follow Slate/UMG scaling. World-panel UI typically remains pixel-sized.

## Conversion readiness gate

The generated report and Export dialog distinguish `blocked` (errors or manual fixes), `needs-review` (warnings or unverified features), and `static-clean` (no known static compatibility issue). `static-clean` is deliberately not described as 100% runtime compatibility: only a smoke test in the exact UE5/VaCuus plugin build can verify rendering, input, assets, and game-side bindings.
