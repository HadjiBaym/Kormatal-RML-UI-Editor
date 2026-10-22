/** Shared lightweight HTML tokenizer/tree builder for converter stages.
 * It is intentionally dependency-free and targets common UI HTML, not the full HTML5 parsing algorithm.
 */
export type HtmlNodeType = 'document' | 'element' | 'text' | 'comment' | 'doctype';
export interface HtmlAttribute {
  name: string;
  value: string;
  hasValue: boolean;
  /** Source range of the complete attribute, used for precise, non-destructive edits. */
  sourceStart?: number;
  sourceEnd?: number;
}
export interface HtmlParseWarning { name: string; start: number; message: string; }

export interface HtmlNode {
  type: HtmlNodeType;
  name?: string;
  value?: string;
  attrs?: HtmlAttribute[];
  children: HtmlNode[];
  parent?: HtmlNode;
  start: number;
  end: number;
  selfClosingSyntax?: boolean;
  parseWarnings?: HtmlParseWarning[];
}

export const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr', 'keygen',
]);
const RAW_TEXT_TAGS = new Set(['script', 'style']);
const RCDATA_TAGS = new Set(['textarea', 'title']);
const BLOCK_START_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset', 'footer',
  'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'nav',
  'ol', 'p', 'pre', 'section', 'table', 'ul',
]);

export function parseHtmlTree(source: string): HtmlNode {
  const root: HtmlNode = { type: 'document', children: [], start: 0, end: source.length, parseWarnings: [] };
  const stack: HtmlNode[] = [root];
  let i = 0;
  // Cache the lowercase copy only when raw-text elements occur; do not lowercase the
  // complete document once per <style>/<script> block.
  let lowerSource: string | null = null;

  const append = (node: HtmlNode) => {
    node.parent = stack[stack.length - 1];
    stack[stack.length - 1].children.push(node);
  };

  while (i < source.length) {
    if (source.startsWith('<!--', i)) {
      const close = source.indexOf('-->', i + 4);
      const end = close === -1 ? source.length : close + 3;
      append({ type: 'comment', value: source.slice(i + 4, close === -1 ? source.length : close), children: [], start: i, end });
      i = end;
      continue;
    }

    if (/^<!doctype\b/i.test(source.slice(i, i + 16))) {
      const endIndex = source.indexOf('>', i + 2);
      const end = endIndex === -1 ? source.length : endIndex + 1;
      append({ type: 'doctype', value: source.slice(i, end), children: [], start: i, end });
      i = end;
      continue;
    }

    if (source.startsWith('</', i)) {
      const close = parseEndTag(source, i);
      if (!close) {
        append({ type: 'text', value: '<', children: [], start: i, end: i + 1 });
        i += 1;
        continue;
      }
      const warning = closeOpenElement(stack, close.name, i);
      if (warning) root.parseWarnings?.push(warning);
      i = close.end;
      continue;
    }

    if (source[i] === '<' && isTagNameStart(source[i + 1])) {
      const open = parseStartTag(source, i);
      if (!open) {
        append({ type: 'text', value: '<', children: [], start: i, end: i + 1 });
        i += 1;
        continue;
      }

      autoCloseOptionalElements(stack, open.name);
      const node: HtmlNode = {
        type: 'element', name: open.name, attrs: open.attrs, children: [],
        start: i, end: open.end, selfClosingSyntax: open.selfClosing,
      };
      append(node);
      i = open.end;

      if (VOID_TAGS.has(open.name) || open.selfClosing) continue;

      if (RAW_TEXT_TAGS.has(open.name) || RCDATA_TAGS.has(open.name)) {
        lowerSource ??= source.toLowerCase();
        const close = findRawClosingTag(source, i, open.name, lowerSource);
        const textEnd = close ? close.start : source.length;
        if (textEnd > i) {
          const rawValue = source.slice(i, textEnd);
          node.children.push({
            type: 'text', value: RAW_TEXT_TAGS.has(open.name) ? rawValue : decodeHtmlEntities(rawValue),
            children: [], parent: node, start: i, end: textEnd,
          });
        }
        node.end = close ? close.end : source.length;
        i = close ? close.end : source.length;
        continue;
      }

      stack.push(node);
      continue;
    }

    const nextTag = source.indexOf('<', i + 1);
    const end = nextTag === -1 ? source.length : nextTag;
    const text = source.slice(i, end);
    if (text) append({ type: 'text', value: decodeHtmlEntities(text), children: [], start: i, end });
    i = end;
  }

  return root;
}

function parseStartTag(source: string, start: number): { name: string; attrs: HtmlAttribute[]; end: number; selfClosing: boolean } | null {
  let i = start + 1;
  const nameStart = i;
  while (i < source.length && isTagNameChar(source[i])) i++;
  if (i === nameStart) return null;
  const name = source.slice(nameStart, i).toLowerCase();
  const attrs: HtmlAttribute[] = [];
  let selfClosing = false;

  while (i < source.length) {
    while (isWhitespace(source[i])) i++;
    if (i >= source.length) return { name, attrs, end: source.length, selfClosing };
    if (source[i] === '>') return { name, attrs, end: i + 1, selfClosing };
    if (source[i] === '/' && source[i + 1] === '>') return { name, attrs, end: i + 2, selfClosing: true };

    const attrStart = i;
    while (i < source.length && !isWhitespace(source[i]) && source[i] !== '=' && source[i] !== '>' && source[i] !== '/') i++;
    if (attrStart === i) { i++; continue; }
    const attrName = source.slice(attrStart, i).toLowerCase();
    const attrNameEnd = i;
    while (isWhitespace(source[i])) i++;
    let value = '';
    let hasValue = false;
    let attrEnd = attrNameEnd;
    if (source[i] === '=') {
      hasValue = true;
      i++;
      while (isWhitespace(source[i])) i++;
      const quote = source[i];
      if (quote === '"' || quote === "'") {
        i++;
        const valueStart = i;
        while (i < source.length && source[i] !== quote) i++;
        value = source.slice(valueStart, i);
        if (source[i] === quote) i++;
      } else {
        const valueStart = i;
        while (i < source.length && !isWhitespace(source[i]) && source[i] !== '>') i++;
        value = source.slice(valueStart, i);
      }
      attrEnd = i;
    }
    if (!attrs.some(attr => attr.name === attrName)) {
      attrs.push({
        name: attrName,
        value: decodeHtmlEntities(value),
        hasValue,
        sourceStart: attrStart,
        sourceEnd: attrEnd,
      });
    }
  }
  return { name, attrs, end: source.length, selfClosing };
}

function parseEndTag(source: string, start: number): { name: string; end: number } | null {
  let i = start + 2;
  while (isWhitespace(source[i])) i++;
  const nameStart = i;
  while (i < source.length && isTagNameChar(source[i])) i++;
  if (nameStart === i) return null;
  const name = source.slice(nameStart, i).toLowerCase();
  const close = source.indexOf('>', i);
  return { name, end: close === -1 ? source.length : close + 1 };
}

function autoCloseOptionalElements(stack: HtmlNode[], incoming: string): void {
  if (incoming === 'li') closeNearestOpen(stack, new Set(['li']), new Set(['ul', 'ol', 'menu']));
  if (incoming === 'dt' || incoming === 'dd') closeNearestOpen(stack, new Set(['dt', 'dd']), new Set(['dl']));
  if (incoming === 'option') closeNearestOpen(stack, new Set(['option']), new Set(['select', 'datalist']));
  if (incoming === 'optgroup') closeNearestOpen(stack, new Set(['option']), new Set(['select', 'datalist']));
  if (incoming === 'tr') closeNearestOpen(stack, new Set(['tr']), new Set(['table']));
  if (incoming === 'td' || incoming === 'th') closeNearestOpen(stack, new Set(['td', 'th']), new Set(['tr', 'table']));
  if (['thead', 'tbody', 'tfoot'].includes(incoming)) {
    closeNearestOpen(stack, new Set(['thead', 'tbody', 'tfoot']), new Set(['table']));
  }
  if (/^h[1-6]$/.test(incoming)) closeNearestOpen(stack, new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']));
  if (BLOCK_START_TAGS.has(incoming)) closeNearestOpen(stack, new Set(['p']));
}

/** Pops an open optional-end-tag element and any unclosed descendants above it. */
function closeNearestOpen(stack: HtmlNode[], names: Set<string>, stopAt: Set<string> = new Set()): void {
  for (let index = stack.length - 1; index > 0; index--) {
    const name = stack[index].name || '';
    if (names.has(name)) {
      stack.length = index;
      return;
    }
    if (stopAt.has(name)) return;
  }
}

function closeOpenElement(stack: HtmlNode[], name: string, start: number): HtmlParseWarning | undefined {
  // Do not let a stray mismatched closing tag cross a phrasing/control boundary and
  // close an unrelated ancestor container. This was corrupting real UI trees when a
  // source had e.g. an extra </div> inside a <button>.
  const scopeBoundaries = new Set(['button', 'select', 'textarea', 'option', 'a', 'form']);
  for (let index = stack.length - 1; index > 0; index--) {
    const openName = stack[index].name || '';
    if (openName === name) {
      stack.length = index;
      return undefined;
    }
    if (scopeBoundaries.has(openName)) {
      return {
        name,
        start,
        message: `Ignored unmatched closing tag </${name}> inside <${openName}> instead of closing an ancestor element. Check the source HTML nesting.`,
      };
    }
  }
  return {
    name,
    start,
    message: `Ignored unmatched closing tag </${name}> because no matching open element exists.`,
  };
}

function findRawClosingTag(source: string, start: number, name: string, lower = source.toLowerCase()): { start: number; end: number } | null {
  const needle = `</${name}`;
  let index = lower.indexOf(needle, start);
  while (index !== -1) {
    const charAfterName = lower[index + needle.length];
    if (charAfterName === '>' || isWhitespace(charAfterName)) {
      const close = source.indexOf('>', index + needle.length);
      return { start: index, end: close === -1 ? source.length : close + 1 };
    }
    index = lower.indexOf(needle, index + needle.length);
  }
  return null;
}

export function getAttribute(node: HtmlNode | undefined, name: string): string {
  return node?.attrs?.find(attr => attr.name === name.toLowerCase())?.value ?? '';
}

export function directChild(parent: HtmlNode | undefined, name: string): HtmlNode | undefined {
  return parent?.children.find(node => node.type === 'element' && node.name === name);
}

export function firstDescendant(node: HtmlNode | undefined, predicate: (candidate: HtmlNode) => boolean): HtmlNode | undefined {
  if (!node) return undefined;
  const pending = [node];
  while (pending.length) {
    const current = pending.pop()!;
    if (predicate(current)) return current;
    for (let index = current.children.length - 1; index >= 0; index--) pending.push(current.children[index]);
  }
  return undefined;
}

export function descendants(nodes: HtmlNode[]): HtmlNode[] {
  const result: HtmlNode[] = [];
  const pending = [...nodes].reverse();
  while (pending.length) {
    const node = pending.pop()!;
    result.push(node);
    for (let index = node.children.length - 1; index >= 0; index--) pending.push(node.children[index]);
  }
  return result;
}

export function collectText(node: HtmlNode): string {
  if (node.type === 'text') return node.value || '';
  const parts: string[] = [];
  const pending = [...node.children].reverse();
  while (pending.length) {
    const current = pending.pop()!;
    if (current.type === 'text') parts.push(current.value || '');
    else for (let index = current.children.length - 1; index >= 0; index--) pending.push(current.children[index]);
  }
  return parts.join('');
}

export function locationAt(source: string, offset: number): { line: number; column: number } {
  const prefix = source.slice(0, offset);
  const lastNewline = prefix.lastIndexOf('\n');
  return { line: (prefix.match(/\n/g) || []).length + 1, column: offset - lastNewline };
}

function isTagNameStart(char: string | undefined): boolean {
  return Boolean(char && /[a-zA-Z]/.test(char));
}
function isTagNameChar(char: string | undefined): boolean {
  return Boolean(char && /[a-zA-Z0-9:_-]/.test(char));
}
function isWhitespace(char: string | undefined): boolean {
  return Boolean(char && /[\t\n\f\r ]/.test(char));
}
export const HTML_NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '\u00a9',
  reg: '\u00ae', trade: '\u2122', mdash: '\u2014', ndash: '\u2013', hellip: '\u2026',
  bull: '\u2022', middot: '\u00b7', lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c',
  rdquo: '\u201d', euro: '\u20ac', pound: '\u00a3', yen: '\u00a5', cent: '\u00a2',
};
export const SUPPORTED_HTML_NAMED_ENTITY_NAMES = new Set(Object.keys(HTML_NAMED_ENTITIES));

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|[a-z][a-z0-9]+);?/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const hex = entity[1]?.toLowerCase() === 'x';
      const numeric = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 0x10ffff || (numeric >= 0xd800 && numeric <= 0xdfff)) return '\ufffd';
      return String.fromCodePoint(numeric);
    }
    return Object.prototype.hasOwnProperty.call(HTML_NAMED_ENTITIES, entity.toLowerCase()) ? HTML_NAMED_ENTITIES[entity.toLowerCase()] : match;
  });
}

