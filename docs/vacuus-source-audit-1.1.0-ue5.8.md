# VaCuus source audit — 1.1.0 / Unreal Engine 5.8

**Purpose:** version-pinned implementation reference for the Kormatal VaCuus UI Converter. This is derived from the user-supplied `VaCuus-1.1.0-UE5.8.zip`, with a separate comparison against the user-supplied `VaCuus-master.zip`. It is a static source/documentation audit, not a claim that the plug-in was built or rendered in Unreal in this environment.

## 1. Pinned source of truth

| Field | Verified value |
|---|---|
| Release archive | `VaCuus-1.1.0-UE5.8.zip` |
| `VaCuus.uplugin` | `VersionName: 1.1.0`, `EngineVersion: 5.8.0`, `Installed: true` |
| Vendored RmlUi upstream commit | `0ae381e00d7426762bb5ed897973366358b16642` |
| Release `VENDORED_SHA.txt` | `0ae381e00d7426762bb5ed897973366358b16642` |
| Official RCSS matrix | `docs/buyer/rcss-matrix.md` |
| Official matrix SHA-256 | `3ffc91eb288fa93d5c5868f88ec85348ea7e7126876bfdcc2deeac3db1adad34` |
| Matrix counts | 99 properties, 20 shorthand rules, 16 decorators, 10 filter types, 4 font effects |
| Machine-readable converter copy | `src/core/vacuus-1.1.0-ue5.8-profile.ts` |

The versioned profile is the authority for target-engine support in this project. `src/core/rcss-matrix.ts` is deliberately retained as a broader **source CSS import/conversion** catalog; its 103 rows are not the target property's native matrix. Do not merge both row counts or let import policy override the exact target profile.

## 2. Release ZIP versus `master`

Both uploaded `VaCuus.uplugin` files say `VersionName: 1.1.0`. That string alone does **not** prove source equivalence.

- The release ZIP pins `EngineVersion: 5.8.0` and `Installed: true`; the master archive omits that `EngineVersion` pin and sets `Installed: false`.
- Release `Source/ThirdParty/RmlUi/VENDORED_TAG.txt` documents patches #1–#13. `master` contains patches #14/#15 and a #15 follow-up. These concern font-size fractional values and subpixel text layout in the vendored engine.
- `diff -qr Source` shows non-trivial differences in vendored RmlUi's `FontEngineInterface`, `FontGlyph`, `ElementStyle`, `ElementText`, `WidgetTextInput`, font-engine/default FreeType paths, texture layout, and in VaCuus font registry, bundle, UI queue/subsystem, JS DOM and render tests. `master` also contains extra RmlUi backend reference material and new font-size/subpixel tests.

**Rule:** use the UE5.8 release profile for generated content targeting the supplied release ZIP. Use `master` only to track possible future changes and label them as unverified against the installed release.

The release ZIP omits the root `LICENSE.md`, `COMMERCIAL.md` and `CLA.md` files referenced by the repository, while the supplied `master` archive contains them. The release README identifies a Business Source License 1.1 and points to commercial terms; this audit does not replace review of the complete license terms before commercial distribution.

## 3. Runtime architecture and integration

Source references in the release archive:

- `README.md` and `docs/buyer/ai-guide.md`: RML/RCSS are plain-text UI assets; VaCuus has a dedicated UI thread for RmlUi layout/style and draw-command recording. The game thread queues input/commands and reads published interactive snapshots; rendering replays commands into a persistent render target composited by Slate.
- `Source/VaCuus/`, `Source/VaCuusRender/`, `Source/VaCuusRml/`, `Source/VaCuusJs/`: subsystem/view, render path, RmlUi integration and QuickJS-backed JS facade.
- `docs/buyer/setup.md`: `UVaCuusWidget` is screen-space; `UVaCuusWorldComponent` is a world panel. The game accesses the view through `UVaCuusView`; UI calls must obey the documented game-thread API and queueing model.
- `docs/buyer/setup.md`: bind the data model before `LoadDocument`; a UI write to a bound model property is delivered as a request to the game thread, not an automatic arbitrary game-side mutation. Reset request-style properties after handling where required to avoid suppressing equal echoes.

This is not a browser host. Do not depend on browser navigation, the Fetch API, a general DOM library or arbitrary Web APIs. Navigation is host-controlled through `LoadDocument`; network work belongs in the Unreal host layer. JavaScript methods and browser-preview shims are not proof of native runtime support.

## 4. RCSS features and sharp edges

### Layout and defaults

- `display` includes `none`, `block`, `inline`, `inline-block`, `flow-root`, `flex`, `inline-flex`, `table`, `inline-table`, `table-row`, `table-row-group`, `table-column`, `table-column-group`, and `table-cell` in the release matrix. This is evidence for CSS `display` values; it does not automatically establish that every semantic HTML table tag is supported.
- CSS Grid is absent. Convert Grid layouts to flexbox or deterministic geometry and warn about lost Grid semantics.
- There is no parser for CSS `calc()` in the vendored RmlUi core. Do not output `calc()` expecting browser behavior.
- There is no user-agent stylesheet. Include `vacuus-base.rcss` first or elements have different default display/margin behavior than in browsers.
- `px` is physical pixels; `dp` scales with the view's density scale in screen-space when configured. World panels can have `dp == px`. Preserve source `px` by default for fidelity unless the target widget's DPI policy has been measured.
- `opacity` is a plain inherited render property, not a browser compositing group; a child setting it can overwrite rather than compound with the inherited value.
- `border-radius` parser accepts lengths, not percentages.

### Effects and transitions

- `box-shadow`: release refuses the off-screen `SaveLayerAsTexture` capture and emits a warning once per view. The shadow is dropped; normal background and border remain. Patch #3 is what avoids the earlier opaque-white failure. Prefer a pre-rendered/nine-patch shadow asset or another validated decorator.
- `mask-image`: release refuses the mask capture and emits a warning once per view. The element is rendered unmasked; the mask art is discarded. Bake alpha into the asset or use supported clipping when visually equivalent.
- `backdrop-filter: blur(...)`: this is the shipped VaCuus scene-glass path; it is distilled at recording and recomposited/re-blurred per engine frame. The official release matrix does **not** require `decorator: shader(glass-panel)` in the same selector. Non-blur backdrop filters are refused.
- `filter: blur(...)` on an individual element is not the same shipped feature; the matrix describes blur as compiled but the verified v1 consumer is `backdrop-filter`. Other filter types are refused.
- Transition timing uses RmlUi tween tokens, not browser `ease` names. `cubic-in-out` is the equivalent mapping for CSS `ease-in-out`; normalize known browser names intentionally, not by arbitrary lowercasing. Unsupported transition tokens can invalidate a declaration. This vendored build includes a `var()` transition patch.
- Custom properties / `var(--x, fallback)` are supported in the pinned build; an undefined variable without a fallback can produce a runtime error.
- At-rules listed by the release matrix: `@keyframes`, `@decorator`, `@spritesheet`, `@media`, `@font-face`. `@media` grammar remains more restricted than browser CSS.
- Sixteen decorator types are listed in the matrix: text, tiled-horizontal, tiled-vertical, tiled-box, image, ninepatch, shader, gradient, horizontal-gradient, vertical-gradient, linear-gradient, repeating-linear-gradient, radial-gradient, repeating-radial-gradient, conic-gradient and repeating-conic-gradient.
- Four font effects are documented: blur, glow, outline, shadow. Glyph generation for glow/outline can produce a measurable UI-thread first-record spike (~4.2 ms on the reference HUD), so test first-show cost.

## 5. Fonts and resource paths

- VaCuus supports custom packaged `@font-face`. `font-family` and `src` are required.
- The public `UVaCuusSubsystem::LoadFontFace(VfsPath, bFallbackFace)` API is also available as a `BlueprintCallable` runtime route; it queues registration to the UI thread, supports fallback-face registration, and replays registered faces after a UI-thread restart. The release `docs/buyer/rcss-matrix.md` §`@font-face` contains the stale sentence “There is NO public C++ font-loading API”; the public subsystem header and `gotchas.md` §5 contradict it. For the actual shipped API, prefer the public header and gotchas entry. The Knowledge Engine now records this contradiction explicitly.
- `@font-face src` is a **bare DevUI/VFS-root-relative path** such as `MyHud/fonts/GameSans-Regular.ttf`; do not wrap it in `url(...)` or add a leading slash. The `src` path is passed as-is by the parser and resolved through ordered DevUI roots.
- This differs from `<link href>` and `<script src>`, whose paths are document-relative. Avoid flattening the two path rules into one generic URL rewrite.
- Static font files per weight are safer than variable fonts: the default font engine does not set variation axes, so a variable face can render the same default instance for multiple requested weights.
- RmlUi/VaCuus's fallback font is LatoLatin and is Latin-oriented; do not assume Cyrillic/CJK coverage. Package and register a family with the needed glyphs and verify on target.
- VFS search order is plugin `Content/DevUI` first, project `Content/DevUI` second. A project file does not shadow a same-named plugin file. Give project assets unique names and include them in the project DevUI tree or a verified `UVaCuusBundle`.

## 6. RML and JavaScript rules

- RML is XML-oriented, not permissive HTML. Close elements; escape text/attributes; include `vacuus-base.rcss` before screen styles.
- JS uses QuickJS-ng with VaCuus's own DOM facade, not a full browser DOM. `fetch`, standard anchor navigation and general browser APIs should not be assumed. Use Unreal/host-level networking and host-driven navigation.
- UI input and mutating calls must follow VaCuus's thread/API rules. Avoid calling UI mutations from arbitrary worker threads. The UI thread is not an invitation to call Unreal APIs directly from JavaScript.
- The release tests and docs describe specific DOM methods and the `vacuus` object; do not invent unsupported browser methods or assume `classList` and reflected attributes behave exactly like Chromium.

## 7. Converter corrections made in v33

1. Added `src/core/vacuus-1.1.0-ue5.8-profile.ts`, copied from the exact release's official matrix with provenance checksum and separate lists for properties, shorthand, decorators, filters, font effects, at-rules and selected implementation facts.
2. Made AI Knowledge Engine target cards and native RCSS diagnostics consume this profile; the previous 103-entry importer catalog remains available only to describe conversion policy. Target-critical cards are budgeted before generic docs to prevent relevant rules being omitted from a small model's prompt.
3. Corrected `display` values to include official table-layout keywords while continuing to reject Grid.
4. Corrected diagnostics and rules for box-shadow/mask-image (warning + effect dropped, not unqualified “parses and silently does nothing”), filter versus backdrop-filter, and the native blur path.
5. Removed an undocumented same-selector shader requirement for `backdrop-filter: blur(...)`; unsupported non-blur backdrop filters remain diagnosed.
6. Preserved imported custom `@font-face` declarations and packages local font files under `Fonts/`; the three-family dropdown remains an editor authoring choice, not a claim about engine capability.
7. Updated current compatibility/research/conversion docs; historical v9/v10/v11 and prior converter-audit docs are clearly marked as historical rather than target truth.

## 8. License and package caveat

The supplied README says VaCuus itself is under Business Source License 1.1 and states that commercial production use requires a purchased license. The release ZIP did not include the referenced top-level `LICENSE.md`, `COMMERCIAL.md` or `CLA.md` files, so the complete terms and applicable change date were **not verified from this archive alone**. Third-party license notices and vendored RmlUi/QuickJS licenses are present. Check the marketplace/author license terms before shipping in a commercial Lamguard product; this is a compliance checkpoint, not legal advice.

## 9. Verification boundary

This profile was cross-checked against the user-supplied release's official matrix, its `VENDORED_TAG.txt`, `VENDORED_SHA.txt`, README, AI guide, setup guide, gotchas and source file paths. Converter tests verify mappings and diagnostics. No Unreal Editor build, Play-In-Editor render, cooked build, or actual `LogVaCuus` runtime test ran inside this environment. Target-render behaviour still requires a runtime smoke test on UE 5.8 with the exact plugin archive.
