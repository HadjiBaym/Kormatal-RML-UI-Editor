export interface RcssPropertyDefinition {
  property: string;
  status: 'supported' | 'supported-with-limits' | 'convertible' | 'unsupported' | 'parses-not-rendered';
  allowedValues?: string[];
  notes: string;
  conversionRule?: string;
  autoFixAvailable: boolean;
  docAnchor?: string;
}

/**
 * CSS-import/conversion rule catalog. This is NOT the complete native VaCuus RCSS property matrix.
 * Native RCSS diagnostics and AI target-compatibility context use vacuus-1.1.0-ue5.8-profile.ts,
 * generated from the provided VaCuus 1.1.0 UE5.8 release's official buyer matrix.
 * This catalog intentionally also contains browser-only source properties, shorthands and
 * conversion candidates such as grid-template-columns and animation-duration.
 */
export const RCSS_PROPERTY_CATALOG: Record<string, RcssPropertyDefinition> = {
  // Display & Positioning
  'display': {
    property: 'display',
    status: 'supported-with-limits',
    allowedValues: ['none', 'block', 'inline', 'inline-block', 'flow-root', 'flex', 'inline-flex', 'table', 'inline-table', 'table-row', 'table-row-group', 'table-column', 'table-column-group', 'table-cell'],
    notes: 'CSS Grid values grid/inline-grid are unsupported. VaCuus 1.1.0 does include CSS display table-layout values, including table, inline-table, table-row, table-row-group, table-column, table-column-group and table-cell; this does not by itself prove semantic HTML table-tag support. Elements default to inline without vacuus-base.rcss.',
    conversionRule: 'Convert display: grid to display: flex with flex-wrap: wrap.',
    autoFixAvailable: true,
  },
  'position': {
    property: 'position',
    status: 'supported-with-limits',
    allowedValues: ['static', 'relative', 'absolute', 'fixed'],
    notes: 'Absolute positioning is relative to the nearest positioned ancestor (position != static).',
    autoFixAvailable: false,
  },
  'top': { property: 'top', status: 'supported', notes: 'Supported with px, %, em, rem.', autoFixAvailable: false },
  'right': { property: 'right', status: 'supported', notes: 'Supported with px, %, em, rem.', autoFixAvailable: false },
  'bottom': { property: 'bottom', status: 'supported', notes: 'Supported with px, %, em, rem.', autoFixAvailable: false },
  'left': { property: 'left', status: 'supported', notes: 'Supported with px, %, em, rem.', autoFixAvailable: false },
  'z-index': { property: 'z-index', status: 'supported', notes: 'Integer values supported.', autoFixAvailable: false },

  // Flexbox
  'flex': { property: 'flex', status: 'supported', notes: 'Shorthand for flex-grow flex-shrink flex-basis.', autoFixAvailable: false },
  'flex-direction': { property: 'flex-direction', status: 'supported', allowedValues: ['row', 'row-reverse', 'column', 'column-reverse'], notes: 'Full flex-direction support.', autoFixAvailable: false },
  'flex-wrap': { property: 'flex-wrap', status: 'supported', allowedValues: ['nowrap', 'wrap', 'wrap-reverse'], notes: 'Full wrap support.', autoFixAvailable: false },
  'justify-content': { property: 'justify-content', status: 'supported', allowedValues: ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'], notes: 'Standard flex alignment.', autoFixAvailable: false },
  'align-items': { property: 'align-items', status: 'supported', allowedValues: ['flex-start', 'flex-end', 'center', 'baseline', 'stretch'], notes: 'Cross-axis alignment.', autoFixAvailable: false },
  'align-content': { property: 'align-content', status: 'supported', notes: 'Cross-axis multi-line alignment.', autoFixAvailable: false },
  'align-self': { property: 'align-self', status: 'supported', notes: 'Item self-alignment.', autoFixAvailable: false },
  'flex-grow': { property: 'flex-grow', status: 'supported', notes: 'Numeric factor.', autoFixAvailable: false },
  'flex-shrink': { property: 'flex-shrink', status: 'supported', notes: 'Numeric factor.', autoFixAvailable: false },
  'flex-basis': { property: 'flex-basis', status: 'supported', notes: 'Length or auto.', autoFixAvailable: false },
  'order': { property: 'order', status: 'supported', notes: 'Integer item ordering.', autoFixAvailable: false },
  'gap': { property: 'gap', status: 'supported-with-limits', notes: 'Supported in modern RmlUi; margin fallbacks recommended for older engine builds.', autoFixAvailable: true },

  // Dimensions & Box Model
  'width': { property: 'width', status: 'supported', notes: 'Supports px, dp, %, em, rem, auto. Browser CSS px is preserved by default; set cssPixelsAsDp=true to opt into DPI-aware dp scaling.', autoFixAvailable: false },
  'min-width': { property: 'min-width', status: 'supported', notes: 'Supports lengths and %.', autoFixAvailable: false },
  'max-width': { property: 'max-width', status: 'supported', notes: 'Supports lengths and %.', autoFixAvailable: false },
  'height': { property: 'height', status: 'supported', notes: 'Supports px, dp, %, em, rem, auto. Browser CSS px is preserved by default; set cssPixelsAsDp=true to opt into DPI-aware dp scaling.', autoFixAvailable: false },
  'min-height': { property: 'min-height', status: 'supported', notes: 'Supports lengths and %.', autoFixAvailable: false },
  'max-height': { property: 'max-height', status: 'supported', notes: 'Supports lengths and %.', autoFixAvailable: false },
  'margin': { property: 'margin', status: 'supported', notes: 'Shorthand margin supported.', autoFixAvailable: false },
  'margin-top': { property: 'margin-top', status: 'supported', notes: 'Supports auto, lengths, %.', autoFixAvailable: false },
  'margin-right': { property: 'margin-right', status: 'supported', notes: 'Supports auto, lengths, %.', autoFixAvailable: false },
  'margin-bottom': { property: 'margin-bottom', status: 'supported', notes: 'Supports auto, lengths, %.', autoFixAvailable: false },
  'margin-left': { property: 'margin-left', status: 'supported', notes: 'Supports auto, lengths, %.', autoFixAvailable: false },
  'padding': { property: 'padding', status: 'supported', notes: 'Shorthand padding supported.', autoFixAvailable: false },
  'padding-top': { property: 'padding-top', status: 'supported', notes: 'Supports lengths and %.', autoFixAvailable: false },
  'padding-right': { property: 'padding-right', status: 'supported', notes: 'Supports lengths and %.', autoFixAvailable: false },
  'padding-bottom': { property: 'padding-bottom', status: 'supported', notes: 'Supports lengths and %.', autoFixAvailable: false },
  'padding-left': { property: 'padding-left', status: 'supported', notes: 'Supports lengths and %.', autoFixAvailable: false },
  'box-sizing': { property: 'box-sizing', status: 'supported', allowedValues: ['border-box', 'content-box'], notes: 'Set border-box globally via vacuus-base.rcss.', autoFixAvailable: false },
  'src': { property: 'src', status: 'supported', notes: 'Font source descriptor inside @font-face.', autoFixAvailable: false },

  // Background & Borders
  'background': { property: 'background', status: 'supported', notes: 'Colors, decorators and image URLs supported.', autoFixAvailable: false },
  'background-color': { property: 'background-color', status: 'supported', notes: 'Supports hex, rgb, rgba.', autoFixAvailable: false },
  'border': { property: 'border', status: 'supported', notes: 'Supports <width> <style> <color>.', autoFixAvailable: false },
  'border-top': { property: 'border-top', status: 'supported', notes: 'Top border shorthand.', autoFixAvailable: false },
  'border-right': { property: 'border-right', status: 'supported', notes: 'Right border shorthand.', autoFixAvailable: false },
  'border-bottom': { property: 'border-bottom', status: 'supported', notes: 'Bottom border shorthand.', autoFixAvailable: false },
  'border-left': { property: 'border-left', status: 'supported', notes: 'Left border shorthand.', autoFixAvailable: false },
  'border-width': { property: 'border-width', status: 'supported', notes: 'Supports px lengths.', autoFixAvailable: false },
  'border-top-width': { property: 'border-top-width', status: 'supported', notes: 'Top border width.', autoFixAvailable: false },
  'border-right-width': { property: 'border-right-width', status: 'supported', notes: 'Right border width.', autoFixAvailable: false },
  'border-bottom-width': { property: 'border-bottom-width', status: 'supported', notes: 'Bottom border width.', autoFixAvailable: false },
  'border-left-width': { property: 'border-left-width', status: 'supported', notes: 'Left border width.', autoFixAvailable: false },
  'border-style': { property: 'border-style', status: 'supported', allowedValues: ['none', 'solid', 'double'], notes: 'Solid borders are primary.', autoFixAvailable: false },
  'border-top-style': { property: 'border-top-style', status: 'supported', notes: 'Top border style.', autoFixAvailable: false },
  'border-right-style': { property: 'border-right-style', status: 'supported', notes: 'Right border style.', autoFixAvailable: false },
  'border-bottom-style': { property: 'border-bottom-style', status: 'supported', notes: 'Bottom border style.', autoFixAvailable: false },
  'border-left-style': { property: 'border-left-style', status: 'supported', notes: 'Left border style.', autoFixAvailable: false },
  'border-color': { property: 'border-color', status: 'supported', notes: 'Colors supported.', autoFixAvailable: false },
  'border-top-color': { property: 'border-top-color', status: 'supported', notes: 'Top border color.', autoFixAvailable: false },
  'border-right-color': { property: 'border-right-color', status: 'supported', notes: 'Right border color.', autoFixAvailable: false },
  'border-bottom-color': { property: 'border-bottom-color', status: 'supported', notes: 'Bottom border color.', autoFixAvailable: false },
  'border-left-color': { property: 'border-left-color', status: 'supported', notes: 'Left border color.', autoFixAvailable: false },
  'border-radius': { property: 'border-radius', status: 'supported-with-limits', notes: 'The target RmlUi longhand parsers accept lengths, not percentages. The converter has a special approximation for 50% pills/circles; other percentage radii require explicit lengths.', autoFixAvailable: false },
  'border-top-left-radius': { property: 'border-top-left-radius', status: 'supported', notes: 'Corner radius.', autoFixAvailable: false },
  'border-top-right-radius': { property: 'border-top-right-radius', status: 'supported', notes: 'Corner radius.', autoFixAvailable: false },
  'border-bottom-left-radius': { property: 'border-bottom-left-radius', status: 'supported', notes: 'Corner radius.', autoFixAvailable: false },
  'border-bottom-right-radius': { property: 'border-bottom-right-radius', status: 'supported', notes: 'Corner radius.', autoFixAvailable: false },

  // Typography
  'color': { property: 'color', status: 'supported', notes: 'Supports hex, rgb, rgba.', autoFixAvailable: false },
  'font-family': { property: 'font-family', status: 'supported', notes: 'Must match registered fonts in UE5 / DevUI.', autoFixAvailable: false },
  'font-size': { property: 'font-size', status: 'supported', notes: 'Supports px, dp, em, rem. Browser CSS px is preserved by default; set cssPixelsAsDp=true to opt into Slate DPI scaling.', autoFixAvailable: false },
  'font-style': { property: 'font-style', status: 'supported', allowedValues: ['normal', 'italic'], notes: 'Supported if italic font variant loaded.', autoFixAvailable: false },
  'font-weight': { property: 'font-weight', status: 'supported', allowedValues: ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'], notes: 'Depends on loaded font weights.', autoFixAvailable: false },
  'text-align': { property: 'text-align', status: 'supported', allowedValues: ['left', 'right', 'center', 'justify'], notes: 'Horizontal text alignment.', autoFixAvailable: false },
  'text-decoration': { property: 'text-decoration', status: 'supported', allowedValues: ['none', 'underline'], notes: 'Underline supported.', autoFixAvailable: false },
  'text-transform': { property: 'text-transform', status: 'supported', allowedValues: ['none', 'capitalize', 'uppercase', 'lowercase'], notes: 'Transforming text casing.', autoFixAvailable: false },
  'line-height': { property: 'line-height', status: 'supported', notes: 'Supports normal, numeric, px.', autoFixAvailable: false },
  'letter-spacing': { property: 'letter-spacing', status: 'supported', notes: 'Kerning adjustment.', autoFixAvailable: false },
  'white-space': { property: 'white-space', status: 'supported', allowedValues: ['normal', 'pre', 'nowrap', 'pre-wrap', 'pre-line'], notes: 'Whitespace collapsing rules.', autoFixAvailable: false },
  'word-break': { property: 'word-break', status: 'supported', allowedValues: ['normal', 'break-all', 'break-word'], notes: 'Word wrapping.', autoFixAvailable: false },

  // Transitions & Animations
  'transition': {
    property: 'transition',
    status: 'convertible',
    notes: 'Timing functions MUST be exact lowercase: cubic-in, cubic-out, cubic-in-out, linear. Invalid functions or capitalized names (e.g. Cubic-Out, ease-in-out) cause whole declaration to be dropped. var() inside transition has known engine limits.',
    conversionRule: 'Translate ease -> cubic-in-out, ease-in -> cubic-in, ease-out -> cubic-out, fix casing to lowercase.',
    autoFixAvailable: true,
  },
  'animation': { property: 'animation', status: 'supported-with-limits', notes: 'CSS keyframe animations supported for transform, opacity, colors.', autoFixAvailable: false },
  'animation-name': { property: 'animation-name', status: 'supported', notes: 'Keyframes identifier.', autoFixAvailable: false },
  'animation-duration': { property: 'animation-duration', status: 'supported', notes: 'Duration in s or ms.', autoFixAvailable: false },
  'animation-timing-function': { property: 'animation-timing-function', status: 'convertible', notes: 'Must be cubic-in, cubic-out, cubic-in-out or linear.', autoFixAvailable: true },
  'animation-iteration-count': { property: 'animation-iteration-count', status: 'supported', notes: 'Integer or infinite.', autoFixAvailable: false },

  // Transform & Opacity
  'transform': { property: 'transform', status: 'supported', notes: 'Supports translate, translateX, translateY, scale, scaleX, scaleY, rotate.', autoFixAvailable: false },
  'transform-origin': { property: 'transform-origin', status: 'supported', notes: 'Supports x y origin lengths or percentages.', autoFixAvailable: false },
  'opacity': { property: 'opacity', status: 'supported', notes: 'Number between 0.0 and 1.0.', autoFixAvailable: false },
  'visibility': { property: 'visibility', status: 'supported', allowedValues: ['visible', 'hidden'], notes: 'Visibility toggle.', autoFixAvailable: false },
  'overflow': { property: 'overflow', status: 'supported', allowedValues: ['visible', 'hidden', 'auto', 'scroll'], notes: 'Overflow clipping.', autoFixAvailable: false },
  'overflow-x': { property: 'overflow-x', status: 'supported', allowedValues: ['visible', 'hidden', 'auto', 'scroll'], notes: 'Horizontal clipping.', autoFixAvailable: false },
  'overflow-y': { property: 'overflow-y', status: 'supported', allowedValues: ['visible', 'hidden', 'auto', 'scroll'], notes: 'Vertical clipping.', autoFixAvailable: false },
  'pointer-events': { property: 'pointer-events', status: 'supported', allowedValues: ['auto', 'none'], notes: 'Pass-through input events.', autoFixAvailable: false },
  'cursor': { property: 'cursor', status: 'supported-with-limits', notes: 'Pointer or default cursor.', autoFixAvailable: false },

  // RmlUi Decorators (Unique to RCSS)
  'decorator': { property: 'decorator', status: 'supported', notes: 'RmlUi custom decorators: image(), tiled-horizontal(), tiled-box(), gradient().', autoFixAvailable: false },

  // Critical Gotchas: Properties that parse but DO NOT render or are unsupported
  'box-shadow': {
    property: 'box-shadow',
    status: 'parses-not-rendered',
    notes: 'VaCuus 1.1.0 refuses box-shadow at SaveLayerAsTexture with a warning once per view. The shadow is dropped while the element keeps its normal background and border; do not describe it as silent or as replacing the element with a white rectangle.',
    conversionRule: 'Use a packaged pre-blurred shadow/ninepatch texture or another visually validated decorator; do not leave box-shadow expecting it to render.',
    autoFixAvailable: true,
  },
  'mask-image': {
    property: 'mask-image',
    status: 'parses-not-rendered',
    notes: 'VaCuus 1.1.0 refuses mask-image at SaveLayerAsMaskImage with a warning once per view. The element renders unmasked and the mask artwork is discarded.',
    conversionRule: 'Bake alpha into the image asset, use a supported image/ninepatch decorator, or use overflow:hidden plus border-radius where visually valid.',
    autoFixAvailable: true,
  },
  '-webkit-mask-image': {
    property: '-webkit-mask-image',
    status: 'parses-not-rendered',
    notes: 'Browser-only vendor mask property. The target VaCuus mask-layer capture path is refused; target content renders without the mask and logs a warning once per view.',
    autoFixAvailable: true,
  },
  'filter': {
    property: 'filter',
    status: 'unsupported',
    notes: 'The VaCuus 1.1.0 recorder compiles the blur filter, but the shipped verified consumer is backdrop-filter (glass); per-element filter:blur is not a shipped v1 surface. Other filter types are refused and dropped.',
    autoFixAvailable: false,
  },
  'backdrop-filter': {
    property: 'backdrop-filter',
    status: 'supported-with-limits',
    notes: 'VaCuus 1.1.0 ships backdrop-filter: blur(...) as its scene-glass path: the blur is distilled at record time and recomposited/re-blurred each engine frame. Non-blur backdrop-filter values are refused. This is a VaCuus renderer feature, not a generic RmlUi/browser guarantee.',
    conversionRule: 'Preserve backdrop-filter: blur(...); warn and disable non-blur backdrop filters. Verify the effect in the exact UE5/VaCuus target runtime.',
    autoFixAvailable: true,
  },
  'grid': {
    property: 'grid',
    status: 'unsupported',
    notes: 'CSS Grid is completely unsupported in RmlUi. Must use Flexbox.',
    conversionRule: 'Convert to display: flex and flex-direction/wrap.',
    autoFixAvailable: true,
  },
  'grid-template-columns': {
    property: 'grid-template-columns',
    status: 'unsupported',
    notes: 'CSS Grid template columns unsupported.',
    conversionRule: 'Use flex children with flex: 0 0 <width> or flex-basis percentage.',
    autoFixAvailable: true,
  },
  'grid-template-rows': {
    property: 'grid-template-rows',
    status: 'unsupported',
    notes: 'CSS Grid template rows unsupported.',
    autoFixAvailable: true,
  },
  'grid-column': {
    property: 'grid-column',
    status: 'unsupported',
    notes: 'CSS Grid column positioning unsupported.',
    autoFixAvailable: true,
  },
  'grid-row': {
    property: 'grid-row',
    status: 'unsupported',
    notes: 'CSS Grid row positioning unsupported.',
    autoFixAvailable: true,
  },
  'grid-gap': {
    property: 'grid-gap',
    status: 'convertible',
    notes: 'Convert to gap or child margins.',
    conversionRule: 'Convert grid-gap to gap or margin.',
    autoFixAvailable: true,
  },
};

export const TIMING_FUNCTION_MAP: Record<string, string> = {
  'ease': 'cubic-in-out',
  'ease-in-out': 'cubic-in-out',
  'ease-in': 'cubic-in',
  'ease-out': 'cubic-out',
  'cubic-out': 'cubic-out',
  'cubic-in': 'cubic-in',
  'cubic-in-out': 'cubic-in-out',
  'linear': 'linear',
  'linear-in-out': 'linear-in-out',
  'linear-in': 'linear-in',
  'linear-out': 'linear-out',
  'Cubic-Out': 'cubic-out',
  'Cubic-In': 'cubic-in',
  'Cubic-In-Out': 'cubic-in-out',
  'Ease': 'cubic-in-out',
  'Ease-In-Out': 'cubic-in-out',
  'Linear-In-Out': 'linear-in-out',
};
