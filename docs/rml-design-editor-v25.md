# VaCuus UI Converter v25

## What changed

### Automatic source routing

`src/core/layout-import-router.ts` recognizes single SVG files, Figma JSON, PNG/JPEG/WebP images, and small design bundles made only from these supported source types. A mixed HTML/CSS/JS project is intentionally not routed into the screenshot-layout wizard; it remains on the existing HTML/CSS-to-RML converter path.

### Screenshot-only manual reconstruction

A screenshot with AI disabled previously reached `combineLayoutPipelineDocuments(null, null)` and produced no Layout IR. The new `createImageReferenceStarter()` creates an explicit empty `LayoutDocument` with the source image dimensions and a `manualReconstructionStarter` marker. Validation accepts that *workspace state* with a warning, so the editor can expose its manual layer tools. Export still refuses to generate a screen with zero nodes.

When a local vision model is selected, the existing image-analysis path is retained. A failed vision request remains an error; the manual starter is not used to hide model failures.

### Default editor entrypoint

After generated files enter the main workspace, `main-editable.rml` is selected before `main.rml`. The former contains the generated, editable RML tree and references `layout.rcss` and `layout.js`; the latter remains a bitmap-backed pixel reference with optional explicitly defined hit zones.

## Verification performed

Run:

```bash
node --experimental-strip-types --test src/core/tests/layout-generator.test.ts src/core/tests/layout-import-router.test.ts
```

Current targeted regression result: **58 tests passed, 0 failed** across Layout Generator, import routing, UI wiring, combined pipeline and analysis validation.

Full Vite/React build and actual Unreal Engine 5.8/VaCuus rendering were not run in this workspace because project npm dependencies are not installed. The generated output manifest therefore continues to set `nativeVaCuusRuntimeVerified: false` until checked in UE.
