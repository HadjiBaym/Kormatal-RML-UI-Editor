> Historical implementation note: statements below about only three permitted/bundled font families describe that editor revision, not VaCuus 1.1.0 engine capability. Current target truth is documented in `vacuus-source-audit-1.1.0-ue5.8.md`; the engine supports packaged custom `@font-face`.

# RML Design Editor v9 — typography policy

## Supported font families

The editor and every exported project use only these three bundled families:

- **Onest** — default UI family; Onest Regular (weight 400) is the default.
- **Tektur** — display typography and game-style headings.
- **JetBrains Mono** — code, diagnostics and technical values.

The editor packages static normal-style weights 400, 500, 600, 700 and 800 for each family. The original SIL Open Font License files are shipped with the export.

## Conversion rules

- `font-family: Onest` resolves to Onest. A browser stack with no approved family (e.g. Arial/Helvetica/sans-serif) resolves to Onest.
- `font-family: monospace` resolves to JetBrains Mono.
- Tektur and JetBrains Mono are available only when explicitly chosen in the UI or source CSS.
- Arbitrary source `@font-face` blocks are removed. The canonical registration comes from `vacuus-base.rcss` and references the bundled `Content/DevUI/Fonts/` resources using DevUI-rooted bare paths such as `Fonts/Onest-Regular.ttf`.
- User-imported TTF/OTF/WOFF/WOFF2 assets are not copied into the output font folder; diagnostics explain that they were excluded. The font files bundled with the editor are the sole source of typography binaries in exports.
- Browser preview uses these same three families and weights, rather than the computer's installed default fonts.

## Verification boundary

Automated tests verify the family allow-list, the default Onest face registrations, inline/style-sheet normalization and packaging references. The final font rasterization still needs to be checked in the project's UE5/VaCuus runtime; static tests do not prove that a particular plugin build loads every face correctly.
