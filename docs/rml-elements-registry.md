# RML Elements Registry & HTML Mapping Guide

RmlUi is an XML-based user interface markup language. Unlike HTML5, it requires strict XML syntax (self-closing void tags) and has specific built-in element types and data-binding attributes.

---

## 1. Supported Document & Container Elements

| Element | Support Status | RmlUi Notes | Recommended Conversion |
| :--- | :--- | :--- | :--- |
| `<rml>` | Native Root | The root element of all RmlUi documents. Replaces `<html>`. | `<html>` → `<rml>` |
| `<head>` | Native Header | Contains `<title>`, `<link>`, `<script>`, `<style>`. | Preserved. |
| `<body>` | Native Body | Primary viewport container. Requires `vacuus-base.rcss` reset. | Preserved. |
| `<div>` | Native Block | Primary container for layout (block, flex, inline-block). | Preserved. |
| `<p>` | Native Block | Paragraph block. Margin resets provided by `vacuus-base.rcss`. | Preserved. |
| `<span>` | Native Inline | Inline text container. | Preserved. |
| `<h1>`-`<h6>` | Native Block | Heading elements with hierarchical font sizes. | Preserved. |
| `<button>` | Native Control | Clickable button element with `:hover`, `:active` pseudo-classes. | Preserved. |
| `<input>` | Native Control | Form input. Supported types: `text`, `password`, `radio`, `checkbox`, `range`, `submit`. MUST be self-closing `<input ... />`. | Preserved, self-closing enforced. |
| `<img>` | Native Image | Image sprite renderer. Requires `src` attribute. MUST be self-closing `<img ... />`. | Self-closing enforced. |
| `<progress>` | Native Progress | Value/max progress bar with `:indeterminate` state. | Preserved. |
| `<ul>`, `<ol>`, `<li>` | Native List | List structures with list-item display. | Preserved. |
| `<label>` | Native Inline | Input labeling. | Preserved. |
| `<textarea>` | Native Control | Multi-line text entry. | Preserved. |
| `<select>`, `<option>` | Native Control | Dropdown selection list. | Preserved. |

---

## 2. Semantic HTML Elements & Automatic Mappings

Semantic HTML5 container elements (`<section>`, `<article>`, `<header>`, `<footer>`, `<main>`, `<nav>`, `<aside>`) are not distinct built-in types in RmlUi, but can be rendered as block elements when reset via `vacuus-base.rcss`:

```css
div, section, article, nav, header, footer, main, aside {
  display: block;
}
```

The converter preserves these tags or maps them to `<div class="tag-name">` while retaining accessibility roles and class hooks.

---

## 3. Unsupported HTML Elements & Alternatives

| Unsupported HTML Element | Cause of Failure in RmlUi | Unreal Engine 5 Alternative |
| :--- | :--- | :--- |
| `<video>` | No video decoding pipeline in RmlUi. | Unreal Engine Media Player / `UMediaTexture` mapped to a 3D quad or UMG background. |
| `<audio>` | No audio playback in RmlUi DOM. | Unreal Engine Audio Engine / MetaSounds triggered via game thread events. |
| `<canvas>` | No HTML5 2D / WebGL canvas rendering context. | `UTextureRenderTarget2D` or custom Slate rendering widget. |
| `<iframe>` | No nested browser engine / windowing. | Decompose into separate RML documents or RmlUi `<template>` includes. |
| `<svg>` (Inline) | Arbitrary vector paths not natively rasterized by RmlUi core. | Rasterize SVG to PNG asset or place in `Assets/Icons/` and reference via `decorator: image()`. |
| `<table>`, `<tr>`, `<td>` | No CSS table layout engine in RmlUi. | Convert to Flexbox containers (`display: flex; flex-direction: column;`). |

---

## 4. RML Data Binding Syntax

RmlUi supports reactive data binding when backed by an Unreal Engine data model bound *before* `LoadDocument`:

- `data-model="ModelName"`: declares the data model context on a root or container element.
- `data-if="condition"`: conditional visibility/rendering.
- `data-for="item, idx : Items"`: array iteration (**Crucial rule:** iterator alias must NOT be `t` or match top-level field names).
- `data-value="property"`: two-way or one-way value binding for inputs and text.
- `data-class-active="isActive"`: conditional CSS class toggling.
- `data-event-click="OnAction()"`: event dispatching to host model.
