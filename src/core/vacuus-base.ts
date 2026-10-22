import { DEFAULT_UI_FONT_FAMILY, getBundledFontFaceRcss } from './ui-fonts.ts';

/**
 * Official default base stylesheet for VaCuus / RmlUi in Unreal Engine 5.
 * (@vacuus/cli, spec §3.1).
 * 
 * WHY IT EXISTS: RmlUi ships NO user-agent stylesheet. In a browser `div` is
 * display: block because the UA sheet says so; in RmlUi every element defaults
 * to inline, margins are 0, and a web developer's first document collapses into one line.
 * This sheet is the missing UA layer: link it FIRST, put your own sheet after it.
 * 
 * CRITICAL GOTCHAS GOVERNED BY THIS FILE:
 *  - Only the bundled Onest, Tektur and JetBrains Mono families are allowed.
 *    Onest Regular is the default; the font faces below are bundled into export packages.
 *  - The document fills its context: body has width: 100%; height: 100%; position: absolute; top: 0; left: 0;
 *    Without this, absolute children of body resolve percentages against a zero-sized or collapsed box.
 *  - THERE IS NO `ease` FAMILY in RCSS. `transition: opacity 0.3s ease-in-out` drops the whole declaration.
 *    Write `cubic-in-out` lowercase.
 *  - box-shadow is not rendered in v1 (no layer render targets); use ninepatch decorator or border.
 */
export const VACUUS_BASE_RCSS = `/* ==========================================================================
   VaCuus Base Stylesheet (vacuus-base.rcss)
   Essential resets & base styles for RmlUi in Unreal Engine 5
   ========================================================================== */

/* Only supported project typefaces: Onest, Tektur and JetBrains Mono. */
${getBundledFontFaceRcss()}


/* Bundled font assets are packaged by the Export ZIP action and registered here. */
* {
  box-sizing: border-box;
}

/* The block layer of the missing UA sheet — critical: RmlUi defaults elements to inline */
body,
div,
p,
h1,
h2,
h3,
h4,
h5,
h6,
section,
header,
footer,
nav,
main,
aside,
article,
ul,
ol,
li,
form {
  display: block;
}

/* The inline layer */
span,
a,
b,
i,
em,
strong,
label,
code {
  display: inline;
}

/* Mixed text runs are emitted as explicit spans where RmlUi cannot synthesize
   browser anonymous flex items. Keep them inline in normal flow so mixed text does
   not turn into unexpected full-width rows; a flex parent still lays each span out
   as a normal direct flex child. */
.vacuus-text-run {
  display: inline;
}

/* Generated pseudo-element helpers exist in the RML tree, but should only become
   visible when their rewritten source selector (base/hover/focus/etc.) matches. */
.vacuus-pseudo-helper {
  display: none;
}

/* The root body document fills its context.
   Position: absolute ensures full-screen viewport coverage in UE5. */
body {
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  /* Default typography for newly authored UI: Onest Regular. */
  font-family: ${DEFAULT_UI_FONT_FAMILY};
  font-weight: 400;
  font-size: 16px;
  color: #ffffff;
  background-color: transparent;
}

/* Baseline sizes use CSS-like physical px for browser visual parity. Use dp explicitly when a project intentionally wants Slate-DPI-aware sizing. */
h1 { font-size: 28px; font-weight: bold; margin: 0.67em 0; }
h2 { font-size: 22px; font-weight: bold; margin: 0.75em 0; }
h3 { font-size: 18px; font-weight: bold; margin: 0.83em 0; }
h4 { font-size: 16px; font-weight: bold; margin: 1.12em 0; }
h5 { font-size: 14px; font-weight: bold; margin: 1.5em 0; }
h6 { font-size: 12px; font-weight: bold; margin: 1.67em 0; }

p {
  margin: 0 0 1em 0;
}

/* Interactive Controls */
button {
  display: inline-block;
  text-align: center;
  cursor: pointer;
  padding: 8px 16px;
  background-color: #1e293b;
  color: #f8fafc;
  border-width: 1px;
  border-color: #475569;
  border-radius: 4px;
  tab-index: auto;
}

button:hover {
  background-color: #334155;
  border-color: #64748b;
}

button:active {
  background-color: #0f172a;
}

button:focus {
  border-color: #38bdf8;
}

input {
  display: inline-block;
  padding: 8px 12px;
  background-color: #0f172a;
  color: #f8fafc;
  border-width: 1px;
  border-color: #334155;
  border-radius: 4px;
  font-family: inherit;
  font-size: 14px;
  tab-index: auto;
  cursor: text;
}

input:focus {
  border-color: #38bdf8;
}

img {
  display: inline-block;
}

ul, ol {
  margin: 1em 0;
  padding-left: 24px;
}

li {
  display: list-item;
}

progress {
  display: inline-block;
  height: 16px;
  background-color: #1e293b;
  border-width: 1px;
  border-color: #475569;
  border-radius: 4px;
}
`;
