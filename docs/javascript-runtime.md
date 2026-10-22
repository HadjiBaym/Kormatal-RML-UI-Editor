# JavaScript Runtime & Unreal Engine 5 Bridge Guide

This document defines the verified behavior of JavaScript execution in the VaCuus / RmlUi embedded environment.

---

## 1. Execution Environment & Threading Rules

1. **Dedicated UI Thread**:
   VaCuus executes user interface layout, rendering command preparation, and script evaluation on a dedicated thread separate from the Unreal Engine Game Thread.
2. **Game Thread Interfacing Law**:
   Direct manipulation of Unreal Engine actors, components, or game state MUST be dispatched from the game thread through `UVaCuusView`.
3. **Script Inclusion**:
   Scripts are linked via `<script src="screen.js"></script>` in the RML `<head>`.

---

## 2. Supported DOM & Element Manipulation APIs

RmlUi provides a lightweight DOM abstraction designed for game HUDs:

| API | Status | Notes |
| :--- | :--- | :--- |
| `document.getElementById(id)` | Supported (Primary) | Fastest lookup method. Elements should use distinct IDs. |
| `document.querySelector(selector)` | Supported with RmlUi semantics | An element's own query searches descendants and never matches itself; `closest()` likewise starts at the parent. |
| `document.querySelectorAll(selector)`| Supported with RmlUi semantics | Returns a snapshot array. Verify complex selectors against the target selector grammar. |
| `element.addEventListener(type, fn)` | Supported | Mouse, keyboard, and custom RML events. |
| `element.removeEventListener(type, fn)`| Supported | Event detachment. |
| `element.innerRML` | Supported, but parses markup when written | Use only when the assigned value is intended to be RML. Dynamic braces such as `{{...}}` are parsed as data expressions; do not use this as a text setter for untrusted strings. |
| `document.createTextNode()`, text-node `nodeValue` / `data` | Supported | Use a text node when literal text is required. Plain `element.textContent = value` assignments may be auto-adapted to clear `innerRML` and append a literal text node; text-node writes use `nodeValue`, and Document writes are no-ops. The adapter is limited to VaCuus node types 1/3/9 and is emitted only when the native `document` binding is not shadowed. Reads, compound assignments, `innerText`, and other node types still need manual review. |
| `element.style.setProperty(name, val)` | Supported | Dynamic style updates, including `--custom-properties`. |
| `element.classList.add/remove/toggle` | Supported | Class toggling. |
| `element.setAttribute()`, `getAttribute()` | Supported | Attribute access. |
| `setInterval()`, `setTimeout()` | Supported | Timer-based updates. |
| `console.log()`, `console.warn()` | Supported | Logs routed to engine log (`LogVaCuus`). |

---

## 3. Forbidden Browser APIs

The following APIs are NOT available in headless embedded game runtimes and will cause execution failures if not guarded or adapted:

- `window.alert()`, `window.confirm()`, `window.prompt()`: Modal dialogs halt execution.
- `localStorage`, `sessionStorage`, `document.cookie`: No browser storage subsystem.
- `fetch()`, `XMLHttpRequest`, `WebSocket`: No browser networking stack. (Must use `FHttpModule` in C++).
- `window.location.href`, `window.location.reload()`: No browser URL bar navigation.
- `MutationObserver`, `ResizeObserver`, `IntersectionObserver`: Observer APIs absent.
- Full virtual-DOM frameworks (`ReactDOM`, `Vue` reactivity proxy loops): Heavy runtime overhead, virtual DOM incompatibilities.

---


## 3a. JavaScript source analysis and auto-fixes

The converter parses standard JavaScript with Acorn before issuing API diagnostics or rewriting member expressions. Comments and string literals are not scanned as executable code. The `innerHTML` conversion targets AST `MemberExpression` nodes only and applies source-range edits from right to left, preserving unrelated source text. This maps markup access to VaCuus `innerRML`; it is not equivalent to setting browser text content.

### Module and JSX input

If parsing fails, the converter emits a `manual-fix` diagnostic and does not apply AST-based edits to that file. This includes untranspiled TypeScript and most JSX. A single local JavaScript module entrypoint referenced by the HTML can be bundled through the local converter service into an esbuild IIFE (`target: es2020`), using only imported project files; package imports, remote modules, multiple active script entrypoints, and unsupported resource types are refused rather than silently omitted. The generated bundle is still scanned for VaCuus runtime API issues. For TSX/Preact projects, use the official VaCuus [AI guide](https://vacuus.ufna.dev/docs/ai-guide) and Web workflow (`@vacuus/preact` and `vacuus build`), which provides the supported Preact adapter and provenance metadata. Static analysis cannot prove that an API is supplied by the runtime, and the final result still needs validation against the exact VaCuus build.

The growing-list and fixed-pool messages are heuristics across the parsed file, not formal proofs of an unbounded allocation. Review their context before changing code automatically.

## 4. Unreal Engine 5 Communication Pattern

When enabled, the converter emits a small adapter over VaCuus 1.1.0's native `vacuus` API:

```javascript
const VaCuusBridge = {
  sendToUE: function(eventName, payload) {
    return vacuus.emit(eventName, payload);
  },
  get: function(id) {
    return document === null ? null : document.getElementById(id);
  },
  getModel: function(name, path) {
    return vacuus.model(name).get(path);
  }
};
```

`vacuus` is installed by the plugin; the converter must not replace it with browser-shaped globals or fake `window.ue` dispatch. `sendToUE` queues a native event and returns whether it was accepted; bind `UVaCuusView::OnJsEvent` on the Unreal side to consume it. Payload values crossing the bridge are flat booleans, numbers, and strings. The plugin does not provide `window`, `localStorage`, `fetch`, a browser `textContent`/`innerText` property, or browser layout-dependent text behavior. Only simple textContent assignments can be rewritten through the literal-text adapter; unsupported APIs remain visible and block a clean-readiness result rather than being replaced by behavior-changing stubs.
