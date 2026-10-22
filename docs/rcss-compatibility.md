# RCSS compatibility in this converter

> **Target baseline pinned from supplied plugin package:** VaCuus 1.1.0 for UE 5.8, vendored RmlUi commit `0ae381e00d7426762bb5ed897973366358b16642`. Machine-readable target facts and all 99 official properties are in `src/core/vacuus-1.1.0-ue5.8-profile.ts`; provenance is `docs/vacuus-source-audit-1.1.0-ue5.8.md`. The official property matrix is the source of truth for native `.rcss`.
>
> The generated table below is the converter's **CSS-import/conversion catalog**, not the native plugin matrix. It intentionally includes browser-only properties, source shorthands and transformation candidates. Do not treat its row count as the number of properties supported by VaCuus.

# RCSS Compatibility & Property Matrix (VaCuus / UE5)

This document catalogs RCSS properties supported by the vendored RmlUi engine in VaCuus for Unreal Engine 5, detailing limitations, quirks, and automatic conversion strategies.

---

## 1. Critical Engine Constraints

### 1.0. CSS `px` versus RmlUi `dp` in VaCuus screen-space views

- **Verified fact**: in the pinned RmlUi core, `px` returns the numeric value unchanged, while `dp` is multiplied by the context's density-independent pixel ratio. VaCuus screen-space widgets feed Slate's geometry scale to this ratio when `vacuus.DpFollowsDpiScale` is enabled (default `1`); world panels retain `dp == px`.
- **Converter behavior**: project conversion preserves CSS `px` values and `@media` pixel breakpoints by default to prioritize pixel-fidelity with browser screenshots. Opt into `cssPixelsAsDp: true` when the target needs Slate-DPI-aware sizing. Use the actual target widget scale to decide; the setting is not universal.
- **Important**: this is a sizing policy, not a guarantee of exact browser layout. Validate the final screen at the target viewport and project's DPI curve.

### 1.1. Absence of `calc()`
- **Verified Fact**: There is **no `calc()` parser** anywhere in the vendored RmlUi core.
- **Symptom**: Declarations such as `width: calc(100% - 30px);` fail to parse or are completely discarded.
- **Remedy**: Use Flexbox layout, percentage sizing with child margins, or CSS custom properties `var(--name)`.

### 1.2. Non-Compositing `opacity`
- **Verified Fact**: In CSS, `opacity` creates a stacking context composited into a dedicated offscreen buffer. In RmlUi, `opacity` is a plain **inherited** property multiplied per element at paint time.
- **Gotcha**: A child element that sets its own `opacity` completely **overwrites** the inherited opacity rather than compounding it!
- **Remedy**:
  - Do NOT redeclare `opacity` on child elements if an ancestor animates or toggles opacity.
  - For images, `<progress>`, and decorators: use `image-color: rgba(255, 255, 255, 0.5);` which multiplies against inherited opacity.
  - For text and solid fills: use the alpha channel of `color` or `background-color`.

### 1.3. `box-shadow` & `mask-image` in the pinned VaCuus 1.1.0 release
- **`box-shadow`**: the target refuses the off-screen layer capture needed to render the shadow and emits a warning once per view. The shadow is dropped; the element's ordinary background and border remain. Do not promise a visible shadow and do not describe this release as silently accepting it.
- **`mask-image`**: the target refuses the mask capture and emits a warning once per view. The element renders unmasked; mask artwork is discarded. Bake alpha into the asset or use a supported clipping/decorator approach.
- These are native runtime facts from the supplied VaCuus 1.1.0 / UE 5.8 archive. See `docs/vacuus-source-audit-1.1.0-ue5.8.md` and the machine-readable profile `src/core/vacuus-1.1.0-ue5.8-profile.ts`.

### 1.4. `transition` timing function syntax
- VaCuus 1.1.0 uses RmlUi tween names, not browser CSS `ease` names. Supported families in this release include `back`, `bounce`, `circular`, `cubic`, `elastic`, `exponential`, `linear`, `quadratic`, `quartic`, `quintic` and `sine`, with `-in`, `-out` and `-in-out` variants where defined by the engine.
- `cubic-in-out` is the target equivalent for browser `ease-in-out`; normalize browser timing functions deliberately rather than lowercasing arbitrary strings. `var()` in transition values is supported by this vendored build, but a declaration using an unsupported tween token may be rejected as a whole.

### 1.5. Custom Properties `var(--name, fallback)`
- **Verified Fact**: Supported with cycle detection, inheritance, and JS write access (`element.style.setProperty('--name', val)`).
- **Gotcha**: An undefined variable without a fallback value produces a runtime Error: `[Rml] Invalid substitution, variable '--name' not defined`.
- **Remedy**: Ensure fallbacks are provided: `var(--accent, #38bdf8)`.

### 1.6. `backdrop-filter` and `filter`
- In the pinned release, `backdrop-filter: blur(...)` is the shipped scene-glass path; do not require `decorator: shader(glass-panel)` in the same selector as a generic workaround.
- Non-blur `backdrop-filter` functions are refused. Per-element `filter: blur(...)` is not the same feature and is not a shipped Surface v1 use; other filter types are refused.
- Preserve only the verified blur form during conversion, and emit an explicit diagnostic for unsupported filter chains.

### 1.7. Custom packaged `@font-face`
- VaCuus supports custom packaged font faces. `font-family` and `src` are required; `src` is a bare path relative to the DevUI virtual root such as `Fonts/GameSans.ttf`, not `url(...)` and not a leading-slash URL.
- `<link>` / `<script src>` paths are document-relative, which differs from the font-face VFS-root path rule. Multi-source browser fallback lists and variable-font axis behavior should not be assumed to transfer faithfully; package the needed static weights and test in UE.
- The converter may choose a fallback when no packaged custom face is declared, but must not report custom `@font-face` support as a target-engine limitation.

### 1.8. CSS at-rules
- VaCuus 1.1.0's stylesheet parser accepts `@keyframes`, `@decorator`, `@spritesheet`, `@media` and `@font-face`. Browser-only at-rules such as `@supports`, `@container`, `@layer` and `@property` are omitted from generated RCSS with a source-located warning rather than passed through to an invalid-at-rule runtime error.
- Unsupported conditional blocks are not flattened: applying their declarations unconditionally could change the source cascade. `@charset` is removed as source-encoding metadata after decoding and reported as informational.

---

## 2. Comprehensive Property Matrix

The generated table below summarizes the converter's CSS-import/conversion catalog in `src/core/rcss-matrix.ts`; native target capability is defined by `src/core/vacuus-1.1.0-ue5.8-profile.ts`. The table is generated from that importer catalog; do not edit it manually. Run `node --experimental-strip-types scripts/sync-rcss-matrix.mts` after catalog changes, or append `--check` in validation to detect drift. Status reflects the converter's declared compatibility profile and is not a substitute for a runtime test against the exact VaCuus build.

<!-- BEGIN GENERATED RCSS PROPERTY MATRIX -->
| Property | Status | Values and constraints | Conversion rule | Source auto-fix |
| :--- | :--- | :--- | :--- | :--- |
| `display` | Supported with limits | Allowed values: none, block, inline, inline-block, flow-root, flex, inline-flex, table, inline-table, table-row, table-row-group, table-column, table-column-group, table-cell. CSS Grid values grid/inline-grid are unsupported. VaCuus 1.1.0 does include CSS display table-layout values, including table, inline-table, table-row, table-row-group, table-column, table-column-group and table-cell; this does not by itself prove semantic HTML table-tag support. Elements default to inline without vacuus-base.rcss. | Convert display: grid to display: flex with flex-wrap: wrap. | Yes (review result) |
| `position` | Supported with limits | Allowed values: static, relative, absolute, fixed. Absolute positioning is relative to the nearest positioned ancestor (position != static). | — | No |
| `top` | Supported | Supported with px, %, em, rem. | — | No |
| `right` | Supported | Supported with px, %, em, rem. | — | No |
| `bottom` | Supported | Supported with px, %, em, rem. | — | No |
| `left` | Supported | Supported with px, %, em, rem. | — | No |
| `z-index` | Supported | Integer values supported. | — | No |
| `flex` | Supported | Shorthand for flex-grow flex-shrink flex-basis. | — | No |
| `flex-direction` | Supported | Allowed values: row, row-reverse, column, column-reverse. Full flex-direction support. | — | No |
| `flex-wrap` | Supported | Allowed values: nowrap, wrap, wrap-reverse. Full wrap support. | — | No |
| `justify-content` | Supported | Allowed values: flex-start, flex-end, center, space-between, space-around, space-evenly. Standard flex alignment. | — | No |
| `align-items` | Supported | Allowed values: flex-start, flex-end, center, baseline, stretch. Cross-axis alignment. | — | No |
| `align-content` | Supported | Cross-axis multi-line alignment. | — | No |
| `align-self` | Supported | Item self-alignment. | — | No |
| `flex-grow` | Supported | Numeric factor. | — | No |
| `flex-shrink` | Supported | Numeric factor. | — | No |
| `flex-basis` | Supported | Length or auto. | — | No |
| `order` | Supported | Integer item ordering. | — | No |
| `gap` | Supported with limits | Supported in modern RmlUi; margin fallbacks recommended for older engine builds. | — | Yes (review result) |
| `width` | Supported | Supports px, dp, %, em, rem, auto. Browser CSS px is preserved by default; set cssPixelsAsDp=true to opt into DPI-aware dp scaling. | — | No |
| `min-width` | Supported | Supports lengths and %. | — | No |
| `max-width` | Supported | Supports lengths and %. | — | No |
| `height` | Supported | Supports px, dp, %, em, rem, auto. Browser CSS px is preserved by default; set cssPixelsAsDp=true to opt into DPI-aware dp scaling. | — | No |
| `min-height` | Supported | Supports lengths and %. | — | No |
| `max-height` | Supported | Supports lengths and %. | — | No |
| `margin` | Supported | Shorthand margin supported. | — | No |
| `margin-top` | Supported | Supports auto, lengths, %. | — | No |
| `margin-right` | Supported | Supports auto, lengths, %. | — | No |
| `margin-bottom` | Supported | Supports auto, lengths, %. | — | No |
| `margin-left` | Supported | Supports auto, lengths, %. | — | No |
| `padding` | Supported | Shorthand padding supported. | — | No |
| `padding-top` | Supported | Supports lengths and %. | — | No |
| `padding-right` | Supported | Supports lengths and %. | — | No |
| `padding-bottom` | Supported | Supports lengths and %. | — | No |
| `padding-left` | Supported | Supports lengths and %. | — | No |
| `box-sizing` | Supported | Allowed values: border-box, content-box. Set border-box globally via vacuus-base.rcss. | — | No |
| `src` | Supported | Font source descriptor inside @font-face. | — | No |
| `background` | Supported | Colors, decorators and image URLs supported. | — | No |
| `background-color` | Supported | Supports hex, rgb, rgba. | — | No |
| `border` | Supported | Supports <width> <style> <color>. | — | No |
| `border-top` | Supported | Top border shorthand. | — | No |
| `border-right` | Supported | Right border shorthand. | — | No |
| `border-bottom` | Supported | Bottom border shorthand. | — | No |
| `border-left` | Supported | Left border shorthand. | — | No |
| `border-width` | Supported | Supports px lengths. | — | No |
| `border-top-width` | Supported | Top border width. | — | No |
| `border-right-width` | Supported | Right border width. | — | No |
| `border-bottom-width` | Supported | Bottom border width. | — | No |
| `border-left-width` | Supported | Left border width. | — | No |
| `border-style` | Supported | Allowed values: none, solid, double. Solid borders are primary. | — | No |
| `border-top-style` | Supported | Top border style. | — | No |
| `border-right-style` | Supported | Right border style. | — | No |
| `border-bottom-style` | Supported | Bottom border style. | — | No |
| `border-left-style` | Supported | Left border style. | — | No |
| `border-color` | Supported | Colors supported. | — | No |
| `border-top-color` | Supported | Top border color. | — | No |
| `border-right-color` | Supported | Right border color. | — | No |
| `border-bottom-color` | Supported | Bottom border color. | — | No |
| `border-left-color` | Supported | Left border color. | — | No |
| `border-radius` | Supported with limits | The target RmlUi longhand parsers accept lengths, not percentages. The converter has a special approximation for 50% pills/circles; other percentage radii require explicit lengths. | — | No |
| `border-top-left-radius` | Supported | Corner radius. | — | No |
| `border-top-right-radius` | Supported | Corner radius. | — | No |
| `border-bottom-left-radius` | Supported | Corner radius. | — | No |
| `border-bottom-right-radius` | Supported | Corner radius. | — | No |
| `color` | Supported | Supports hex, rgb, rgba. | — | No |
| `font-family` | Supported | Must match registered fonts in UE5 / DevUI. | — | No |
| `font-size` | Supported | Supports px, dp, em, rem. Browser CSS px is preserved by default; set cssPixelsAsDp=true to opt into Slate DPI scaling. | — | No |
| `font-style` | Supported | Allowed values: normal, italic. Supported if italic font variant loaded. | — | No |
| `font-weight` | Supported | Allowed values: normal, bold, 100, 200, 300, 400, 500, 600, 700, 800, 900. Depends on loaded font weights. | — | No |
| `text-align` | Supported | Allowed values: left, right, center, justify. Horizontal text alignment. | — | No |
| `text-decoration` | Supported | Allowed values: none, underline. Underline supported. | — | No |
| `text-transform` | Supported | Allowed values: none, capitalize, uppercase, lowercase. Transforming text casing. | — | No |
| `line-height` | Supported | Supports normal, numeric, px. | — | No |
| `letter-spacing` | Supported | Kerning adjustment. | — | No |
| `white-space` | Supported | Allowed values: normal, pre, nowrap, pre-wrap, pre-line. Whitespace collapsing rules. | — | No |
| `word-break` | Supported | Allowed values: normal, break-all, break-word. Word wrapping. | — | No |
| `transition` | Convertible | Timing functions MUST be exact lowercase: cubic-in, cubic-out, cubic-in-out, linear. Invalid functions or capitalized names (e.g. Cubic-Out, ease-in-out) cause whole declaration to be dropped. var() inside transition has known engine limits. | Translate ease -> cubic-in-out, ease-in -> cubic-in, ease-out -> cubic-out, fix casing to lowercase. | Yes (review result) |
| `animation` | Supported with limits | CSS keyframe animations supported for transform, opacity, colors. | — | No |
| `animation-name` | Supported | Keyframes identifier. | — | No |
| `animation-duration` | Supported | Duration in s or ms. | — | No |
| `animation-timing-function` | Convertible | Must be cubic-in, cubic-out, cubic-in-out or linear. | — | Yes (review result) |
| `animation-iteration-count` | Supported | Integer or infinite. | — | No |
| `transform` | Supported | Supports translate, translateX, translateY, scale, scaleX, scaleY, rotate. | — | No |
| `transform-origin` | Supported | Supports x y origin lengths or percentages. | — | No |
| `opacity` | Supported | Number between 0.0 and 1.0. | — | No |
| `visibility` | Supported | Allowed values: visible, hidden. Visibility toggle. | — | No |
| `overflow` | Supported | Allowed values: visible, hidden, auto, scroll. Overflow clipping. | — | No |
| `overflow-x` | Supported | Allowed values: visible, hidden, auto, scroll. Horizontal clipping. | — | No |
| `overflow-y` | Supported | Allowed values: visible, hidden, auto, scroll. Vertical clipping. | — | No |
| `pointer-events` | Supported | Allowed values: auto, none. Pass-through input events. | — | No |
| `cursor` | Supported with limits | Pointer or default cursor. | — | No |
| `decorator` | Supported | RmlUi custom decorators: image(), tiled-horizontal(), tiled-box(), gradient(). | — | No |
| `box-shadow` | Parses / not rendered | VaCuus 1.1.0 refuses box-shadow at SaveLayerAsTexture with a warning once per view. The shadow is dropped while the element keeps its normal background and border; do not describe it as silent or as replacing the element with a white rectangle. | Use a packaged pre-blurred shadow/ninepatch texture or another visually validated decorator; do not leave box-shadow expecting it to render. | Yes (review result) |
| `mask-image` | Parses / not rendered | VaCuus 1.1.0 refuses mask-image at SaveLayerAsMaskImage with a warning once per view. The element renders unmasked and the mask artwork is discarded. | Bake alpha into the image asset, use a supported image/ninepatch decorator, or use overflow:hidden plus border-radius where visually valid. | Yes (review result) |
| `-webkit-mask-image` | Parses / not rendered | Browser-only vendor mask property. The target VaCuus mask-layer capture path is refused; target content renders without the mask and logs a warning once per view. | — | Yes (review result) |
| `filter` | Unsupported | The VaCuus 1.1.0 recorder compiles the blur filter, but the shipped verified consumer is backdrop-filter (glass); per-element filter:blur is not a shipped v1 surface. Other filter types are refused and dropped. | — | No |
| `backdrop-filter` | Supported with limits | VaCuus 1.1.0 ships backdrop-filter: blur(...) as its scene-glass path: the blur is distilled at record time and recomposited/re-blurred each engine frame. Non-blur backdrop-filter values are refused. This is a VaCuus renderer feature, not a generic RmlUi/browser guarantee. | Preserve backdrop-filter: blur(...); warn and disable non-blur backdrop filters. Verify the effect in the exact UE5/VaCuus target runtime. | Yes (review result) |
| `grid` | Unsupported | CSS Grid is completely unsupported in RmlUi. Must use Flexbox. | Convert to display: flex and flex-direction/wrap. | Yes (review result) |
| `grid-template-columns` | Unsupported | CSS Grid template columns unsupported. | Use flex children with flex: 0 0 <width> or flex-basis percentage. | Yes (review result) |
| `grid-template-rows` | Unsupported | CSS Grid template rows unsupported. | — | Yes (review result) |
| `grid-column` | Unsupported | CSS Grid column positioning unsupported. | — | Yes (review result) |
| `grid-row` | Unsupported | CSS Grid row positioning unsupported. | — | Yes (review result) |
| `grid-gap` | Convertible | Convert to gap or child margins. | Convert grid-gap to gap or margin. | Yes (review result) |
<!-- END GENERATED RCSS PROPERTY MATRIX -->
