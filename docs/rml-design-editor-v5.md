# RML Design Editor v5 — UE5 resource parity

## Changes

- Imports binary raster files and TTF/OTF/WOFF/WOFF2 files without decoding their bytes as text. Binary resources get a resource inspector instead of a base64 source editor. On ZIP import, the editor selects HTML first, then CSS, then JS, rather than accidentally opening the first image.
- Builds a project resource manifest; normalizes local HTML image paths (including CSS in `<style>` blocks and `style` attributes) to the screen-folder-relative `../Assets/...` form and custom font paths to `Fonts/...`. Missing images, fonts, and HTML-referenced JavaScript files are diagnosed.
- Includes imported binary images/fonts in Export ZIP; converts imported SVG resources and inline SVGs to PNG; keeps external CSS background image fetching explicit at export.
- Emits inline SVG references relative to the generated RML screen folder and omits source script tags from the RML body because JavaScript is bundled into the generated screen JS.
- Preview frames rewrite VaCuus `decorator: image(...)` to browser `background-image: url(...)`, resolve local assets to data URLs, resolve the editor-bundled Onest, Tektur and JetBrains Mono faces in the browser preview. These transformations are preview-only; exported RCSS stays native VaCuus syntax.
- Adds a `px→dp` toggle in the editor. Off by default for pixel fidelity. On converts CSS px sizing and breakpoints into dp so a screen-space UI can follow Slate/UMG's DPI curve.
- Detects imports with no source HTML and warns that a generated RML/RCSS/JS ZIP cannot be used as the original source project.

## Path rules

- Screen file: `Content/DevUI/<Screen>/<screen>.rml`.
- Images: `Content/DevUI/Assets/<image>`, referenced in RML/RCSS as `../Assets/<image>`.
- Fonts: `Content/DevUI/Fonts/<font>`, referenced by `@font-face src` as `Fonts/<font>` (DevUI-rooted bare path; no `url()` or leading slash).
- The editor now bundles Onest, Tektur and JetBrains Mono; Onest Regular is the default. Arbitrary font imports and other font families are no longer supported by current exports.

## Validation

Core tests are run with Node's built-in test runner using TypeScript type stripping. Full Vite production build depends on the Vite package being installed in the environment. Native UE5 rendering must still be confirmed in the target project and plugin version.
