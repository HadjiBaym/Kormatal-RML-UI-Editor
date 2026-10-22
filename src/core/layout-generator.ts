import { RCSS_PROPERTY_CATALOG } from './rcss-matrix.ts';
import { VACUUS_RCSS_PROPERTIES } from './vacuus-1.1.0-ue5.8-profile.ts';

/**
 * Layout IR and deterministic source generators for Figma SVG/JSON exports.
 * This module intentionally avoids React/browser APIs so geometry and serialization
 * remain deterministic and can be regression-tested independently.
 */

export type LayoutNodeKind = 'container' | 'text' | 'shape' | 'line' | 'raster';
export type LayoutShape = 'rect' | 'ellipse' | 'line';
export type LayoutInteraction = 'none' | 'button' | 'toggle' | 'tab';

export interface LayoutNode {
  id: string;
  parentId?: string;
  layoutMode?: 'none' | 'horizontal' | 'vertical';
  layoutItemSpacing?: number;
  layoutPaddingTop?: number;
  layoutPaddingRight?: number;
  layoutPaddingBottom?: number;
  layoutPaddingLeft?: number;
  layoutJustifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between';
  layoutAlignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';
  layoutWrap?: boolean;
  layoutPositioning?: 'absolute' | 'flow';
  layoutGrow?: number;
  layoutSizingHorizontal?: 'fixed' | 'hug' | 'fill';
  layoutSizingVertical?: 'fixed' | 'hug' | 'fill';
  clipContent?: boolean;
  name: string;
  kind: LayoutNodeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  opacity?: number;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  rotation?: number;
  confidence?: number;
  sourceType?: string;
  rasterSvg?: string;
  assetPath?: string;
  /** Embedded PNG from the Figma layout exporter; packaged under Assets during generation. */
  assetContentBase64?: string;
  assetMimeType?: 'image/png';
  /** Figma BACKGROUND_BLUR mapped to VaCuus backdrop-filter: blur(...). */
  backdropBlur?: number;
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: 'uppercase' | 'lowercase' | 'capitalize';
  textDecoration?: 'underline';
  visible?: boolean;
  /** Explicit/inferred UI behavior. Clicks emit a VaCuus event; real game actions must be bound in UE. */
  interaction?: LayoutInteraction;
  actionName?: string;
}

export interface LayoutDocument {
  name: string;
  width: number;
  height: number;
  backgroundColor?: string;
  layoutMode?: 'none' | 'horizontal' | 'vertical';
  layoutItemSpacing?: number;
  layoutPaddingTop?: number;
  layoutPaddingRight?: number;
  layoutPaddingBottom?: number;
  layoutPaddingLeft?: number;
  layoutJustifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between';
  layoutAlignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';
  layoutWrap?: boolean;
  clipContent?: boolean;
  sourceKind: 'svg' | 'figma-json' | 'png';
  nodes: LayoutNode[];
  diagnostics: string[];
  /** Allows a screenshot-only workspace to start empty for manual reconstruction when no local vision model is enabled. */
  manualReconstructionStarter?: boolean;
}

export interface GeneratedLayoutSources {
  rml: string;
  rcss: string;
  js: string;
  report: string;
  diagnostics: string[];
}

export interface GeneratedReferenceSources {
  rml: string;
  rcss: string;
  js: string;
  diagnostics: string[];
}

export interface GeneratedLayoutArtifact {
  path: string;
  content: string;
  contentEncoding?: 'text' | 'base64';
}

export interface GeneratedLayoutBundleValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checkedReferences: number;
}


export interface LayoutPipelineStep {
  title: string;
  description: string;
}
export interface LayoutSourcePipeline {
  title: string;
  summary: string;
  steps: [LayoutPipelineStep, LayoutPipelineStep, LayoutPipelineStep, LayoutPipelineStep];
}

/** Single source of truth for explaining how each input format becomes RML/RCSS. */
export function getLayoutSourcePipeline(sourceKind: LayoutDocument['sourceKind']): LayoutSourcePipeline {
  if (sourceKind === 'svg') return {
    title: 'SVG: векторная геометрия → Layout IR',
    summary: 'AI не нужен: конвертер читает структуру SVG локально, без обращения к модели.',
    steps: [
      { title: '1 · Чтение SVG', description: 'Считываются viewBox, координаты, transform, текст, заливки, обводки и поддерживаемые геометрические элементы.' },
      { title: '2 · Построение Layout IR', description: 'Каждая распознанная фигура или текст становится узлом. Path/polygon и сложные фильтры могут быть вынесены в PNG-ресурсы или отмечены диагностикой.' },
      { title: '3 · Генерация RML + RCSS', description: 'RML создаёт элементы; RCSS задаёт размеры, цвета и координаты. Flex не выводится из визуального вида SVG без явной структуры раскладки.' },
      { title: '4 · Проверка', description: 'Просмотрите предупреждения об эффектах, внешних ресурсах и элементах, которые пришлось растрировать.' },
    ],
  };
  if (sourceKind === 'figma-json') return {
    title: 'Figma JSON: дерево слоёв → Layout IR',
    summary: 'AI не нужен: JSON уже содержит геометрию и иерархию, если экспорт включал document/children.',
    steps: [
      { title: '1 · Чтение слоёв', description: 'Считываются выбранный Frame, границы, тексты, цвета, вложенность Frame/Component и параметры Auto Layout.' },
      { title: '2 · Восстановление дерева', description: 'Вложенные слои связываются с родителями, координаты переводятся в локальные, horizontal/vertical Auto Layout сохраняется.' },
      { title: '3 · Генерация RML + RCSS', description: 'Контейнеры становятся вложенными RML-узлами. RCSS использует Flex при наличии Auto Layout; прочие элементы сохраняют координатное позиционирование.' },
      { title: '4 · Проверка', description: 'Grid, градиенты, маски, эффекты и режимы заливки без прямого аналога показываются в диагностике и могут требовать ручной правки.' },
    ],
  };
  return {
    title: 'PNG: пиксели → предполагаемые UI-элементы → Layout IR',
    summary: 'PNG не содержит слоёв или DOM. AI необязателен: без модели изображение служит подложкой для ручной разметки.',
    steps: [
      { title: '1 · Чтение изображения', description: 'Без AI загружается только bitmap-подложка. Выбранная локальная vision-модель может оценить панели, текст, кнопки, границы и цвета.' },
      { title: '2 · Черновое дерево', description: 'AI возвращает предполагаемые элементы с координатами и уверенностью — это оценка, а не восстановление исходной структуры Figma.' },
      { title: '3 · Генерация RML + RCSS', description: 'Каждый слой преобразуется в RML-элемент и RCSS-правило. По PNG нельзя достоверно восстановить Auto Layout, скрытые элементы или интерактивные состояния.' },
      { title: '4 · Ручная проверка', description: 'Сверьте рамки с изображением и исправьте текст/размеры. Без AI создайте панели, текст, фигуры и линии вручную.' },
    ],
  };
}

const MAX_LAYOUT_NODES = 400;
const MAX_DIMENSION = 16384;
const round = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Creates an editable blank Layout IR while retaining an uploaded screenshot as the reference image. */
export function createImageReferenceStarter(width: number, height: number, name = 'GeneratedLayout'): LayoutDocument {
  const safeWidth = clamp(Math.round(Number.isFinite(width) ? width : 1920), 1, MAX_DIMENSION);
  const safeHeight = clamp(Math.round(Number.isFinite(height) ? height : 1080), 1, MAX_DIMENSION);
  return {
    name: name.replace(/\.[^.]+$/, '') || 'GeneratedLayout',
    width: safeWidth,
    height: safeHeight,
    sourceKind: 'png',
    nodes: [],
    manualReconstructionStarter: true,
    diagnostics: [
      'Скриншот сохранён как визуальный эталон. Локальный vision-анализ отключён, поэтому структура элементов не распознана автоматически.',
      'Добавьте слои в панели «Слои» или включите локальную vision-модель для автоматической черновой реконструкции.',
    ],
  };
}

function decodeXml(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (all, entity: string) => {
    const key = entity.toLowerCase();
    if (key === 'amp') return '&';
    if (key === 'lt') return '<';
    if (key === 'gt') return '>';
    if (key === 'quot') return '"';
    if (key === 'apos') return "'";
    if (key.startsWith('#x')) { const code = parseInt(key.slice(2), 16); return code >= 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : all; }
    if (key.startsWith('#')) { const code = parseInt(key.slice(1), 10); return code >= 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : all; }
    return all;
  });
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n\f]/g, ' ');
}

function numberValue(raw: string | undefined, fallback = 0): number {
  if (!raw) return fallback;
  const match = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/i.exec(raw.trim());
  const value = match ? Number(match[0]) : fallback;
  return Number.isFinite(value) ? value : fallback;
}

function normalizeColor(value: string | undefined, fallback = 'transparent'): string {
  const raw = (value || '').trim();
  if (!raw || raw === 'none' || raw === 'transparent') return 'transparent';
  if (/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(raw)) return raw;
  const rgbChannel = '[-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)%?';
  const alphaChannel = '(?:[-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)%?)';
  if (new RegExp(`^rgba?\\(\\s*${rgbChannel}\\s*,\\s*${rgbChannel}\\s*,\\s*${rgbChannel}(?:\\s*,\\s*${alphaChannel})?\\s*\\)$`, 'i').test(raw)) return raw;
  if (/^hsla?\(\s*[-+]?\d*\.?\d+(?:deg|rad|turn)?\s*,\s*\d*\.?\d+%\s*,\s*\d*\.?\d+%(?:\s*,\s*[-+]?\d*\.?\d+%?)?\s*\)$/i.test(raw)) return raw;
  const named: Record<string, string> = {
    black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff',
    gray: '#808080', grey: '#808080', yellow: '#ffff00', orange: '#ffa500', purple: '#800080',
    cyan: '#00ffff', magenta: '#ff00ff', none: 'transparent',
  };
  return named[raw.toLowerCase()] || (raw.startsWith('url(') ? 'transparent' : fallback);
}

interface Matrix { a: number; b: number; c: number; d: number; e: number; f: number }
const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
function multiplyMatrix(left: Matrix, right: Matrix): Matrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}
function transformMatrix(raw: string | undefined): Matrix {
  if (!raw) return { ...IDENTITY };
  let result = { ...IDENTITY };
  const commands = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = commands.exec(raw))) {
    const values = match[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (values.some(n => !Number.isFinite(n))) continue;
    const name = match[1].toLowerCase();
    let next: Matrix | undefined;
    if (name === 'matrix' && values.length >= 6) next = { a: values[0], b: values[1], c: values[2], d: values[3], e: values[4], f: values[5] };
    if (name === 'translate') next = { ...IDENTITY, e: values[0] || 0, f: values.length > 1 ? values[1] : 0 };
    if (name === 'scale') next = { a: values[0] ?? 1, b: 0, c: 0, d: values.length > 1 ? values[1] : (values[0] ?? 1), e: 0, f: 0 };
    if (name === 'rotate') {
      const angle = (values[0] || 0) * Math.PI / 180;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const rotation: Matrix = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
      if (values.length >= 3) {
        const [cx, cy] = [values[1], values[2]];
        next = multiplyMatrix(multiplyMatrix({ ...IDENTITY, e: cx, f: cy }, rotation), { ...IDENTITY, e: -cx, f: -cy });
      } else next = rotation;
    }
    if (name === 'skewx') next = { ...IDENTITY, c: Math.tan((values[0] || 0) * Math.PI / 180) };
    if (name === 'skewy') next = { ...IDENTITY, b: Math.tan((values[0] || 0) * Math.PI / 180) };
    if (next) result = multiplyMatrix(result, next);
  }
  return result;
}
function transformPoint(matrix: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f };
}
function transformedBounds(matrix: Matrix, x: number, y: number, width: number, height: number) {
  const points = [transformPoint(matrix, x, y), transformPoint(matrix, x + width, y), transformPoint(matrix, x, y + height), transformPoint(matrix, x + width, y + height)];
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
  start: number;
  end: number;
  openRaw: string;
  selfClosing: boolean;
}
function parseXml(source: string): XmlNode | null {
  const root: XmlNode = { tag: '#root', attrs: {}, children: [], text: '', start: 0, end: source.length, openRaw: '', selfClosing: false };
  const stack: XmlNode[] = [root];
  const tokenPattern = /<!--[\s\S]*?-->|<\?[^?]*\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<[^>]+>|[^<]+/g;
  let token: RegExpExecArray | null;
  while ((token = tokenPattern.exec(source))) {
    const raw = token[0];
    if (raw.startsWith('<!--') || raw.startsWith('<?') || /^<!doctype/i.test(raw) || /^<!\[CDATA\[/i.test(raw) || /^<!/i.test(raw)) continue;
    if (raw.startsWith('</')) {
      const closingTag = /^<\/\s*([^\s>]+)/.exec(raw)?.[1]?.toLowerCase();
      if (!closingTag) continue;
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag.toLowerCase() === closingTag) {
          stack[i].end = token.index + raw.length;
          stack.length = i;
          break;
        }
      }
      continue;
    }
    if (raw.startsWith('<')) {
      const nameMatch = /^<\s*([a-zA-Z_][\w:.-]*)/.exec(raw);
      if (!nameMatch) continue;
      const tag = nameMatch[1];
      const attrs: Record<string, string> = {};
      const attrText = raw.slice(nameMatch[0].length, raw.length - (raw.endsWith('/>') ? 2 : 1));
      const attrPattern = /([^\s=/>]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let attr: RegExpExecArray | null;
      while ((attr = attrPattern.exec(attrText))) attrs[attr[1].toLowerCase()] = decodeXml(attr[2] ?? attr[3] ?? attr[4] ?? '');
      const selfClosing = /\/\s*>$/.test(raw) || /^(?:path|rect|circle|ellipse|line|polyline|polygon|stop|use|image|metadata|br|hr)$/i.test(tag);
      const node: XmlNode = { tag, attrs, children: [], text: '', start: token.index, end: selfClosing ? token.index + raw.length : source.length, openRaw: raw, selfClosing };
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) stack.push(node);
      continue;
    }
    if (stack.length > 0) stack[stack.length - 1].text += decodeXml(raw);
  }
  const svg = root.children.find(child => child.tag.toLowerCase() === 'svg');
  return svg || null;
}
function parseInlineStyle(raw: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const chunk of (raw || '').split(';')) {
    const i = chunk.indexOf(':');
    if (i < 0) continue;
    const key = chunk.slice(0, i).trim().toLowerCase();
    if (key) result[key] = chunk.slice(i + 1).trim().replace(/\s*!important\s*$/i, '');
  }
  return result;
}
function parseSvgStyleSheets(root: XmlNode): Array<{selector: string; declarations: Record<string, string>}> {
  const rules: Array<{selector: string; declarations: Record<string, string>}> = [];
  const visit = (node: XmlNode) => {
    if (node.tag.toLowerCase() === 'style') {
      const css = node.text.replace(/\/\*[\s\S]*?\*\//g, '');
      const re = /([^{}]+)\{([^{}]*)\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(css))) {
        const declarations = parseInlineStyle(m[2]);
        for (const selector of m[1].split(',').map(s => s.trim()).filter(Boolean)) {
          if (/^[.#]?[\w-]+$/.test(selector)) rules.push({ selector, declarations });
        }
      }
    }
    node.children.forEach(visit);
  };
  visit(root);
  return rules;
}
function resolveSvgStyles(node: XmlNode, inherited: Record<string, string>, rules: Array<{selector: string; declarations: Record<string, string>}>) {
  const style: Record<string, string> = { ...inherited };
  const tag = node.tag.toLowerCase();
  for (const rule of rules) {
    const selector = rule.selector;
    if (selector.startsWith('.')) {
      const classNames = (node.attrs.class || '').split(/\s+/);
      if (classNames.includes(selector.slice(1))) Object.assign(style, rule.declarations);
    } else if (selector.startsWith('#')) {
      if (node.attrs.id === selector.slice(1)) Object.assign(style, rule.declarations);
    } else if (selector.toLowerCase() === tag) Object.assign(style, rule.declarations);
  }
  const inheritable = ['fill', 'stroke', 'stroke-width', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'color', 'fill-opacity', 'stroke-opacity', 'visibility', 'filter', 'mask', 'clip-path', 'clip-rule', 'fill-rule', 'mix-blend-mode'];
  const explicit: Record<string, string> = {};
  for (const key of inheritable) if (node.attrs[key] !== undefined) explicit[key] = node.attrs[key];
  if (node.attrs.opacity !== undefined) explicit.opacity = String(numberValue(node.attrs.opacity, 1) * numberValue(inherited.opacity, 1));
  Object.assign(style, explicit, parseInlineStyle(node.attrs.style));
  // Inline style attribute wins over presentation attributes.
  return style;
}
function getRawElement(source: string, node: XmlNode): string {
  if (!node.start && !node.openRaw) return '';
  if (node.end > node.start) return source.slice(node.start, node.end);
  return node.openRaw;
}
interface SvgRasterContext {
  styleText: string;
  definitionsById: Map<string, XmlNode>;
  elementsById: Map<string, XmlNode>;
}

/** Index SVG defs once, then serialize only resources referenced by each rasterized node. */
function buildSvgRasterContext(source: string, root: XmlNode): SvgRasterContext {
  const definitionsById = new Map<string, XmlNode>();
  const elementsById = new Map<string, XmlNode>();
  const styleText = root.children
    .filter(child => child.tag.toLowerCase() === 'style')
    .map(child => getRawElement(source, child).replace(/@import\s+[^;]+;?/gi, ''))
    .join('\n');
  const visitAll = (node: XmlNode) => {
    if (node.attrs.id) elementsById.set(node.attrs.id, node);
    for (const child of node.children) visitAll(child);
  };
  for (const child of root.children) visitAll(child);
  const visitDefinitions = (node: XmlNode, activeDefinition: XmlNode | undefined) => {
    const nextDefinition = node.attrs.id ? node : activeDefinition;
    if (node.attrs.id && activeDefinition === undefined) definitionsById.set(node.attrs.id, node);
    for (const child of node.children) visitDefinitions(child, nextDefinition);
  };
  for (const child of root.children) if (child.tag.toLowerCase() === 'defs') {
    for (const definition of child.children) visitDefinitions(definition, undefined);
  }
  return { styleText, definitionsById, elementsById };
}

function referencedSvgIds(value: string): string[] {
  const ids = new Set<string>();
  for (const match of value.matchAll(/url\(\s*['"]?#([\w:.-]+)['"]?\s*\)/gi)) ids.add(match[1]);
  for (const match of value.matchAll(/(?:xlink:)?href\s*=\s*['"]#([\w:.-]+)['"]/gi)) ids.add(match[1]);
  return [...ids];
}

function serializeReferencedDefinitions(source: string, context: SvgRasterContext, references: string[]): string {
  const seen = new Set<string>();
  const chunks: string[] = [];
  const queue = [...references];
  while (queue.length && seen.size < 256) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = context.definitionsById.get(id);
    if (!node) continue;
    const raw = getRawElement(source, node);
    if (!raw) continue;
    chunks.push(raw);
    for (const dependency of referencedSvgIds(raw)) if (!seen.has(dependency)) queue.push(dependency);
  }
  const cleaned = chunks.join('\n')
    .replace(/@import\s+[^;]+;?/gi, '')
    .replace(/url\(([^)]*)\)/gi, (all, raw: string) => { const value = raw.trim().replace(/^['"]|['"]$/g, ''); return value.startsWith('#') || /^data:image\//i.test(value) ? all : 'none'; })
    .replace(/\s+(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi, (all, _quote: string, value: string) => value.startsWith('#') || /^data:image\//i.test(value) ? all : '');
  return cleaned;
}

function makeRasterSvg(source: string, node: XmlNode, bounds: {x:number;y:number;width:number;height:number}, matrix: Matrix, style: Record<string, string>, context: SvgRasterContext): string {
  const safeW = Math.max(1, bounds.width), safeH = Math.max(1, bounds.height);
  const inlineStyle = Object.entries(style).map(([key, value]) => `${key}:${value}`).join(';');
  const tagName = node.tag.toLowerCase();
  const rawElement = tagName === 'g' ? getRawElement(source, node) : node.openRaw;
  const referenced = referencedSvgIds(`${rawElement}\n${inlineStyle}`);
  const defs = [context.styleText, serializeReferencedDefinitions(source, context, referenced)].filter(Boolean).join('\n');
  let raw = node.openRaw;
  const tagMatch = /^<\s*([\w:.-]+)/.exec(raw);
  if (!tagMatch) return '';
  const tag = tagMatch[1];
  let attrsText = raw.slice(tagMatch[0].length, raw.length - (raw.endsWith('/>') ? 2 : 1));
  attrsText = attrsText.replace(/\s+transform\s*=\s*(?:"[^"]*"|'[^']*')/gi, '').replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    .replace(/\s+on[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi, (all, _quote: string, value: string) => value.startsWith('#') || /^data:image\//i.test(value) ? all : '');
  const styleKeys = ['fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'opacity', 'color', 'clip-rule', 'fill-rule', 'filter', 'mask', 'clip-path', 'mix-blend-mode'];
  const mergedStyle = { ...style };
  for (const key of styleKeys) if (node.attrs[key] !== undefined) mergedStyle[key] = node.attrs[key];
  const styleText = Object.entries(mergedStyle).map(([key, value]) => `${key}:${value}`).join(';');
  const matrixText = `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`;
  let rawNode: string;
  if (tagName === 'g') {
    const sourceStart = rawElement.indexOf('>') + 1;
    const sourceClose = rawElement.toLowerCase().lastIndexOf('</g');
    const inner = sourceStart > 0 && sourceClose >= sourceStart ? rawElement.slice(sourceStart, sourceClose) : '';
    attrsText = attrsText.replace(/\s+transform\s*=\s*(?:"[^"]*"|'[^']*')/gi, '').replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
    rawNode = `<${tag}${attrsText} transform="${matrixText}" style="${escapeXml(styleText)}">${inner}</${tag}>`;
  } else {
    rawNode = `<${tag}${attrsText} transform="${matrixText}" style="${escapeXml(styleText)}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${round(safeW)}" height="${round(safeH)}" viewBox="${round(bounds.x)} ${round(bounds.y)} ${round(safeW)} ${round(safeH)}">${defs}${rawNode}</svg>`;
}

function pathCoordinateBounds(pathData: string): { x: number; y: number; width: number; height: number } | null {
  const tokens = (pathData.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi) || []);
  const points: Array<{x:number;y:number}> = [];
  let i = 0, command = '', x = 0, y = 0, sx = 0, sy = 0;
  const isCommand = (value: string | undefined) => Boolean(value && /^[a-z]$/i.test(value));
  const read = () => Number(tokens[i++]);
  const push = (px: number, py: number) => { if (Number.isFinite(px) && Number.isFinite(py)) points.push({x:px,y:py}); };
  let guard = 0;
  while (i < tokens.length && guard++ < 10000) {
    if (isCommand(tokens[i])) command = tokens[i++];
    if (!command) break;
    const relative = command === command.toLowerCase();
    const op = command.toUpperCase();
    if (op === 'Z') { x = sx; y = sy; push(x,y); command = ''; continue; }
    const needs = op === 'H' || op === 'V' ? 1 : op === 'M' || op === 'L' || op === 'T' ? 2 : op === 'S' || op === 'Q' ? 4 : op === 'C' ? 6 : op === 'A' ? 7 : 0;
    if (!needs || i + needs > tokens.length || isCommand(tokens[i])) { command = ''; continue; }
    const values: number[] = [];
    for (let n = 0; n < needs; n++) values.push(read());
    if (op === 'H') x = relative ? x + values[0] : values[0];
    else if (op === 'V') y = relative ? y + values[0] : values[0];
    else if (op === 'A') {
      const nx = relative ? x + values[5] : values[5], ny = relative ? y + values[6] : values[6];
      push(x - Math.abs(values[0]), y - Math.abs(values[1])); push(x + Math.abs(values[0]), y + Math.abs(values[1]));
      push(nx - Math.abs(values[0]), ny - Math.abs(values[1])); push(nx + Math.abs(values[0]), ny + Math.abs(values[1]));
      x = nx; y = ny;
    } else {
      const pairStart = op === 'C' ? 4 : op === 'S' || op === 'Q' ? 2 : 0;
      if (op === 'C') {
        for (let p = 0; p < 6; p += 2) push(relative ? x + values[p] : values[p], relative ? y + values[p + 1] : values[p + 1]);
        x = relative ? x + values[4] : values[4]; y = relative ? y + values[5] : values[5];
      } else if (op === 'S' || op === 'Q') {
        for (let p = 0; p < 4; p += 2) push(relative ? x + values[p] : values[p], relative ? y + values[p + 1] : values[p + 1]);
        x = relative ? x + values[pairStart] : values[pairStart]; y = relative ? y + values[pairStart + 1] : values[pairStart + 1];
      } else {
        x = relative ? x + values[0] : values[0]; y = relative ? y + values[1] : values[1];
      }
    }
    if (op === 'M') { sx = x; sy = y; command = relative ? 'l' : 'L'; }
    push(x,y);
  }
  if (!points.length) return null;
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(1, Math.max(...xs) - minX), height: Math.max(1, Math.max(...ys) - minY) };
}

function localGeometry(node: XmlNode, computedStyle: Record<string, string> = {}): { shape?: LayoutShape; kind: LayoutNodeKind; x: number; y: number; width: number; height: number; text?: string; radius?: number } | null {
  const a = node.attrs;
  const tag = node.tag.toLowerCase();
  if (tag === 'rect') {
    return { shape: 'rect', kind: 'shape', x: numberValue(a.x), y: numberValue(a.y), width: Math.max(0, numberValue(a.width)), height: Math.max(0, numberValue(a.height)), radius: Math.max(numberValue(a.rx), numberValue(a.ry)) };
  }
  if (tag === 'circle') {
    const r = Math.max(0, numberValue(a.r));
    return { shape: 'ellipse', kind: 'shape', x: numberValue(a.cx) - r, y: numberValue(a.cy) - r, width: r * 2, height: r * 2, radius: r };
  }
  if (tag === 'ellipse') {
    const rx = Math.max(0, numberValue(a.rx)), ry = Math.max(0, numberValue(a.ry));
    return { shape: 'ellipse', kind: 'shape', x: numberValue(a.cx) - rx, y: numberValue(a.cy) - ry, width: rx * 2, height: ry * 2, radius: Math.min(rx, ry) };
  }
  if (tag === 'line') {
    const x1 = numberValue(a.x1), y1 = numberValue(a.y1), x2 = numberValue(a.x2), y2 = numberValue(a.y2);
    return { shape: 'line', kind: 'line', x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.max(1, Math.abs(x2 - x1)), height: Math.max(1, Math.abs(y2 - y1)) };
  }
  if (tag === 'text') {
    const text = (node.text + node.children.map(child => child.text).join('')).replace(/\s+/g, ' ').trim();
    if (!text) return null;
    const size = Math.max(1, numberValue(computedStyle['font-size'] || a['font-size'], 16));
    const fontWeight = numberValue(a['font-weight'], 400);
    const width = Math.max(1, numberValue(a['textLength'], text.length * size * 0.56));
    const anchor = computedStyle['text-anchor'] || a['text-anchor'] || 'start';
    const x = numberValue(a.x) - (anchor === 'middle' ? width / 2 : anchor === 'end' ? width : 0);
    return { kind: 'text', x, y: numberValue(a.y) - size, width, height: Math.max(size * 1.2, numberValue(a.height)), text };
  }
  if (['path', 'polygon', 'polyline', 'image', 'use'].includes(tag)) {
    let x = 0, y = 0, width = 0, height = 0;
    if (tag === 'image' || tag === 'use') { x = numberValue(a.x); y = numberValue(a.y); width = numberValue(a.width); height = numberValue(a.height); if (tag === 'use' && (width <= 0 || height <= 0)) return null; }
    else if (tag === 'polygon' || tag === 'polyline') {
      const values = (a.points || '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
      const xs = values.filter((_, i) => i % 2 === 0), ys = values.filter((_, i) => i % 2 === 1);
      if (xs.length && ys.length) { x = Math.min(...xs); y = Math.min(...ys); width = Math.max(...xs) - x; height = Math.max(...ys) - y; }
    } else if (tag === 'path') {
      const bounds = pathCoordinateBounds(a.d || '');
      if (bounds) ({ x, y, width, height } = bounds);
    }
    return { kind: 'raster', x, y, width: Math.max(1, width), height: Math.max(1, height) };
  }
  return null;
}

function geometryBoundsInSubtree(node: XmlNode, context: SvgRasterContext, parentMatrix: Matrix = IDENTITY, seen = new Set<string>(), depth = 0): { x: number; y: number; width: number; height: number } | null {
  if (depth > 64) return null;
  const tag = node.tag.toLowerCase();
  if (['defs', 'style', 'metadata', 'title', 'desc', 'script', 'foreignobject'].includes(tag)) return null;
  const matrix = multiplyMatrix(parentMatrix, transformMatrix(node.attrs.transform));
  let bounds: { x: number; y: number; width: number; height: number } | null = null;
  if (tag === 'use') {
    const href = node.attrs.href || node.attrs['xlink:href'] || '';
    const refId = href.startsWith('#') ? href.slice(1) : '';
    const referenced = refId && !seen.has(refId) ? context.elementsById.get(refId) : undefined;
    if (referenced) {
      const geometry = localGeometry(referenced);
      const useMatrix = multiplyMatrix(matrix, { ...IDENTITY, e: numberValue(node.attrs.x), f: numberValue(node.attrs.y) });
      if (geometry && geometry.width > 0 && geometry.height > 0) {
        bounds = transformedBounds(multiplyMatrix(useMatrix, transformMatrix(referenced.attrs.transform)), geometry.x, geometry.y, geometry.width, geometry.height);
      } else {
        bounds = geometryBoundsInSubtree(referenced, context, useMatrix, new Set([...seen, refId]), depth + 1);
      }
    }
  } else {
    const geometry = localGeometry(node);
    if (geometry && geometry.width > 0 && geometry.height > 0) bounds = transformedBounds(matrix, geometry.x, geometry.y, geometry.width, geometry.height);
  }
  for (const child of node.children) {
    const childBounds = geometryBoundsInSubtree(child, context, matrix, seen, depth + 1);
    if (!childBounds) continue;
    if (!bounds) bounds = childBounds;
    else {
      const left = Math.min(bounds.x, childBounds.x), top = Math.min(bounds.y, childBounds.y);
      const right = Math.max(bounds.x + bounds.width, childBounds.x + childBounds.width);
      const bottom = Math.max(bounds.y + bounds.height, childBounds.y + childBounds.height);
      bounds = { x: left, y: top, width: right - left, height: bottom - top };
    }
  }
  return bounds;
}

function safeId(value: string, fallback: string): string {
  const clean = value.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  return clean || fallback;
}
function resolveFontFamily(value: string | undefined): LayoutNode['fontFamily'] {
  const raw = (value || '').toLowerCase();
  if (raw.includes('tektur')) return 'Tektur';
  if (raw.includes('jetbrains') || raw.includes('mono')) return 'JetBrains Mono';
  return value?.trim() || 'Onest';
}

function svgViewportLength(raw: string | undefined, fallback: number): number {
  if (!raw || /%\s*$/.test(raw.trim())) return fallback;
  const match = /^\s*([-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?)\s*(px|pt|pc|mm|cm|in|q)?\s*$/i.exec(raw);
  if (!match) return fallback;
  const value = Number(match[1]);
  const unit = (match[2] || 'px').toLowerCase();
  const factor: Record<string, number> = { px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, q: 96 / 101.6 };
  return Number.isFinite(value) && value > 0 ? value * (factor[unit] || 1) : fallback;
}

export function parseSvgLayout(source: string, name = 'Figma SVG'): LayoutDocument {
  if (/<\s*script\b/i.test(source) || /\son[a-z][\w:-]*\s*=/i.test(source) || /(?:href|xlink:href)\s*=\s*(['\"]?)\s*javascript:/i.test(source)) throw new Error('SVG содержит активное содержимое (script, event handler или javascript URL). Оно запрещено для безопасного импорта.');
  const foreignObjectCount = (source.match(/<\s*foreignObject\b/gi) || []).length;
  // Figma exports backdrop-filter placeholders as XHTML foreignObject elements. They are not part of RmlUi;
  // remove them after checking the full source for executable content, and preserve the remaining artwork.
  const safeSource = source
    .replace(/<\s*foreignObject\b[^>]*>[\s\S]*?<\/\s*foreignObject\s*>/gi, '')
    .replace(/<\s*foreignObject\b[^>]*\/\s*>/gi, '');
  const root = parseXml(safeSource);
  if (!root || root.tag.toLowerCase() !== 'svg') throw new Error('Не удалось прочитать SVG. Проверьте, что это корректный SVG-файл.');
  const viewBox = (root.attrs.viewbox || '').trim().split(/[\s,]+/).map(Number);
  const rootWidth = svgViewportLength(root.attrs.width, viewBox[2] || 1920);
  const rootHeight = svgViewportLength(root.attrs.height, viewBox[3] || 1080);
  const viewX = viewBox.length >= 4 && Number.isFinite(viewBox[0]) ? viewBox[0] : 0;
  const viewY = viewBox.length >= 4 && Number.isFinite(viewBox[1]) ? viewBox[1] : 0;
  const width = clamp(viewBox.length >= 4 && viewBox[2] > 0 ? viewBox[2] : rootWidth, 1, MAX_DIMENSION);
  const height = clamp(viewBox.length >= 4 && viewBox[3] > 0 ? viewBox[3] : rootHeight, 1, MAX_DIMENSION);
  if (width <= 0 || height <= 0) throw new Error('SVG должен иметь положительную ширину и высоту.');
  const rules = parseSvgStyleSheets(root);
  const rasterContext = buildSvgRasterContext(safeSource, root);
  const rootStyle = resolveSvgStyles(root, {}, rules);
  const nodes: LayoutNode[] = [];
  const diagnostics: string[] = [];
  if (foreignObjectCount) diagnostics.push(`Удалено ${foreignObjectCount} SVG foreignObject с XHTML/blur: RmlUi не поддерживает этот тип элемента, поэтому содержимое foreignObject не перенесено. Основная SVG-графика сохранена.`);
  if (/(?:href|xlink:href)\s*=\s*(['\"])(?!#|data:image\/)[^'\"]+\1/i.test(safeSource) || /url\(\s*(['\"]?)(?!#|data:image\/)(?:https?:|\/\/|\.\.?\/|[^)]*)\1\s*\)/i.test(safeSource)) diagnostics.push('В SVG есть внешние/относительные ссылки. Они не будут автоматически загружены в изолированные PNG-ресурсы; проверьте такие изображения и шрифты вручную.');
  const skipTags = new Set(['defs', 'style', 'title', 'desc', 'metadata', 'clippath', 'mask', 'lineargradient', 'radialgradient', 'pattern', 'filter', 'symbol']);

  const walk = (node: XmlNode, parentMatrix: Matrix, inherited: Record<string, string>, ancestorVisible = true) => {
    const tag = node.tag.toLowerCase();
    if (skipTags.has(tag)) return;
    const style = resolveSvgStyles(node, inherited, rules);
    const isVisible = ancestorVisible && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    if (!isVisible) return;
    const matrix = multiplyMatrix(parentMatrix, transformMatrix(node.attrs.transform));
    let geometry = localGeometry(node, style);
    let compositeGroup = false;
    // Figma commonly exports cards as clipped groups containing a background image, gradients and outlined text.
    // Rasterizing this subtree as one unit preserves the visual stacking and clipping that individual nodes lose.
    if (tag === 'g' && style['clip-path']) {
      const clipId = /url\(\s*["']?#([\w:.-]+)["']?\s*\)/i.exec(style['clip-path'])?.[1];
      const clipNode = clipId ? rasterContext.elementsById.get(clipId) : undefined;
      const clipBounds = clipNode ? geometryBoundsInSubtree(clipNode, rasterContext) : null;
      if (clipBounds && clipBounds.width > 0 && clipBounds.height > 0) {
        geometry = { kind: 'raster', x: clipBounds.x, y: clipBounds.y, width: clipBounds.width, height: clipBounds.height };
        compositeGroup = true;
        diagnostics.push(`Группа «${node.attrs.id || node.attrs.class || 'group'}» содержит clip-path и составные слои; объединена в один PNG для сохранения порядка, градиентов и масок. Дочерние контуры не редактируются по отдельности.`);
      }
    }
    // SVG <use> reuses geometry from a definition. It needs explicit bounds for Layout IR;
    // otherwise gradient/mask overlays (including Figma's card darkening layers) silently disappear.
    if (tag === 'use') {
      const href = node.attrs.href || node.attrs['xlink:href'] || '';
      const refId = href.startsWith('#') ? href.slice(1) : '';
      const referenced = refId ? rasterContext.elementsById.get(refId) : undefined;
      if (referenced) {
        const referencedGeometry = localGeometry(referenced, resolveSvgStyles(referenced, style, rules));
        if (referencedGeometry && referencedGeometry.width > 0 && referencedGeometry.height > 0) {
          geometry = { ...referencedGeometry, kind: 'raster' };
        }
      }
    }
    if (geometry && geometry.kind !== 'raster' && (/^url\(/i.test(style.fill || '') || style['clip-path'] || style.mask || style.filter)) { geometry = { ...geometry, kind: 'raster' }; }
    if (geometry && geometry.width > 0 && geometry.height > 0) {
      const boundsMatrix = tag === 'use' ? multiplyMatrix(matrix, { ...IDENTITY, e: numberValue(node.attrs.x), f: numberValue(node.attrs.y) }) : matrix;
      const bounds = transformedBounds(boundsMatrix, geometry.x, geometry.y, geometry.width, geometry.height);
      const x = round(bounds.x - viewX), y = round(bounds.y - viewY);
      const nodeWidth = round(Math.max(0.1, bounds.width)), nodeHeight = round(Math.max(0.1, bounds.height));
      const id = safeId(node.attrs.id || `element-${nodes.length + 1}`, `element-${nodes.length + 1}`);
      const fillRaw = style.fill || (geometry.kind === 'text' ? style.color : '#000000');
      const fill = normalizeColor(fillRaw, 'transparent');
      const stroke = normalizeColor(style.stroke, 'transparent');
      const localOpacity = numberValue(style.opacity, 1);
      const fillOpacity = numberValue(style['fill-opacity'], 1);
      const fontSize = Math.max(1, numberValue(style['font-size'], 16));
      const rotation = round(Math.atan2(matrix.b, matrix.a) * 180 / Math.PI);
      const localScaleX = Math.sqrt(matrix.a * matrix.a + matrix.b * matrix.b) || 1;
      const localScaleY = Math.sqrt(matrix.c * matrix.c + matrix.d * matrix.d) || 1;
      const renderedWidth = round(geometry.width * localScaleX);
      const renderedHeight = round(geometry.height * localScaleY);
      const centerX = x + nodeWidth / 2, centerY = y + nodeHeight / 2;
      const outputNode: LayoutNode = {
        id: nodes.some(item => item.id === id) ? `${id}-${nodes.length + 1}` : id,
        name: node.attrs.id || node.attrs['aria-label'] || node.attrs.class || `${tag} ${nodes.length + 1}`,
        kind: geometry.kind,
        x: geometry.kind === 'text' ? round(centerX - renderedWidth / 2) : round(centerX - renderedWidth / 2),
        y: geometry.kind === 'text' ? round(centerY - renderedHeight / 2) : round(centerY - renderedHeight / 2),
        width: renderedWidth,
        height: renderedHeight,
        fill: fill === 'transparent' ? (stroke !== 'transparent' ? 'transparent' : 'transparent') : fill,
        stroke,
        strokeWidth: round(numberValue(style['stroke-width'], 0) * Math.max(localScaleX, localScaleY)),
        radius: round((geometry.radius || 0) * Math.min(localScaleX, localScaleY)),
        opacity: clamp(localOpacity * fillOpacity, 0, 1),
        text: geometry.text,
        fontFamily: resolveFontFamily(style['font-family']),
        fontSize: round(fontSize * localScaleY),
        fontWeight: clamp(numberValue(style['font-weight'], 400), 100, 900),
        textAlign: (style['text-anchor'] === 'middle' ? 'center' : style['text-anchor'] === 'end' ? 'right' : 'left'),
        rotation: geometry.kind === 'raster' ? 0 : rotation,
        confidence: 0.94,
        sourceType: tag,
        interaction: inferLayoutInteraction(node.attrs['aria-label'] || node.attrs.id || node.attrs.class || '', tag, node.attrs),
        actionName: node.attrs['aria-label'] || node.attrs['data-action'] || undefined,
        visible: true,
      };
      if (geometry.kind === 'raster') {
        outputNode.rasterSvg = makeRasterSvg(safeSource, node, { x: bounds.x, y: bounds.y, width: nodeWidth, height: nodeHeight }, matrix, style, rasterContext);
        // Path geometry's inexpensive bounding estimate can be too small for curves; generous transparent padding avoids clipping strokes.
        if (tag === 'path' || tag === 'polygon' || tag === 'polyline') diagnostics.push(`«${outputNode.name}»: векторная графика будет растрирована в PNG, поэтому её форму нельзя редактировать как отдельные векторные узлы.`);
      }
      if (tag === 'image') diagnostics.push(`«${outputNode.name}»: SVG image может ссылаться на внешний ресурс; проверьте его наличие при экспорте.`);
      nodes.push(outputNode);
      if (nodes.length >= MAX_LAYOUT_NODES) return;
      // Text can include tspans; treat their text as part of the parent text item, not separate boxes.
      if (tag === 'text' || compositeGroup) return;
    }
    for (const child of node.children) {
      if (nodes.length >= MAX_LAYOUT_NODES) break;
      walk(child, matrix, style, isVisible);
    }
  };
  for (const child of root.children) walk(child, IDENTITY, rootStyle);
  if (nodes.length >= MAX_LAYOUT_NODES) diagnostics.push(`Импорт ограничен ${MAX_LAYOUT_NODES} элементами для защиты от чрезмерно больших SVG.`);
  if (!nodes.length) diagnostics.push('Не обнаружены редактируемые SVG-элементы. Проверьте структуру файла и наличие геометрии вне <defs>.');
  return { name, width: round(width), height: round(height), sourceKind: 'svg', nodes, diagnostics: [...new Set(diagnostics)] };
}

function figmaRgb(color: any): string | undefined {
  if (!color || typeof color !== 'object') return undefined;
  const c = [color.r, color.g, color.b].map((n: unknown) => clamp(Number(n) || 0, 0, 1));
  const hex = c.map((n: number) => Math.round(n * 255).toString(16).padStart(2, '0')).join('');
  return `#${hex}`;
}
function firstFigmaColor(value: any): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const paint of value) {
    if (!paint || paint.visible === false || Number(paint.opacity ?? 1) <= 0) continue;
    if (paint.type === 'SOLID') {
      const hex = figmaRgb(paint.color);
      if (hex) {
        const opacity = clamp(Number(paint.opacity ?? 1), 0, 1);
        if (opacity >= 1) return hex;
        const channels = hex.slice(1).match(/.{2}/g)?.map(channel => Number.parseInt(channel, 16)) || [0, 0, 0];
        return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${round(opacity)})`;
      }
    }
  }
  return undefined;
}
function findFigmaFrames(node: any, result: any[] = [], depth = 0, scan = { count: 0 }): any[] {
  if (!node || typeof node !== 'object' || depth > 80 || scan.count >= 100_000) return result;
  scan.count++;
  if (['FRAME', 'COMPONENT', 'INSTANCE'].includes(String(node.type)) && node.absoluteBoundingBox && node.absoluteBoundingBox.width > 0 && node.absoluteBoundingBox.height > 0) result.push(node);
  if (Array.isArray(node.children)) for (const child of node.children) findFigmaFrames(child, result, depth + 1, scan);
  return result;
}

const FIGMA_EMBEDDED_PNG_MAX_BASE64_LENGTH = 12 * 1024 * 1024;
function embeddedPngBase64(value: any): string | undefined {
  const base64 = value?.mimeType === 'image/png' && typeof value.contentBase64 === 'string'
    ? value.contentBase64
    : '';
  if (!base64 || base64.length > FIGMA_EMBEDDED_PNG_MAX_BASE64_LENGTH || !base64.startsWith('iVBORw0KGgo')) return undefined;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(base64) ? base64 : undefined;
}

/** Returns the PNG reference embedded by Kormatal Layout Exporter, if present and valid. */
export function parseFigmaJsonReferenceImage(raw: string, frameId?: string): { name: string; mimeType: 'image/png'; contentBase64: string } | undefined {
  try {
    const parsed = JSON.parse(raw);
    const frames = findFigmaFrames(parsed?.document || parsed);
    const target = (frameId ? frames.find(frame => String(frame.id || frame.name || '') === frameId) : undefined)
      || frames.sort((a, b) => (Number(b.absoluteBoundingBox?.width) * Number(b.absoluteBoundingBox?.height)) - (Number(a.absoluteBoundingBox?.width) * Number(a.absoluteBoundingBox?.height)))[0];
    const contentBase64 = embeddedPngBase64(target?.referenceImage);
    return contentBase64 ? { name: `${String(target.name || 'figma-layout')}-reference.png`, mimeType: 'image/png', contentBase64 } : undefined;
  } catch {
    return undefined;
  }
}

export interface FigmaFrameOption { id: string; name: string; width: number; height: number; type: string }

function isCompactExporterNode(node: any): boolean {
  return Boolean(node && typeof node === 'object' && node.size && Number(node.size.w) > 0 && Number(node.size.h) > 0 && Array.isArray(node.children));
}
function getCompactExporterRoot(parsed: any): any | undefined {
  const structure = parsed?.structure;
  if (!isCompactExporterNode(structure)) return undefined;
  if (!parsed?.metadata?.plugin && !parsed?.designTokens && !('summary' in (parsed || {}))) return undefined;
  return structure;
}
function compactNodeId(node: any, index: number): string {
  return String(node?.id || `${String(node?.name || node?.type || 'layer')}-${index}`);
}
function collectCompactFrames(root: any): FigmaFrameOption[] {
  const result: FigmaFrameOption[] = [];
  let index = 0;
  const walk = (node: any, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 80 || index > 100_000) return;
    index++;
    const type = String(node.type || '').toUpperCase();
    if (['FRAME', 'COMPONENT', 'INSTANCE'].includes(type) && node.size && Number(node.size.w) > 0 && Number(node.size.h) > 0) {
      result.push({ id: compactNodeId(node, index), name: String(node.name || type || 'Frame'), width: round(Number(node.size.w)), height: round(Number(node.size.h)), type });
    }
    if (Array.isArray(node.children)) node.children.forEach((child: any) => walk(child, depth + 1));
  };
  walk(root);
  return result.sort((a, b) => b.width * b.height - a.width * a.height);
}

/** Whether the source has coordinates sufficient to preserve actual layer geometry. */
export function figmaJsonHasCompleteCoordinates(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw);
    return findFigmaFrames(parsed.document || parsed).some((frame: any) => frame.absoluteBoundingBox && Number.isFinite(Number(frame.absoluteBoundingBox.x)) && Number.isFinite(Number(frame.absoluteBoundingBox.y)));
  } catch { return false; }
}

export function listFigmaFrames(raw: string): FigmaFrameOption[] {
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Файл Figma должен содержать корректный JSON.'); }
  const frames = findFigmaFrames(parsed.document || parsed);
  if (frames.length) return frames
    .map((frame: any) => ({
      id: String(frame.id || frame.name || ''),
      name: String(frame.name || frame.type || 'Frame'),
      width: round(Number(frame.absoluteBoundingBox.width) || 1),
      height: round(Number(frame.absoluteBoundingBox.height) || 1),
      type: String(frame.type || 'FRAME'),
    }))
    .sort((a, b) => b.width * b.height - a.width * a.height);
  const compactRoot = getCompactExporterRoot(parsed);
  const compactFrames = compactRoot ? collectCompactFrames(compactRoot) : [];
  if (compactFrames.length) return compactFrames;
  throw new Error('В JSON не найдено дерево Frame/Component с распознаваемыми размерами. Поддерживаются Figma JSON с absoluteBoundingBox и экспорт Figma to JSON Exporter с metadata/structure/size/children.');
}

function compactTypeKind(typeRaw: unknown): LayoutNodeKind | null {
  const type = String(typeRaw || '').toUpperCase();
  if (type === 'TEXT') return 'text';
  if (type === 'LINE') return 'line';
  if (['FRAME', 'COMPONENT', 'INSTANCE', 'GROUP'].includes(type)) return 'container';
  if (['RECTANGLE', 'ELLIPSE', 'VECTOR', 'POLYGON', 'STAR'].includes(type)) return type === 'VECTOR' || type === 'POLYGON' || type === 'STAR' ? 'raster' : 'shape';
  return null;
}
function compactColor(value: unknown, fallback = 'transparent'): string {
  return typeof value === 'string' ? normalizeColor(value, fallback) : fallback;
}
function compactTextInTree(node: any): string[] {
  const found: string[] = [];
  const walk = (item: any, depth = 0) => {
    if (!item || depth > 40) return;
    if (String(item.type).toUpperCase() === 'TEXT' && item.content) found.push(String(item.content).trim().toUpperCase());
    if (Array.isArray(item.children)) item.children.forEach((child: any) => walk(child, depth + 1));
  };
  walk(node);
  return found;
}
function compactHasText(node: any, value: string): boolean { return compactTextInTree(node).some(text => text === value.toUpperCase()); }
function compactNodeSizes(node: any): { width: number; height: number } {
  return { width: Math.max(1, round(Number(node?.size?.w) || 1)), height: Math.max(1, round(Number(node?.size?.h) || 1)) };
}
function compactNodeOwnLayout(node: any): 'none' | 'horizontal' | 'vertical' {
  const direction = String(node?.styles?.layout?.direction || '').toLowerCase();
  return direction === 'row' || direction === 'horizontal' ? 'horizontal' : direction === 'column' || direction === 'vertical' ? 'vertical' : 'none';
}
function compactIsLayered(node: any): boolean {
  const children = Array.isArray(node?.children) ? node.children : [];
  const { width, height } = compactNodeSizes(node);
  // Backgrounds, images, borders and labels often overlap in design exports, even when a plugin
  // attaches a generic row layout. A nearly full-size child is a strong signal not to use Flex.
  return children.some((child: any) => {
    const size = compactNodeSizes(child);
    return size.width >= width * 0.88 && size.height >= height * 0.55;
  });
}
function compactApproxPosition(parent: any, child: any, index: number, childCount: number, parentX: number, parentY: number, parentWidth: number, parentHeight: number, fallbackCursor: { x: number; y: number; rowHeight: number }, isRoot = false): { x: number; y: number } {
  const { width, height } = compactNodeSizes(child);
  const type = String(child?.type || '').toUpperCase();
  const name = String(child?.name || '').toLowerCase();
  const texts = compactTextInTree(child);
  const parentLayout = compactNodeOwnLayout(parent);
  const layered = compactIsLayered(parent);
  const rightAnchor = /inventory|settings|profile|store|clan|play|quit|metascript|bermood|control|action|footer|bottom|status/.test(`${name} ${texts.join(' ')}`);
  if (isRoot) {
    if (width >= parentWidth * 0.96 && height >= parentHeight * 0.85) return { x: 0, y: 0 };
    if (width >= parentWidth * 0.94 && height <= parentHeight * 0.16) return { x: 0, y: 0 };
    if (compactHasText(child, 'QUIT')) return { x: 26, y: Math.max(0, parentHeight - height - 27) };
    if (compactHasText(child, 'PLAY') && width < parentWidth * 0.6 && height > parentHeight * 0.12) return { x: 24, y: Math.max(0, parentHeight - height - Math.round(parentHeight * 0.099)) };
    if (width < parentWidth * 0.2 && height < parentHeight * 0.12 && rightAnchor) return { x: Math.max(0, parentWidth - width - 13), y: Math.max(0, parentHeight - height - 24) };
    if (compactTextInTree(child).some(text => text === 'METASCRIPT' || text === 'BERMOOD')) return { x: Math.max(0, parentWidth - width - 20), y: 10 };
    if (width < parentWidth * 0.5 && height < parentHeight * 0.12 && /group|nav|menu/.test(name)) return { x: round((parentWidth - width) / 2), y: Math.max(0, (64 - height) / 2) };
  }
  if (width >= parentWidth * 0.94 && height >= parentHeight * 0.85) return { x: parentX, y: parentY };
  if (layered) {
    if ((type === 'RECTANGLE' || type === 'VECTOR') && width >= parentWidth * 0.88) return { x: parentX, y: parentY };
    if (type === 'TEXT') {
      const textStackY = fallbackCursor.y;
      fallbackCursor.y += height + 6;
      return { x: parentX + 12, y: Math.min(parentY + Math.max(8, textStackY), parentY + parentHeight - height) };
    }
    if (/play|quit|button|action|change|gamemode/.test(name) || compactTextInTree(child).some(text => ['PLAY', 'QUIT', 'CHANGE GAMEMODE'].includes(text))) return { x: parentX, y: parentY + parentHeight - height };
    if (width >= parentWidth * 0.88) return { x: parentX, y: parentY };
    if (parentLayout === 'horizontal') return { x: parentX + fallbackCursor.x, y: parentY + fallbackCursor.y };
    return { x: parentX + 12, y: parentY + Math.min(fallbackCursor.y, Math.max(0, parentHeight - height)) };
  }
  if (parentLayout === 'horizontal') {
    const position = { x: parentX + fallbackCursor.x, y: parentY + (parentHeight - height) / 2 };
    fallbackCursor.x += width + Math.max(0, Number(parent?.styles?.layout?.gap) || 0);
    fallbackCursor.rowHeight = Math.max(fallbackCursor.rowHeight, height);
    return { x: position.x, y: position.y };
  }
  if (parentLayout === 'vertical' || parentLayout === 'none') {
    const gap = Math.max(0, Number(parent?.styles?.layout?.gap) || (parentLayout === 'none' ? 8 : 0));
    const position = { x: parentX, y: parentY + fallbackCursor.y };
    fallbackCursor.y += height + gap;
    return position;
  }
  return { x: parentX, y: parentY };
}

function inferLayoutInteraction(nameRaw: string, typeRaw: unknown, source: any): LayoutInteraction | undefined {
  const explicit = String(source?.interaction || source?.actionType || source?.role || '').trim().toLowerCase();
  if (['button', 'toggle', 'tab'].includes(explicit)) return explicit as LayoutInteraction;
  const name = String(nameRaw || '').normalize('NFKC').toLowerCase();
  const type = String(typeRaw || '').toUpperCase();
  // Never infer gameplay behavior from a text label alone (e.g. a decorative word "PLAY").
  // Semantic node types, explicit roles, and names containing "button"/"btn" are safer cues.
  if (type === 'TEXT') return undefined;
  if (type === 'BUTTON' || /(^|[\s_-])(button|btn)([\s_-]|$)/i.test(name) || /^(play|start|quit|exit|back|close|save|submit|confirm|cancel|settings|store|profile|inventory|clan|tab)(\b|[-_\s])/i.test(name)) {
    return /(^|[\s_-])tab([\s_-]|$)/i.test(name) ? 'tab' : 'button';
  }
  return undefined;
}

export function generateLayoutInteractionJs(nodes: LayoutNode[]): string {
  const count = nodes.filter(node => node.visible !== false && node.interaction && node.interaction !== 'none').length;
  return `/* Generated by Kormatal Layout Generator. Bind layout_ui_action in VaCuus/UE for gameplay behavior. */
(function () {
  var attempts = 0;
  function bindLayoutActions() {
    var root = document.getElementById("layout-root") || document.getElementById("reference-root");
    if (!root || typeof root.querySelectorAll !== "function") {
      // RML scripts are linked in <head>; retry after the document parser has created <body>.
      if (attempts++ < 20 && typeof setTimeout === "function") setTimeout(bindLayoutActions, 0);
      else if (typeof console !== "undefined" && console.warn) console.warn("Layout actions: root element was not found.");
      return;
    }
    var controls = root.querySelectorAll("[data-layout-action]");
    for (var i = 0; i < controls.length; i++) {
      (function (control) {
        if (control.getAttribute("data-layout-action-bound") === "true") return;
        control.setAttribute("data-layout-action-bound", "true");
        control.addEventListener("click", function () {
          var action = control.getAttribute("data-layout-action") || "button";
          var id = control.getAttribute("id") || "unknown";
          var label = control.getAttribute("data-layout-action-name") || id;
          if (action === "toggle" || action === "tab") control.classList.toggle("is-active");
          var payload = { id: id, action: action, label: label };
          try {
            if (typeof vacuus !== "undefined" && vacuus && typeof vacuus.emit === "function") {
              vacuus.emit("layout_ui_action", payload);
            } else if (typeof VaCuusBridge !== "undefined" && VaCuusBridge && typeof VaCuusBridge.sendToUE === "function") {
              VaCuusBridge.sendToUE("layout_ui_action", payload);
            } else if (typeof console !== "undefined" && console.log) {
              console.log("[Layout UI action]", payload);
            }
          } catch (error) {
            if (typeof console !== "undefined" && console.warn) console.warn("Layout UI action failed", error);
          }
        });
      })(controls[i]);
    }
  }
  bindLayoutActions();
})();
/* Interactive controls generated: ${count}. */
`;
}

export function generateReferenceScreenSources(document: LayoutDocument, imageAssetPath = 'Assets/design-reference.png'): GeneratedReferenceSources {
  const width = round(clamp(document.width, 1, MAX_DIMENSION));
  const height = round(clamp(document.height, 1, MAX_DIMENSION));
  const diagnostics: string[] = [];
  const asset = safeAssetReference(imageAssetPath);
  if (!asset) throw new Error('Путь PNG-эталона должен быть относительным и не содержать сегменты ..');
  const interactive = document.nodes.filter(node => node.visible !== false && node.interaction && node.interaction !== 'none');
  const hitboxRules: string[] = [];
  const hitboxes = interactive.map((node, index) => {
    const point = getLayoutNodeAbsolutePosition(document, node.id);
    const x = round(clamp(point.x, 0, width));
    const y = round(clamp(point.y, 0, height));
    const w = round(clamp(node.width, 0, Math.max(0, width - x)));
    const h = round(clamp(node.height, 0, Math.max(0, height - y)));
    if (w < 1 || h < 1) { diagnostics.push(`Интерактивная зона «${node.name}» имеет нулевой размер и пропущена.`); return ''; }
    const id = safeId(node.id, `hitbox-${index + 1}`);
    const className = `reference-hitbox-${index + 1}`;
    const action = node.interaction || 'button';
    const label = node.actionName || node.text || node.name || id;
    hitboxRules.push(`.${className} { left: ${x}px; top: ${y}px; width: ${w}px; height: ${h}px; }`);
    return `    <button type="button" id="hit-${id}" class="reference-hitbox ${className}" data-layout-action="${escapeXml(action)}" data-layout-action-name="${escapeXml(label)}" aria-label="${escapeXml(label)}"></button>`;
  }).filter(Boolean).join('\n');
  if (!interactive.length) diagnostics.push('В pixel-reference entrypoint пока нет интерактивных зон. Отметьте кнопки/вкладки в редакторе Layout IR: изображение само по себе не содержит поведения.');
  const rml = `<rml>\n<head>\n  <title>${escapeXml(document.name)} · Pixel Reference</title>\n  <link type="text/rcss" href="vacuus-base.rcss"/>\n  <link type="text/rcss" href="reference.rcss"/>\n  <script src="layout.js"></script>\n</head>\n<body>\n  <div id="reference-root">\n    <img id="design-reference" src="${escapeXml(asset)}" alt="Исходный макет"/>\n${hitboxes}\n  </div>\n</body>\n</rml>\n`;
  const rcss = `/* Pixel-reference mode: artwork remains a single raster, hitboxes carry optional behavior. */\n#reference-root { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; }\n#design-reference { position: absolute; left: 0px; top: 0px; width: ${width}px; height: ${height}px; }\n.reference-hitbox { position: absolute; display: block; margin: 0px; padding: 0px; border-width: 0px; background-color: transparent; opacity: 0.001; }\n.reference-hitbox:hover { opacity: 0.035; background-color: #20ab8e; }\n.reference-hitbox:focus { opacity: 0.10; background-color: #20ab8e; border-width: 1px; border-color: #20ab8e; }\n.reference-hitbox.is-active { opacity: 0.08; background-color: #20ab8e; border-width: 1px; border-color: #20ab8e; }\n${hitboxRules.join('\n')}\n`;
  return { rml, rcss, js: generateLayoutInteractionJs(document.nodes), diagnostics };
}

function parseCompactExporterLayout(parsed: any, name: string, frameId?: string): LayoutDocument {
  const root = getCompactExporterRoot(parsed);
  if (!root) throw new Error('Не найден корень структуры Figma to JSON Exporter.');
  const frameNodes = collectCompactFrames(root);
  const selectedOption = frameId ? frameNodes.find(frame => frame.id === frameId) : undefined;
  const selected = selectedOption ? findCompactNodeById(root, selectedOption.id) : root;
  const target = selected || root;
  const dims = compactNodeSizes(target);
  const diagnostics: string[] = [
    'Этот JSON-экспорт не содержит x/y или absoluteBoundingBox.x/y. Расположение элементов восстановлено эвристически по размерам, порядку слоёв и текстовым якорям; точное совпадение невозможно без координат. Для точной геометрии приложите соответствующий SVG или используйте JSON-экспортёр с абсолютными границами.',
  ];
  const nodes: LayoutNode[] = [];
  const used = new Set<string>();
  let index = 0;
  const visitChildren = (parent: any, parentId: string | undefined, originX: number, originY: number, parentWidth: number, parentHeight: number, depth: number, isRoot = false) => {
    if (depth > 80) { diagnostics.push('Часть JSON дерева пропущена: глубина превышает 80 уровней.'); return; }
    const children = Array.isArray(parent?.children) ? parent.children : [];
    const cursor = { x: 0, y: 0, rowHeight: 0 };
    const parentLayered = compactIsLayered(parent);
    for (let childIndex = 0; childIndex < children.length && nodes.length < MAX_LAYOUT_NODES; childIndex++) {
      const child = children[childIndex];
      if (!child || child.visible === false || Number(child.opacity) === 0 || String(child.type).toUpperCase() === 'SLICE') continue;
      index++;
      const size = compactNodeSizes(child);
      const pos = compactApproxPosition(parent, child, childIndex, children.length, originX, originY, parentWidth, parentHeight, cursor, isRoot);
      const type = String(child.type || '').toUpperCase();
      const rawKind = compactTypeKind(type);
      const nameFromJson = String(child.name || `${type.toLowerCase()}-${index}`);
      const idBase = safeId(compactNodeId(child, index), `layer-${index}`);
      let id = idBase, suffix = 2;
      while (used.has(id)) id = `${idBase}-${suffix++}`;
      used.add(id);
      let outParentId = parentId;
      if (rawKind) {
        const style = child.styles || {};
        const textStyle = style.text || {};
        const nodeOut: LayoutNode = {
          id, parentId, name: nameFromJson, kind: rawKind,
          x: round(pos.x - originX), y: round(pos.y - originY), width: size.width, height: size.height,
          fill: rawKind === 'text' ? compactColor(style.bg, '#ffffff') : compactColor(style.bg),
          stroke: compactColor(style.border?.color), strokeWidth: round(Number(style.border?.width) || 0),
          radius: round(Number(style.radius) || 0), opacity: clamp(Number(child.opacity ?? 1), 0, 1),
          text: type === 'TEXT' ? String(child.content || '') : undefined,
          fontFamily: resolveFontFamily(String(textStyle.family || parsed?.designTokens?.fonts?.onest?.family || 'Onest')),
          fontSize: round(clamp(Number(textStyle.size) || 16, 1, 256)), fontWeight: clamp(Number(textStyle.weight) || 400, 100, 900),
          textAlign: String(textStyle.align || 'left').toLowerCase() === 'center' ? 'center' : String(textStyle.align || 'left').toLowerCase() === 'right' ? 'right' : 'left',
          rotation: 0, confidence: 0.42, sourceType: type, visible: true,
          interaction: inferLayoutInteraction(nameFromJson, type, child),
          layoutPositioning: parentLayered ? 'absolute' : compactNodeOwnLayout(parent) === 'none' ? 'absolute' : 'flow',
        };
        if (rawKind === 'container') {
          const desiredMode = compactNodeOwnLayout(child);
          Object.assign(nodeOut, {
            layoutMode: compactIsLayered(child) ? 'none' : desiredMode,
            layoutItemSpacing: Math.max(0, Number(style.layout?.gap) || 0),
            layoutJustifyContent: 'flex-start', layoutAlignItems: 'flex-start',
            clipContent: false,
          });
          if (compactIsLayered(child) && desiredMode !== 'none') diagnostics.push(`«${nameFromJson}»: у контейнера найдены перекрывающиеся слои; направление ${desiredMode} отключено, поскольку оно могло бы раздвинуть фон и содержимое.`);
          outParentId = id;
          nodes.push(nodeOut);
          // Children are positioned in the local coordinates of this container.
          visitChildren(child, outParentId, pos.x, pos.y, size.width, size.height, depth + 1, false);
          continue;
        }
        if (rawKind === 'raster') {
          nodeOut.kind = 'shape';
          nodeOut.fill = compactColor(style.bg, '#808080');
          diagnostics.push(`«${nameFromJson}» (${type}): в этом JSON нет path-геометрии. Создана цветовая заглушка; для точного вида нужен SVG-ресурс.`);
        }
        nodes.push(nodeOut);
      } else {
        diagnostics.push(`Слой «${nameFromJson}» (${type}) пропущен: тип не имеет безопасного прямого аналога RML.`);
        if (Array.isArray(child.children)) visitChildren(child, parentId, pos.x, pos.y, size.width, size.height, depth + 1, false);
      }
    }
  };
  const rootLayout = compactNodeOwnLayout(target);
  const rootLayoutFinal = compactIsLayered(target) ? 'none' : rootLayout;
  visitChildren(target, undefined, 0, 0, dims.width, dims.height, 0, true);
  if (compactIsLayered(target) && rootLayout !== 'none') diagnostics.push(`Корневая раскладка ${rootLayout} отключена: в дереве есть перекрывающийся полноразмерный слой.`);
  return {
    name: String(target.name || name), width: dims.width, height: dims.height, sourceKind: 'figma-json',
    backgroundColor: compactColor(target.styles?.bg), layoutMode: rootLayoutFinal,
    layoutItemSpacing: Math.max(0, Number(target.styles?.layout?.gap) || 0),
    nodes, diagnostics: [...new Set(diagnostics)],
  };
}
function findCompactNodeById(root: any, id: string): any | undefined {
  let index = 0, found: any;
  const walk = (node: any, depth = 0) => {
    if (!node || found || depth > 80) return;
    index++;
    if (compactNodeId(node, index) === id) { found = node; return; }
    if (Array.isArray(node.children)) node.children.forEach((child: any) => walk(child, depth + 1));
  };
  walk(root); return found;
}

function figmaLayoutMode(node: any): 'none' | 'horizontal' | 'vertical' {
  const value = String(node?.layoutMode || 'NONE').toUpperCase();
  if (value === 'HORIZONTAL') return 'horizontal';
  if (value === 'VERTICAL') return 'vertical';
  return 'none';
}
function figmaMainAlign(node: any): LayoutNode['layoutJustifyContent'] {
  const value = String(node?.primaryAxisAlignItems || '').toUpperCase();
  if (value === 'CENTER') return 'center';
  if (value === 'MAX') return 'flex-end';
  if (value === 'SPACE_BETWEEN') return 'space-between';
  return 'flex-start';
}
function figmaCrossAlign(node: any): LayoutNode['layoutAlignItems'] {
  const value = String(node?.counterAxisAlignItems || '').toUpperCase();
  if (value === 'CENTER') return 'center';
  if (value === 'MAX') return 'flex-end';
  if (value === 'BASELINE') return 'baseline';
  if (value === 'STRETCH') return 'stretch';
  return 'flex-start';
}
function figmaContainerLayout(node: any) {
  return {
    layoutMode: figmaLayoutMode(node),
    layoutItemSpacing: Math.max(0, Number(node?.itemSpacing) || 0),
    layoutPaddingTop: Math.max(0, Number(node?.paddingTop) || 0),
    layoutPaddingRight: Math.max(0, Number(node?.paddingRight) || 0),
    layoutPaddingBottom: Math.max(0, Number(node?.paddingBottom) || 0),
    layoutPaddingLeft: Math.max(0, Number(node?.paddingLeft) || 0),
    layoutJustifyContent: figmaMainAlign(node),
    layoutAlignItems: figmaCrossAlign(node),
    layoutWrap: String(node?.layoutWrap || '').toUpperCase() === 'WRAP',
    clipContent: node?.clipsContent === true,
  };
}

export function parseFigmaJsonLayout(raw: string, name = 'Figma JSON', frameId?: string): LayoutDocument {
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Файл Figma должен содержать корректный JSON.'); }
  const documentRoot = parsed.document || parsed;
  const frames = findFigmaFrames(documentRoot);
  if (!frames.length) {
    if (getCompactExporterRoot(parsed)) return parseCompactExporterLayout(parsed, name, frameId);
    throw new Error('В JSON не найдено дерево Frame/Component с распознаваемыми размерами. Поддерживаются Figma JSON с absoluteBoundingBox и экспорт Figma to JSON Exporter с metadata/structure/size/children.');
  }
  const target = (frameId ? frames.find((frame: any) => String(frame.id || frame.name || '') === frameId) : undefined)
    || frames.sort((a, b) => (b.absoluteBoundingBox.width * b.absoluteBoundingBox.height) - (a.absoluteBoundingBox.width * a.absoluteBoundingBox.height))[0];
  const bounds = target.absoluteBoundingBox;
  const width = clamp(Number(bounds.width) || 1, 1, MAX_DIMENSION), height = clamp(Number(bounds.height) || 1, 1, MAX_DIMENSION);
  const baseX = Number(bounds.x) || 0, baseY = Number(bounds.y) || 0;
  const nodes: LayoutNode[] = [], diagnostics: string[] = [];
  const seenIds = new Set<string>();
  let depthLimitReported = false;
  const uniqueId = (rawId: string, fallback: string) => {
    const base = safeId(rawId, fallback);
    let candidate = base, suffix = 2;
    while (seenIds.has(candidate)) candidate = `${base}-${suffix++}`;
    seenIds.add(candidate);
    return candidate;
  };
  const warnedGridNodes = new Set<string>();
  const warnIfGridLayout = (node: any) => {
    if (String(node?.layoutMode || '').toUpperCase() !== 'GRID') return;
    const key = String(node?.id || node?.name || `grid-${warnedGridNodes.size + 1}`);
    if (warnedGridNodes.has(key)) return;
    warnedGridNodes.add(key);
    diagnostics.push(`«${String(node?.name || 'Grid')}»: Figma Grid Layout не имеет прямого эквивалента во Flexbox VaCuus. Слой импортирован без Grid-раскладки; проверьте позиции и при необходимости перестройте контейнер вручную.`);
  };
  warnIfGridLayout(target);
  const visit = (node: any, parentId: string | undefined, parentBounds: any, parentLayoutMode: 'none' | 'horizontal' | 'vertical', depth = 0) => {
    if (!node || typeof node !== 'object' || nodes.length >= MAX_LAYOUT_NODES) return;
    if (depth > 80) { if (!depthLimitReported) diagnostics.push('Часть дерева Figma пропущена: глубина вложенности превышает 80 уровней.'); depthLimitReported = true; return; }
    if (node.visible === false || Number(node.opacity) === 0) return;
    warnIfGridLayout(node);
    const b = node.absoluteBoundingBox;
    const type = String(node.type || '').toUpperCase();
    let childParentId = parentId;
    let childParentBounds = parentBounds;
    let childParentLayoutMode = parentLayoutMode;
    if (b && Number(b.width) > 0 && Number(b.height) > 0) {
      const fill = firstFigmaColor(node.fills) || (node.backgroundColor ? figmaRgb(node.backgroundColor) : undefined);
      const stroke = firstFigmaColor(node.strokes);
      const opacity = clamp(Number(node.opacity ?? 1), 0, 1);
        const textStyle = node.style || {};
        const sourceFontSize = Math.max(1, Number(textStyle.fontSize) || 16);
        const lineHeight = textStyle.lineHeight && typeof textStyle.lineHeight === 'object'
          ? textStyle.lineHeight.unit === 'PIXELS' ? Number(textStyle.lineHeight.value) : textStyle.lineHeight.unit === 'PERCENT' ? sourceFontSize * Number(textStyle.lineHeight.value) / 100 : 0
          : Number(textStyle.lineHeightPx) || 0;
        const letterSpacing = textStyle.letterSpacing && typeof textStyle.letterSpacing === 'object'
          ? textStyle.letterSpacing.unit === 'PERCENT' ? sourceFontSize * Number(textStyle.letterSpacing.value) / 100 : Number(textStyle.letterSpacing.value) || 0
          : Number(textStyle.letterSpacing) || 0;
      let kind: LayoutNodeKind | null = null;
      if (type === 'TEXT') kind = 'text';
      else if (['RECTANGLE', 'ELLIPSE', 'FRAME', 'COMPONENT', 'INSTANCE', 'GROUP', 'VECTOR', 'LINE', 'POLYGON', 'STAR'].includes(type)) {
        kind = type === 'LINE' ? 'line' : (['VECTOR', 'POLYGON', 'STAR'].includes(type) ? 'raster' : ['FRAME', 'COMPONENT', 'INSTANCE', 'GROUP'].includes(type) ? 'container' : 'shape');
      }
      if (kind) {
        const nameFromFigma = String(node.name || `${type.toLowerCase()}-${nodes.length + 1}`);
        const id = uniqueId(String(node.id || nameFromFigma), `figma-${nodes.length + 1}`);
        const flowChild = parentLayoutMode !== 'none' && String(node.layoutPositioning || '').toUpperCase() !== 'ABSOLUTE';
        const nodeOut: LayoutNode = {
          id, parentId, name: nameFromFigma, kind,
          x: round(Number(b.x) - Number(parentBounds?.x ?? baseX)),
          y: round(Number(b.y) - Number(parentBounds?.y ?? baseY)),
          width: round(Number(b.width)), height: round(Number(b.height)),
          fill: kind === 'text' ? (fill || '#ffffff') : (fill || 'transparent'),
          stroke: stroke || 'transparent', strokeWidth: round(Number(node.strokeWeight) || 0),
          radius: round(Number(node.cornerRadius) || 0), opacity,
          text: type === 'TEXT' ? String(node.characters || '') : undefined,
          fontFamily: resolveFontFamily(textStyle.fontFamily), fontSize: round(sourceFontSize),
          fontWeight: clamp(Number(textStyle.fontWeight) || 400, 100, 900),
          textAlign: textStyle.textAlignHorizontal === 'CENTER' ? 'center' : textStyle.textAlignHorizontal === 'RIGHT' ? 'right' : 'left',
          rotation: round(Number(node.rotation) || 0), confidence: 0.98, sourceType: type,
          interaction: inferLayoutInteraction(nameFromFigma, type, node),
          actionName: typeof node?.pluginData?.actionName === 'string' ? node.pluginData.actionName : undefined,
          visible: true, layoutPositioning: flowChild ? 'flow' : 'absolute', layoutGrow: Math.max(0, Number(node.layoutGrow) || 0),
          layoutSizingHorizontal: ({ FIXED: 'fixed', HUG: 'hug', FILL: 'fill' } as Record<string, 'fixed' | 'hug' | 'fill'>)[String(node.layoutSizingHorizontal || '').toUpperCase()],
          layoutSizingVertical: ({ FIXED: 'fixed', HUG: 'hug', FILL: 'fill' } as Record<string, 'fixed' | 'hug' | 'fill'>)[String(node.layoutSizingVertical || '').toUpperCase()],
        };
        if (kind === 'text') {
          if (lineHeight > 0) nodeOut.lineHeight = round(lineHeight);
          if (letterSpacing !== 0) nodeOut.letterSpacing = round(letterSpacing);
          const textCase = String(textStyle.textCase || '').toUpperCase();
          if (textCase === 'UPPER') nodeOut.textTransform = 'uppercase';
          else if (textCase === 'LOWER') nodeOut.textTransform = 'lowercase';
          else if (textCase === 'TITLE') nodeOut.textTransform = 'capitalize';
          const textDecoration = String(textStyle.textDecoration || '').toUpperCase();
          if (textDecoration === 'UNDERLINE') nodeOut.textDecoration = 'underline';
          else if (textDecoration === 'STRIKETHROUGH') diagnostics.push(`«${nameFromFigma}»: зачёркивание Figma пока не переносится в VaCuus RCSS.`);
          if (textStyle.fontFamily && !['Onest', 'Tektur', 'JetBrains Mono'].includes(String(textStyle.fontFamily))) {
            diagnostics.push(`«${nameFromFigma}»: шрифт «${String(textStyle.fontFamily)}» сохранён в RCSS, но отсутствует среди встроенных шрифтов. Добавьте его как статический TTF/OTF в проект UE/DevUI и зарегистрируйте через @font-face.`);
          }
        }
        if (kind === 'container') Object.assign(nodeOut, figmaContainerLayout(node));
        if (kind === 'raster') {
          diagnostics.push(`«${nameFromFigma}» (${type}): в JSON нет самостоятельного SVG-path. Создана геометрическая заглушка; для точной графики импортируйте SVG/PNG этого слоя.`);
          nodeOut.kind = 'shape'; nodeOut.fill = fill || '#808080'; nodeOut.stroke = stroke || 'transparent';
        }
        const embeddedAsset = embeddedPngBase64(node.embeddedAsset);
        if (embeddedAsset) {
          nodeOut.kind = 'raster';
          nodeOut.assetPath = `Assets/figma-${safeId(id, `layer-${nodes.length + 1}`)}.png`;
          nodeOut.assetContentBase64 = embeddedAsset;
          nodeOut.assetMimeType = 'image/png';
        } else if (node.assetExportError) {
          diagnostics.push(`«${nameFromFigma}»: Figma не смогла встроить графический слой (${String(node.assetExportError).slice(0, 180)}); в редактируемом экране будет заглушка.`);
        }
        const nonSolidFills = Array.isArray(node.fills) && node.fills.some((paint: any) => paint?.visible !== false && paint?.type && paint.type !== 'SOLID');
        if (nonSolidFills && !embeddedAsset) {
          diagnostics.push(`«${nameFromFigma}»: содержит градиентный/изображенческий fill; заливка полностью не восстанавливается из простого JSON. Экспортируйте слой как SVG для точного вида.`);
        }
        const visibleEffects = Array.isArray(node.effects) ? node.effects.filter((effect: any) => effect?.visible !== false) : [];
        const backgroundBlur = visibleEffects.filter((effect: any) => String(effect?.type || '').toUpperCase() === 'BACKGROUND_BLUR').reduce((maximum: number, effect: any) => Math.max(maximum, Number(effect.radius) || 0), 0);
        if (backgroundBlur > 0) {
          nodeOut.backdropBlur = round(backgroundBlur);
          diagnostics.push(`«${nameFromFigma}»: Figma Background Blur перенесён в VaCuus backdrop-filter: blur(${round(backgroundBlur)}px); проверьте совпадение в UE.`);
        }
        if (visibleEffects.some((effect: any) => String(effect?.type || '').toUpperCase() !== 'BACKGROUND_BLUR') && !embeddedAsset) {
          diagnostics.push(`«${nameFromFigma}»: эффекты Figma (тени/blur) не перенесены автоматически. Проверьте возможность реализации в RCSS.`);
        }
        if (node.fills?.some((paint: any) => paint?.type === 'IMAGE' && paint.visible !== false) && !embeddedAsset) diagnostics.push(`«${nameFromFigma}»: слой содержит image fill; для точного вида импортируйте SVG/PNG отдельно.`);
        nodes.push(nodeOut);
        if (kind === 'container') {
          childParentId = id;
          childParentBounds = b;
          childParentLayoutMode = nodeOut.layoutMode || 'none';
        }
      } else if (!['DOCUMENT', 'CANVAS', 'SECTION'].includes(type)) {
        diagnostics.push(`Слой «${String(node.name || type)}» (${type}) пропущен, поскольку его тип нельзя безопасно представить простым RML-элементом.`);
      }
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (nodes.length >= MAX_LAYOUT_NODES) break;
        visit(child, childParentId, childParentBounds, childParentLayoutMode, depth + 1);
      }
    }
  };
  const rootLayout = figmaContainerLayout(target);
  for (const child of (Array.isArray(target.children) ? target.children : [])) visit(child, undefined, bounds, rootLayout.layoutMode);
  const rootFill = firstFigmaColor(target.fills) || (target.backgroundColor ? figmaRgb(target.backgroundColor) : undefined);
  const rootNonSolidFill = Array.isArray(target.fills) && target.fills.some((paint: any) => paint?.visible !== false && paint?.type && paint.type !== 'SOLID');
  if (rootNonSolidFill) diagnostics.push(`Frame «${String(target.name || name)}» содержит градиентную/изображенческую заливку, которая не переносится в редактируемый Layout IR. PNG-эталон сохранит исходный вид; проверьте фон в main-editable.rml вручную.`);
  const unsupportedRootEffects = Array.isArray(target.effects) && target.effects.some((effect: any) => effect?.visible !== false && String(effect?.type || '').toUpperCase() !== 'BACKGROUND_BLUR');
  if (unsupportedRootEffects) diagnostics.push(`Frame «${String(target.name || name)}» содержит эффекты Figma, которые не перенесены в редактируемый Layout IR. PNG-эталон сохраняет их исходный вид.`);
  if (!nodes.length) diagnostics.push('В выбранном Frame не найдено элементов, которые можно представить в RML.');
  if (nodes.length >= MAX_LAYOUT_NODES) diagnostics.push(`Импорт ограничен ${MAX_LAYOUT_NODES} элементами.`);
  return {
    name: String(target.name || name), width: round(width), height: round(height), sourceKind: 'figma-json',
    backgroundColor: rootFill, ...rootLayout, nodes, diagnostics: [...new Set(diagnostics)],
  };
}

export interface AiLayoutElement {
  name?: string; kind?: string; x?: number; y?: number; width?: number; height?: number;
  text?: string; fill?: string; stroke?: string; radius?: number; fontSize?: number;
  fontWeight?: number; textAlign?: string; confidence?: number; parentIndex?: number;
  layoutMode?: 'none' | 'horizontal' | 'vertical'; layoutItemSpacing?: number;
  layoutPaddingTop?: number; layoutPaddingRight?: number; layoutPaddingBottom?: number; layoutPaddingLeft?: number;
  layoutJustifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between';
  layoutAlignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';
  layoutWrap?: boolean; layoutPositioning?: 'absolute' | 'flow';
}
export function layoutDocumentFromAi(width: number, height: number, elements: AiLayoutElement[], name = 'PNG макет'): LayoutDocument {
  const diagnostics: string[] = [];
  const canvasWidth = round(clamp(width, 1, MAX_DIMENSION));
  const canvasHeight = round(clamp(height, 1, MAX_DIMENSION));
  const accepted: Array<{ sourceIndex: number; node: LayoutNode; absoluteX: number; absoluteY: number }> = [];
  const bySourceIndex = new Map<number, typeof accepted[number]>();
  const usedIds = new Set<string>();
  elements.slice(0, MAX_LAYOUT_NODES).forEach((element, index) => {
    const x = Number(element.x), y = Number(element.y), w = Number(element.width), h = Number(element.height);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
      diagnostics.push(`Элемент №${index + 1} пропущен: модель вернула некорректные координаты.`); return;
    }
    const rawKind = String(element.kind || 'shape').toLowerCase();
    const kind: LayoutNodeKind = rawKind === 'text' ? 'text' : rawKind === 'container' || rawKind === 'panel' || rawKind === 'button' ? 'container' : rawKind === 'line' ? 'line' : 'shape';
    const absoluteX = round(clamp(x, 0, canvasWidth - 1));
    const absoluteY = round(clamp(y, 0, canvasHeight - 1));
    const nameText = String(element.name || `${rawKind} ${index + 1}`).slice(0, 100);
    const baseId = safeId(`${nameText}-${index + 1}`, `detected-${index + 1}`);
    let id = baseId, suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    usedIds.add(id);
    const node: LayoutNode = {
      id, name: nameText, kind,
      x: absoluteX, y: absoluteY,
      width: round(clamp(w, 1, canvasWidth - absoluteX)), height: round(clamp(h, 1, canvasHeight - absoluteY)),
      fill: normalizeColor(element.fill, kind === 'text' ? '#ffffff' : 'transparent'),
      stroke: normalizeColor(element.stroke, 'transparent'), radius: round(Math.max(0, Number(element.radius) || 0)),
      opacity: 1, text: kind === 'text' ? String(element.text || '') : (rawKind === 'button' ? String(element.text || '') : undefined),
      fontFamily: 'Onest', fontSize: round(clamp(Number(element.fontSize) || 16, 1, 256)), fontWeight: clamp(Number(element.fontWeight) || 400, 100, 900),
      textAlign: element.textAlign === 'center' || element.textAlign === 'right' ? element.textAlign : 'left',
      confidence: clamp(Number(element.confidence) || 0.65, 0, 1), sourceType: rawKind === 'button' ? 'button' : 'png-ai', visible: true,
      interaction: rawKind === 'button' ? 'button' : inferLayoutInteraction(nameText, rawKind, element),
      actionName: rawKind === 'button' ? nameText : undefined,
      layoutMode: kind === 'container' && ['horizontal', 'vertical'].includes(String(element.layoutMode)) ? element.layoutMode : 'none',
      layoutItemSpacing: round(clamp(Number(element.layoutItemSpacing) || 0, 0, 1024)),
      layoutPaddingTop: round(clamp(Number(element.layoutPaddingTop) || 0, 0, 1024)),
      layoutPaddingRight: round(clamp(Number(element.layoutPaddingRight) || 0, 0, 1024)),
      layoutPaddingBottom: round(clamp(Number(element.layoutPaddingBottom) || 0, 0, 1024)),
      layoutPaddingLeft: round(clamp(Number(element.layoutPaddingLeft) || 0, 0, 1024)),
      layoutJustifyContent: ['center', 'flex-end', 'space-between'].includes(String(element.layoutJustifyContent)) ? element.layoutJustifyContent : 'flex-start',
      layoutAlignItems: ['center', 'flex-end', 'stretch', 'baseline'].includes(String(element.layoutAlignItems)) ? element.layoutAlignItems : 'flex-start',
      layoutWrap: Boolean(element.layoutWrap), layoutPositioning: element.layoutPositioning === 'absolute' ? 'absolute' : 'flow',
    };
    const entry = { sourceIndex: index, node, absoluteX, absoluteY };
    accepted.push(entry); bySourceIndex.set(index, entry);
  });

  for (const entry of accepted) {
    const parentIndex = Number(entry.sourceIndex < elements.length ? elements[entry.sourceIndex]?.parentIndex : NaN);
    if (!Number.isInteger(parentIndex) || parentIndex < 0) continue;
    const parent = bySourceIndex.get(parentIndex);
    if (!parent || parent.sourceIndex >= entry.sourceIndex || parent.node.kind !== 'container') {
      diagnostics.push(`«${entry.node.name}»: AI указал недопустимого родителя; элемент оставлен на корневом холсте.`);
      continue;
    }
    entry.node.parentId = parent.node.id;
    entry.node.x = round(entry.absoluteX - parent.absoluteX);
    entry.node.y = round(entry.absoluteY - parent.absoluteY);
    entry.node.layoutPositioning = (parent.node.layoutMode || 'none') !== 'none' && entry.node.layoutPositioning !== 'absolute' ? 'flow' : 'absolute';
  }
  if (elements.length > MAX_LAYOUT_NODES) diagnostics.push(`Результат ограничен ${MAX_LAYOUT_NODES} элементами.`);
  if (!accepted.length) diagnostics.push('ИИ не нашёл пригодных элементов. Добавьте их вручную или загрузите SVG/Figma JSON для более точного результата.');
  return { name, width: canvasWidth, height: canvasHeight, sourceKind: 'png', nodes: accepted.map(entry => entry.node), diagnostics };
}

function safeAssetReference(value: string | undefined): string | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const normalized = value.replace(/\\/g, '/').trim();
  if (!normalized || normalized.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(normalized) || /[\u0000-\u001f]/.test(normalized)) return undefined;
  const segments = normalized.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) return undefined;
  return normalized;
}

export interface LayoutPipelineValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function normLayoutText(value: unknown): string {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function nodeRect(node: Pick<LayoutNode, 'x' | 'y' | 'width' | 'height'>) {
  return { left: node.x, top: node.y, right: node.x + node.width, bottom: node.y + node.height };
}
function overlapRatioOfCandidate(a: LayoutNode, b: LayoutNode): number {
  const ar = nodeRect(a), br = nodeRect(b);
  const w = Math.max(0, Math.min(ar.right, br.right) - Math.max(ar.left, br.left));
  const h = Math.max(0, Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top));
  const intersection = w * h;
  const smaller = Math.min(Math.max(0, a.width * a.height), Math.max(0, b.width * b.height));
  return smaller > 0 ? intersection / smaller : 0;
}
function sameLayoutRole(a: LayoutNode, b: LayoutNode): boolean {
  if (a.kind === b.kind) return true;
  const visual = (kind: LayoutNode['kind']) => kind === 'shape' || kind === 'raster' || kind === 'line';
  return visual(a.kind) && visual(b.kind);
}

/**
 * Combines structured geometry (Figma JSON/SVG) with the final PNG vision pass.
 * Structured source coordinates remain authoritative; vision adds confidence and
 * high-confidence elements not represented by any source node. JSON text can enrich
 * vision-detected text boxes when JSON lacks usable coordinates.
 */
export function combineLayoutPipelineDocuments(
  geometry: LayoutDocument | null,
  vision: LayoutDocument | null,
  semantic: LayoutDocument | null = null,
  supplementalGeometry: LayoutDocument | null = null,
): LayoutDocument | null {
  if (!geometry && !vision) return null;
  if (!geometry) return vision ? { ...vision, diagnostics: [...new Set(vision.diagnostics)] } : null;
  if (!vision) {
    const nodes = geometry.nodes.map(node => ({ ...node }));
    const diagnostics = [...geometry.diagnostics];
    if (semantic && semantic !== geometry) {
      const semanticTextNodes = semantic.nodes.filter(item => item.kind === 'text' && item.text?.trim());
      for (const node of semanticTextNodes) {
        const key = normLayoutText(node.text || node.name);
        if (!key) continue;
        const match = nodes.find(item => item.kind === 'text' && normLayoutText(item.text || item.name) === key);
        if (match && !match.text) match.text = node.text;
      }
      if (semanticTextNodes.length && !nodes.some(item => item.kind === 'text')) {
        diagnostics.push('Figma JSON содержит текстовые подписи, но финальный PNG-анализатор не запускался или не распознал текст. SVG хранит эти подписи в виде контуров; они останутся графикой, а не редактируемым текстом. Включите локальную vision-модель для распознавания текстовых областей либо вручную добавьте текстовые узлы.');
      } else if (semanticTextNodes.length) {
        const unmatched = semanticTextNodes.filter(semanticNode => {
          const key = normLayoutText(semanticNode.text || semanticNode.name);
          return key && !nodes.some(item => item.kind === 'text' && normLayoutText(item.text || item.name) === key);
        });
        if (unmatched.length) diagnostics.push(`Figma JSON: ${unmatched.length} текстовых подписей не удалось точно сопоставить с геометрией без PNG/OCR; они не получили выдуманные координаты.`);
      }
    }
    if (supplementalGeometry && supplementalGeometry !== geometry) {
      for (const candidate of supplementalGeometry.nodes) {
        const key = normLayoutText(candidate.text || candidate.name);
        const semanticMatch = key ? nodes.find(node => node.kind === candidate.kind && normLayoutText(node.text || node.name) === key) : undefined;
        if (semanticMatch) {
          if (!semanticMatch.text && candidate.text) semanticMatch.text = candidate.text;
          semanticMatch.confidence = Math.max(semanticMatch.confidence || 0, candidate.confidence || 0.8);
          continue;
        }
        const duplicate = nodes.some(node => sameLayoutRole(node, candidate) && overlapRatioOfCandidate(node, candidate) >= 0.82 && Math.abs(node.width * node.height - candidate.width * candidate.height) <= Math.max(1, node.width * node.height, candidate.width * candidate.height) * 0.45);
        if (!duplicate) nodes.push({ ...candidate, id: nodes.some(node => node.id === candidate.id) ? `${candidate.id}-svg` : candidate.id });
      }
      diagnostics.push(`SVG-слои объединены с ${geometry.sourceKind}: сопоставлены совпадающие узлы и добавлена недублирующаяся графика.`);
      diagnostics.push(...supplementalGeometry.diagnostics);
    }
    return { ...geometry, nodes, diagnostics: [...new Set(diagnostics)] };
  }

  const nodes = geometry.nodes.map(node => ({ ...node }));
  const diagnostics = [...geometry.diagnostics, ...vision.diagnostics];
  if (supplementalGeometry && supplementalGeometry !== geometry) {
    for (const candidate of supplementalGeometry.nodes) {
      const key = normLayoutText(candidate.text || candidate.name);
      const semanticMatch = key ? nodes.find(node => node.kind === candidate.kind && normLayoutText(node.text || node.name) === key) : undefined;
      if (semanticMatch) {
        if (!semanticMatch.text && candidate.text) semanticMatch.text = candidate.text;
        semanticMatch.confidence = Math.max(semanticMatch.confidence || 0, candidate.confidence || 0.8);
        continue;
      }
      const duplicate = nodes.some(node => sameLayoutRole(node, candidate) && overlapRatioOfCandidate(node, candidate) >= 0.82 && Math.abs(node.width * node.height - candidate.width * candidate.height) <= Math.max(1, node.width * node.height, candidate.width * candidate.height) * 0.45);
      if (!duplicate) nodes.push({ ...candidate, id: nodes.some(node => node.id === candidate.id) ? `${candidate.id}-svg` : candidate.id });
    }
    diagnostics.push(`SVG-слои добавлены в Layout IR как дополнительный визуальный источник.`);
    diagnostics.push(...supplementalGeometry.diagnostics);
  }
  const visionNodes = vision.nodes.map(node => ({ ...node }));

  // If JSON carries text while the matching SVG uses outlined paths, the final PNG pass
  // supplies text geometry and JSON supplies the exact string and preferred font metrics.
  const semanticTexts = (semantic?.nodes || []).filter(node => node.kind === 'text' && node.text?.trim());
  const visionTextHasSemanticMatch = new Set<string>();
  for (const aiNode of visionNodes.filter(node => node.kind === 'text')) {
    const textKey = normLayoutText(aiNode.text || aiNode.name);
    const semanticMatch = semanticTexts.find(node => {
      const key = normLayoutText(node.text || node.name);
      return key && (key === textKey || (textKey.length >= 4 && (key.includes(textKey) || textKey.includes(key))));
    });
    if (semanticMatch) {
      visionTextHasSemanticMatch.add(aiNode.id);
      aiNode.text = semanticMatch.text;
      aiNode.fontFamily = semanticMatch.fontFamily || aiNode.fontFamily;
      aiNode.fontSize = semanticMatch.fontSize || aiNode.fontSize;
      aiNode.fontWeight = semanticMatch.fontWeight || aiNode.fontWeight;
      aiNode.textAlign = semanticMatch.textAlign || aiNode.textAlign;
      aiNode.confidence = Math.max(aiNode.confidence || 0, semanticMatch.confidence || 0.9);
      aiNode.sourceType = 'png-ai+figma-json';
    }
  }

  const matchedVisionIds = new Set<string>();
  for (const visionNode of visionNodes) {
    const key = normLayoutText(visionNode.text || visionNode.name);
    let match = key
      ? nodes.find(node => node.kind === 'text' && normLayoutText(node.text || node.name) === key)
      : undefined;
    if (!match) {
      // Match only similar semantic kinds. A full-screen background must not swallow a
      // smaller AI-detected card merely because they geometrically overlap.
      const candidates = nodes
        .filter(node => sameLayoutRole(node, visionNode))
        .map(node => ({ node, overlap: overlapRatioOfCandidate(node, visionNode), areaRatio: (node.width * node.height) / Math.max(1, visionNode.width * visionNode.height) }))
        .filter(candidate => candidate.overlap >= 0.72 && candidate.areaRatio >= 0.62 && candidate.areaRatio <= 1.65)
        .sort((a, b) => b.overlap - a.overlap);
      match = candidates[0]?.node;
    }
    if (match) {
      matchedVisionIds.add(visionNode.id);
      match.confidence = Math.max(match.confidence || 0, Math.min(visionNode.confidence || 0.65, 0.98));
      if (match.kind === 'text' && !match.text && visionNode.text) match.text = visionNode.text;
      if (match.kind === 'text' && (match.fontSize || 0) <= 0 && (visionNode.fontSize || 0) > 0) match.fontSize = visionNode.fontSize;
      match.sourceType = `${match.sourceType || geometry.sourceKind}+png-validation`;
      continue;
    }

    const visualCoverage = !(visionNode.kind === 'text' && visionTextHasSemanticMatch.has(visionNode.id)) && nodes.some(node => overlapRatioOfCandidate(node, visionNode) >= 0.82 && node.width * node.height <= visionNode.width * visionNode.height * 1.6);
    if (visualCoverage) {
      diagnostics.push(`PNG-анализ: «${visionNode.name}» визуально перекрывается существующей геометрией источника и не добавлен повторно.`);
      continue;
    }

    // If the SVG encoded a label as outlined vector glyphs, hide tiny path fragments under
    // the editable text box before placing the AI text node on top.
    if (visionNode.kind === 'text' && visionNode.text?.trim()) {
      for (const sourceNode of nodes) {
        if (sourceNode.kind !== 'raster' || !['path', 'polygon', 'polyline'].includes(String(sourceNode.sourceType).toLowerCase())) continue;
        const centerX = sourceNode.x + sourceNode.width / 2;
        const centerY = sourceNode.y + sourceNode.height / 2;
        const inside = centerX >= visionNode.x && centerX <= visionNode.x + visionNode.width && centerY >= visionNode.y && centerY <= visionNode.y + visionNode.height;
        if (inside && sourceNode.width * sourceNode.height < visionNode.width * visionNode.height * 0.18) sourceNode.visible = false;
      }
    }
    nodes.push({ ...visionNode, sourceType: visionNode.sourceType || 'png-ai' });
    matchedVisionIds.add(visionNode.id);
  }

  if (semanticTexts.length && !visionNodes.some(node => node.kind === 'text')) {
    diagnostics.push('Figma JSON содержит текстовые подписи, но PNG-анализ не определил ни одной текстовой области. Подписи не добавлены с выдуманными координатами; проверьте OCR/vision-модель.');
  }
  diagnostics.push(`Слияние источников: ${geometry.sourceKind} использован как источник геометрии; PNG-анализ выполнил финальную проверку и добавил/сопоставил ${matchedVisionIds.size} элементов.`);
  return {
    ...geometry,
    nodes,
    diagnostics: [...new Set(diagnostics)],
  };
}

/** Scale a secondary geometry source into the authoritative canvas coordinate system. */
export function scaleLayoutDocumentTo(document: LayoutDocument, targetWidth: number, targetHeight: number): LayoutDocument {
  const width = round(clamp(targetWidth, 1, MAX_DIMENSION));
  const height = round(clamp(targetHeight, 1, MAX_DIMENSION));
  const sx = width / Math.max(1, document.width);
  const sy = height / Math.max(1, document.height);
  if (Math.abs(sx - 1) < 0.0001 && Math.abs(sy - 1) < 0.0001) return { ...document, nodes: document.nodes.map(node => ({ ...node })) };
  const sf = Math.min(sx, sy);
  return {
    ...document,
    width,
    height,
    nodes: document.nodes.map(node => ({
      ...node,
      x: round(node.x * sx), y: round(node.y * sy),
      width: round(Math.max(node.kind === 'line' ? 0 : 0.1, node.width * sx)),
      height: round(Math.max(node.kind === 'line' ? 0 : 0.1, node.height * sy)),
      radius: node.radius === undefined ? undefined : round(node.radius * sf),
      fontSize: node.fontSize === undefined ? undefined : round(node.fontSize * sf),
      strokeWidth: node.strokeWidth === undefined ? undefined : round(node.strokeWidth * sf),
      layoutItemSpacing: node.layoutItemSpacing === undefined ? undefined : round(node.layoutItemSpacing * sf),
      layoutPaddingTop: node.layoutPaddingTop === undefined ? undefined : round(node.layoutPaddingTop * sy),
      layoutPaddingBottom: node.layoutPaddingBottom === undefined ? undefined : round(node.layoutPaddingBottom * sy),
      layoutPaddingLeft: node.layoutPaddingLeft === undefined ? undefined : round(node.layoutPaddingLeft * sx),
      layoutPaddingRight: node.layoutPaddingRight === undefined ? undefined : round(node.layoutPaddingRight * sx),
    })),
    diagnostics: [...document.diagnostics, `Координаты ${document.sourceKind} масштабированы из ${Math.round(document.width)}×${Math.round(document.height)} в общий холст ${Math.round(width)}×${Math.round(height)} для объединения источников.`],
  };
}

/** Strict gate before generating project files from the merged Layout IR. */
export function validateLayoutPipelineDocument(document: LayoutDocument | null): LayoutPipelineValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!document) return { valid: false, errors: ['Layout IR не создан: проверьте источники и повторите полный анализ.'], warnings };
  if (!Number.isFinite(document.width) || !Number.isFinite(document.height) || document.width <= 0 || document.height <= 0) {
    errors.push('Размеры холста должны быть конечными положительными числами.');
  }
  const manualScreenshotStarter = document.nodes.length === 0 && document.sourceKind === 'png' && document.manualReconstructionStarter === true;
  if (!document.nodes.length && !manualScreenshotStarter) errors.push('В Layout IR нет элементов. Для PNG-only включите локальный vision-анализатор или добавьте структуру вручную.');
  if (manualScreenshotStarter) warnings.push('Создано пустое редактируемое полотно по скриншоту. Перед экспортом добавьте хотя бы один слой; исходное изображение сохранится отдельно как визуальный эталон.');
  if (document.nodes.length > MAX_LAYOUT_NODES) errors.push(`Слишком много элементов (${document.nodes.length}); лимит генератора — ${MAX_LAYOUT_NODES}.`);
  const ids = new Set<string>();
  for (const node of document.nodes) {
    if (ids.has(node.id)) errors.push(`Повторяется ID узла «${node.id}».`);
    ids.add(node.id);
    if (![node.x, node.y, node.width, node.height].every(Number.isFinite)) errors.push(`«${node.name}»: координаты содержат NaN/Infinity.`);
    if (node.width < 0 || node.height < 0 || (node.kind !== 'line' && (node.width === 0 || node.height === 0))) errors.push(`«${node.name}»: ширина/высота некорректны.`);
    if (node.x < -1 || node.y < -1 || node.x + node.width > document.width + 1 || node.y + node.height > document.height + 1) {
      warnings.push(`«${node.name}» частично выходит за границы холста.`);
    }
    if (node.parentId && !document.nodes.some(parent => parent.id === node.parentId && parent.kind === 'container')) warnings.push(`«${node.name}»: родительский контейнер не найден; генератор разместит элемент на корневом холсте.`);
  }
  if (document.diagnostics.some(item => /обрезан|не содержит координат|не найдено элементов|не распознано/i.test(item))) warnings.push('В источниках есть диагностические замечания; проверьте панель предупреждений перед экспортом.');
  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

/**
 * Checks the actual generated layout package, not just the in-memory Layout IR.
 * This catches missing linked files and broken relative asset paths before export.
 */
export function validateGeneratedLayoutBundle(artifacts: GeneratedLayoutArtifact[]): GeneratedLayoutBundleValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalizePath = (value: string) => value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/');
  const byPath = new Map<string, GeneratedLayoutArtifact>();
  for (const artifact of artifacts) {
    const path = normalizePath(artifact.path).replace(/^\/+/, '');
    const key = path.toLowerCase();
    if (byPath.has(key)) errors.push(`Дублируется путь файла «${path}».`);
    else byPath.set(key, { ...artifact, path });
  }
  const required = [
    'main.rml', 'reference.rcss', 'main-editable.rml', 'layout.rcss', 'layout.js',
    'vacuus-base.rcss', 'layout-report.md', 'Assets/design-reference.png',
  ];
  for (const suffix of required) {
    const requiredPath = suffix.toLowerCase();
    if (![...byPath.keys()].some(path => path.endsWith(`/${requiredPath}`) || path === requiredPath)) {
      errors.push(`В экспортном пакете отсутствует обязательный файл «${suffix}».`);
    }
  }
  const resolveReference = (sourcePath: string, reference: string): string | undefined => {
    const ref = reference.trim();
    if (!ref || ref.startsWith('#') || /^(?:data:|https?:|file:|mailto:|\/\/)/i.test(ref)) return undefined;
    if (ref.startsWith('/')) return normalizePath(ref.slice(1));
    const parts = [...normalizePath(sourcePath).split('/').slice(0, -1), ...normalizePath(ref).split('/')];
    const output: string[] = [];
    for (const part of parts) {
      if (!part || part === '.') continue;
      if (part === '..') { if (!output.length) return undefined; output.pop(); }
      else output.push(part);
    }
    return output.join('/');
  };
  let checkedReferences = 0;
  for (const artifact of byPath.values()) {
    if (!/\.rml$/i.test(artifact.path)) continue;
    if (!/<rml\b/i.test(artifact.content) || !/<head\b/i.test(artifact.content) || !/<body\b/i.test(artifact.content)) {
      errors.push(`«${artifact.path}» не содержит корректную оболочку RML с head и body.`);
    }
    const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(artifact.content)?.[1] || '';
    const bodyScripts = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(artifact.content)?.[1] || '';
    if (/<script\b/i.test(bodyScripts)) errors.push(`«${artifact.path}»: внешний JS должен подключаться в <head> по правилам VaCuus.`);
    if (/layout\.js(?:["']|$)/i.test(artifact.content) && !/<script\b[^>]*src=["'][^"']*layout\.js["'][^>]*>/i.test(head)) {
      errors.push(`«${artifact.path}» использует layout.js, но не подключает его в <head>.`);
    }
    const referencePattern = /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = referencePattern.exec(artifact.content))) {
      const reference = match[1];
      const resolved = resolveReference(artifact.path, reference);
      if (resolved === undefined) continue;
      checkedReferences++;
      if (!byPath.has(resolved.toLowerCase())) errors.push(`«${artifact.path}» ссылается на отсутствующий ресурс «${reference}» (ожидался «${resolved}»).`);
    }
  }
  for (const artifact of byPath.values()) {
    if (!/\.rcss$/i.test(artifact.path)) continue;
    const source = artifact.content.replace(/\/\*[\s\S]*?\*\//g, '');
    const blocks = source.matchAll(/\{([^{}]*)\}/g);
    for (const block of blocks) {
      for (const declarationText of block[1].split(';')) {
        const separator = declarationText.indexOf(':');
        if (separator < 1) continue;
        const property = declarationText.slice(0, separator).trim().toLowerCase();
        const value = declarationText.slice(separator + 1).trim();
        if (!/^[a-z][a-z0-9-]*$/i.test(property) || !value) continue;
        // Validate against the exact target plugin profile first. The source-CSS conversion
        // catalog also contains browser-only properties and intentionally is not the complete
        // native RCSS list. Falling back to it alone falsely rejected native VaCuus properties
        // (for example `tab-index` used by vacuus-base.rcss) during package export.
        const targetProperty = VACUUS_RCSS_PROPERTIES.find(entry => entry.property === property);
        const targetStatus = targetProperty?.renderStatus === 'registered'
          ? 'supported'
          : targetProperty?.renderStatus === 'limited'
            ? 'supported-with-limits'
            : targetProperty?.renderStatus === 'not-rendered'
              ? 'parses-not-rendered'
              : undefined;
        const definition = targetProperty && targetStatus
          ? {
              property,
              status: targetStatus as NonNullable<typeof RCSS_PROPERTY_CATALOG[string]>['status'],
              allowedValues: targetProperty.keywords.length ? targetProperty.keywords : undefined,
              notes: targetProperty.notes || `Свойство зарегистрировано в целевом профиле VaCuus 1.1.0 / UE5.8; допустимый синтаксис: ${targetProperty.acceptedValueGrammar}.`,
              autoFixAvailable: false,
            }
          : RCSS_PROPERTY_CATALOG[property];
        if (!definition) {
          errors.push(`«${artifact.path}»: свойство «${property}» отсутствует и в профиле VaCuus 1.1.0/UE5.8, и в каталоге преобразования CSS.`);
          continue;
        }
        if (definition.status === 'unsupported' || definition.status === 'parses-not-rendered') {
          errors.push(`«${artifact.path}»: свойство «${property}» имеет статус «${definition.status}» и не может использоваться в проверенном экспорте.`);
          continue;
        }
        const firstValue = value.split(/\s+/)[0].toLowerCase();
        const allowedValueIsExplicitlyValid = Boolean(definition.allowedValues?.some(allowed => allowed.toLowerCase() === value.toLowerCase() || allowed.toLowerCase() === firstValue));
        if ((definition.status === 'supported-with-limits' && !allowedValueIsExplicitlyValid) || definition.status === 'convertible') {
          warnings.push(`«${artifact.path}»: свойство «${property}» требует учёта ограничений RCSS: ${definition.notes}`);
        }
      }
    }
  }
  const referenceAsset = [...byPath.values()].find(file => /(?:^|\/)assets\/design-reference\.png$/i.test(file.path));
  if (!referenceAsset || referenceAsset.contentEncoding !== 'base64' || !referenceAsset.content.startsWith('iVBORw0KGgo')) {
    errors.push('PNG-эталон отсутствует, пуст или не имеет сигнатуры PNG. Экспорт прекращён, чтобы не создать ссылку на нерабочий ресурс.');
  }
  const referenceRml = [...byPath.values()].find(file => /(?:^|\/)main\.rml$/i.test(file.path));
  if (referenceRml && !/id=["']design-reference["']/i.test(referenceRml.content)) warnings.push('Главный main.rml не содержит растровую подложку design-reference; проверьте целевой визуальный режим.');
  const editableRml = [...byPath.values()].find(file => /(?:^|\/)main-editable\.rml$/i.test(file.path));
  if (editableRml && !/id=["']layout-root["']/i.test(editableRml.content)) warnings.push('Редактируемый RML не содержит layout-root.');
  const js = [...byPath.values()].find(file => /(?:^|\/)layout\.js$/i.test(file.path));
  if (js && !js.content.includes('layout_ui_action')) warnings.push('layout.js не содержит обработчик события layout_ui_action.');
  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)], checkedReferences };
}

export function generateLayoutSources(document: LayoutDocument): GeneratedLayoutSources {
  const diagnostics = [...document.diagnostics];
  const visibleNodes = document.nodes.filter(node => node.visible !== false);
  const nodesById = new Map<string, LayoutNode>();
  const outputIdByOriginal = new Map<string, string>();
  const usedOutputIds = new Set<string>();
  const classByOriginal = new Map<string, string>();
  visibleNodes.forEach((node, index) => {
    nodesById.set(node.id, node);
    let outId = safeId(node.id, `element-${index + 1}`), suffix = 2;
    while (usedOutputIds.has(outId)) outId = `${safeId(node.id, `element-${index + 1}`)}-${suffix++}`;
    usedOutputIds.add(outId); outputIdByOriginal.set(node.id, outId);
    classByOriginal.set(node.id, `layout-${index + 1}`);
  });

  // Keep only links to actual container nodes and protect serialization from malformed/cyclic trees.
  const effectiveParent = new Map<string, string | undefined>();
  for (const node of visibleNodes) {
    const candidate = node.parentId ? nodesById.get(node.parentId) : undefined;
    let parentId = candidate && candidate.kind === 'container' && candidate.id !== node.id ? candidate.id : undefined;
    if (node.parentId && !parentId) diagnostics.push(`«${node.name}»: ссылка на родительский контейнер «${node.parentId}» не разрешена; элемент размещён на корневом холсте.`);
    if (parentId) {
      const seen = new Set<string>([node.id]);
      let cursor: string | undefined = parentId;
      while (cursor) {
        if (seen.has(cursor)) { parentId = undefined; diagnostics.push(`«${node.name}»: обнаружен цикл родительских контейнеров; элемент размещён на корневом холсте.`); break; }
        seen.add(cursor);
        cursor = nodesById.get(cursor)?.parentId;
      }
    }
    effectiveParent.set(node.id, parentId);
  }
  const childrenByParent = new Map<string | undefined, LayoutNode[]>();
  for (const node of visibleNodes) {
    const parentId = effectiveParent.get(node.id);
    const siblings = childrenByParent.get(parentId) || [];
    siblings.push(node); childrenByParent.set(parentId, siblings);
  }

  const styles: string[] = [];
  const containerDeclarations = (target: LayoutDocument | LayoutNode): string[] => {
    const declarations: string[] = [];
    const mode = target.layoutMode || 'none';
    if (mode !== 'none') {
      declarations.push('display: flex', `flex-direction: ${mode === 'horizontal' ? 'row' : 'column'}`);
      const gap = Math.max(0, Number(target.layoutItemSpacing) || 0);
      if (gap > 0) declarations.push(`gap: ${round(gap)}px`);
      const paddingTop = Math.max(0, Number(target.layoutPaddingTop) || 0);
      const paddingRight = Math.max(0, Number(target.layoutPaddingRight) || 0);
      const paddingBottom = Math.max(0, Number(target.layoutPaddingBottom) || 0);
      const paddingLeft = Math.max(0, Number(target.layoutPaddingLeft) || 0);
      if (paddingTop || paddingRight || paddingBottom || paddingLeft) declarations.push(`padding: ${round(paddingTop)}px ${round(paddingRight)}px ${round(paddingBottom)}px ${round(paddingLeft)}px`);
      declarations.push(`justify-content: ${target.layoutJustifyContent || 'flex-start'}`, `align-items: ${target.layoutAlignItems || 'flex-start'}`);
      if (target.layoutWrap) declarations.push('flex-wrap: wrap');
    } else declarations.push('display: block');
    return declarations;
  };

  const markupNode = (node: LayoutNode, depth: number, parentLayoutMode: 'none' | 'horizontal' | 'vertical', stack: Set<string>): string => {
    if (stack.has(node.id)) return '';
    const nextStack = new Set(stack); nextStack.add(node.id);
    const id = outputIdByOriginal.get(node.id) || safeId(node.id, 'layout-node');
    const className = classByOriginal.get(node.id) || 'layout-node';
    const indent = '  '.repeat(depth);
    const isRaster = node.kind === 'raster' || Boolean(node.assetPath);
    const safeAssetPath = isRaster ? safeAssetReference(node.assetPath) : undefined;
    let opening: string, closing: string;
    const interaction = node.interaction && node.interaction !== 'none' ? node.interaction : undefined;
    const actionName = escapeXml(node.actionName || node.name || id);
    const actionAttrs = interaction ? ` data-layout-action="${escapeXml(interaction)}" data-layout-action-name="${actionName}"` : '';
    const outputClass = interaction ? `${className} layout-action` : className;
    if (isRaster && safeAssetPath) {
      const image = `<img id="${id}-image" class="${className}-image" src="${escapeXml(safeAssetPath)}" alt="${escapeXml(node.name)}"/>`;
      if (interaction) { opening = `<button type="button" id="${id}" class="${outputClass}"${actionAttrs} aria-label="${actionName}">${image}`; closing = '</button>'; }
      else { opening = `<img id="${id}" class="${className}" src="${escapeXml(safeAssetPath)}" alt="${escapeXml(node.name)}"/>`; closing = ''; }
    } else if (isRaster) {
      if (node.assetPath) diagnostics.push(`«${node.name}»: путь ресурса небезопасен или не является относительным; вместо него выведена заглушка.`);
      else diagnostics.push(`«${node.name}»: для векторного слоя ещё не создан PNG-ресурс; вместо него выведена заглушка.`);
      opening = `<div id="${id}" class="${className} layout-placeholder"${actionAttrs} aria-label="${actionName}">`;
      closing = '</div>';
    } else if (interaction) {
      const inner = node.kind === 'text' || (node.kind === 'container' && node.text) ? escapeXml(node.text || node.name || 'Текст') : '';
      opening = `<button type="button" id="${id}" class="${outputClass}"${actionAttrs} aria-label="${actionName}">${inner}`;
      closing = '</button>';
    } else {
      const tag = node.kind === 'text' ? 'span' : 'div';
      const inner = node.kind === 'text' || (node.kind === 'container' && node.text) ? escapeXml(node.text || node.name || 'Текст') : '';
      opening = `<${tag} id="${id}" class="${className}">${inner}`;
      closing = `</${tag}>`;
    }
    const childLayoutMode = node.kind === 'container' ? (node.layoutMode || 'none') : 'none';
    const childLines = (childrenByParent.get(node.id) || []).map(child => markupNode(child, depth + 1, childLayoutMode, nextStack)).filter(Boolean);
    // Flow is only used under an actual flex container. Other children are positioned against their nearest container.
    const parentNode = effectiveParent.get(node.id) ? nodesById.get(effectiveParent.get(node.id)!) : undefined;
    const effectiveParentLayout = parentNode?.kind === 'container' ? (parentNode.layoutMode || 'none') : (!parentNode ? (document.layoutMode || 'none') : 'none');
    const isFlowChild = effectiveParentLayout !== 'none' && node.layoutPositioning !== 'absolute';
    const decl: string[] = [
      `position: ${isFlowChild ? (node.kind === 'container' ? 'relative' : 'static') : 'absolute'}`, 'box-sizing: border-box',
      ...(!isFlowChild ? [`left: ${round(node.x)}px`, `top: ${round(node.y)}px`] : []),
      `width: ${round(Math.max(0.1, node.width))}px`, `height: ${round(Math.max(0.1, node.height))}px`,
      `opacity: ${round(clamp(node.opacity ?? 1, 0, 1))}`,
    ];
    if (interaction) decl.push('display: block', 'padding: 0', 'margin: 0', 'border-width: 0', 'background-color: transparent');
    if (isFlowChild) {
      const fillOnMainAxis = effectiveParentLayout === 'horizontal' ? node.layoutSizingHorizontal === 'fill' : node.layoutSizingVertical === 'fill';
      const fillOnCrossAxis = effectiveParentLayout === 'horizontal' ? node.layoutSizingVertical === 'fill' : node.layoutSizingHorizontal === 'fill';
      if (fillOnMainAxis || node.layoutGrow) decl.push(`flex-grow: ${round(Math.max(1, node.layoutGrow || 1))}`, 'flex-shrink: 1', 'flex-basis: 0px');
      else decl.push('flex-shrink: 0');
      if (fillOnCrossAxis) decl.push('align-self: stretch');
    }
    if (node.kind === 'text') {
      decl.push('display: block', `font-family: "${escapeCssString(node.fontFamily || 'Onest')}"`, `font-size: ${round(node.fontSize || 16)}px`, `font-weight: ${clamp(node.fontWeight || 400, 100, 900)}`, `color: ${normalizeColor(node.fill, '#ffffff') === 'transparent' ? '#ffffff' : normalizeColor(node.fill, '#ffffff')}`, `text-align: ${node.textAlign || 'left'}`, 'white-space: pre-wrap', node.lineHeight ? `line-height: ${round(node.lineHeight)}px` : 'line-height: 1.15');
      if (node.letterSpacing !== undefined) decl.push(`letter-spacing: ${round(node.letterSpacing)}px`);
      if (node.textTransform) decl.push(`text-transform: ${node.textTransform}`);
      if (node.textDecoration) decl.push(`text-decoration: ${node.textDecoration}`);
    } else if (node.kind === 'line') {
      const lineColor = node.stroke && node.stroke !== 'transparent' ? normalizeColor(node.stroke, '#ffffff') : normalizeColor(node.fill, '#ffffff');
      decl.push(`background-color: ${lineColor}`);
    } else if (isRaster) {
      decl.push('display: block');
    } else {
      if (node.kind === 'container') decl.push(...containerDeclarations(node));
      else decl.push('display: block');
      if (node.clipContent) decl.push('overflow: hidden');
      if (node.fill && node.fill !== 'transparent') decl.push(`background-color: ${normalizeColor(node.fill, 'transparent')}`);
      if (node.backdropBlur && node.backdropBlur > 0) decl.push(`backdrop-filter: blur(${round(node.backdropBlur)}px)`);
      if (node.text) decl.push(`font-family: "${escapeCssString(node.fontFamily || 'Onest')}"`, `font-size: ${round(node.fontSize || 16)}px`, `font-weight: ${clamp(node.fontWeight || 400, 100, 900)}`, 'color: #ffffff', `text-align: ${node.textAlign || 'left'}`);
      if (node.stroke && node.stroke !== 'transparent' && (node.strokeWidth || 1)) decl.push(`border: ${round(Math.max(0, node.strokeWidth || 1))}px solid ${normalizeColor(node.stroke, 'transparent')}`);
      if (node.radius) decl.push(`border-radius: ${round(node.radius)}px`);
    }
    if (node.rotation) decl.push(`transform: rotate(${round(node.rotation)}deg)`, 'transform-origin: center center');
    styles.push(`.${className} {\n  ${decl.join(';\n  ')};\n}`);
    const contents = [opening, ...childLines.map(line => line.trimStart()), closing].filter(Boolean).join('\n' + indent + '  ');
    return `${indent}${contents}`;
  };

  const rootDeclarations: string[] = [
    'position: relative', 'box-sizing: border-box',
    `width: ${round(document.width)}px`, `height: ${round(document.height)}px`,
    `overflow: ${document.clipContent === false ? 'visible' : 'hidden'}`,
  ];
  if (document.backgroundColor && document.backgroundColor !== 'transparent') rootDeclarations.push(`background-color: ${normalizeColor(document.backgroundColor, 'transparent')}`);
  rootDeclarations.push(...containerDeclarations(document));
  const rootMarkup = (childrenByParent.get(undefined) || []).map(node => markupNode(node, 2, document.layoutMode || 'none', new Set())).join('\n');
  const rml = `<rml>\n<head>\n  <title>${escapeXml(document.name)}</title>\n  <link type="text/rcss" href="vacuus-base.rcss"/>\n  <link type="text/rcss" href="layout.rcss"/>\n  <script src="layout.js"></script>\n</head>\n<body>\n  <div id="layout-root">\n${rootMarkup}\n  </div>\n</body>\n</rml>\n`;
  const rcss = `/* Generated from ${document.sourceKind.toUpperCase()} by Kormatal Layout Generator. Review diagnostics before shipping. */\n#layout-root {\n  ${rootDeclarations.join(';\n  ')};\n}\n.layout-placeholder {\n  border: 1px dashed #eab308;\n  background-color: rgba(234,179,8,0.08);\n}\n${styles.join('\n\n')}\n.layout-action { padding: 0; margin: 0; border-width: 0; background-color: transparent; }\n.layout-action:focus { border-width: 1px; border-color: #20ab8e; }\n.layout-action.is-active { border-width: 1px; border-color: #20ab8e; }\n`;
  const js = generateLayoutInteractionJs(visibleNodes);
  if (visibleNodes.length >= MAX_LAYOUT_NODES) diagnostics.push(`Генерация ограничена ${MAX_LAYOUT_NODES} элементами.`);
  const pipeline = getLayoutSourcePipeline(document.sourceKind);
  const kindCounts = visibleNodes.reduce((counts, node) => { counts[node.kind] = (counts[node.kind] || 0) + 1; return counts; }, {} as Record<string, number>);
  const interactiveCount = visibleNodes.filter(node => node.interaction && node.interaction !== 'none').length;
  const reportSections = [
    '# Отчёт генератора макета',
    `- Источник: ${document.sourceKind}`,
    `- Размер холста: ${round(document.width)} × ${round(document.height)} px`,
    `- Всего элементов Layout IR: ${visibleNodes.length}`,
    `- Контейнеры: ${kindCounts.container || 0}; текст: ${kindCounts.text || 0}; фигуры: ${kindCounts.shape || 0}; линии: ${kindCounts.line || 0}; растровые слои: ${kindCounts.raster || 0}`,
    `- Интерактивные элементы: ${interactiveCount}`,
    '- Файлы редактируемого интерфейса: main-editable.rml, layout.rcss, layout.js',
    `- Диагностик: ${new Set(diagnostics).size}`,
    '## Важно о точности',
    'Редактируемый RML/RCSS является реконструкцией структуры. Он может отличаться от исходного макета, если источник не содержит полной геометрии или эффектов, либо если свойства не поддерживаются VaCuus. Для пиксельного совпадения основной main.rml использует отдельный PNG-эталон; редактируемый вариант доступен как main-editable.rml. PNG-подложка сохраняет вид, но сама по себе не превращает все нарисованные части в нативные текстовые/векторные элементы.',
    '## Как источник преобразован',
    `**${pipeline.title}**`,
    pipeline.summary,
    pipeline.steps.map((step, index) => `${index + 1}. **${step.title.replace(/^\d+ · /, '')}.** ${step.description}`).join('\n\n'),
    '## Как генерируется код',
    'RML задаёт дерево элементов; RCSS — размеры, цвета, шрифты, позиции и поддерживаемые параметры раскладки.',
    'layout.js добавляет действия для явно помеченных интерактивных элементов: отправляет событие layout_ui_action и локально обрабатывает toggle/tab. Игровые команды нужно связать на стороне Blueprint/C++ через VaCuus.',
    'Отсутствие предупреждений не доказывает визуальное совпадение в Unreal; для окончательной приёмки необходим скриншотный тест в фактической версии VaCuus.',
    '## Диагностика',
    diagnostics.length ? [...new Set(diagnostics)].map(item => `- ${item}`).join('\n') : 'Синтаксические/структурные замечания генератора отсутствуют; визуальную точность в UE ещё нужно подтвердить.',
  ];
  const report = reportSections.join('\n\n');
  return { rml, rcss, js, report, diagnostics: [...new Set(diagnostics)] };
}


/** Produces a lightweight SVG illustration of the current Layout IR for the editor preview. */
export function renderLayoutDocumentSvg(document: LayoutDocument): string {
  const width = clamp(round(document.width), 1, MAX_DIMENSION);
  const height = clamp(round(document.height), 1, MAX_DIMENSION);
  const esc = (value: string) => escapeXml(value);
  const visible = document.nodes.filter(node => node.visible !== false).slice(0, MAX_LAYOUT_NODES);
  const byId = new Map(visible.map(node => [node.id, node]));
  const absoluteCache = new Map<string, { x: number; y: number }>();
  const absolutePosition = (node: LayoutNode, seen = new Set<string>()): { x: number; y: number } => {
    const cached = absoluteCache.get(node.id);
    if (cached) return cached;
    if (seen.has(node.id)) return { x: node.x, y: node.y };
    const nextSeen = new Set(seen); nextSeen.add(node.id);
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    const parentPosition = parent ? absolutePosition(parent, nextSeen) : { x: 0, y: 0 };
    const result = { x: parentPosition.x + node.x, y: parentPosition.y + node.y };
    absoluteCache.set(node.id, result);
    return result;
  };
  const elements = visible.map(node => {
    const position = absolutePosition(node);
    const x = round(clamp(position.x, -width, width * 2));
    const y = round(clamp(position.y, -height, height * 2));
    const w = round(clamp(node.width, 0.1, width * 2));
    const h = round(clamp(node.height, 0.1, height * 2));
    const fill = normalizeColor(node.fill, 'transparent');
    const stroke = normalizeColor(node.stroke, 'transparent');
    const opacity = round(clamp(node.opacity ?? 1, 0, 1));
    const transform = node.rotation ? ` transform="rotate(${round(node.rotation)} ${round(x + w / 2)} ${round(y + h / 2)})"` : '';
    if (node.kind === 'text') {
      const content = esc(node.text || node.name || '');
      const anchor = node.textAlign === 'center' ? 'middle' : node.textAlign === 'right' ? 'end' : 'start';
      const tx = node.textAlign === 'center' ? x + w / 2 : node.textAlign === 'right' ? x + w : x;
      const fontSize = round(clamp(node.fontSize || 16, 1, 256));
      const baseline = y + Math.min(h, fontSize * 1.15);
      return `<text id="${esc(node.id)}" x="${tx}" y="${baseline}" font-family="${esc(node.fontFamily || 'Onest')}" font-size="${fontSize}" font-weight="${clamp(node.fontWeight || 400, 100, 900)}" text-anchor="${anchor}" fill="${fill === 'transparent' ? '#ffffff' : fill}" opacity="${opacity}"${transform}>${content}</text>`;
    }
    if (node.kind === 'line') return `<path d="M ${x} ${y} L ${x + w} ${y + h}" fill="none" stroke="${stroke === 'transparent' ? fill : stroke}" stroke-width="${Math.max(1, node.strokeWidth || 1)}" opacity="${opacity}"${transform}/>`;
    if (node.kind === 'raster' || node.assetPath) {
      if (node.assetContentBase64 && node.assetMimeType === 'image/png') return `<image id="${esc(node.id)}" href="data:image/png;base64,${node.assetContentBase64}" x="${x}" y="${y}" width="${w}" height="${h}" opacity="${opacity}"${transform}/>`;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#64748b" fill-opacity="0.25" stroke="#94a3b8" stroke-dasharray="5 4" opacity="${opacity}"${transform}/><text x="${x + 5}" y="${y + Math.min(18, h / 2)}" font-size="10" fill="#cbd5e1">${esc(node.name)}</text>`;
    }
    if (node.kind === 'shape' && node.sourceType === 'ELLIPSE') return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fill}" stroke="${stroke}" opacity="${opacity}"${transform}/>`;
    const radius = round(clamp(node.radius || 0, 0, Math.min(w, h) / 2));
    const rect = `<rect id="${esc(node.id)}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${Math.max(0, node.strokeWidth || 0)}" opacity="${opacity}"${transform}/>`;
    if (node.text) return `${rect}<text x="${x + 8}" y="${y + Math.min(h - 2, (node.fontSize || 16) + 6)}" font-family="${esc(node.fontFamily || 'Onest')}" font-size="${round(clamp(node.fontSize || 16, 1, 256))}" fill="#ffffff">${esc(node.text)}</text>`;
    return rect;
  }).join('');
  const background = document.backgroundColor && document.backgroundColor !== 'transparent' ? normalizeColor(document.backgroundColor, '#111318') : '#111318';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${background}"/>${elements}</svg>`;
}


export function getLayoutNodeAbsolutePosition(document: LayoutDocument, nodeId: string): { x: number; y: number } {
  const byId = new Map(document.nodes.map(node => [node.id, node]));
  const visit = (id: string, seen: Set<string>): { x: number; y: number } => {
    const node = byId.get(id);
    if (!node) return { x: 0, y: 0 };
    if (seen.has(id)) return { x: node.x, y: node.y };
    const next = new Set(seen); next.add(id);
    const parent = node.parentId ? visit(node.parentId, next) : { x: 0, y: 0 };
    return { x: parent.x + node.x, y: parent.y + node.y };
  };
  return visit(nodeId, new Set());
}

export function updateLayoutNode(nodes: LayoutNode[], id: string, patch: Partial<LayoutNode>): LayoutNode[] {
  return nodes.map(node => node.id === id ? { ...node, ...patch, id: node.id } : node);
}

export function createManualLayoutNode(kind: 'container' | 'text' | 'shape' | 'line', index: number, width: number, height: number): LayoutNode {
  return {
    id: `manual-${index}`, name: kind === 'text' ? `Текст ${index}` : kind === 'container' ? `Панель ${index}` : kind === 'line' ? `Линия ${index}` : `Фигура ${index}`,
    kind, x: Math.round(width * 0.15), y: Math.round(height * 0.15), layoutPositioning: 'absolute', width: Math.max(32, Math.round(width * 0.25)), height: kind === 'text' ? 28 : Math.max(16, Math.round(height * 0.08)),
    fill: kind === 'text' ? '#ffffff' : kind === 'container' ? '#222831' : 'transparent', stroke: kind === 'container' ? '#3b4654' : 'transparent',
    strokeWidth: kind === 'container' ? 1 : 0, radius: kind === 'container' ? 6 : 0, text: kind === 'text' ? 'Новый текст' : undefined,
    fontFamily: 'Onest', fontSize: 16, fontWeight: 400, textAlign: 'left', confidence: 1, sourceType: 'manual', visible: true,
  };
}
