# Layout Generator workspace — v23

## Goal

Consolidate the layout-to-RML workflow into one responsive workspace. Source formats are no longer presented as independent screens. They are optional inputs to the same pipeline.

## Workspace structure

### Wide desktop

- **Sources** — optional Figma JSON, SVG, and PNG/JPEG/WebP. Each source can be replaced or removed independently. A Figma JSON with multiple Frames exposes a Frame selector.
- **Preview** — source reference with clickable reconstructed element bounds, or the generated Layout IR schematic.
- **Inspector** — tabs for Structure, Code, and Checks. Structure permits adding and editing nodes; Code exposes RML/RCSS/report; Checks shows source, geometry, and pipeline diagnostics.

### Tablet and mobile

The workspace uses a compact navigation row (Files, Preview, Layers, Code, Checks). Only the selected area is mounted visibly; the footer action and current status remain available. This avoids stacking the complete editor, source list, layer inspector, and code panels into one long scrolling page.

## Pipeline states

1. Upload any subset of JSON, SVG, and PNG.
2. Parse JSON and SVG when supplied, compare geometry and image aspect ratio.
3. Run the final PNG pass: provided PNG preferred; otherwise use a rasterized SVG or a generated Layout IR reference.
4. Merge observations into Layout IR and show diagnostics.
5. Enable RML/RCSS generation only when validation passes.

Adding, replacing, or removing any source resets the validated state. The main footer action is context-sensitive: **Analyze layout** before successful validation, **Create RML/RCSS** afterward.

## Local AI settings

The local AI section is collapsed by default because AI is optional. It preserves the selected provider, model ID, endpoint, and bridge settings. PNG image analysis requires a configured local vision model; structural SVG/JSON paths can still be parsed when AI is disabled.

## Verification boundary

The responsive view selection and layout workflow are covered by source-level regression assertions, and the core layout/pipeline tests can run without Vite. Browser interaction, accessibility at real device widths, Vite build, and Unreal/VaCuus runtime rendering require a separate runtime verification pass.
