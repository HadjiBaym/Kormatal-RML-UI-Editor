# Multi-source Layout Pipeline (v22)

## Intended flow

The Layout Generator has a dedicated **All sources / Full pipeline** mode. SVG, PNG/JPEG/WebP and Figma JSON are independent optional inputs; at least one source is required.

1. **Figma JSON** — parse the layer tree, text, node metadata, available coordinates and supported Auto Layout information. Invalid supplied JSON is recorded as a blocking source error; an absent JSON file is skipped.
2. **SVG** — parse vector geometry, transforms, text and raster-backed vector groups. Invalid supplied SVG is recorded as a blocking source error; an absent SVG file is skipped.
3. **Source consistency** — compare the available canvas dimensions and select the geometry authority. Coordinate-complete JSON has priority; otherwise SVG is the preferred geometry source; otherwise a parseable JSON layout is used. Secondary SVG geometry is scaled to the authoritative canvas before merging.
4. **Final PNG pass** — this is intentionally the last analysis stage. An uploaded PNG is preferred. If no PNG is supplied, the pipeline rasterizes the SVG; if there is no SVG, it rasterizes the JSON-derived Layout IR preview. With a local vision model enabled, the resulting bitmap is sent to the selected local model. With AI disabled, bitmap dimensions and preparation are checked deterministically and visual AI recognition is explicitly marked as skipped.
5. **Merge to Layout IR** — keep structural-source geometry authoritative, use visual observations to enrich confidence/text and add high-confidence unrepresented regions, avoid obvious duplicates, and carry warnings into the document diagnostics. If JSON lacks trustworthy coordinates, it contributes semantic text rather than invented precise placement.
6. **Validation / RML-RCSS** — check canvas dimensions, IDs and node geometry. Generation is disabled until the resulting Layout IR is valid. A supplied source that fails parsing blocks generation; missing optional sources do not.

## Important limitations

- The PNG analyzer provides a visual estimate, not exact source-DOM recovery. It can miss small details or misclassify decorative regions.
- A JSON-only run without a supplied PNG analyzes a generated preview of the parsed layout, not an original pixel reference. That cannot verify visual parity with the original design.
- When the local AI model is disabled, SVG and JSON generation can still proceed after structural validation, but the PNG vision pass is skipped and clearly marked as such.
- Size mismatches are reported; supplemental SVG geometry is scaled to the authoritative canvas before merging.
- Browser and Unreal Engine/VaCuus runtime validation remain separate steps; unit tests do not establish native-renderer parity.
