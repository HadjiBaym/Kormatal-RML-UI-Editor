import type { DiagnosticIssue, PseudoElementSpec, SvgRasterAsset } from './types.ts';
import { normalizeInlineFontStyle } from './ui-fonts.ts';
import {
  VOID_TAGS, parseHtmlTree, firstDescendant, directChild, descendants, collectText,
  getAttribute, locationAt, SUPPORTED_HTML_NAMED_ENTITY_NAMES, type HtmlNode, type HtmlAttribute,
} from './html-parser.ts';

export interface DataModelInfo {
  modelName: string;
  bindings: string[];
  collections: { name: string; alias: string; properties: string[] }[];
}

export interface HtmlConversionResult {
  rml: string;
  diagnostics: DiagnosticIssue[];
  metrics: {
    tagsProcessed: number;
    voidTagsClosed: number;
    unsupportedTagsEncountered: number;
  };
  dataModelInfo?: DataModelInfo;
  svgAssets: SvgRasterAsset[];
}

/**
 * Converts an HTML document or fragment into an RML envelope.
 *
 * Markup is tokenized and represented as a tree before diagnostics and serialization;
 * regular expressions are deliberately not used to find HTML elements because tag-like
 * text may occur in comments, attributes, scripts, and CSS. This is a pragmatic HTML
 * tokenizer/tree builder for UI source files, not a complete browser HTML5 tree builder.
 * It handles quoted attributes, comments, void elements, raw-text script/style blocks,
 * matching end tags, and common optional closing tags.
 */
export function convertHtmlToRml(
  htmlContent: string,
  filename: string = 'index.html',
  options: {
    includeVacuusBase?: boolean;
    targetRcssName?: string;
    targetJsName?: string;
    pseudoElements?: PseudoElementSpec[];
    registeredFontFamilies?: ReadonlySet<string>;
  } = {},
): HtmlConversionResult {
  const diagnostics: DiagnosticIssue[] = [];
  let diagSeq = 0;
  let tagsProcessed = 0;
  let voidTagsClosed = 0;
  let unsupportedTagsEncountered = 0;

  const targetRcss = options.targetRcssName || 'mainui.rcss';
  const targetJs = options.targetJsName || 'mainui.js';
  const includeBase = options.includeVacuusBase !== false;
  const documentTree = parseHtmlTree(htmlContent);
  injectPseudoElements(documentTree, options.pseudoElements || []);

  // This dependency-free parser intentionally supports a limited named-entity table.
  // Diagnose visible text that would otherwise be serialized as a literal entity.
  const reportedEntities = new Set<string>();
  for (const node of descendants(documentTree.children)) {
    if (node.type !== 'text' || !node.value || ['script', 'style'].includes(node.parent?.name || '')) continue;
    const rawText = htmlContent.slice(node.start, node.end);
    const pattern = /&([a-z][a-z0-9]+);/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(rawText)) !== null) {
      const name = match[1].toLowerCase();
      if (SUPPORTED_HTML_NAMED_ENTITY_NAMES.has(name)) continue;
      const sourceOffset = node.start + match.index;
      const key = `${name}:${sourceOffset}`;
      if (reportedEntities.has(key)) continue;
      reportedEntities.add(key);
      const loc = locationAt(htmlContent, sourceOffset);
      pushDiagnostic({
        idPrefix: `html-unknown-entity-${loc.line}-${name}`, severity: 'warning', category: 'html', ...loc,
        originalSnippet: match[0],
        message: `Named HTML entity "&${name};" is not in the converter's supported entity table.`,
        impact: 'The entity may appear literally instead of displaying its intended character in generated RML.',
        autoFixAvailable: false, fixed: false,
        recommendedAction: 'Replace it with a numeric character reference (for example, &#8212;) or a literal Unicode character, then reconvert.',
        docRef: 'docs/html-parser.md#known-limitations',
      });
    }
  }
  const htmlNode = firstDescendant(documentTree, node => node.type === 'element' && node.name === 'html');
  const headNode = htmlNode ? directChild(htmlNode, 'head') : directChild(documentTree, 'head');
  const explicitBody = htmlNode ? directChild(htmlNode, 'body') : directChild(documentTree, 'body');
  const bodyAttributes = (explicitBody?.attrs ?? []).map(attr => attr.name.toLowerCase() === 'style' ? { ...attr, value: normalizeInlineFontStyle(attr.value, options.registeredFontFamilies) } : attr);
  const bodyChildren = explicitBody
    ? explicitBody.children
    : htmlNode
      ? htmlNode.children.filter(node => node !== headNode && node.type !== 'doctype')
      : documentTree.children.filter(node => node !== headNode && node.type !== 'doctype' && !(node.type === 'element' && node.name === 'html'));

  const titleNode = headNode ? firstDescendant(headNode, node => node.type === 'element' && node.name === 'title')
    : firstDescendant(documentTree, node => node.type === 'element' && node.name === 'title');
  const extractedTitle = titleNode ? collectText(titleNode).trim() : '';
  const docTitle = extractedTitle || 'VaCuus UI Screen';

  const allBodyElements = descendants(bodyChildren).filter(node => node.type === 'element');
  tagsProcessed = allBodyElements.length;

  function pushDiagnostic(issue: Omit<DiagnosticIssue, 'id' | 'file'> & { idPrefix: string }): void {
    const { idPrefix, ...rest } = issue;
    diagSeq += 1;
    diagnostics.push({ id: `${idPrefix}-${diagSeq}`, file: filename, ...rest });
  }

  for (const warning of documentTree.parseWarnings || []) {
    const loc = locationAt(htmlContent, warning.start);
    pushDiagnostic({
      idPrefix: `html-mismatched-end-tag-${loc.line}`, severity: 'warning', category: 'html', ...loc,
      originalSnippet: `</${warning.name}>`,
      message: warning.message,
      impact: 'Malformed closing tags can otherwise detach UI nodes from their intended positioned parent and radically change layout.',
      autoFixAvailable: false, fixed: false,
      recommendedAction: 'Fix the source HTML nesting, then convert again. The converter preserves the surrounding UI tree instead of closing an unrelated ancestor.',
      docRef: 'docs/html-parser.md#html-recovery',
    });
  }

  if (documentTree.children.some(node => node.type === 'doctype')) {
    pushDiagnostic({
      idPrefix: 'html-doctype', severity: 'info', category: 'html', line: 1, column: 1,
      originalSnippet: '<!DOCTYPE html>',
      message: 'HTML5 DOCTYPE is stripped because RML uses an <rml> document envelope.',
      impact: 'The output document uses <rml> as its root element instead of an HTML document declaration.',
      autoFixAvailable: true, autoFixDescription: 'Omitted the DOCTYPE and generated the <rml> envelope.',
      fixed: true, recommendedAction: 'No action needed; the RML envelope is generated automatically.',
    });
  }

  const unsupportedTags = new Map<string, { message: string; action: string }>([
    ['video', { message: 'HTML5 <video> is not supported by RmlUi core.', action: 'Render video through Unreal Media Player / UMediaTexture on an in-game quad or material.' }],
    ['audio', { message: 'HTML5 <audio> is not supported by RmlUi core.', action: 'Trigger audio through Unreal Engine Audio System / MetaSounds.' }],
    ['canvas', { message: 'HTML5 <canvas> 2D/WebGL context is not supported in RmlUi.', action: 'Render procedural graphics through Unreal render targets or a custom renderer.' }],
    ['iframe', { message: 'HTML5 <iframe> is not supported by RmlUi.', action: 'Decompose sub-screens into separate RML documents or a supported include/template mechanism.' }],
    ['table', { message: 'HTML <table> layout has no browser-equivalent table layout in RmlUi.', action: 'Convert the table into flex/positioned containers with explicit row and column rules.' }],
  ]);

  for (const node of allBodyElements) {
    const unsupported = unsupportedTags.get(node.name || '');
    if (unsupported) {
      unsupportedTagsEncountered += 1;
      const loc = locationAt(htmlContent, node.start);
      const tag = node.name || 'unknown';
      pushDiagnostic({
        idPrefix: `html-${tag}-${loc.line}`, severity: 'error', category: 'html', ...loc,
        originalSnippet: htmlContent.slice(node.start, Math.min(node.end, node.start + 60)),
        message: unsupported.message,
        impact: `Elements of type <${tag}> need a native Unreal implementation or explicit conversion before they can render correctly.`,
        autoFixAvailable: false, fixed: false, recommendedAction: unsupported.action,
      });
    }

    if (node.name === 'svg') {
      const loc = locationAt(htmlContent, node.start);
      pushDiagnostic({
        idPrefix: `html-svg-${loc.line}`, severity: 'info', category: 'html', ...loc,
        originalSnippet: htmlContent.slice(node.start, Math.min(node.end, node.start + 60)) + '…',
        message: 'Inline SVG icon detected and converted to a generated PNG asset reference.',
        impact: 'The SVG DOM is not emitted as unsupported inline vector markup; the ZIP exporter rasterizes the sanitized SVG and bundles the PNG under Content/DevUI/Assets.',
        autoFixAvailable: true,
        autoFixDescription: 'Generated an img node and a rasterization asset record.',
        fixed: true,
        recommendedAction: 'Export the full ZIP so SVG assets are rasterized and included. Verify the generated PNGs are present under Content/DevUI/Assets.',
        docRef: 'docs/rml-elements-registry.md#svg',
      });
    }

    const attrs = node.attrs || [];
    for (const attr of attrs) {
      if (/^on[a-z]+$/i.test(attr.name)) {
        const loc = locationAt(htmlContent, node.start);
        pushDiagnostic({
          idPrefix: `html-inline-${attr.name}-${loc.line}`, severity: 'manual-fix', category: 'html', ...loc,
          originalSnippet: `${attr.name}="${attr.value.slice(0, 48)}"`,
          message: `Inline event handler "${attr.name}" detected.`,
          impact: 'Inline browser event evaluation may not work in the VaCuus JavaScript runtime.',
          autoFixAvailable: false, fixed: false,
          recommendedAction: `Move the handler into the screen JavaScript file and register it with addEventListener for the target element.`,
        });
      }
    }
  }

  const bodyAllNodes = descendants(bodyChildren);
  const detectedDataModelName = getAttribute(explicitBody, 'data-model') || getAttribute(htmlNode, 'data-model') || allBodyElements.map(node => getAttribute(node, 'data-model')).find(Boolean) || '';
  if (detectedDataModelName) {
    pushDiagnostic({
      idPrefix: 'html-data-model', severity: 'info', category: 'html', line: 1, column: 1,
      originalSnippet: `data-model="${detectedDataModelName}"`,
      message: `DATA MODEL DETECTED: Document binds to data model "${detectedDataModelName}". Register it before LoadDocument().`,
      impact: 'VaCuus resolves data-model when the document is attached; a model registered afterwards will not satisfy these bindings.',
      autoFixAvailable: true,
      autoFixDescription: `Documented the required registration order for model "${detectedDataModelName}".`,
      fixed: true,
      recommendedAction: `Register data model "${detectedDataModelName}" before calling LoadDocument().`,
      docRef: 'docs/conversion-rules.md#rule-h-04',
    });
  }

  const sourceForBindings = bodyAllNodes.map(node => {
    if (node.type === 'text') return node.value || '';
    if (node.type === 'element') return (node.attrs || []).map(attr => attr.value).join(' ');
    return '';
  }).join('\n');
  const detectedBindings = new Set<string>();
  const bindingRegex = /\{\{\s*([a-zA-Z0-9_\.]+)\s*\}\}/g;
  let bindingMatch: RegExpExecArray | null;
  while ((bindingMatch = bindingRegex.exec(sourceForBindings)) !== null) detectedBindings.add(bindingMatch[1]);

  const detectedCollections: { name: string; alias: string; properties: string[] }[] = [];
  for (const node of allBodyElements) {
    const dataFor = getAttribute(node, 'data-for');
    if (!dataFor) continue;
    const match = /^\s*([a-zA-Z_][\w]*)\s*:\s*([a-zA-Z_][\w]*)\s*$/.exec(dataFor);
    if (!match) continue;
    const [, alias, name] = match;
    const properties = new Set<string>();
    const propPattern = new RegExp(`\\b${escapeRegExp(alias)}\\.([a-zA-Z_][\\w]*)\\b`, 'g');
    let propMatch: RegExpExecArray | null;
    while ((propMatch = propPattern.exec(sourceForBindings)) !== null) properties.add(propMatch[1]);
    detectedCollections.push({ name, alias, properties: [...properties] });

    if (alias === 't') {
      const loc = locationAt(htmlContent, node.start);
      pushDiagnostic({
        idPrefix: `html-data-for-alias-${loc.line}`, severity: 'error', category: 'html', ...loc,
        originalSnippet: `data-for="${dataFor}"`,
        message: 'CRITICAL GOTCHA: data-for iterator alias cannot equal "t". VaCuus reserves "t" for translation data, so the loop may print a field name instead of its value.',
        impact: 'The collection row may show the property name instead of the actual data.',
        autoFixAvailable: true, autoFixDescription: 'Rename the loop iterator to "item".', fixed: false,
        recommendedAction: 'Use an alias such as data-for="item : Items".', docRef: 'setup.md#binding-and-input-rules',
      });
    }
  }

  const hasMountDiv = allBodyElements.some(node => node.name === 'div' && getAttribute(node, 'id') === 'mount');
  if (hasMountDiv) {
    pushDiagnostic({
      idPrefix: 'html-preact-mount', severity: 'info', category: 'html', line: 1, column: 1,
      originalSnippet: '<div id="mount">',
      message: 'Dedicated #mount container detected.',
      impact: 'A compiled UI bundle can mount into this node if its runtime expects this convention.',
      autoFixAvailable: true, autoFixDescription: 'Preserved the empty mount node when present.', fixed: true,
      recommendedAction: 'Keep the mount node empty if the JS bundle owns its children.',
    });
  }

  if (tagsProcessed > 200) {
    pushDiagnostic({
      idPrefix: 'html-perf-element-budget', severity: 'warning', category: 'html', line: 1, column: 1,
      originalSnippet: `<document: ${tagsProcessed} elements>`,
      message: `High HTML element count detected (${tagsProcessed}). Review the VaCuus element budget for this screen type.`,
      impact: 'Large UI trees can increase layout and update costs; runtime profiling is required to quantify this document.',
      autoFixAvailable: false, fixed: false,
      recommendedAction: 'Remove redundant wrappers, cap dynamic lists, and profile before claiming a performance issue.',
      docRef: 'perf-guide.md#element-budgets',
    });
  }

  const visibleText = bodyAllNodes.filter(node => node.type === 'text').map(node => node.value || '').join(' ');
  const hasCyrillicOrExtended = /[\u0400-\u04FF\u00C0-\u024F]/.test(visibleText);
  const htmlLang = getAttribute(htmlNode, 'lang') || getAttribute(documentTree, 'lang') || '';
  const rmlLang = getAttribute(firstDescendant(documentTree, node => node.type === 'element' && node.name === 'rml'), 'lang') || '';
  if (hasCyrillicOrExtended && !htmlLang && !rmlLang) {
    pushDiagnostic({
      idPrefix: 'html-localization-font', severity: 'info', category: 'html', line: 1, column: 1,
      originalSnippet: 'Localized / non-ASCII text content detected',
      message: 'Localized text detected. Verify that the loaded font contains all required Unicode glyphs.',
      impact: 'Missing font glyphs may render as boxes or blank spaces in the UE5 viewport.',
      autoFixAvailable: false, fixed: false,
      recommendedAction: 'Provide a font with the required glyph ranges (including Cyrillic where needed) and verify it in the target VaCuus build.',
      docRef: 'localization.md#font-glyph-ranges',
    });
  }

  // Emoji are frequently absent from bundled UI fonts and appear as tofu boxes in
  // VaCuus even when ordinary Latin/Cyrillic text is fine. Flag them separately so
  // iconography can be rasterized/bundled instead of silently disappearing.
  const emojiTextNode = bodyAllNodes.find(node => node.type === 'text' && /\p{Extended_Pictographic}/u.test(node.value || ''));
  if (emojiTextNode) {
    const emojiSample = [...(emojiTextNode.value || '').matchAll(/\p{Extended_Pictographic}/gu)].slice(0, 4).map(match => match[0]).join(' ');
    const loc = locationAt(htmlContent, emojiTextNode.start);
    pushDiagnostic({
      idPrefix: `html-emoji-glyph-${loc.line}`, severity: 'warning', category: 'html', ...loc,
      originalSnippet: emojiSample || 'emoji glyph',
      message: 'Emoji glyph detected in visible text. Bundled VaCuus fonts may not contain color-emoji glyphs, which can render as empty boxes.',
      impact: 'The emoji may be missing or display as a tofu square, even while surrounding text renders correctly.',
      autoFixAvailable: false, fixed: false,
      recommendedAction: 'Replace decorative emoji with a packaged PNG/SVG-raster icon or a verified monochrome icon font; do not rely on OS emoji fonts in a packaged UE5 build.',
      docRef: 'localization.md#font-glyph-ranges',
    });
  }

  const svgAssets: SvgRasterAsset[] = [];
  const serializedBody = bodyChildren.map(node => serializeNode(node, () => { voidTagsClosed += 1; }, svgAssets, options)).join('');
  const bodyAttrsText = serializeAttributes(bodyAttributes);
  const rmlParts: string[] = [
    '<rml>',
    '  <head>',
    `    <title>${escapeXml(docTitle)}</title>`,
  ];
  if (includeBase) {
    rmlParts.push('    <!-- VaCuus base reset stylesheet must be linked before screen styles -->');
    rmlParts.push('    <link type="text/rcss" href="vacuus-base.rcss"/>');
  }
  rmlParts.push(`    <link type="text/rcss" href="${escapeXml(targetRcss)}"/>`);
  rmlParts.push(`    <script src="${escapeXml(targetJs)}"></script>`);
  rmlParts.push('  </head>');
  rmlParts.push(bodyAttrsText ? `  <body${bodyAttrsText}>` : '  <body>');
  const indentedBody = serializedBody.trim();
  rmlParts.push(indentedBody ? `    ${indentedBody}` : '    <div id="root"></div>');
  rmlParts.push('  </body>');
  rmlParts.push('</rml>');

  return {
    rml: rmlParts.join('\n'),
    diagnostics,
    metrics: { tagsProcessed, voidTagsClosed, unsupportedTagsEncountered },
    svgAssets,
    dataModelInfo: detectedDataModelName || detectedBindings.size > 0 || detectedCollections.length > 0
      ? { modelName: detectedDataModelName, bindings: [...detectedBindings], collections: detectedCollections }
      : undefined,
  };
}

function serializeNode(
  node: HtmlNode,
  onVoidTagClosed: () => void,
  svgAssets: SvgRasterAsset[],
  options: { registeredFontFamilies?: ReadonlySet<string> } = {},
): string {
  if (node.type === 'doctype') return '';
  if (node.type === 'comment') {
    const content = (node.value || '').replace(/--/g, '- -').replace(/-$/g, '- ');
    return `<!--${content}-->`;
  }
  if (node.type === 'text') {
    const value = node.value || '';
    const parent = node.parent;
    const mixedContentParent = parent?.type === 'element' && parent.children.some(child => child.type === 'element');
    // RmlUi does not synthesize browser anonymous flex items for raw mixed text.
    // Explicitly wrap non-whitespace text when the parent also has element children.
    if (value.trim() && mixedContentParent && !['script', 'style', 'textarea', 'title'].includes(parent?.name || '')) {
      return `<span class="vacuus-text-run">${escapeXml(value)}</span>`;
    }
    return escapeXml(value);
  }
  if (node.type !== 'element') return node.children.map(child => serializeNode(child, onVoidTagClosed, svgAssets, options)).join('');

  const name = node.name || 'div';
  // JS is bundled into one generated screen script by project-converter.ts. Do not
  // leak source <script src> paths into RML (they are document-relative and may not
  // exist in the output package); missing input JS references are reported as diagnostics.
  if (name === 'script') return '';
  if (name === 'svg') {
    const filename = `inline-svg-${String(svgAssets.length + 1).padStart(3, '0')}.png`;
    const dimensions = getSvgRasterDimensions(node);
    const sourceSvg = serializeSvgNode(node, dimensions);
    const altText = getAttribute(node, 'aria-label') || getAttribute(node, 'title') || 'Converted vector icon';
    svgAssets.push({
      filename, sourceSvg, width: dimensions.width, height: dimensions.height, altText,
      elementClasses: getAttribute(node, 'class').split(/\s+/).filter(Boolean),
      parentClasses: getAttribute(node.parent, 'class').split(/\s+/).filter(Boolean),
      elementId: getAttribute(node, 'id') || undefined,
    });

    const originalClass = getAttribute(node, 'class').trim();
    const attrs: HtmlAttribute[] = [
      { name: 'src', value: `../Assets/${filename}`, hasValue: true },
      { name: 'class', value: `${originalClass ? `${originalClass} ` : ''}vacuus-svg-raster`, hasValue: true },
      { name: 'alt', value: altText, hasValue: true },
    ];
    const id = getAttribute(node, 'id');
    if (id) attrs.push({ name: 'id', value: id, hasValue: true });
    return `<img${serializeAttributes(attrs)} />`;
  }

  const attrs = serializeAttributes((node.attrs || []).map(attr => attr.name.toLowerCase() === 'style' ? { ...attr, value: normalizeInlineFontStyle(attr.value, options.registeredFontFamilies) } : attr));
  if (VOID_TAGS.has(name)) {
    if (!node.selfClosingSyntax) onVoidTagClosed();
    return `<${name}${attrs} />`;
  }
  return `<${name}${attrs}>${node.children.map(child => serializeNode(child, onVoidTagClosed, svgAssets, options)).join('')}</${name}>`;
}

function injectPseudoElements(documentTree: HtmlNode, specs: PseudoElementSpec[]): void {
  if (!specs.length) return;
  const elements = descendants(documentTree.children).filter((node): node is HtmlNode => node.type === 'element');
  for (const spec of specs) {
    for (const target of elements) {
      if (!matchesPseudoTarget(target, spec.targetSelector)) continue;
      const existing = target.children.some(child => child.type === 'element' && getAttribute(child, 'class').split(/\s+/).includes(spec.className));
      if (existing) continue;
      const helper: HtmlNode = {
        type: 'element', name: 'span',
        attrs: [
          { name: 'class', value: `${spec.className} vacuus-pseudo-helper`, hasValue: true },
          { name: 'aria-hidden', value: 'true', hasValue: true },
        ],
        children: [], parent: target, start: target.start, end: target.start,
      };
      if (spec.contentText) helper.children.push({
        type: 'text', value: spec.contentText, children: [], parent: helper, start: target.start, end: target.start,
      });
      if (spec.position === 'before') target.children.unshift(helper);
      else target.children.push(helper);
    }
  }
}

function matchesPseudoTarget(node: HtmlNode, selector: string): boolean {
  const normalized = selector.trim();
  // An adjacent-sibling selector's pseudo-element belongs to its right-hand
  // element (e.g. .quick + .quick::before is a child of the second .quick).
  const adjacent = normalized.match(/^(.*?)(?:\s*)\+(?:\s*)([^+>~]+)$/);
  if (adjacent) {
    const [, previousSelector, currentSelector] = adjacent;
    if (!matchesSelectorCompound(node, currentSelector.trim())) return false;
    const elementSiblings = (node.parent?.children || []).filter((child): child is HtmlNode => child.type === 'element');
    const index = elementSiblings.indexOf(node);
    if (index <= 0 || !matchesSelectorCompound(elementSiblings[index - 1], previousSelector.trim())) return false;
    return true;
  }
  const tokens = normalized.replace(/\s*>\s*/g, ' > ').split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  let current: HtmlNode | undefined = node;
  let index = tokens.length - 1;
  if (!current) return false;
  if (!matchesSelectorCompound(current, tokens[index])) return false;
  while (index > 0) {
    if (!current) return false;
    index--;
    if (tokens[index] === '>') {
      index--;
      if (index < 0 || !current.parent || !matchesSelectorCompound(current.parent, tokens[index])) return false;
      current = current.parent;
    } else {
      const wanted = tokens[index];
      let ancestor: HtmlNode | undefined = current.parent;
      while (ancestor && !matchesSelectorCompound(ancestor, wanted)) ancestor = ancestor.parent;
      if (!ancestor) return false;
      current = ancestor;
    }
  }
  return true;
}

function matchesSelectorCompound(node: HtmlNode | undefined, compound: string): boolean {
  if (!node || node.type !== 'element') return false;
  const tagMatch = compound.match(/^([a-zA-Z][\w-]*|\*)/);
  if (tagMatch && tagMatch[1] !== '*' && node.name !== tagMatch[1].toLowerCase()) return false;
  const idMatch = compound.match(/#([\w-]+)/);
  if (idMatch && getAttribute(node, 'id') !== idMatch[1]) return false;
  const requiredClasses = [...compound.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
  const nodeClasses = getAttribute(node, 'class').split(/\s+/).filter(Boolean);
  if (requiredClasses.some(name => !nodeClasses.includes(name))) return false;
  // Structural pseudo-classes affect which source nodes actually receive a helper.
  // Dynamic state pseudo-classes are ignored because the helper exists permanently,
  // while its RCSS selector keeps :hover/:active/:focus and controls its visibility.
  const elementSiblings = (node.parent?.children || []).filter(child => child.type === 'element');
  if (/:first-child\b/i.test(compound) && elementSiblings[0] !== node) return false;
  if (/:last-child\b/i.test(compound) && elementSiblings[elementSiblings.length - 1] !== node) return false;
  let residue = compound.replace(/^([a-zA-Z][\w-]*|\*)/, '').replace(/#[\w-]+/g, '').replace(/\.[\w-]+/g, '');
  residue = residue.replace(/:(?:hover|active|focus-visible|focus|disabled|enabled)\b/g, '');
  residue = residue.replace(/:(?:first-child|last-child)\b/gi, '');
  return residue.length === 0;
}

const SVG_ATTRIBUTE_NAMES: Record<string, string> = {
  viewbox: 'viewBox', preserveaspectratio: 'preserveAspectRatio', gradientunits: 'gradientUnits',
  gradienttransform: 'gradientTransform', patternunits: 'patternUnits', patterncontentunits: 'patternContentUnits',
  markerwidth: 'markerWidth', markerheight: 'markerHeight', refx: 'refX', refy: 'refY',
  strokewidth: 'strokeWidth', strokelinecap: 'strokeLinecap', strokelinejoin: 'strokeLinejoin',
  strokeopacity: 'strokeOpacity', fillopacity: 'fillOpacity', fillrule: 'fillRule', cliprule: 'clipRule',
  clippathunits: 'clipPathUnits', maskunits: 'maskUnits', maskcontentunits: 'maskContentUnits',
  textlength: 'textLength', lengthadjust: 'lengthAdjust', startoffset: 'startOffset', fontfamily: 'fontFamily',
  fontsize: 'fontSize', dominantbaseline: 'dominantBaseline', alignmentbaseline: 'alignmentBaseline',
};

function serializeSvgNode(node: HtmlNode, dimensions: { width: number; height: number }): string {
  const attrs = [...(node.attrs || [])];
  if (!attrs.some(attr => attr.name.toLowerCase() === 'xmlns')) {
    attrs.unshift({ name: 'xmlns', value: 'http://www.w3.org/2000/svg', hasValue: true });
  }
  if (!attrs.some(attr => attr.name.toLowerCase() === 'width')) {
    attrs.push({ name: 'width', value: String(dimensions.width), hasValue: true });
  }
  if (!attrs.some(attr => attr.name.toLowerCase() === 'height')) {
    attrs.push({ name: 'height', value: String(dimensions.height), hasValue: true });
  }
  const attrText = attrs.map(attr => ` ${SVG_ATTRIBUTE_NAMES[attr.name.toLowerCase()] || attr.name}="${escapeXml(attr.value)}"`).join('');
  const children = node.children.map(child => serializeSvgChild(child)).join('');
  return `<svg${attrText}>${children}</svg>`;
}

function serializeSvgChild(node: HtmlNode): string {
  // Preserve the SVG's own text nodes exactly as SVG text; UI mixed-content wrappers
  // are only valid in the outer RML tree and must never be injected into SVG assets.
  if (node.type === 'text') return escapeXml(node.value || '');
  if (node.type === 'comment') return `<!--${(node.value || '').replace(/--/g, '- -')}-->`;
  if (node.type !== 'element') return node.children.map(serializeSvgChild).join('');
  const name = node.name || 'g';
  const attrs = (node.attrs || []).map(attr => ` ${SVG_ATTRIBUTE_NAMES[attr.name.toLowerCase()] || attr.name}="${escapeXml(attr.value)}"`).join('');
  return `<${name}${attrs}>${node.children.map(serializeSvgChild).join('')}</${name}>`;
}

function getSvgRasterDimensions(node: HtmlNode): { width: number; height: number } {
  const viewBox = getAttribute(node, 'viewbox').trim().split(/[ ,]+/).map(Number);
  const viewWidth = viewBox.length === 4 && Number.isFinite(viewBox[2]) && viewBox[2] > 0 ? viewBox[2] : 24;
  const viewHeight = viewBox.length === 4 && Number.isFinite(viewBox[3]) && viewBox[3] > 0 ? viewBox[3] : 24;
  const parseDimension = (value: string) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };
  const baseWidth = parseDimension(getAttribute(node, 'width')) || viewWidth;
  const baseHeight = parseDimension(getAttribute(node, 'height')) || viewHeight;
  const scale = Math.min(4, 512 / Math.max(baseWidth, baseHeight));
  return { width: Math.max(1, Math.round(baseWidth * scale)), height: Math.max(1, Math.round(baseHeight * scale)) };
}

function serializeAttributes(attrs: HtmlAttribute[]): string {
  return attrs.map(attr => ` ${attr.name}="${escapeXml(attr.hasValue ? attr.value : '')}"`).join('');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
