/**
 * Unified Knowledge Base & Compatibility Registry for VaCuus and RmlUi in Unreal Engine 5.
 * Serves as the authoritative single source of truth for all conversion pipelines,
 * diagnostics, analyzers, auto-fixes, and UI documentation.
 */

export interface KnowledgeElement {
  tag: string;
  category: 'document' | 'layout' | 'typography' | 'control' | 'media' | 'list';
  status: 'supported' | 'supported-with-limits' | 'unsupported' | 'semantic-mapped';
  supportedAttributes: string[];
  notes: string;
  replacement?: string;
  sourceDoc: string;
}

export interface KnowledgeRcssProperty {
  property: string;
  category: 'layout' | 'box-model' | 'borders' | 'typography' | 'transitions' | 'decorators' | 'unsupported';
  status: 'supported' | 'supported-with-limits' | 'convertible' | 'parses-not-rendered' | 'unsupported';
  allowedValues?: string[];
  notes: string;
  autoFixAvailable: boolean;
  conversionRule?: string;
  sourceDoc: string;
}

export interface KnowledgeJsApi {
  name: string;
  category: 'dom' | 'events' | 'ue5-bridge' | 'forbidden-browser' | 'timers';
  status: 'supported' | 'shim-available' | 'forbidden';
  description: string;
  alternative?: string;
  sourceDoc: string;
}

export interface KnowledgeConversionRule {
  id: string;
  title: string;
  category: 'html' | 'css' | 'js';
  precondition: string;
  action: string;
  severity: 'error' | 'warning' | 'manual-fix' | 'info';
  autoFixAvailable: boolean;
  docAnchor: string;
}

export const RML_ELEMENTS_REGISTRY: KnowledgeElement[] = [
  {
    tag: 'rml',
    category: 'document',
    status: 'supported',
    supportedAttributes: ['lang', 'id'],
    notes: 'The mandatory XML root element for all RmlUi documents. Replaces <html>.',
    sourceDoc: 'rml/element_index.html',
  },
  {
    tag: 'head',
    category: 'document',
    status: 'supported',
    supportedAttributes: [],
    notes: 'Document metadata container. Contains <title>, <link type="text/rcss">, <script>.',
    sourceDoc: 'rml/element_index.html',
  },
  {
    tag: 'body',
    category: 'document',
    status: 'supported',
    supportedAttributes: ['id', 'class', 'style', 'data-model'],
    notes: 'Main document body. Requires vacuus-base.rcss resets for standard box model.',
    sourceDoc: 'rml/element_index.html',
  },
  {
    tag: 'div',
    category: 'layout',
    status: 'supported',
    supportedAttributes: ['id', 'class', 'style', 'data-model', 'data-if', 'data-for'],
    notes: 'Primary container element. Supports block, inline-block, and flex layouts.',
    sourceDoc: 'rml/element_index.html',
  },
  {
    tag: 'p',
    category: 'typography',
    status: 'supported',
    supportedAttributes: ['id', 'class', 'style'],
    notes: 'Paragraph block. Margin resets provided by vacuus-base.rcss.',
    sourceDoc: 'rml/element_index.html',
  },
  {
    tag: 'span',
    category: 'typography',
    status: 'supported',
    supportedAttributes: ['id', 'class', 'style'],
    notes: 'Inline typography element.',
    sourceDoc: 'rml/element_index.html',
  },
  {
    tag: 'button',
    category: 'control',
    status: 'supported',
    supportedAttributes: ['id', 'class', 'style', 'disabled', 'data-event-click'],
    notes: 'Interactive button with :hover, :active pseudo-classes.',
    sourceDoc: 'rml/element_index.html',
  },
  {
    tag: 'input',
    category: 'control',
    status: 'supported',
    supportedAttributes: ['id', 'class', 'style', 'type', 'value', 'checked', 'disabled', 'maxlength', 'data-value'],
    notes: 'Form control. Must be self-closing <input ... /> in XML RML.',
    sourceDoc: 'rml/element_index.html',
  },
  {
    tag: 'img',
    category: 'media',
    status: 'supported',
    supportedAttributes: ['id', 'class', 'style', 'src', 'alt', 'width', 'height'],
    notes: 'Image sprite renderer. Must be self-closing <img ... />.',
    sourceDoc: 'rml/element_index.html',
  },
  {
    tag: 'progress',
    category: 'control',
    status: 'supported',
    supportedAttributes: ['id', 'class', 'style', 'value', 'max'],
    notes: 'Native progress/health bar. Fade with image-color rather than child opacity.',
    sourceDoc: 'gotchas.md#opacity',
  },
  {
    tag: 'ul',
    category: 'list',
    status: 'supported',
    supportedAttributes: ['id', 'class', 'style'],
    notes: 'Unordered list container.',
    sourceDoc: 'rml/element_index.html',
  },
  {
    tag: 'li',
    category: 'list',
    status: 'supported',
    supportedAttributes: ['id', 'class', 'style'],
    notes: 'List item with list-item display.',
    sourceDoc: 'rml/element_index.html',
  },
  {
    tag: 'video',
    category: 'media',
    status: 'unsupported',
    supportedAttributes: [],
    notes: 'HTML5 video is unsupported by RmlUi core.',
    replacement: 'Render via Unreal Media Player / UMediaTexture onto an in-game quad or UMG widget.',
    sourceDoc: 'docs/ai-guide',
  },
  {
    tag: 'audio',
    category: 'media',
    status: 'unsupported',
    supportedAttributes: [],
    notes: 'HTML5 audio element is unsupported in RmlUi.',
    replacement: 'Trigger audio through Unreal Engine MetaSounds / Audio Component via game thread events.',
    sourceDoc: 'docs/ai-guide',
  },
  {
    tag: 'canvas',
    category: 'media',
    status: 'unsupported',
    supportedAttributes: [],
    notes: 'HTML5 2D / WebGL canvas is unsupported in RmlUi.',
    replacement: 'Render dynamic textures via UTextureRenderTarget2D or Slate custom drawer.',
    sourceDoc: 'docs/ai-guide',
  },
  {
    tag: 'iframe',
    category: 'layout',
    status: 'unsupported',
    supportedAttributes: [],
    notes: 'Nested browser iframes are not supported.',
    replacement: 'Split into separate RML documents or use RmlUi <template> includes.',
    sourceDoc: 'rml/element_index.html',
  },
  {
    tag: 'svg',
    category: 'media',
    status: 'supported-with-limits',
    supportedAttributes: ['width', 'height', 'viewBox'],
    notes: 'Complex inline vector SVG DOM is not natively rendered by RmlUi.',
    replacement: 'Rasterize to PNG assets in Assets/Icons/ or use decorator: image().',
    sourceDoc: 'docs/gotchas',
  },
];

export const RCSS_PROPERTIES_REGISTRY: KnowledgeRcssProperty[] = [
  {
    property: 'display',
    category: 'layout',
    status: 'supported-with-limits',
    allowedValues: ['none', 'block', 'inline', 'inline-block', 'flow-root', 'flex', 'inline-flex', 'table', 'inline-table', 'table-row', 'table-row-group', 'table-column', 'table-column-group', 'table-cell'],
    notes: 'CSS Grid (grid/inline-grid) is unsupported. The official VaCuus 1.1.0 UE5.8 RCSS matrix includes CSS table display values (table, inline-table, table-row, table-row-group, table-column, table-column-group, table-cell); semantic HTML table tag support must be checked separately. Elements default to inline without vacuus-base.rcss.',
    autoFixAvailable: true,
    conversionRule: 'Convert display: grid to display: flex; flex-wrap: wrap;',
    sourceDoc: 'docs/rcss-matrix#what-is-not-here',
  },
  {
    property: 'calc()',
    category: 'unsupported',
    status: 'unsupported',
    notes: 'CRITICAL GOTCHA: There is NO calc() parser in vendored RmlUi core. calc(100% - 20px) will fail or be dropped.',
    autoFixAvailable: true,
    conversionRule: 'Replace with flex-grow / flex-basis percentage, child margins, or custom property var().',
    sourceDoc: 'docs/rcss-matrix#what-is-not-here',
  },
  {
    property: 'opacity',
    category: 'typography',
    status: 'supported-with-limits',
    notes: 'CRITICAL GOTCHA: opacity is inherited and non-compositing. A descendant that sets opacity overwrites its parent\'s instead of multiplying. Use image-color or color alpha.',
    autoFixAvailable: false,
    sourceDoc: 'docs/gotchas#opacity-does-not-establish-a-group',
  },
  {
    property: 'var()',
    category: 'typography',
    status: 'supported-with-limits',
    notes: 'Custom properties supported (--name: val; var(--name, fallback)). An undefined var without a fallback produces a runtime Error.',
    autoFixAvailable: true,
    conversionRule: 'Always supply fallback value after comma: var(--name, fallback).',
    sourceDoc: 'docs/rcss-matrix#custom-properties',
  },
  {
    property: 'transition',
    category: 'transitions',
    status: 'convertible',
    allowedValues: ['cubic-in', 'cubic-out', 'cubic-in-out', 'linear'],
    notes: 'Timing functions MUST be exact lowercase: cubic-in, cubic-out, cubic-in-out, linear. Capitalized tweens (Cubic-Out) or ease-in-out cause declaration to be rejected.',
    autoFixAvailable: true,
    conversionRule: 'Normalize ease -> cubic-in-out, ease-in -> cubic-in, ease-out -> cubic-out, Cubic-Out -> cubic-out.',
    sourceDoc: 'docs/gotchas#transition-timing-casing',
  },
  {
    property: 'box-shadow',
    category: 'borders',
    status: 'parses-not-rendered',
    notes: 'VaCuus 1.1.0 refuses box-shadow at layer capture with a warning once per view. The shadow is dropped; normal element background and border remain. This is not a silent no-op in the target release.',
    autoFixAvailable: true,
    conversionRule: 'Replace with border highlight or image slice decorator.',
    sourceDoc: 'docs/gotchas#box-shadow',
  },
  {
    property: 'mask-image',
    category: 'borders',
    status: 'parses-not-rendered',
    notes: 'VaCuus 1.1.0 refuses mask-image at layer capture with a warning once per view. The element renders unmasked and the mask artwork is discarded.',
    autoFixAvailable: false,
    sourceDoc: 'docs/gotchas#mask-image',
  },
  {
    property: 'decorator',
    category: 'decorators',
    status: 'supported',
    allowedValues: ['image()', 'tiled-horizontal()', 'tiled-box()', 'gradient()'],
    notes: 'RmlUi custom decorators for procedural gradients, borders, and sliced textures.',
    autoFixAvailable: false,
    sourceDoc: 'docs/rcss-matrix#decorators',
  },
  {
    property: '@font-face src',
    category: 'typography',
    status: 'convertible',
    notes: 'VaCuus supports custom packaged font faces through @font-face: font-family and src are required, and src is a bare DevUI/VFS-root-relative path (for example MyHud/fonts/Face.ttf), without url() or a leading slash. This differs from document-relative <link> and <script> paths. The new-font picker exposes bundled Onest, Tektur and JetBrains Mono, but imported packaged custom @font-face registrations are preserved and their local files are packaged by the project importer. The picker policy is not a VaCuus engine limitation.',
    autoFixAvailable: true,
    conversionRule: 'Rewrite ./Fonts/... to Fonts/... without a leading slash',
    sourceDoc: 'docs/gotchas#font-face-paths',
  },
];

export const JS_API_REGISTRY: KnowledgeJsApi[] = [
  {
    name: 'document.getElementById',
    category: 'dom',
    status: 'supported',
    description: 'Direct element retrieval by unique ID. Fastest and most robust lookup in RmlUi.',
    sourceDoc: 'docs/javascript-runtime',
  },
  {
    name: 'element.addEventListener',
    category: 'events',
    status: 'supported',
    description: 'Event listener registration for click, mouseover, mouseout, keydown, etc.',
    sourceDoc: 'docs/javascript-runtime',
  },
  {
    name: 'element.style.setProperty',
    category: 'dom',
    status: 'supported',
    description: 'Dynamic style manipulation, including setting custom properties (--accent).',
    sourceDoc: 'docs/rcss-matrix#custom-properties',
  },
  {
    name: 'VaCuusBridge.sendToUE',
    category: 'ue5-bridge',
    status: 'supported',
    description: 'Calls VaCuus 1.1.0 vacuus.emit(name, payload); Unreal code receives it through UVaCuusView::OnJsEvent.',
    sourceDoc: 'docs/javascript-runtime',
  },
  {
    name: 'localStorage',
    category: 'forbidden-browser',
    status: 'forbidden',
    description: 'Browser local storage does not exist in embedded headless runtime.',
    alternative: 'Bind data model to Unreal Engine or save via USaveGame.',
    sourceDoc: 'docs/gotchas#unsupported-js-apis',
  },
  {
    name: 'fetch / XMLHttpRequest',
    category: 'forbidden-browser',
    status: 'forbidden',
    description: 'Browser HTTP client APIs are not available.',
    alternative: 'Perform network requests in Unreal C++ via FHttpModule and push results into UI model.',
    sourceDoc: 'docs/gotchas#unsupported-js-apis',
  },
  {
    name: 'window.alert / confirm',
    category: 'forbidden-browser',
    status: 'forbidden',
    description: 'Modal window alerts halt execution and crash headless game UI.',
    alternative: 'Display in-game HUD message or RML notification box.',
    sourceDoc: 'docs/gotchas#unsupported-js-apis',
  },
];

export const CONVERSION_RULES_REGISTRY: KnowledgeConversionRule[] = [
  {
    id: 'H-01',
    title: 'Document Envelope (<rml>)',
    category: 'html',
    precondition: 'HTML5 <html> document with DOCTYPE.',
    action: 'Convert <html> to <rml>, preserve <head> and <body>, drop DOCTYPE.',
    severity: 'info',
    autoFixAvailable: true,
    docAnchor: 'docs/conversion-rules#rule-h-01',
  },
  {
    id: 'H-02',
    title: 'XML Self-Closing Void Tags',
    category: 'html',
    precondition: 'Unclosed void tags (<img>, <input>, <br>, <hr>).',
    action: 'Append self-closing slash (<img ... />, <input ... />).',
    severity: 'info',
    autoFixAvailable: true,
    docAnchor: 'docs/conversion-rules#rule-h-02',
  },
  {
    id: 'H-03',
    title: 'Base Resets Inclusion (vacuus-base.rcss)',
    category: 'html',
    precondition: 'RML document lacking vacuus-base.rcss as first link.',
    action: 'Inject <link type="text/rcss" href="vacuus-base.rcss"/> at head top.',
    severity: 'info',
    autoFixAvailable: true,
    docAnchor: 'docs/gotchas#gotcha-1',
  },
  {
    id: 'C-01',
    title: 'CSS Grid to Flexbox Fallback',
    category: 'css',
    precondition: 'display: grid or display: inline-grid.',
    action: 'Convert to display: flex; flex-wrap: wrap; and grid-gap to gap.',
    severity: 'warning',
    autoFixAvailable: true,
    docAnchor: 'docs/rcss-matrix#what-is-not-here',
  },
  {
    id: 'C-02',
    title: 'Transition Timing Function Normalization',
    category: 'css',
    precondition: 'transition using ease, ease-in, ease-out, ease-in-out, or capitalized Cubic-Out.',
    action: 'Convert to exact lowercase cubic-in, cubic-out, cubic-in-out, or linear.',
    severity: 'warning',
    autoFixAvailable: true,
    docAnchor: 'docs/gotchas#transition-timing-casing',
  },
  {
    id: 'C-03',
    title: 'calc() Parser Prohibition',
    category: 'css',
    precondition: 'Declaration containing calc(...).',
    action: 'Flag error; there is no calc() parser in RmlUi core. Recommend flexbox or custom properties.',
    severity: 'error',
    autoFixAvailable: true,
    docAnchor: 'docs/rcss-matrix#what-is-not-here',
  },
  {
    id: 'C-04',
    title: 'Non-Compositing Opacity Guard',
    category: 'css',
    precondition: 'Child element declaring opacity under an ancestor that also has opacity.',
    action: 'Warn that child opacity overwrites ancestor. Use image-color or color alpha.',
    severity: 'warning',
    autoFixAvailable: false,
    docAnchor: 'docs/gotchas#opacity-does-not-establish-a-group',
  },
  {
    id: 'C-05',
    title: 'Root-Relative @font-face Paths',
    category: 'css',
    precondition: '@font-face src uses a browser-relative path (./Fonts/...).',
    action: 'Rewrite to the DevUI-rooted bare path (Fonts/...) without url() or a leading slash.',
    severity: 'warning',
    autoFixAvailable: true,
    docAnchor: 'docs/gotchas#font-face-paths',
  },
  {
    id: 'C-06',
    title: 'CSS Filter (blur, drop-shadow) Elimination',
    category: 'css',
    precondition: 'filter: blur(...) or drop-shadow(...) declaration.',
    action: 'Flag error; CSS filter is not implemented in RmlUi renderer. Use procedural tiled-box decorator or Unreal PostProcess volume.',
    severity: 'error',
    autoFixAvailable: true,
    docAnchor: 'docs/rcss-matrix#what-is-not-here',
  },
  {
    id: 'C-07',
    title: 'Pseudo-elements (::before, ::after) Prohibition',
    category: 'css',
    precondition: 'Selectors containing ::before or ::after.',
    action: 'RmlUi does not support generated pseudo-elements. Replace with real DOM <span> or <div> elements.',
    severity: 'error',
    autoFixAvailable: false,
    docAnchor: 'docs/rcss-matrix#what-is-not-here',
  },
  {
    id: 'C-08',
    title: 'Layout Thrashing Animation Guard',
    category: 'css',
    precondition: 'CSS transition or animation on width, height, margin, padding, or top/left.',
    action: 'Warn per VaCuus Performance Guide: animating box layout causes full subtree reflow each frame. Use transform or opacity.',
    severity: 'warning',
    autoFixAvailable: false,
    docAnchor: 'docs/perf-guide#layout-thrashing',
  },
  {
    id: 'J-01',
    title: 'Storage & Network Subsystems Guard',
    category: 'js',
    precondition: 'Usage of localStorage, fetch, or window.alert.',
    action: 'Flag error, inject safe testing shims, recommend Unreal Engine C++ modules.',
    severity: 'error',
    autoFixAvailable: true,
    docAnchor: 'docs/javascript-runtime',
  },
  {
    id: 'H-05',
    title: 'Dedicated UI Mount Point (<div id="mount"/>)',
    category: 'html',
    precondition: 'Document envelope preparing for React/Preact/JS UI mounting.',
    action: 'Preserve empty dedicated <div id="mount"/> element. Never mount into <body> and never insert static children inside #mount.',
    severity: 'info',
    autoFixAvailable: true,
    docAnchor: 'docs/ai-guide#mount-point',
  },
  {
    id: 'C-09',
    title: 'Density-Independent Pixels (dp) Unit Support',
    category: 'css',
    precondition: 'Styles using dp units (e.g. margin: 24dp; font-size: 16dp).',
    action: 'Preserve dp units. VaCuus M5 supports dp as a native resolution-independent unit for game UI scaling.',
    severity: 'info',
    autoFixAvailable: false,
    docAnchor: 'docs/rcss-matrix#units-dp',
  },
  {
    id: 'C-10',
    title: 'Hardware-Accelerated Decorators (shader, linear-gradient)',
    category: 'css',
    precondition: 'Usage of decorator: linear-gradient(...) or decorator: shader(glass-panel).',
    action: 'Preserve supported native VaCuus decorator directives for gradients and explicit shader-based effects. Do not require decorator: shader(glass-panel) in the same selector as backdrop-filter: blur(...); that is a separate native scene-glass path in the pinned VaCuus 1.1.0 release.',
    severity: 'info',
    autoFixAvailable: false,
    docAnchor: 'docs/rcss-matrix#decorators',
  },
  {
    id: 'J-02',
    title: 'VaCuus M5 Native JavaScript API',
    category: 'js',
    precondition: 'Code using vacuus.model(name).get(prop), vacuus.translate(key, params), or vacuus.emit(event, data).',
    action: 'Recognize official VaCuus M5 runtime API for in-engine data models, string localization, and event dispatching.',
    severity: 'info',
    autoFixAvailable: false,
    docAnchor: 'docs/javascript-runtime#vacuus-api',
  },
  {
    id: 'L-01',
    title: 'Localization Dynamic Expansion Guard',
    category: 'css',
    precondition: 'Fixed width button or label holding text without flex-shrink or wrap.',
    action: 'Warn per VaCuus Localization Guide: translated strings (RU, DE) expand 30-50%. Avoid rigid width; use min-width.',
    severity: 'warning',
    autoFixAvailable: false,
    docAnchor: 'docs/localization#text-expansion',
  },
];

export interface KnowledgeGuideItem {
  id: string;
  title: string;
  category: string;
  summary: string;
  rules: string[];
  docUrl: string;
}

export const PERFORMANCE_GUIDELINES: KnowledgeGuideItem[] = [
  {
    id: 'PERF-01',
    title: 'DOM Element Budget Guidelines',
    category: 'Budgets',
    summary: 'Keep RmlUi element counts strictly budgeted according to screen type to maintain 60-120 FPS in Unreal Engine 5.',
    rules: [
      'Combat HUD & Reticle: Keep under 50-80 active elements.',
      'Complex Fullscreen Menus / Inventories: Keep under 250-300 elements.',
      'Eliminate redundant wrapping <div> tags; each level of depth increases layout pass duration.',
      'Use data-if to mount/unmount heavy subtrees instead of hiding with display: none.',
    ],
    docUrl: 'https://vacuus.ufna.dev/docs/perf-guide',
  },
  {
    id: 'PERF-02',
    title: 'Avoiding Layout Thrashing & Subtree Reflows',
    category: 'Rendering',
    summary: 'Layout properties force synchronous geometry recalculation across the entire RmlUi hierarchy.',
    rules: [
      'Never animate width, height, margin, padding, top, or left on tick.',
      'Animate transform: translate() or scale() which bypass layout recalculation.',
      'Batch dynamic property changes or update them via bound Unreal Engine data models.',
      'Color, background-color, and decorator updates are cheap visual passes and do not trigger layout reflow.',
    ],
    docUrl: 'https://vacuus.ufna.dev/docs/perf-guide',
  },
  {
    id: 'PERF-03',
    title: 'Texture Atlasing & Sliced Decorators',
    category: 'Draw Calls',
    summary: 'RmlUi draw calls scale with distinct texture assets. Minimize draw calls via texture atlasing.',
    rules: [
      'Bundle UI icons and HUD elements into a single spritesheet atlas.',
      'Use decorator: image(atlas.png box 0px 0px 64px 64px) to sample sub-rectangles.',
      'Use 9-slice decorators (tiled-box) for buttons and frames to allow arbitrary scaling with zero texture duplication.',
    ],
    docUrl: 'https://vacuus.ufna.dev/docs/perf-guide',
  },
  {
    id: 'PERF-04',
    title: 'Offscreen Layer Caching',
    category: 'Engine Integration',
    summary: 'Static UI backdrops and complex static panels can be cached to offscreen render targets.',
    rules: [
      'Separate rapidly updating HUD elements (ammo, health) from static panel backgrounds.',
      'Enable offscreen rendering in VaCuus component settings for complex static panels.',
    ],
    docUrl: 'https://vacuus.ufna.dev/docs/perf-guide',
  },
];

export const LOCALIZATION_GUIDELINES: KnowledgeGuideItem[] = [
  {
    id: 'LOC-01',
    title: 'Font Registration & Unicode Ranges',
    category: 'Typography',
    summary: 'RmlUi requires registered TTF/OTF fonts containing necessary glyph tables for every supported language.',
    rules: [
      'Always register fonts containing Cyrillic (U+0400 to U+04FF) for Russian / Ukrainian text.',
      'Register Latin Extended glyphs for German (Umlaute), Polish, French, and Spanish accents.',
      'Use only the bundled Onest, Tektur and JetBrains Mono families. Onest Regular (400) is the default; all supported static faces and licenses are included automatically in the export.',
      'Do not rely on browser/system font names; select a family known to be registered in the target VaCuus runtime.',
    ],
    docUrl: 'https://vacuus.ufna.dev/docs/localization',
  },
  {
    id: 'LOC-02',
    title: 'Text Expansion Buffer in Layout',
    category: 'Layout',
    summary: 'Translated strings frequently expand significantly compared to the original English text.',
    rules: [
      'Russian, German, and French translations average 30% to 50% longer string lengths.',
      'Never specify rigid fixed width: 100px on buttons or labels containing localized text.',
      'Use min-width combined with flex-grow or auto width and padding.',
      'Ensure white-space: normal or word-break: break-word when text wrapping is acceptable.',
    ],
    docUrl: 'https://vacuus.ufna.dev/docs/localization',
  },
  {
    id: 'LOC-03',
    title: 'Unreal Engine FText & String Tables',
    category: 'Engine Integration',
    summary: 'Bind localized game text directly through Unreal Engine String Tables and FText bindings.',
    rules: [
      'Do not hardcode user-facing strings into RML templates.',
      'Bind text nodes to data model properties fed by UE5 FText (e.g. data-value="Loc.StartGame").',
      'Use <rml lang="ru"> or <rml lang="en"> root attribute to set active language locale.',
    ],
    docUrl: 'https://vacuus.ufna.dev/docs/localization',
  },
];

export const AI_GUIDE_RULES: KnowledgeGuideItem[] = [
  {
    id: 'AI-01',
    title: 'Strict XML Document Model',
    category: 'RML Syntax',
    summary: 'RML is parsed strictly as XML, not lenient HTML5.',
    rules: [
      'All tags must be properly closed, including void elements (<img ... />, <input ... />, <br />).',
      'All attribute values must be enclosed in quotes.',
      'Ampersands (&) and special characters must be XML-escaped (&amp;, &lt;, &gt;).',
      'No DOCTYPE declarations in RML; the root envelope must be <rml>.',
    ],
    docUrl: 'https://vacuus.ufna.dev/docs/ai-guide',
  },
  {
    id: 'AI-02',
    title: 'Separation of Concerns & Clean Assets',
    category: 'Architecture',
    summary: 'Clean architecture splits structure, styles, and logic into standalone files for UE5 packaging.',
    rules: [
      'Never keep monolithic HTML with embedded <style> and <script> in production.',
      'Extract styles to .rcss and scripts to .js alongside the target .rml document.',
      'Include vacuus-base.rcss as the very first stylesheet link.',
      'Organize assets under Content/DevUI/<ScreenName>/<ScreenName>.[rml|rcss|js].',
    ],
    docUrl: 'https://vacuus.ufna.dev/docs/ai-guide',
  },
  {
    id: 'AI-03',
    title: 'Unreal Engine Viewport Input Routing',
    category: 'Input Routing',
    summary: 'Configure player controller input mode so both game world and UI react appropriately.',
    rules: [
      'Use FInputModeGameAndUI for interactive HUD menus.',
      'Use FInputModeGameOnly during active gameplay when RmlUi HUD is non-interactive.',
      'Ensure interactive elements have tabindex or appropriate event listeners.',
    ],
    docUrl: 'https://vacuus.ufna.dev/docs/ai-guide',
  },
];

