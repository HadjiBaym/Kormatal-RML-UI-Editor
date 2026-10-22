# Visual viewport editor

The Active UI viewport includes a Figma-style **Design Edit** mode. It edits the project source instead of keeping changes only in the preview.

## How to use it

1. Open **Active UI** in the preview panel.
2. Press **Design Edit**. The preview switches to the original browser artboard so the element geometry follows the source HTML/CSS.
3. Click an element. A cyan outline and resize handle appear, and the Design Properties inspector shows its selector, current dimensions, font size, opacity and color properties.
4. Drag the element to move it. Drag the cyan bottom-right handle to resize it.
5. Edit Width, Height or Font size in the inspector. Change Fill/background, Text color or Border color with the color inputs. Numeric values commit when the field loses focus; color changes commit when the picker closes.
6. Every committed edit is written to a dedicated `visual-editor-overrides.css` file next to the entry HTML file. The file is linked from the HTML and appended last in the source project order. The conversion pipeline then regenerates the target RML/RCSS from the updated project.
7. Use **Undo** and **Redo** in the inspector to navigate the visual-edit history. New edits clear the redo stack; history is capped at 80 snapshots. The **Snap 8px / Snap off** toggle controls pointer movement and resize snapping. The Layers tree is populated from the current preview DOM and lets you select an element without clicking it on the artboard. A static RmlUi validation section flags suspicious sizes/layout values; it is advisory, not proof of native UE rendering. Editing code manually, switching/resetting/importing projects or applying conversion fixes clears the visual-edit-only undo history.
8. Turn off Design Edit, then switch to **Dual Artboards** to compare the browser source against the VaCuus emulation and inspect the generated `.rcss` output.

## Viewport navigation (including Active UI)

The artboard can now be navigated without turning off **Active UI**. The interaction toggle controls whether the preview receives normal clicks; it no longer disables canvas pan/zoom.

- **Mouse wheel / trackpad** pans the canvas. Hold **Ctrl** (Windows/Linux) or **Command** (macOS) while scrolling to zoom around the pointer. Trackpad pinch normally arrives as Ctrl/Command+wheel and uses the same path.
- **Space + left-drag** pans the canvas while preserving the Select tool after Space is released. This works when the pointer is over either preview iframe as well as the surrounding canvas.
- **Middle mouse button + drag** pans without switching tools. The gesture is forwarded from sandboxed preview frames to the host editor.
- **Hand tool (H)** temporarily disables ordinary preview interaction and lets a left-drag pan. **V** returns to Select.
- The bottom dock includes a **10–300% zoom slider**, zoom presets, **Fit All**, and **100%**. These controls remain usable while Active UI is on.
- Scrolling inside a genuinely scrollable element inside the preview remains a normal scroll; elsewhere it pans the board.

The frame bridge sends only navigation events through `postMessage`. Regular clicks, input and button interactions continue to work unless the Hand tool is selected or Active UI is explicitly turned off. Cursor-anchored zoom and pointer-delta mapping are covered by tests in `src/core/tests/canvas-navigation.test.ts`.

## Implementation notes

- The selection/drag script runs inside the sandboxed source preview iframe and reports changes through `postMessage`; the parent does not attempt to access the opaque-origin iframe DOM directly.
- CSS updates use PostCSS AST rather than string replacements. Existing author styles remain untouched; the editor creates or updates an override rule.
- Only an allowlist of visual CSS properties is accepted from viewport messages. Values containing declaration breaks, JavaScript URLs or expression-like constructs are rejected. The Fill color control writes a simple hex fill so it intentionally replaces an existing background gradient/image on that selected element.
- The editor supports direct move, resize, width/height/font-size, fill, text color, border color and opacity. Undo/Redo is maintained in memory for visual edits only; manual code edits clear this history. The Layers tree is limited to 500 DOM nodes and structural selectors can change when the HTML hierarchy changes. Snapping rounds drag deltas to 8 px when enabled; guides show the selected element’s center during its drag. It is not a full Figma replacement: it does not yet edit text content, vector paths, constraints/auto-layout, responsive variants, gradients, component variants or arbitrary transforms.
- Moving a static-flow element writes `position: relative` plus `left`/`top`; moving a positioned element updates the offsets. Check the generated RCSS and target VaCuus viewport after edits because CSS layout rules and runtime support still differ from Chromium.
- Visual edits always go through the project converter. The browser preview updating correctly is not by itself proof of exact VaCuus rendering; compare with the emulated artboard and check the diagnostics panel.

## Tests

`npm test` includes tests for rule updates, property allowlisting, nested HTML paths, override-file reuse, end-to-end visual edit flow, and cursor-anchored zoom/pan calculations.

## VaCuus RmlUi visual editing

The toolbar also provides **RML Design**. This switches to the VaCuus/RmlUi emulation artboard and enables element selection, drag-to-move, and bottom-right resize directly on that artboard. The inspector exposes dimensions, font size, fill, text color, border color, and opacity. Changes are applied to the source project through `visual-editor-overrides.css`, then the converter regenerates RML/RCSS; the editor does not mutate generated RCSS as a one-off preview-only patch.

Important: the target artboard is a browser-based RmlUi compatibility emulation, not the native Unreal runtime. A selector must map back to the source HTML to persist correctly. For elements without stable IDs/classes, the editor derives a structural selector; verify that selector in the generated RCSS and test the final result in UE5/VaCuus. Unsupported RCSS properties cannot be made supported merely by editing them visually.


## Current validation limits

`validateVisualDeclarationsForRmlUi` is a conservative static check for unsupported properties/layout modes, negative dimensions and percentage lengths. The inspector evaluates the selected element's measured values. The complete compatibility report remains the primary diagnostic source. Native VaCuus/RmlUi behavior depends on the engine/plugin version, loaded fonts, decorators, and runtime configuration; always validate the exported RML/RCSS in Unreal Engine.
