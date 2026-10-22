# VaCuus & RmlUi Research Sources and Provenance

This document establishes the verified technical sources for the **VaCuus UI Converter** knowledge base, adhering to the source hierarchy defined in section 21.2 of the specification.

---

## 1. Primary Sources (Hierarchy Tier 1 & 2: Target Engine Plugin)

### VaCuus Plugin Documentation & Runtime Guides
- **Official Documentation Portal**: `https://vacuus.ufna.dev/`
  - **AI Guide**: `https://vacuus.ufna.dev/docs/ai-guide`
    - Core verification loop (file save in `Content/DevUI`, PIE live reload via `vacuus.ReloadUI`).
    - Threading law: all calls into UI must originate from the game thread via `UVaCuusView`.
    - Headless offscreen testing (`-RenderOffscreen -ForceRes -resx=1920 -resy=1080`).
    - Data binding binding order rule (bind before load).
  - **Setup Guide**: `https://vacuus.ufna.dev/docs/setup`
    - Viewport mouse capture defaults in Unreal Engine (`FInputModeGameAndUI` requirement).
    - Offscreen render CLI flags and automation execution syntax (`-ExecCmds="..., Quit"`).
    - File location: `<Project>/Content/DevUI/`.
  - **Gotchas & Critical Limitations**: `https://vacuus.ufna.dev/docs/gotchas`
    - Gotcha #1: Mandatory `vacuus-base.rcss` reset stylesheet.
    - Gotcha #3b: `transition` timing function casing (`cubic-in`, `cubic-out`, `cubic-in-out`, `linear` only; `Cubic-Out` breaks transition).
    - Gotcha #5: DevUI-rooted bare `@font-face src` path resolution (e.g. `Fonts/Onest-Regular.ttf`, no leading slash); v9 registers only the three bundled families.
    - Gotcha #8a: Clip-mask stencil allocation costs and rounded scroll containers.
    - Gotcha #8b: `opacity` does NOT establish a compositing group! A child setting its own `opacity` overwrites the parent's rather than multiplying. Use `image-color` for images/decorators, alpha channel of `color`/`background-color` for text/fills.
    - Gotcha #9: Data model binding prior to `LoadDocument`.
    - Gotcha #14: Custom properties `var(--name, fallback)`. Unknown variable without fallback causes runtime Error.
    - Gotcha #16 & #19: Packaged build asset cooking and relative path differences.
  - **RCSS Property Matrix**: `https://vacuus.ufna.dev/docs/rcss-matrix`
    - Verified properties generated from the vendored RmlUi core.
    - **Absence of `calc()`**: No `calc()` parser exists in vendored RmlUi Core.
    - Flexbox support (flex-direction, flex-wrap, justify-content, align-items, gap).
    - Complete absence of CSS Grid engine.
    - `box-shadow` and `mask-image` are refused by the pinned VaCuus 1.1.0 layer-capture path with warnings; box-shadow is dropped while normal background/border remain, and mask renders unmasked. See the versioned source audit.
  - **Performance Guide**: `https://vacuus.ufna.dev/docs/perf-guide`
    - DOM element budget recommendations for 60fps/120fps HUDs.
    - Standing DOM vs dynamic row instantiation.
  - **Localization Guide**: `https://vacuus.ufna.dev/docs/localization`
    - Font glyph coverage (Latin vs Cyrillic vs CJK).
    - Parse-time vs runtime data-bound localization text.

---

## 2. Secondary Sources (Hierarchy Tier 4 & 5: Upstream RmlUi Core)

### Upstream RmlUi Documentation
- **RmlUi Documentation Portal**: `https://mikke89.github.io/RmlUiDoc/`
- **RCSS Specification**: `https://mikke89.github.io/RmlUiDoc/pages/rcss.html`
- **RCSS Property Index**: `https://mikke89.github.io/RmlUiDoc/pages/rcss/property_index.html`
- **RML Element Index**: `https://mikke89.github.io/RmlUiDoc/pages/rml/element_index.html`
- **Data Bindings Guide**: `https://mikke89.github.io/RmlUiDoc/pages/data_bindings.html`
- **C++ Events & Input**: `https://mikke89.github.io/RmlUiDoc/pages/cpp_manual/events.html`
- **Official GitHub Repository**: `https://github.com/mikke89/RmlUi`

---

## 3. Discrepancy Resolution Protocol

1. When upstream RmlUi documentation mentions a feature (e.g., standard CSS behaviors like group opacity or theoretical grid/calc proposals), but VaCuus documentation or vendored code explicitly notes it is absent or modified (e.g., `calc()` missing, `opacity` non-compositing, `box-shadow` not rendered), **VaCuus runtime reality is the authoritative source**.
2. Any unconfirmed feature is categorized as `unverified` and flagged for developer review rather than assumed to work.
