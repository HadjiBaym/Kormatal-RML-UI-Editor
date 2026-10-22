# VaCuus source audit — UE 5.8 release vs master

Date: 2026-10-18. Basis: user-provided `VaCuus-1.1.0-UE5.8.zip` and `VaCuus-master.zip`. This is a static source/documentation audit; the plugin was not built or rendered in Unreal in this environment.

## Version and provenance

| Field | UE5.8 release archive | `master` archive |
|---|---|---|
| ZIP SHA-256 | `5a701ec7df0ec8a723885185322258f8c4e63364feb4e6fdfca02890c3444bff` | `e06f31605c8f912628733dd62694318a46d10c490ab318606acc7a7b79f7f44a` |
| `VersionName` | `1.1.0` | `1.1.0` |
| `EngineVersion` | `5.8.0` | Not specified |
| `Installed` | `true` | `false` |
| Vendored RmlUi upstream commit | `0ae381e00d7426762bb5ed897973366358b16642` | Same upstream commit |
| Official RCSS matrix SHA | `3ffc91eb288fa93d5c5868f88ec85348ea7e7126876bfdcc2deeac3db1adad34` | Same matrix file/SHA |

There are **33 path-level differences** under `Source` according to `diff -qr`. Release RmlUi `VENDORED_TAG.txt` documents patch entries through #13; `master` has later patch #14/#15 and a #15 follow-up, including changes to fractional font-size and subpixel text layout. Other changed paths include font engine/glyph/texture layout, RmlUi text/style/input widgets, VaCuus font registry, bundle code, UI queues/subsystem, JS DOM facade and tests. Thus same version label and upstream SHA do not establish binary/source equivalence.

**Target rule:** use the UE5.8 release archive as the target profile for projects using that release. Use `master` only as a separate future profile unless its exact code is confirmed in the installed plugin.

## Official target RCSS matrix

The supplied release's `docs/buyer/rcss-matrix.md` reports 99 properties, 20 shorthand rules, 16 decorators, 10 filter types, 4 font effects. The converter's 103-row CSS catalog is a different collection because it includes source CSS import/transform/diagnostic rules.

- `display` includes table-layout values (`table`, `inline-table`, `table-row`, `table-row-group`, `table-column`, `table-column-group`, `table-cell`); CSS Grid is not supported. Do not infer complete semantic HTML `<table>` coverage from display keywords alone.
- `calc()` is not parsed by the pinned vendored RmlUi.
- `box-shadow` layer capture is refused with a warning; the element keeps ordinary background/border and the shadow is dropped. `mask-image` is refused; the element remains unmasked and mask artwork is discarded.
- `backdrop-filter: blur(...)` is the shipped scene-glass path, distilled during recording and recomposited/re-blurred in engine-frame composition. Non-blur backdrop filters are refused. The release matrix does not require `decorator: shader(glass-panel)` in the same selector. Do not confuse this with per-element `filter: blur(...)`, which is not the verified shipped v1 surface.
- Transition timing values are RmlUi tween tokens, not normal browser `ease` names. The docs recommend `cubic-in-out` for `ease-in-out`.
- Custom properties and `var()` fallback/cycle handling are supported; undefined variables without fallback can error. No user-agent stylesheet is supplied; include `vacuus-base.rcss` first.
- `opacity` is inherited rather than a browser compositing group; percentage `border-radius` isn't supported by the registered length grammar.

## Font API contradiction

The release's public `Source/VaCuus/Public/VaCuusSubsystem.h` declares `UFUNCTION(BlueprintCallable) bool LoadFontFace(const FString& VfsPath, bool bFallbackFace = false);`. `VaCuusFontRegistry.cpp` validates/enqueues registration via the dedicated UI thread; the public header documents fallback-face registration and replay after UI-thread restart.

However, the release's `docs/buyer/rcss-matrix.md` paragraph under `@font-face` still says “There is NO public C++ font-loading API”. The same release's `docs/buyer/gotchas.md` §5 says the earlier edition was wrong and documents both the RCSS authoring route and `UVaCuusSubsystem::LoadFontFace`. For real API behavior, use the public header and gotchas guide over that stale sentence in the matrix.

`@font-face src` is bare DevUI/VFS-root-relative (no `url()`, no leading slash), unlike document-relative `<link href>` and `<script src>`. VaCuus's bundled fallback is Latin-oriented; Russian/CJK need a packaged/registered face with glyph coverage. Static font weights are safer than variable fonts in the shipped font engine.

## Resources and runtime

Mounted bundles are checked first for matching paths, then loose DevUI roots in order: VaCuus plugin, other enabled plugins sorted by plugin name, and project `Content/DevUI`. Therefore project files cannot shadow same-named plugin-root resources, and a mounted bundle may outrank disk files.

The JS environment is QuickJS-ng plus the custom facade in `Source/VaCuusJs/Private/VaCuusJsDom.cpp`; it is not Chromium. A limited DOM surface exists (`querySelector`, `querySelectorAll`, `closest`, element attributes, `innerRML`, child/sibling/text access, classList/style/event methods, `createElement`, `createTextNode`, etc.) but arbitrary browser APIs, Fetch, and standard anchor navigation should not be assumed. Navigation/network belong in the UE host/bridge. The facade also has documented differences, such as `document.body` mapping to the RmlUi document/root and `classList` not being equivalent to every reflected class-attribute behavior.

Bind data models before `LoadDocument`; view operations follow the dedicated UI-thread queueing contract. UI writes into bound fields are game-thread requests to be handled, not arbitrary mutation of Unreal state from JS.

## License caveat

The release README states the plugin's own source is Business Source License 1.1 and that commercial production use requires a purchased license; RmlUi and QuickJS-ng have separate third-party notices. The supplied release ZIP omits its referenced root `LICENSE.md`, `COMMERCIAL.md` and `CLA.md`, while the master archive includes them. Verify the full terms applicable to the actual acquired package before commercial distribution. This is a compliance checkpoint, not legal advice.

## Converter changes informed by this audit

The v33 converter now has a checksum-pinned native target profile separate from its source-CSS transformation catalog, delivers target facts to all relevant AI tasks, corrects table display/filter/shadow/mask guidance, retains and packages custom `@font-face`, records the public runtime font API with its own provenance, and excludes older editor snapshots from live knowledge retrieval.

## Validation boundary

Converter tests passed 249/249; RCSS conversion catalog synchronization passed (103 entries); 79 TypeScript files passed syntax transpilation. The converter's Vite build, Unreal compilation, PIE/cooked rendering, native screenshot comparison, live Qwen inference and license validation were not performed in this environment.
