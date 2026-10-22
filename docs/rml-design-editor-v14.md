# RML Design Editor v14 — optional local AI and source-to-RML transparency

## Changes

- AI analysis is off by default and only applies to PNG/JPEG/WebP. SVG and Figma JSON remain deterministic/local.
- UI offers `No AI/manual`, bundled Qwen3-VL 2B alias, and a custom local OpenAI-compatible vision model.
- Local server URL and model alias can be configured in the generator UI and are saved as local browser preferences.
- New `/local-ai/status` route probes only loopback `/health` and `/v1/models`; model analysis sends the selected alias and local URL to a loopback-only inference client.
- Custom model IDs are strictly validated and URLs that are not HTTP loopback roots are rejected.
- Generator modal explains the four-step pipeline for SVG, Figma JSON, and PNG. The exact same source descriptions are included in `layout-report.md` through `getLayoutSourcePipeline()`.
- Reports include counts for containers, text, shapes, lines, and raster nodes, and clarify how RML nodes/RCSS rules are selected.

## Validation

- Targeted Node tests cover optional model selection, accepted loopback endpoints, rejection of remote/unsafe endpoint values, local server status probes and source pipeline/report text.
- No Vite build was run.
- Full browser interaction and UE5/VaCuus runtime rendering remain unverified.
