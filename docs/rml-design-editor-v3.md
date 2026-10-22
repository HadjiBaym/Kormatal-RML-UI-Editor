# RML Design Editor v3 — viewport workflow

## Purpose

Keep canvas navigation independent from the **Active UI** interaction toggle. The toggle controls whether normal input is sent into the preview UI; it no longer blocks pan and zoom of the artboard itself.

## Controls

- **Wheel / trackpad scroll**: pan the canvas.
- **Ctrl + wheel** on Windows/Linux or **Command + wheel** on macOS: zoom around the pointer. Trackpad pinch gestures are handled through the same wheel path where the browser reports the modifier.
- **Space + left-drag**: pan from inside either preview iframe without activating its controls.
- **Middle mouse button + drag**: pan from inside either preview iframe.
- **Hand tool (H)**: drag to pan. Normal preview clicks are paused while this tool is active; `V` restores Select.
- **Bottom zoom slider**: set 10–300%. Button/slider zoom stays anchored around the visible viewport center so the board does not drift toward the top-left.
- **Zoom buttons and presets**: remain available while Active UI is enabled.
- **Fit All / 100%**: existing fit and actual-size controls remain in the dock.

The bridge is injected into the sandboxed browser and RmlUi-emulation iframe heads, before source scripts register event handlers. It only sends `CANVAS_NAV_*` messages for explicit navigation gestures. The host validates the message type and that its source is one of the preview iframe windows before applying changes to the canvas transform.

Normal clicks, text inputs, select controls and button interactions are left alone. Ctrl/Command+wheel is reserved for canvas zoom. Ordinary scrolling within a real, scrollable element inside the preview remains an inner scroll; otherwise the wheel pans the canvas.

## Implementation

- `src/core/canvas-navigation.ts`: pure cursor-anchored zoom and pan geometry helpers.
- `src/components/PreviewPanel.tsx`: iframe navigation bridge, host message routing, pan/zoom controls, and shared references so rapid wheel events use the latest transform.
- `src/core/tests/canvas-navigation.test.ts`: tests for cursor anchoring, min/max zoom clamps, wheel-pan direction, and iframe-to-host drag scaling.

## Validation

- 73 core/regression tests passed through Node 22's built-in test runner with TypeScript type stripping.
- TypeScript/TSX syntax transpilation passed for the changed component and navigation helper/test.
- The extracted inline iframe navigation script passed `node --check`.
- Full TypeScript checking and Vite build were not completed because the working copy lacks installed Vite/type packages (`vite/client` declarations are missing and `vite` executable is unavailable).
- Browser interaction and native UE5/VaCuus rendering have not been executed in this environment. Validate the pan/zoom gestures in the browser, then compare the RML emulation with the target VaCuus build.
