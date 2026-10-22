# RML Design Editor v4 — simplified output workspace

## UI changes

- Removed the generated-file tabs from the top `Target Output` bar: `.rml`, `.rcss`, `.js`, C++ header/source, base RCSS and conversion report are no longer separate workspace tabs.
- Removed the redundant `Target Output File` headers and read-only generated-code panes from the main workspace.
- Kept the source editor and Active UI preview modes. The preview continues to support design editing and canvas navigation.
- Replaced the generated-file tab strip with a compact `Active UI Preview · Generated files: Export ZIP` status indicator.
- Generated assets and file contents remain available in the `Export ZIP` modal, where the export package can be inspected before downloading.

## Validation

- 73 core/regression tests passed using Node 22's built-in test runner with TypeScript type stripping.
- `App.tsx` TypeScript/TSX syntax transpilation was checked separately.
- Full Vite build and browser-level interaction tests could not be run because Vite and the `tsx` package are not installed in this working copy.
- Native Unreal Engine / VaCuus runtime validation was not performed.
