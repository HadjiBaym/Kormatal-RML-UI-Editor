> Historical implementation note: statements below about only three permitted/bundled font families describe that editor revision, not VaCuus 1.1.0 engine capability. Current target truth is documented in `vacuus-source-audit-1.1.0-ue5.8.md`; the engine supports packaged custom `@font-face`.

# VaCuus UI Converter — RML Design Editor v10

## Updates

- Native `.rml` and `.rcss` files can be imported individually, together, or from a supported project folder/ZIP.
- Importing an RML screen selects **VaCuus emulation** by default. The preview follows the selected RML screen and resolves linked RCSS/JS companions when available.
- In native RML mode, ZIP export preserves the original relative paths and source contents instead of converting an RML document as if it were browser HTML. The normal UE5 C++ integration files and the three approved font families remain available.
- Canvas background selection is click-controlled and does not depend on hover. The compatibility diagnostics sidebar starts collapsed.
- Resolution select/dropdown uses an explicit dark color scheme.
- The browser-based VaCuus preview maps RmlUi `dp` declaration values and media-query dimensions to same-scale CSS `px` for a visual preview. This is a preview approximation, not a replacement for checking Slate/UMG DPI behavior in UE5.
- **Open Folder** uses the File System Access API to discover relevant UI sources and assets. Edits in the app are written back to disk; changes/new files detected on disk are polled every 1.2 seconds and synchronized into the workspace.

## Folder mode constraints

Folder access requires a browser that supports the File System Access API (usually desktop Chrome/Edge) and a secure origin such as `localhost` or HTTPS. The browser will ask for read/write permission. The editor avoids known dependency/build directories such as `.git`, `node_modules`, `dist`, and `build`.

## Validation performed

- Direct Node test runner: **114 tests passed, 0 failed** (`node --experimental-strip-types --test src/core/tests/*.test.ts`).
- TypeScript/TSX syntax transpilation: **47 files checked, 0 syntax errors**.
- RCSS catalog check: `scripts/sync-rcss-matrix.mts --check` passed; all **103 catalog properties** are synchronized with the compatibility documentation.
- Preview tests cover RmlUi `dp` to same-scale CSS `px` mapping for declarations and media-query dimensions, while preserving normal `px` values and comments.
- Vite was not run. A full application type-check/build and native UE5/VaCuus visual validation are not claimed as completed in this environment.


Native RCSS font-family values and `@font-face` rules are normalized during browser emulation and ZIP export. Only Onest, Tektur and JetBrains Mono are retained; face paths are rewritten to bundled `Fonts/...` resources and unknown families fall back to Onest (or JetBrains Mono for monospace stacks).
