/**
 * Machine-readable target profile grounded in the supplied VaCuus 1.1.0 UE5.8 release archive.
 * Do not hand-edit property tables: regenerate/compare them against the exact target plugin matrix.
 * Implementation facts are separately code-audited and carry their own source provenance when it differs from the matrix.
 * Source SHA-256: 3ffc91eb288fa93d5c5868f88ec85348ea7e7126876bfdcc2deeac3db1adad34
 */
export const VACUUS_TARGET_BASELINE = {
  "pluginVersion": "1.1.0",
  "engineVersion": "5.8.0",
  "targetArchive": "VaCuus-1.1.0-UE5.8.zip",
  "rmlUiMajor": "6.x",
  "rmlUiCommit": "0ae381e00d7426762bb5ed897973366358b16642",
  "sourceMatrix": "VaCuus/docs/buyer/rcss-matrix.md",
  "sourceMatrixSha256": "3ffc91eb288fa93d5c5868f88ec85348ea7e7126876bfdcc2deeac3db1adad34",
  "counts": {
    "properties": 99,
    "shorthands": 20,
    "decorators": 16,
    "filters": 10,
    "fontEffects": 4
  }
} as const;

export type VaCuusRenderStatus = 'registered' | 'limited' | 'not-rendered';
export interface VaCuusRcssProperty { property: string; defaultValue: string; inherited: boolean; affectsLayout: boolean; acceptedValueGrammar: string; keywords: readonly string[]; renderStatus: VaCuusRenderStatus; notes: string; }

export const VACUUS_RCSS_PROPERTIES = [
  {
    "property": "margin-top",
    "defaultValue": "0px",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: auto; length_percent",
    "keywords": [
      "auto"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "margin-right",
    "defaultValue": "0px",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: auto; length_percent",
    "keywords": [
      "auto"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "margin-bottom",
    "defaultValue": "0px",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: auto; length_percent",
    "keywords": [
      "auto"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "margin-left",
    "defaultValue": "0px",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: auto; length_percent",
    "keywords": [
      "auto"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "padding-top",
    "defaultValue": "0px",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "length_percent",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "padding-right",
    "defaultValue": "0px",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "length_percent",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "padding-bottom",
    "defaultValue": "0px",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "length_percent",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "padding-left",
    "defaultValue": "0px",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "length_percent",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "border-top-width",
    "defaultValue": "0px",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "length",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "border-right-width",
    "defaultValue": "0px",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "length",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "border-bottom-width",
    "defaultValue": "0px",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "length",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "border-left-width",
    "defaultValue": "0px",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "length",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "border-top-color",
    "defaultValue": "black",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "color",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "border-right-color",
    "defaultValue": "black",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "color",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "border-bottom-color",
    "defaultValue": "black",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "color",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "border-left-color",
    "defaultValue": "black",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "color",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "border-top-left-radius",
    "defaultValue": "0px",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "length",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "border-top-right-radius",
    "defaultValue": "0px",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "length",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "border-bottom-right-radius",
    "defaultValue": "0px",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "length",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "border-bottom-left-radius",
    "defaultValue": "0px",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "length",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "display",
    "defaultValue": "inline",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: none, block, inline, inline-block, flow-root, flex, inline-flex, table, inline-table, table-row, table-row-group, table-column, table-column-group, table-cell",
    "keywords": [
      "none",
      "block",
      "inline",
      "inline-block",
      "flow-root",
      "flex",
      "inline-flex",
      "table",
      "inline-table",
      "table-row",
      "table-row-group",
      "table-column",
      "table-column-group",
      "table-cell"
    ],
    "renderStatus": "registered",
    "notes": "No CSS Grid in RmlUi (flex-first is the market bar, arch spec 1); the keyword list here is exhaustive."
  },
  {
    "property": "position",
    "defaultValue": "static",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: static, relative, absolute, fixed",
    "keywords": [
      "static",
      "relative",
      "absolute",
      "fixed"
    ],
    "renderStatus": "registered",
    "notes": "absolute resolves against the nearest positioned ancestor; there is no browser-style default-positioned root chain past the document (Content/DevUI/M5Hud/vacuus-base.rcss:29-31)."
  },
  {
    "property": "top",
    "defaultValue": "auto",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: auto; length_percent",
    "keywords": [
      "auto"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "right",
    "defaultValue": "auto",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: auto; length_percent",
    "keywords": [
      "auto"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "bottom",
    "defaultValue": "auto",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: auto; length_percent",
    "keywords": [
      "auto"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "left",
    "defaultValue": "auto",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: auto; length_percent",
    "keywords": [
      "auto"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "float",
    "defaultValue": "none",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: none, left, right",
    "keywords": [
      "none",
      "left",
      "right"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "clear",
    "defaultValue": "none",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: none, left, right, both",
    "keywords": [
      "none",
      "left",
      "right",
      "both"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "box-sizing",
    "defaultValue": "content-box",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: content-box, border-box",
    "keywords": [
      "content-box",
      "border-box"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "z-index",
    "defaultValue": "auto",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: auto; number",
    "keywords": [
      "auto"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "width",
    "defaultValue": "auto",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: auto; length_percent",
    "keywords": [
      "auto"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "min-width",
    "defaultValue": "0px",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "length_percent",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "max-width",
    "defaultValue": "none",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: none; length_percent",
    "keywords": [
      "none"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "height",
    "defaultValue": "auto",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: auto; length_percent",
    "keywords": [
      "auto"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "min-height",
    "defaultValue": "0px",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "length_percent",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "max-height",
    "defaultValue": "none",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: none; length_percent",
    "keywords": [
      "none"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "line-height",
    "defaultValue": "1.2",
    "inherited": true,
    "affectsLayout": true,
    "acceptedValueGrammar": "number_length_percent",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "vertical-align",
    "defaultValue": "baseline",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: baseline, middle, sub, super, text-top, text-bottom, top, center, bottom; length_percent",
    "keywords": [
      "baseline",
      "middle",
      "sub",
      "super",
      "text-top",
      "text-bottom",
      "top",
      "center",
      "bottom"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "overflow-x",
    "defaultValue": "visible",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: visible, hidden, auto, scroll",
    "keywords": [
      "visible",
      "hidden",
      "auto",
      "scroll"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "overflow-y",
    "defaultValue": "visible",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: visible, hidden, auto, scroll",
    "keywords": [
      "visible",
      "hidden",
      "auto",
      "scroll"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "clip",
    "defaultValue": "auto",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: auto, none, always; number",
    "keywords": [
      "auto",
      "none",
      "always"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "visibility",
    "defaultValue": "visible",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: visible, hidden",
    "keywords": [
      "visible",
      "hidden"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "text-overflow",
    "defaultValue": "clip",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: clip, ellipsis; string",
    "keywords": [
      "clip",
      "ellipsis"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "background-color",
    "defaultValue": "transparent",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "color",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "color",
    "defaultValue": "white",
    "inherited": true,
    "affectsLayout": false,
    "acceptedValueGrammar": "color",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "caret-color",
    "defaultValue": "auto",
    "inherited": true,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: auto; color",
    "keywords": [
      "auto"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "image-color",
    "defaultValue": "white",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "color",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "opacity",
    "defaultValue": "1",
    "inherited": true,
    "affectsLayout": false,
    "acceptedValueGrammar": "number",
    "keywords": [],
    "renderStatus": "limited",
    "notes": ""
  },
  {
    "property": "font-family",
    "defaultValue": " (empty)",
    "inherited": true,
    "affectsLayout": true,
    "acceptedValueGrammar": "string",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "font-style",
    "defaultValue": "normal",
    "inherited": true,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: normal, italic",
    "keywords": [
      "normal",
      "italic"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "font-weight",
    "defaultValue": "normal",
    "inherited": true,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: normal=400, bold=700; number",
    "keywords": [
      "normal=400",
      "bold=700"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "font-size",
    "defaultValue": "12px",
    "inherited": true,
    "affectsLayout": true,
    "acceptedValueGrammar": "length; length_percent",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "font-kerning",
    "defaultValue": "auto",
    "inherited": true,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: auto, normal, none",
    "keywords": [
      "auto",
      "normal",
      "none"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "letter-spacing",
    "defaultValue": "normal",
    "inherited": true,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: normal; length",
    "keywords": [
      "normal"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "text-align",
    "defaultValue": "left",
    "inherited": true,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: left, right, center, justify",
    "keywords": [
      "left",
      "right",
      "center",
      "justify"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "text-decoration",
    "defaultValue": "none",
    "inherited": true,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: none, underline, overline, line-through",
    "keywords": [
      "none",
      "underline",
      "overline",
      "line-through"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "text-transform",
    "defaultValue": "none",
    "inherited": true,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: none, capitalize, uppercase, lowercase",
    "keywords": [
      "none",
      "capitalize",
      "uppercase",
      "lowercase"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "white-space",
    "defaultValue": "normal",
    "inherited": true,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: normal, pre, nowrap, pre-wrap, pre-line",
    "keywords": [
      "normal",
      "pre",
      "nowrap",
      "pre-wrap",
      "pre-line"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "word-break",
    "defaultValue": "normal",
    "inherited": true,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: normal, break-all, break-word",
    "keywords": [
      "normal",
      "break-all",
      "break-word"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "row-gap",
    "defaultValue": "0px",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "length_percent",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "column-gap",
    "defaultValue": "0px",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "length_percent",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "cursor",
    "defaultValue": " (empty)",
    "inherited": true,
    "affectsLayout": false,
    "acceptedValueGrammar": "string",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "drag",
    "defaultValue": "none",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: none, drag, drag-drop, block, clone",
    "keywords": [
      "none",
      "drag",
      "drag-drop",
      "block",
      "clone"
    ],
    "renderStatus": "registered",
    "notes": "Only `drag-drop` and `clone` send dragover/dragout/dragdrop/dragmove -- plain `drag` sends dragstart/drag/dragend and nothing else (Context.cpp:692 sets drag_verbose for exactly those two), and `block` stops an ancestor from becoming the drag source. `clone` ships a ghost under the cursor styleable via `:drag` -- the ONE drag pseudo-class, set on the clone only (Context.cpp:1504); sources and targets get no pseudo-class at all. Shipped reference: vacuus.DragDemo + gotchas.md #24; proven by VaCuus.Js.DragDrop."
  },
  {
    "property": "tab-index",
    "defaultValue": "none",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: none, auto",
    "keywords": [
      "none",
      "auto"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "focus",
    "defaultValue": "auto",
    "inherited": true,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: none, auto",
    "keywords": [
      "none",
      "auto"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "nav-up",
    "defaultValue": "none",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: none, auto, horizontal, vertical, tree-order; string",
    "keywords": [
      "none",
      "auto",
      "horizontal",
      "vertical",
      "tree-order"
    ],
    "renderStatus": "registered",
    "notes": "The nav-* family is NOT inherited: spatial-nav rules must sit on the focusable element itself, and targets use `#id` syntax (rmlui-input.md:190-207, :450)."
  },
  {
    "property": "nav-right",
    "defaultValue": "none",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: none, auto, horizontal, vertical, tree-order; string",
    "keywords": [
      "none",
      "auto",
      "horizontal",
      "vertical",
      "tree-order"
    ],
    "renderStatus": "registered",
    "notes": "See nav-up."
  },
  {
    "property": "nav-down",
    "defaultValue": "none",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: none, auto, horizontal, vertical, tree-order; string",
    "keywords": [
      "none",
      "auto",
      "horizontal",
      "vertical",
      "tree-order"
    ],
    "renderStatus": "registered",
    "notes": "See nav-up."
  },
  {
    "property": "nav-left",
    "defaultValue": "none",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: none, auto, horizontal, vertical, tree-order; string",
    "keywords": [
      "none",
      "auto",
      "horizontal",
      "vertical",
      "tree-order"
    ],
    "renderStatus": "registered",
    "notes": "See nav-up."
  },
  {
    "property": "scrollbar-margin",
    "defaultValue": "0",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "length",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "overscroll-behavior",
    "defaultValue": "auto",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: auto, contain",
    "keywords": [
      "auto",
      "contain"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "pointer-events",
    "defaultValue": "auto",
    "inherited": true,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: none, auto",
    "keywords": [
      "none",
      "auto"
    ],
    "renderStatus": "registered",
    "notes": "Inherited, but there is no subtree pruning -- `none` on a parent still walks children during hit tests (docs/research/m2-api-notes/rmlui-input.md:198)."
  },
  {
    "property": "perspective",
    "defaultValue": "none",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: none; length",
    "keywords": [
      "none"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "perspective-origin-x",
    "defaultValue": "50%",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: left, center, right; length_percent",
    "keywords": [
      "left",
      "center",
      "right"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "perspective-origin-y",
    "defaultValue": "50%",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: top, center, bottom; length_percent",
    "keywords": [
      "top",
      "center",
      "bottom"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "transform",
    "defaultValue": "none",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "transform",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "transform-origin-x",
    "defaultValue": "50%",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: left, center, right; length_percent",
    "keywords": [
      "left",
      "center",
      "right"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "transform-origin-y",
    "defaultValue": "50%",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "keyword: top, center, bottom; length_percent",
    "keywords": [
      "top",
      "center",
      "bottom"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "transform-origin-z",
    "defaultValue": "0",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "length",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "transition",
    "defaultValue": "none",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "transition",
    "keywords": [],
    "renderStatus": "limited",
    "notes": "THERE IS NO `ease` FAMILY. The complete tween table is eleven families -- back bounce circular cubic elastic exponential linear quadratic quartic quintic sine -- each with -in/-out/-in-out (PropertyParserAnimation.cpp:27-77). `ease-in-out` is not in it, and an unrecognized token drops the WHOLE declaration with one generic \"Syntax error parsing property declaration\" (:240 misses the map, :267 fails the duration sscanf, :301-315 returns false). Use `cubic-in-out` for CSS's `ease-in-out`. Keywords must be LOWERCASE here: `transition` does not lowercase its token (:240) while `animation` does (:133). gotchas.md #3. Timing tokens MAY come from `var()`, but only because the vendored tree is patched for it (VENDORED_TAG.txt patch #4, bead VaCuus-6gj): upstream reads this property before computed values exist (ElementStyle.cpp:388) and drops the whole declaration with no diagnostic at all. gotchas.md #3b."
  },
  {
    "property": "animation",
    "defaultValue": "none",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "animation",
    "keywords": [],
    "renderStatus": "registered",
    "notes": "Same tween table as `transition` (PropertyParserAnimation.cpp:27-77), but this parser LOWERCASES each token before the lookup (:133), so `Cubic-Out` works here and silently kills a `transition`. Keyframe values may contain `var()` (Element.cpp:2784-2798), and so may this property's own value -- it is read through ComputedValues::animation(), which resolves variables (ComputedValues.cpp:8-16), so unlike `transition` it never needed a patch."
  },
  {
    "property": "decorator",
    "defaultValue": " (empty)",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "decorator",
    "keywords": [],
    "renderStatus": "registered",
    "notes": "Renders through the recorder; `shader(...)` values resolve builtin names then registered UMaterial style keys (see the decorators section below)."
  },
  {
    "property": "mask-image",
    "defaultValue": " (empty)",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "decorator",
    "keywords": [],
    "renderStatus": "not-rendered",
    "notes": "PARSES BUT DOES NOT MASK in v1 -- masking needs the mask layer captured as a filter (ElementEffects.cpp:306 -> RenderInterface::SaveLayerAsMaskImage) and the replayer has no layer render targets. It is REFUSED, once per view, with a Warning (bead VaCuus-iuv). The element renders UNMASKED, and the mask artwork RmlUi drew for the capture is discarded with the refusal -- before that, it was drawn over the element. Substitute: bake the alpha into the image asset and use `decorator: image`/`ninepatch`, or clip with `overflow: hidden` plus `border-radius`."
  },
  {
    "property": "font-effect",
    "defaultValue": " (empty)",
    "inherited": true,
    "affectsLayout": false,
    "acceptedValueGrammar": "font_effect",
    "keywords": [],
    "renderStatus": "registered",
    "notes": "Glyph generation for effects (glow/outline) is the measured spike class -- ~4.2 ms on the reference HUD's FIRST Record, UI thread, before first publish (perf-guide.md, Exp-GLYPH-WARMUP). Budget it at load, not per frame."
  },
  {
    "property": "filter",
    "defaultValue": " (empty)",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "filter: filter",
    "keywords": [],
    "renderStatus": "limited",
    "notes": "v1 compiles `blur` only; the other nine types are refused (one Warning per type, effect dropped per element -- VaCuusRecordingRenderInterface.cpp:866-907). Per-element filter blur is not a shipped v1 surface (arch spec 5, M5 amendment): the verified blur consumer is backdrop-filter."
  },
  {
    "property": "backdrop-filter",
    "defaultValue": " (empty)",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "filter",
    "keywords": [],
    "renderStatus": "limited",
    "notes": "`backdrop-filter: blur(...)` is the shipped glass path -- distilled at record time and re-blurred every engine frame at composite time (arch spec 5, M5 amendment). Non-blur backdrop filters are refused like element filters."
  },
  {
    "property": "box-shadow",
    "defaultValue": "none",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "box_shadow",
    "keywords": [],
    "renderStatus": "not-rendered",
    "notes": "DOES NOT RENDER in v1 -- the shadow needs the current layer captured to a texture (GeometryBoxShadow.cpp:241 -> RenderInterface::SaveLayerAsTexture) and the replayer has no layer render targets. It is REFUSED, once per view, with a Warning naming the property and the substitute; the element then renders its normal background and border with the shadow dropped (bead VaCuus-u0q; VaCuus patch #3 to the vendored RmlUi is what makes the failure harmless -- before it the element rendered as an opaque WHITE rectangle and republished every frame). The refusal also discards what RmlUi drew into the layer for the capture -- before that, the shadow flashed in the view's top-left corner once per new shadow value. Substitute: `decorator: ninepatch(...)` with a pre-blurred shadow image, or `font-effect: glow` for text. Also NOT animatable even where it renders: RmlUi refuses the key at animation start with a Warning (ElementAnimation.cpp:640-648); `vacuus lint` flags it at authoring time (Web/packages/cli/lib/lint.mjs:68-99)."
  },
  {
    "property": "fill-image",
    "defaultValue": " (empty)",
    "inherited": false,
    "affectsLayout": false,
    "acceptedValueGrammar": "string",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "align-content",
    "defaultValue": "stretch",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: flex-start, flex-end, center, space-between, space-around, space-evenly, stretch",
    "keywords": [
      "flex-start",
      "flex-end",
      "center",
      "space-between",
      "space-around",
      "space-evenly",
      "stretch"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "align-items",
    "defaultValue": "stretch",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: flex-start, flex-end, center, baseline, stretch",
    "keywords": [
      "flex-start",
      "flex-end",
      "center",
      "baseline",
      "stretch"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "align-self",
    "defaultValue": "auto",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: auto, flex-start, flex-end, center, baseline, stretch",
    "keywords": [
      "auto",
      "flex-start",
      "flex-end",
      "center",
      "baseline",
      "stretch"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "flex-basis",
    "defaultValue": "auto",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: auto; length_percent",
    "keywords": [
      "auto"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "flex-direction",
    "defaultValue": "row",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: row, row-reverse, column, column-reverse",
    "keywords": [
      "row",
      "row-reverse",
      "column",
      "column-reverse"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "flex-grow",
    "defaultValue": "0",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "number",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "flex-shrink",
    "defaultValue": "1",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "number",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "flex-wrap",
    "defaultValue": "nowrap",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: nowrap, wrap, wrap-reverse",
    "keywords": [
      "nowrap",
      "wrap",
      "wrap-reverse"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "justify-content",
    "defaultValue": "flex-start",
    "inherited": false,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: flex-start, flex-end, center, space-between, space-around, space-evenly",
    "keywords": [
      "flex-start",
      "flex-end",
      "center",
      "space-between",
      "space-around",
      "space-evenly"
    ],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "-rmlui-language",
    "defaultValue": " (empty)",
    "inherited": true,
    "affectsLayout": true,
    "acceptedValueGrammar": "string",
    "keywords": [],
    "renderStatus": "registered",
    "notes": ""
  },
  {
    "property": "-rmlui-direction",
    "defaultValue": "auto",
    "inherited": true,
    "affectsLayout": true,
    "acceptedValueGrammar": "keyword: auto, ltr, rtl",
    "keywords": [
      "auto",
      "ltr",
      "rtl"
    ],
    "renderStatus": "registered",
    "notes": ""
  }
] as const;

export const VACUUS_RCSS_SHORTHANDS = [
  {
    "name": "margin",
    "expandsTo": [
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left"
    ],
    "expansionType": "Box",
    "notes": ""
  },
  {
    "name": "padding",
    "expandsTo": [
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left"
    ],
    "expansionType": "Box",
    "notes": ""
  },
  {
    "name": "border-width",
    "expandsTo": [
      "border-top-width",
      "border-right-width",
      "border-bottom-width",
      "border-left-width"
    ],
    "expansionType": "Box",
    "notes": ""
  },
  {
    "name": "border-color",
    "expandsTo": [
      "border-top-color",
      "border-right-color",
      "border-bottom-color",
      "border-left-color"
    ],
    "expansionType": "Box",
    "notes": ""
  },
  {
    "name": "border-top",
    "expandsTo": [
      "border-top-width",
      "border-top-color"
    ],
    "expansionType": "FallThrough",
    "notes": ""
  },
  {
    "name": "border-right",
    "expandsTo": [
      "border-right-width",
      "border-right-color"
    ],
    "expansionType": "FallThrough",
    "notes": ""
  },
  {
    "name": "border-bottom",
    "expandsTo": [
      "border-bottom-width",
      "border-bottom-color"
    ],
    "expansionType": "FallThrough",
    "notes": ""
  },
  {
    "name": "border-left",
    "expandsTo": [
      "border-left-width",
      "border-left-color"
    ],
    "expansionType": "FallThrough",
    "notes": ""
  },
  {
    "name": "border",
    "expandsTo": [
      "border-top",
      "border-right",
      "border-bottom",
      "border-left"
    ],
    "expansionType": "RecursiveRepeat",
    "notes": ""
  },
  {
    "name": "border-radius",
    "expandsTo": [
      "border-top-left-radius",
      "border-top-right-radius",
      "border-bottom-right-radius",
      "border-bottom-left-radius"
    ],
    "expansionType": "Box",
    "notes": ""
  },
  {
    "name": "inset",
    "expandsTo": [
      "top",
      "right",
      "bottom",
      "left"
    ],
    "expansionType": "Box",
    "notes": ""
  },
  {
    "name": "overflow",
    "expandsTo": [
      "overflow-x",
      "overflow-y"
    ],
    "expansionType": "Replicate",
    "notes": ""
  },
  {
    "name": "background",
    "expandsTo": [
      "background-color"
    ],
    "expansionType": "FallThrough",
    "notes": ""
  },
  {
    "name": "font",
    "expandsTo": [
      "font-style",
      "font-weight",
      "font-size",
      "font-family"
    ],
    "expansionType": "FallThrough",
    "notes": ""
  },
  {
    "name": "gap",
    "expandsTo": [
      "row-gap",
      "column-gap"
    ],
    "expansionType": "Replicate",
    "notes": ""
  },
  {
    "name": "nav",
    "expandsTo": [
      "nav-up",
      "nav-right",
      "nav-down",
      "nav-left"
    ],
    "expansionType": "Box",
    "notes": "Shorthand for the nav-* family; the non-inheritance note on nav-up applies."
  },
  {
    "name": "perspective-origin",
    "expandsTo": [
      "perspective-origin-x",
      "perspective-origin-y"
    ],
    "expansionType": "FallThrough",
    "notes": ""
  },
  {
    "name": "transform-origin",
    "expandsTo": [
      "transform-origin-x",
      "transform-origin-y",
      "transform-origin-z"
    ],
    "expansionType": "FallThrough",
    "notes": ""
  },
  {
    "name": "flex",
    "expandsTo": [
      "flex-grow",
      "flex-shrink",
      "flex-basis"
    ],
    "expansionType": "Flex",
    "notes": ""
  },
  {
    "name": "flex-flow",
    "expandsTo": [
      "flex-direction",
      "flex-wrap"
    ],
    "expansionType": "FallThrough",
    "notes": ""
  }
] as const;

export const VACUUS_RCSS_DECORATORS = [
  "text",
  "tiled-horizontal",
  "tiled-vertical",
  "tiled-box",
  "image",
  "ninepatch",
  "shader",
  "gradient",
  "horizontal-gradient",
  "vertical-gradient",
  "linear-gradient",
  "repeating-linear-gradient",
  "radial-gradient",
  "repeating-radial-gradient",
  "conic-gradient",
  "repeating-conic-gradient"
] as const;

export const VACUUS_RCSS_FILTERS = [
  {
    "name": "hue-rotate",
    "status": "refused (one Warning per type; effect dropped per element)"
  },
  {
    "name": "brightness",
    "status": "refused (one Warning per type; effect dropped per element)"
  },
  {
    "name": "contrast",
    "status": "refused (one Warning per type; effect dropped per element)"
  },
  {
    "name": "grayscale",
    "status": "refused (one Warning per type; effect dropped per element)"
  },
  {
    "name": "invert",
    "status": "refused (one Warning per type; effect dropped per element)"
  },
  {
    "name": "opacity",
    "status": "refused (one Warning per type; effect dropped per element)"
  },
  {
    "name": "saturate",
    "status": "refused (one Warning per type; effect dropped per element)"
  },
  {
    "name": "sepia",
    "status": "refused (one Warning per type; effect dropped per element)"
  },
  {
    "name": "blur",
    "status": "compiled; shipped consumer is `backdrop-filter` (glass)"
  },
  {
    "name": "drop-shadow",
    "status": "refused (one Warning per type; effect dropped per element)"
  }
] as const;

export const VACUUS_RCSS_FONT_EFFECTS = [
  "blur",
  "glow",
  "outline",
  "shadow"
] as const;

export const VACUUS_RCSS_AT_RULES = [
  "@keyframes",
  "@decorator",
  "@spritesheet",
  "@media",
  "@font-face"
] as const;

export const VACUUS_TARGET_FACTS = [
  {
    "id": "no-css-grid",
    "title": "CSS Grid is not supported",
    "detail": "Do not emit display:grid, inline-grid or Grid track placement. Use Flexbox or explicit geometry. The display property DOES support table, inline-table, table-row, table-row-group, table-column, table-column-group and table-cell; do not falsely state that table display values are absent."
  },
  {
    "id": "no-calc",
    "title": "calc() is not supported",
    "detail": "There is no calc() parser in the vendored RmlUi core. Compute values at conversion time only when a deterministic source/viewport basis exists; otherwise use explicit compatible lengths and a diagnostic."
  },
  {
    "id": "no-ua-stylesheet",
    "title": "No user-agent stylesheet",
    "detail": "Link vacuus-base.rcss first; without it ordinary elements default to inline and browser reset/block defaults are absent."
  },
  {
    "id": "box-shadow-refusal",
    "title": "box-shadow is refused at layer capture",
    "detail": "The element keeps its normal background and border, while the shadow is dropped. VaCuus logs a warning once per view; do not describe this as silently doing nothing or replacing the entire element with a white box for this release."
  },
  {
    "id": "mask-image-refusal",
    "title": "mask-image is refused at layer capture",
    "detail": "The element renders unmasked and the mask artwork is discarded; VaCuus logs a warning once per view."
  },
  {
    "id": "filters",
    "title": "Filter support is limited",
    "detail": "The recorder compiles blur, but the shipped verified consumer is backdrop-filter (glass). Other filter types are refused. Do not assume element-level filter:blur is a shipping v1 surface."
  },
  {
    "id": "backdrop-blur",
    "title": "backdrop-filter blur is a native VaCuus path",
    "detail": "backdrop-filter:blur(...) is the shipped glass path, distilled during recording and re-blurred at engine-frame composition. Non-blur backdrop filters are refused. The official matrix does not require decorator:shader(glass-panel) as a same-selector prerequisite."
  },
  {
    "id": "font-face-root",
    "title": "@font-face supports packaged custom faces",
    "detail": "@font-face is the custom-font loading route. font-family and src are required; src is a bare DevUI/VFS-root-relative path, not url(...), and unlike link/script paths it is not document-relative. Variable fonts use default axis behavior; ship static instances per weight."
  },
  {
    "id": "public-font-api",
    "title": "Public runtime font registration API exists",
    "detail": "The public UVaCuusSubsystem exposes BlueprintCallable LoadFontFace(VfsPath, bFallbackFace). It registers a face through the plugin's UI-thread queue using a DevUI/VFS-root-relative path; use bFallbackFace for glyph fallback, and registration survives UI-thread restart. RCSS @font-face remains the declarative authoring route. Note: the supplied release's rcss-matrix.md contains a stale sentence claiming there is no public C++ font API; prefer VaCuusSubsystem.h and gotchas.md, which document the runtime API.",
    "source": "source:VaCuus-1.1.0-UE5.8.zip#Source/VaCuus/Public/VaCuusSubsystem.h:LoadFontFace;docs/buyer/gotchas.md#5"
  },
  {
    "id": "radius-length",
    "title": "border-radius is length-only",
    "detail": "The longhands register length parsers, not percentages. border-radius:50% does not parse; convert to an explicit half-side length or create a carefully bounded pill approximation and diagnose it."
  },
  {
    "id": "transition-easing",
    "title": "Transition easing tokens are not CSS timing names",
    "detail": "There is no ease family. Registered tween families are back, bounce, circular, cubic, elastic, exponential, linear, quadratic, quartic, quintic and sine, with -in/-out/-in-out. Use cubic-in-out for CSS ease-in-out. transition tokens must be lowercase; a bad token drops the whole declaration."
  },
  {
    "id": "custom-properties",
    "title": "CSS custom properties and var() exist",
    "detail": "Custom properties and var() with fallback and cycle detection are supported. transition var() support depends on a vendored RmlUi patch included in this release."
  },
  {
    "id": "path-roots",
    "title": "VFS path roots are ordered plugin first",
    "detail": "Relative document assets resolve first under Plugin/Content/DevUI and then Project/Content/DevUI. Project files cannot shadow same-named plugin files. link and script src are document-relative; @font-face src is DevUI-root-relative."
  },
  {
    "id": "js-runtime",
    "title": "QuickJS facade is not a browser",
    "detail": "The runtime is QuickJS with a custom DOM facade. No full browser, navigation, fetch, or arbitrary web platform APIs. Use the documented VaCuus DOM/event/model bridge and Unreal-side events."
  },
  {
    "id": "data-binding",
    "title": "Data binding is engine-driven",
    "detail": "Bind exposed models before LoadDocument. UPROPERTY fields must be Blueprint-visible/editable according to setup docs. A UI write is a request to the game thread; update the model from the game and reset request fields because equal echoes are swallowed."
  },
  {
    "id": "threading",
    "title": "All RmlUi calls live on the dedicated UI thread",
    "detail": "Game thread enqueues input/commands and reads published interactive snapshots; interact with the view through UVaCuusView rather than touching RmlUi directly from worker threads."
  },
  {
    "id": "dpi",
    "title": "px and dp differ by host context",
    "detail": "Screen px remains physical pixels; dp follows Slate geometry/DPI scale. World-panel dp equals px in the referenced release docs."
  }
] as const;

export const VACUUS_RCSS_PROPERTY_MAP: ReadonlyMap<string, VaCuusRcssProperty> = new Map(VACUUS_RCSS_PROPERTIES.map(item => [item.property, item]));

export function getVaCuusRcssProperty(property: string): VaCuusRcssProperty | undefined { return VACUUS_RCSS_PROPERTY_MAP.get(property.trim().toLowerCase()); }
