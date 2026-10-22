import { descendants, getAttribute, parseHtmlTree, type HtmlNode } from './html-parser.ts';
import postcss from 'postcss';
import { parse as parseJavaScript } from 'acorn';
import type { ProjectFile } from './types.ts';
import type { PreviewAssetUrlMap } from './preview-assets.ts';

export interface OriginalPreviewDiagnostic {
  severity: 'warning' | 'error';
  category: 'resource' | 'javascript' | 'preview';
  file: string;
  message: string;
}

export interface OriginalPreviewBuildResult {
  html: string;
  diagnostics: OriginalPreviewDiagnostic[];
  resources: { stylesheets: number; scripts: number; localAssets: number };
}

interface SourceChange { start: number; end: number; value: string; }

const EXTERNAL_REFERENCE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;
const SCRIPT_DATA_TYPES = new Set(['application/json', 'application/ld+json', 'text/template', 'text/x-template', 'importmap']);

function normalizePath(value: string): string {
  const segments: string[] = [];
  let decoded = value.replace(/\\/g, '/');
  try { decoded = decodeURIComponent(decoded); } catch { /* keep invalid escapes literally */ }
  for (const segment of decoded.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') { if (segments.length) segments.pop(); continue; }
    segments.push(segment.toLowerCase());
  }
  return segments.join('/');
}

function directoryOf(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  return slash < 0 ? '' : normalized.slice(0, slash);
}

function isExternal(reference: string): boolean {
  return EXTERNAL_REFERENCE.test(reference.trim());
}

function stripQueryHash(value: string): string {
  return value.trim().replace(/[?#].*$/, '');
}

function extension(value: string): string {
  return (value.replace(/\\/g, '/').split('/').pop()?.match(/\.[^.]+$/)?.[0] || '').toLowerCase();
}

function resolveProjectFile(reference: string, fromPath: string, files: ProjectFile[], expected: 'css' | 'js' | 'asset' | 'any' = 'any'): ProjectFile | undefined {
  const raw = stripQueryHash(reference).replace(/\\/g, '/');
  if (!raw || isExternal(raw)) return undefined;
  const candidates: string[] = [];
  const push = (candidate: string) => {
    const normalized = normalizePath(candidate);
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
  };
  if (raw.startsWith('/')) push(raw.slice(1));
  else push(`${directoryOf(fromPath)}/${raw}`);
  push(raw.replace(/^\/+/, ''));
  const usable = files.filter(file => {
    if (file.contentEncoding === 'base64' && file.type !== 'asset') return false;
    if (expected === 'css') return file.type === 'css' || extension(file.path) === '.css';
    if (expected === 'js') return file.type === 'js' || /\.(?:js|mjs|cjs)$/i.test(file.path);
    if (expected === 'asset') return file.type === 'asset';
    return true;
  });
  for (const candidate of candidates) {
    const found = usable.find(file => normalizePath(file.path) === candidate);
    if (found) return found;
  }
  // A basename fallback is safe only when the imported project has exactly one match.
  const base = normalizePath(raw.split('/').pop() || '');
  const sameName = usable.filter(file => normalizePath(file.path.split('/').pop() || '') === base);
  return sameName.length === 1 ? sameName[0] : undefined;
}

function extensionMime(path: string): string {
  const ext = extension(path);
  const table: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
    '.svg': 'image/svg+xml', '.tga': 'image/x-tga', '.bmp': 'image/bmp',
    '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  };
  return table[ext] || 'application/octet-stream';
}

function encodeDataUrl(file: ProjectFile): string | undefined {
  if (file.contentEncoding === 'base64') {
    return `data:${file.mimeType || extensionMime(file.path)};base64,${file.content.replace(/\s+/g, '')}`;
  }
  if (extension(file.path) === '.svg' && file.type === 'asset') {
    return `data:${file.mimeType || 'image/svg+xml'};charset=utf-8,${encodeURIComponent(file.content)}`;
  }
  return undefined;
}

function mapLookup(reference: string, map: PreviewAssetUrlMap): string | undefined {
  const raw = reference.trim().replace(/^['"]|['"]$/g, '');
  const normalized = normalizePath(raw);
  const base = normalizePath(raw.split('/').pop() || '');
  return map[raw] || map[raw.toLowerCase()] || map[normalized] || map[normalized.toLowerCase()] || map[base] || undefined;
}

function resolveBrowserResource(reference: string, fromPath: string, files: ProjectFile[], assetUrls: PreviewAssetUrlMap): string | undefined {
  const raw = reference.trim();
  if (!raw || isExternal(raw)) return undefined;
  const unqueriedPath = stripQueryHash(raw);
  const hashIndex = raw.indexOf('#');
  const fragment = hashIndex >= 0 ? raw.slice(hashIndex) : '';
  const keepSvgFragment = (url: string | undefined, assetPath: string): string | undefined =>
    url && extension(assetPath) === '.svg' && fragment ? `${url}${fragment}` : url;
  const file = resolveProjectFile(raw, fromPath, files, 'asset');
  if (file) {
    const encoded = encodeDataUrl(file);
    if (encoded) return keepSvgFragment(encoded, file.path);
    const mappedByPath = mapLookup(file.path, assetUrls);
    if (mappedByPath) return keepSvgFragment(mappedByPath, file.path);
  }
  const mapped = mapLookup(unqueriedPath, assetUrls) || mapLookup(raw, assetUrls);
  return keepSvgFragment(mapped, unqueriedPath);
}

interface CssFunctionMatch { start: number; end: number; reference: string; }
interface CssImportMatch { start: number; end: number; reference: string; modifiers: string; }

function skipCssComment(css: string, index: number): number {
  if (css[index] !== '/' || css[index + 1] !== '*') return index;
  const close = css.indexOf('*/', index + 2);
  return close < 0 ? css.length : close + 2;
}

function skipCssString(css: string, index: number): number {
  const quote = css[index];
  if (quote !== '"' && quote !== "'") return index;
  let cursor = index + 1;
  while (cursor < css.length) {
    if (css[cursor] === '\\') { cursor += 2; continue; }
    if (css[cursor] === quote) return cursor + 1;
    cursor++;
  }
  return css.length;
}

function cssFunctionBody(css: string, openParen: number): { end: number; body: string } {
  let cursor = openParen + 1;
  let depth = 1;
  let quote = '';
  while (cursor < css.length) {
    const char = css[cursor];
    if (quote) {
      if (char === '\\') { cursor += 2; continue; }
      if (char === quote) quote = '';
      cursor++;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; cursor++; continue; }
    if (char === '/' && css[cursor + 1] === '*') { cursor = skipCssComment(css, cursor); continue; }
    if (char === '(') depth++;
    else if (char === ')' && --depth === 0) return { end: cursor + 1, body: css.slice(openParen + 1, cursor) };
    cursor++;
  }
  return { end: css.length, body: css.slice(openParen + 1) };
}

function parseCssUrlBody(body: string): string {
  const value = body.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1).replace(/\\([\\"'])/g, '$1');
  return value;
}

function findCssUrls(css: string): CssFunctionMatch[] {
  const matches: CssFunctionMatch[] = [];
  let cursor = 0;
  while (cursor < css.length) {
    if (css[cursor] === '/' && css[cursor + 1] === '*') { cursor = skipCssComment(css, cursor); continue; }
    if (css[cursor] === '"' || css[cursor] === "'") { cursor = skipCssString(css, cursor); continue; }
    if (css.slice(cursor, cursor + 3).toLowerCase() === 'url' && !/[\w-]/.test(css[cursor - 1] || ' ')) {
      let open = cursor + 3;
      while (/\s/.test(css[open] || '')) open++;
      if (css[open] === '(') {
        const parsed = cssFunctionBody(css, open);
        matches.push({ start: cursor, end: parsed.end, reference: parseCssUrlBody(parsed.body) });
        cursor = parsed.end;
        continue;
      }
    }
    cursor++;
  }
  return matches;
}

function findCssImports(css: string): CssImportMatch[] {
  const matches: CssImportMatch[] = [];
  let cursor = 0;
  while (cursor < css.length) {
    if (css[cursor] === '/' && css[cursor + 1] === '*') { cursor = skipCssComment(css, cursor); continue; }
    if (css[cursor] === '"' || css[cursor] === "'") { cursor = skipCssString(css, cursor); continue; }
    if (css[cursor] === '@' && css.slice(cursor, cursor + 7).toLowerCase() === '@import' && !/[\w-]/.test(css[cursor + 7] || ' ')) {
      let end = cursor + 7;
      let depth = 0;
      let quote = '';
      while (end < css.length) {
        const char = css[end];
        if (quote) {
          if (char === '\\') { end += 2; continue; }
          if (char === quote) quote = '';
          end++;
          continue;
        }
        if (char === '"' || char === "'") { quote = char; end++; continue; }
        if (char === '/' && css[end + 1] === '*') { end = skipCssComment(css, end); continue; }
        if (char === '(') depth++;
        else if (char === ')' && depth > 0) depth--;
        else if (char === ';' && depth === 0) { end++; break; }
        end++;
      }
      const rule = css.slice(cursor, end);
      const parsed = /^\s*@import\s+(?:url\(\s*(?:(["'])(.*?)\1|([^)]*?))\s*\)|(["'])(.*?)\4)\s*([^;]*);$/is.exec(rule);
      if (parsed) {
        matches.push({ start: cursor, end, reference: String(parsed[2] ?? parsed[3] ?? parsed[5] ?? '').trim(), modifiers: String(parsed[6] || '').trim() });
        cursor = end;
        continue;
      }
    }
    cursor++;
  }
  return matches;
}

function rewriteCssUrls(css: string, fromPath: string, files: ProjectFile[], assetUrls: PreviewAssetUrlMap, diagnostics: OriginalPreviewDiagnostic[], countAssets: () => void): string {
  const matches = findCssUrls(css);
  let output = css;
  for (const match of matches.reverse()) {
    const rawRef = match.reference.trim();
    if (!rawRef || isExternal(rawRef)) continue;
    const resolved = resolveBrowserResource(rawRef, fromPath, files, assetUrls);
    if (resolved) {
      output = output.slice(0, match.start) + `url("${resolved.replace(/"/g, '%22')}")` + output.slice(match.end);
      if (resolved.startsWith('data:')) countAssets();
    } else if (!rawRef.startsWith('#')) {
      diagnostics.push({ severity: 'warning', category: 'resource', file: fromPath, message: `CSS-ресурс "${rawRef}" не найден среди импортированных файлов; браузерный предпросмотр может не показать его.` });
    }
  }
  return output;
}

function inlineCssImports(css: string, fromPath: string, files: ProjectFile[], assetUrls: PreviewAssetUrlMap, diagnostics: OriginalPreviewDiagnostic[], stack: Set<string>, countAssets: () => void): string {
  const matches = findCssImports(css);
  let output = css;
  for (const match of matches.reverse()) {
    const ref = match.reference;
    const modifiers = match.modifiers;
    if (!ref || isExternal(ref)) continue;
    const imported = resolveProjectFile(ref, fromPath, files, 'css');
    const start = match.start;
    const end = match.end;
    let replacement = `/* VaCuus preview: unresolved CSS @import ${ref.replace(/\*\//g, '* /')} */`;
    if (!imported) {
      diagnostics.push({ severity: 'warning', category: 'resource', file: fromPath, message: `CSS @import "${ref}" не найден среди импортированных CSS-файлов.` });
    } else {
      try { postcss.parse(imported.content, { from: imported.path }); } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        diagnostics.push({ severity: 'error', category: 'resource', file: imported.path, message: `Синтаксическая ошибка CSS: ${reason.slice(0, 260)}` });
      }
      const key = normalizePath(imported.path);
      if (stack.has(key)) {
        diagnostics.push({ severity: 'error', category: 'resource', file: fromPath, message: `Обнаружен циклический CSS @import: ${[...stack, key].join(' → ')}.` });
      } else {
        const nextStack = new Set(stack); nextStack.add(key);
        let importedCss = inlineCssImports(imported.content, imported.path, files, assetUrls, diagnostics, nextStack, countAssets);
        importedCss = rewriteCssUrls(importedCss, imported.path, files, assetUrls, diagnostics, countAssets);
        if (/\b(?:layer|supports)\s*(?:\(|\b)/i.test(modifiers)) {
          // Keep browser-native cascade-layer/supports evaluation by preserving the @import
          // at-rule, but make its stylesheet self-contained with a CSS data URL.
          const dataCssUrl = `data:text/css;charset=utf-8,${encodeURIComponent(importedCss)}`;
          replacement = `@import url(\"${dataCssUrl}\") ${modifiers};`;
        } else {
          replacement = modifiers ? `@media ${modifiers} {\n${importedCss}\n}` : importedCss;
        }
      }
    }
    output = output.slice(0, start) + replacement + output.slice(end);
  }
  return output;
}

function rewriteCss(css: string, fromPath: string, files: ProjectFile[], assetUrls: PreviewAssetUrlMap, diagnostics: OriginalPreviewDiagnostic[], stack = new Set<string>(), countAssets = () => {}): string {
  try { postcss.parse(css, { from: fromPath }); } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    diagnostics.push({ severity: 'error', category: 'resource', file: fromPath, message: `Синтаксическая ошибка CSS: ${reason.slice(0, 260)}` });
  }
  const nextStack = new Set(stack);
  nextStack.add(normalizePath(fromPath));
  return rewriteCssUrls(inlineCssImports(css, fromPath, files, assetUrls, diagnostics, nextStack, countAssets), fromPath, files, assetUrls, diagnostics, countAssets);
}

function openingTagEnd(source: string, start: number): number {
  let quote = '';
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (quote) { if (char === quote) quote = ''; }
    else if (char === '"' || char === "'") quote = char;
    else if (char === '>') return index + 1;
  }
  return source.length;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function setRawAttribute(tag: string, name: string, value: string): string {
  const escaped = escapeAttribute(value);
  const quoted = new RegExp(`(\\b${name.replace(/[-:]/g, '[-:]')}\\s*=\\s*)(["'])(.*?)\\2`, 'i');
  if (quoted.test(tag)) return tag.replace(quoted, (_all, prefix) => `${prefix}"${escaped}"`);
  const unquoted = new RegExp(`(\\b${name.replace(/[-:]/g, '[-:]')}\\s*=\\s*)[^\\s>]+`, 'i');
  if (unquoted.test(tag)) return tag.replace(unquoted, (_all, prefix) => `${prefix}"${escaped}"`);
  return tag;
}

function serializeScriptAttributes(node: HtmlNode): string {
  const ignored = new Set(['src', 'defer', 'async', 'integrity', 'crossorigin', 'charset']);
  const values = (node.attrs || []).filter(attr => !ignored.has(attr.name.toLowerCase())).map(attr =>
    attr.hasValue ? `${attr.name}="${escapeAttribute(attr.value)}"` : attr.name,
  );
  return values.length ? ` ${values.join(' ')}` : '';
}

function isStylesheetLink(node: HtmlNode): boolean {
  if (node.name !== 'link') return false;
  const rel = getAttribute(node, 'rel').toLowerCase().split(/\s+/);
  return rel.includes('stylesheet') && !rel.includes('alternate') && Boolean(getAttribute(node, 'href'));
}

function isExecutableScriptType(type: string): boolean {
  const normalized = type.trim().toLowerCase().split(';', 1)[0].trim();
  return !normalized || normalized === 'module' || /^(?:text|application)\/(?:java|ecma)script$/.test(normalized);
}

function removeRawAttribute(tag: string, name: string): string {
  const escapedName = name.replace(/[-:]/g, '[-:]');
  return tag.replace(new RegExp(`\\s+${escapedName}(?:\\s*=\\s*(?:\"[^\"]*\"|'[^']*'|[^\\s>]+))?`, 'i'), '');
}

function resolveBaseDocumentPath(baseHref: string, htmlPath: string): string | undefined {
  const raw = stripQueryHash(baseHref).replace(/\\/g, '/');
  if (!raw || isExternal(baseHref)) return undefined;
  let joined = raw.startsWith('/') ? raw.slice(1) : `${directoryOf(htmlPath)}/${raw}`;
  joined = joined.replace(/\\/g, '/');
  if (raw.endsWith('/')) joined += '__vacuus_base__.html';
  return joined;
}

function rewriteSrcset(raw: string, fromPath: string, files: ProjectFile[], assetUrls: PreviewAssetUrlMap, countAssets: () => void): string {
  const candidates: Array<{ start: number; end: number; url: string }> = [];
  let cursor = 0;
  while (cursor < raw.length) {
    while (cursor < raw.length && /[\s,]/.test(raw[cursor])) cursor++;
    if (cursor >= raw.length) break;
    const start = cursor;
    // The URL token may itself contain commas (data URLs), so read to whitespace first.
    while (cursor < raw.length && !/\s/.test(raw[cursor])) cursor++;
    let end = cursor;
    let url = raw.slice(start, end);
    const endedWithSeparator = url.endsWith(',');
    while (url.endsWith(',')) { url = url.slice(0, -1); end--; }
    if (url) candidates.push({ start, end, url });
    if (endedWithSeparator) continue;
    while (cursor < raw.length && raw[cursor] !== ',') cursor++;
    if (raw[cursor] === ',') cursor++;
  }
  let output = raw;
  for (const candidate of candidates.reverse()) {
    const resolved = resolveBrowserResource(candidate.url, fromPath, files, assetUrls);
    if (resolved && resolved !== candidate.url) {
      output = output.slice(0, candidate.start) + resolved + output.slice(candidate.end);
      if (resolved.startsWith('data:')) countAssets();
    }
  }
  return output;
}

function decodeProjectText(file: ProjectFile): string | undefined {
  if (file.contentEncoding !== 'base64') return file.content;
  try {
    const binary = atob(file.content.replace(/\s+/g, ''));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch { return undefined; }
}

export function buildOriginalPreviewDocument(
  sourceHtml: string,
  sourceHtmlPath: string,
  sourceFiles: ProjectFile[],
  assetUrls: PreviewAssetUrlMap = {},
): OriginalPreviewBuildResult {
  const diagnostics: OriginalPreviewDiagnostic[] = [];
  const counts = { stylesheets: 0, scripts: 0, localAssets: 0 };
  const countAsset = () => { counts.localAssets += 1; };
  const htmlPath = sourceHtmlPath || 'index.html';
  if (!sourceHtml.trim()) {
    return { html: '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>', diagnostics: [{ severity: 'warning', category: 'preview', file: htmlPath, message: 'Не найден исходный HTML-файл для браузерного предпросмотра.' }], resources: counts };
  }

  const changes: SourceChange[] = [];
  const tree = parseHtmlTree(sourceHtml);
  for (const warning of tree.parseWarnings || []) diagnostics.push({ severity: 'warning', category: 'preview', file: htmlPath, message: `HTML-парсер: ${warning.message}` });
  const elements = descendants(tree.children).filter(node => node.type === 'element');
  const baseElement = elements.find(node => node.name === 'base' && Boolean(getAttribute(node, 'href')));
  const baseHref = baseElement ? getAttribute(baseElement, 'href').trim() : '';
  const externalBase = Boolean(baseHref && isExternal(baseHref) && !baseHref.startsWith('#'));
  const baseDocumentPath = baseHref && !externalBase ? resolveBaseDocumentPath(baseHref, htmlPath) : undefined;
  const resourceBasePath = baseDocumentPath || htmlPath;
  if (baseHref) {
    diagnostics.push({ severity: 'warning', category: 'preview', file: htmlPath, message: externalBase
      ? `В документе указан внешний <base href="${baseHref}">. Относительные ресурсы должны загружаться с этого внешнего адреса; локальные файлы проекта намеренно не подменяются.`
      : `В документе указан локальный <base href="${baseHref}">. Ресурсы разрешаются относительно этой базы, но переходы по относительным HTML-ссылкам между страницами проекта не эмулируются.` });
  }
  const cspMeta = elements.find(node => node.name === 'meta' && getAttribute(node, 'http-equiv').trim().toLowerCase() === 'content-security-policy');
  if (cspMeta) diagnostics.push({ severity: 'warning', category: 'preview', file: htmlPath, message: 'В исходном HTML задан Content-Security-Policy. Он может блокировать добавленные инструменты диагностики предпросмотра или локально встроенные ресурсы; смотри runtime-ошибки.' });

  // Parse JavaScript before rewriting it so syntax failures are visible even when a browser
  // error is obscured by sandbox/CSP behavior. External network scripts are left to runtime.
  let inlineScriptIndex = 0;
  for (const node of elements) {
    if (node.name !== 'script') continue;
    const scriptType = getAttribute(node, 'type').trim().toLowerCase();
    if (SCRIPT_DATA_TYPES.has(scriptType) || !isExecutableScriptType(scriptType)) continue;
    counts.scripts += 1;
    let code = '';
    let codeFile = `${htmlPath} (inline script)`;
    const src = getAttribute(node, 'src');
    if (src) {
      if (isExternal(src) || externalBase) continue;
      const scriptFile = resolveProjectFile(src, resourceBasePath, sourceFiles, 'js');
      if (!scriptFile) continue; // The dependency pass below emits the missing-resource diagnostic.
      const decoded = decodeProjectText(scriptFile);
      if (decoded === undefined) continue;
      code = decoded;
      codeFile = scriptFile.path;
    } else {
      inlineScriptIndex += 1;
      code = node.children.map(child => child.value || '').join('');
      codeFile = `${htmlPath} (inline script ${inlineScriptIndex})`;
    }
    if (!code.trim()) continue;
    try {
      parseJavaScript(code, { ecmaVersion: 'latest', sourceType: scriptType === 'module' ? 'module' : 'script', allowHashBang: true });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const location = (error as { loc?: { line?: number; column?: number } })?.loc;
      const line = location?.line ? `, строка ${location.line}, столбец ${(location.column || 0) + 1}` : '';
      diagnostics.push({ severity: 'error', category: 'javascript', file: codeFile, message: `Синтаксическая ошибка JavaScript${line}: ${reason.slice(0, 260)}` });
    }
    if (/\bdocument\.currentScript\.src\b|\bimport\.meta\.url\b/.test(code)) {
      diagnostics.push({ severity: 'warning', category: 'javascript', file: codeFile, message: 'Скрипт читает document.currentScript.src или import.meta.url. В srcdoc-предпросмотре виртуальный путь исходного файла не является реальным URL; такая логика может отличаться от запуска сайта с файловой структурой.' });
    }
    if (/\b(?:localStorage|sessionStorage)\b/.test(code)) {
      diagnostics.push({ severity: 'warning', category: 'javascript', file: codeFile, message: 'Скрипт использует localStorage/sessionStorage. В изолированном оригинальном предпросмотре они заменяются временным хранилищем только на время этого предпросмотра; данные не сохраняются между перезагрузками.' });
    }
    if (/\bfetch\s*\(\s*['"](?![a-z][a-z0-9+.-]*:|\/\/|#)[^'"]+['"]\s*\)/i.test(code) || /XMLHttpRequest/i.test(code)) {
      diagnostics.push({ severity: 'warning', category: 'javascript', file: codeFile, message: `Скрипт ${codeFile} обращается к сетевым ресурсам через fetch/XMLHttpRequest. Динамические URL данных не могут быть автоматически привязаны к виртуальной папке импортированного проекта; проверь Network/runtime.` });
    }
  }

  const replacedRanges: Array<{ start: number; end: number }> = [];
  const addChange = (change: SourceChange) => { changes.push(change); replacedRanges.push({ start: change.start, end: change.end }); };

  for (const node of elements) {
    if (node.name === 'link' && !externalBase && getAttribute(node, 'rel').toLowerCase().split(/\s+/).includes('preload')) {
      const href = getAttribute(node, 'href');
      const as = getAttribute(node, 'as').trim().toLowerCase();
      if (href && !isExternal(href) && (as === 'style' || as === 'script')) {
        const dependency = resolveProjectFile(href, resourceBasePath, sourceFiles, as === 'style' ? 'css' : 'js');
        if (!dependency) diagnostics.push({ severity: 'warning', category: 'resource', file: htmlPath, message: `Локальный preload ${as} "${href}" не найден; в оригинальном предпросмотре он пропущен.` });
        const comment = dependency
          ? `<!-- VaCuus original preview: preload ${as} ${dependency.path} omitted because the local dependency is embedded in document order -->`
          : `<!-- VaCuus original preview: unresolved preload ${as} ${href.replace(/--/g, '- -')} -->`;
        addChange({ start: node.start, end: node.end, value: comment });
        continue;
      }
    }
    if (isStylesheetLink(node)) {
      const href = getAttribute(node, 'href');
      if (isExternal(href) || externalBase) continue;
      const cssFile = resolveProjectFile(href, resourceBasePath, sourceFiles, 'css');
      if (!cssFile) {
        addChange({ start: node.start, end: node.end, value: `<!-- VaCuus original preview: missing stylesheet ${href.replace(/--/g, '- -')} -->` });
        diagnostics.push({ severity: 'error', category: 'resource', file: htmlPath, message: `Не найден CSS-файл "${href}" из <link rel="stylesheet">. Проверь импорт и путь относительно ${htmlPath}.` });
        continue;
      }
      if ((node.attrs || []).some(attr => attr.name.toLowerCase() === 'disabled')) {
        addChange({ start: node.start, end: node.end, value: `<!-- VaCuus original preview: disabled stylesheet ${cssFile.path} -->` });
        continue;
      }
      const media = getAttribute(node, 'media');
      const title = getAttribute(node, 'title');
      const css = rewriteCss(cssFile.content, cssFile.path, sourceFiles, assetUrls, diagnostics, new Set(), countAsset);
      const safeCss = css.replace(/<\/style/gi, '<\\/style');
      const styleAttrs = `${media ? ` media="${escapeAttribute(media)}"` : ''}${title ? ` title="${escapeAttribute(title)}"` : ''}`;
      addChange({ start: node.start, end: node.end, value: `<style data-vacuus-source-css="${escapeAttribute(cssFile.path)}"${styleAttrs}>\n${safeCss}\n</style>` });
      counts.stylesheets += 1;
      continue;
    }

    if (node.name === 'style') {
      if (externalBase) continue;
      const contentNode = node.children.find(child => child.type === 'text');
      const openingEnd = openingTagEnd(sourceHtml, node.start);
      const closingStart = contentNode ? contentNode.end : Math.max(openingEnd, node.end - 8);
      const contentStart = contentNode ? contentNode.start : openingEnd;
      const cssSource = sourceHtml.slice(contentStart, closingStart);
      if (cssSource) {
        const rewritten = rewriteCss(cssSource, resourceBasePath, sourceFiles, assetUrls, diagnostics, new Set(), countAsset).replace(/<\/style/gi, '<\\/style');
        changes.push({ start: contentStart, end: closingStart, value: rewritten });
      }
      counts.stylesheets += 1;
      continue;
    }

    if (node.name === 'script' && getAttribute(node, 'src')) {
      const src = getAttribute(node, 'src');
      if (isExternal(src) || externalBase) continue;
      const scriptType = getAttribute(node, 'type').trim().toLowerCase();
      const isDataPayload = SCRIPT_DATA_TYPES.has(scriptType);
      const scriptFile = resolveProjectFile(src, resourceBasePath, sourceFiles, isDataPayload ? 'any' : 'js');
      if (!scriptFile) {
        addChange({ start: node.start, end: node.end, value: `<!-- VaCuus original preview: missing script ${src.replace(/--/g, '- -')} -->` });
        diagnostics.push({ severity: 'error', category: 'resource', file: htmlPath, message: `Не найден ${isDataPayload ? 'файл данных' : 'JavaScript-файл'} "${src}" из <script src>. Проверь импорт и путь относительно ${htmlPath}.` });
        continue;
      }
      const decodedScriptContent = decodeProjectText(scriptFile);
      if (decodedScriptContent === undefined) {
        addChange({ start: node.start, end: node.end, value: `<!-- VaCuus original preview: unreadable script resource ${src.replace(/--/g, '- -')} -->` });
        diagnostics.push({ severity: 'error', category: 'resource', file: scriptFile.path, message: `Не удалось декодировать текстовый ресурс "${src}" из Base64.` });
        continue;
      }
      if (isDataPayload) {
        const jsonContent = decodedScriptContent.replace(/<\/script/gi, '<\\/script');
        addChange({ start: node.start, end: node.end, value: `<script${serializeScriptAttributes(node)}>${jsonContent}\n</script>` });
        continue;
      }
      let scriptCode = decodedScriptContent;
      const hasModuleSyntax = /(^|[;\n\r])\s*(?:import\s+(?:[^'"(]+\s+from\s+)?|export\s+(?:\*|\{)|import\s*\()/m.test(scriptCode);
      if (scriptType === 'module' && hasModuleSyntax) {
        diagnostics.push({ severity: 'warning', category: 'javascript', file: scriptFile.path, message: `Модуль ${scriptFile.path} содержит import/export. В оригинальном предпросмотре относительные импорты модулей требуют корректного графа ES-модулей; проверь ошибки в окне диагностики.` });
      }
      let scriptTag: string;
      if ((node.attrs || []).some(attr => attr.name.toLowerCase() === 'defer') && scriptType !== 'module') {
        // Preserve source position and defer ordering: queue the source text at its original
        // location and execute queued classic scripts after parsing, before DOMContentLoaded handlers.
        const queued = `window.__vacuusDeferredScripts.push(${JSON.stringify(scriptCode)});`.replace(/<\/script/gi, '<\\/script');
        scriptTag = `<script>${queued}</script>`;
      } else {
        const safeScriptCode = scriptCode.replace(/<\/script/gi, '<\\/script');
        scriptTag = `<script${serializeScriptAttributes(node)}>${safeScriptCode}\n</script>`;
        if ((node.attrs || []).some(attr => attr.name.toLowerCase() === 'async')) {
          diagnostics.push({ severity: 'warning', category: 'javascript', file: scriptFile.path, message: `У ${scriptFile.path} указан async; встраивание локального скрипта делает его выполнение синхронным и не воспроизводит сетевую гонку async. Проверь результат вручную.` });
        }
      }
      addChange({ start: node.start, end: node.end, value: scriptTag });
      continue;
    }
  }

  // Rewrite local image/font/media references in the remaining HTML elements. Replacements
  // inside an already replaced stylesheet/script tag are skipped to avoid overlapping edits.
  for (const node of elements) {
    if (replacedRanges.some(range => node.start >= range.start && node.end <= range.end)) continue;
    if (node.name === 'style' || (node.name === 'script' && getAttribute(node, 'src'))) continue;
    const tagEnd = openingTagEnd(sourceHtml, node.start);
    let rawTag = sourceHtml.slice(node.start, tagEnd);
    if (node.name === 'base' && baseHref && !externalBase) {
      rawTag = removeRawAttribute(rawTag, 'href');
      if (rawTag !== sourceHtml.slice(node.start, tagEnd)) changes.push({ start: node.start, end: tagEnd, value: rawTag });
      continue;
    }
    if (externalBase) continue;
    const attrs = node.attrs || [];
    const nodeName = node.name || '';
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      const value = attr.value ?? '';
      let shouldResolve = false;
      if (name === 'src') shouldResolve = ['img', 'source', 'track', 'audio', 'video', 'embed', 'iframe'].includes(nodeName) || (nodeName === 'input' && (getAttribute(node, 'type') || '').toLowerCase() === 'image');
      if (name === 'poster' && node.name === 'video') shouldResolve = true;
      if (name === 'data' && node.name === 'object') shouldResolve = true;
      if ((name === 'href' || name === 'xlink:href') && ['image', 'use'].includes(nodeName)) shouldResolve = true;
      if ((name === 'href' && node.name === 'link')) {
        const relTokens = (getAttribute(node, 'rel') || '').toLowerCase().split(/\s+/);
        const preloadAs = (getAttribute(node, 'as') || '').trim().toLowerCase();
        if (relTokens.some(token => ['icon', 'apple-touch-icon', 'mask-icon'].includes(token))) shouldResolve = true;
        if (relTokens.includes('preload') && ['image', 'font'].includes(preloadAs)) shouldResolve = true;
      }
      if (name === 'srcset' && ['img', 'source'].includes(nodeName)) {
        const rewritten = rewriteSrcset(value, resourceBasePath, sourceFiles, assetUrls, countAsset);
        if (rewritten !== value) rawTag = setRawAttribute(rawTag, attr.name, rewritten);
        continue;
      }
      if (name === 'style') {
        const rewritten = rewriteCss(value, resourceBasePath, sourceFiles, assetUrls, diagnostics, new Set(), countAsset);
        if (rewritten !== value) rawTag = setRawAttribute(rawTag, attr.name, rewritten);
        continue;
      }
      if (!shouldResolve) continue;
      const resolved = resolveBrowserResource(value, resourceBasePath, sourceFiles, assetUrls);
      if (resolved && resolved !== value) { rawTag = setRawAttribute(rawTag, attr.name, resolved); if (resolved.startsWith('data:')) countAsset(); }
      else if (!resolved && value && !isExternal(value)) {
        diagnostics.push({ severity: 'warning', category: 'resource', file: htmlPath, message: `HTML-ресурс "${value}" в <${node.name}> не найден; исходный путь может разрешиться относительно адреса приложения, а не импортированного проекта.` });
      }
    }
    if (rawTag !== sourceHtml.slice(node.start, tagEnd)) changes.push({ start: node.start, end: tagEnd, value: rawTag });
  }

  changes.sort((a, b) => b.start - a.start || b.end - a.end);
  let resultHtml = sourceHtml;
  let lastStart = Number.POSITIVE_INFINITY;
  for (const change of changes) {
    // Changes are applied from right to left; overlapping changes indicate an internal issue.
    if (change.end > lastStart) continue;
    resultHtml = resultHtml.slice(0, change.start) + change.value + resultHtml.slice(change.end);
    lastStart = change.start;
  }

  if (!/<html\b/i.test(resultHtml)) resultHtml = `<!doctype html><html><head><meta charset="utf-8"></head><body>${resultHtml}</body></html>`;
  if (!/<head\b/i.test(resultHtml) && /<html\b/i.test(resultHtml)) resultHtml = resultHtml.replace(/<html\b[^>]*>/i, match => `${match}<head><meta charset="utf-8"></head>`);
  if (/<head\b/i.test(resultHtml) && !/<meta\s+[^>]*charset=/i.test(resultHtml)) resultHtml = resultHtml.replace(/<head\b[^>]*>/i, match => `${match}<meta charset="utf-8">`);

  // srcdoc is sandboxed without allow-same-origin for safety. Supply isolated in-memory
  // storage and runtime listeners after charset metadata but before imported scripts execute.
  const headBootstrap = `<script>
(function(){
  function makeStore(){var data=Object.create(null);return {getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(data,k)?data[k]:null;},setItem:function(k,v){data[String(k)]=String(v);},removeItem:function(k){delete data[String(k)];},clear:function(){data=Object.create(null);},key:function(i){return Object.keys(data)[i]||null;},get length(){return Object.keys(data).length;}};}
  try { Object.defineProperty(window,'localStorage',{value:makeStore(),configurable:true}); } catch(_) {}
  try { Object.defineProperty(window,'sessionStorage',{value:makeStore(),configurable:true}); } catch(_) {}
  window.__vacuusDeferredScripts = [];
  document.addEventListener('DOMContentLoaded', function(){
    var queue = window.__vacuusDeferredScripts || [];
    for (var i = 0; i < queue.length; i++) {
      var script = document.createElement('script');
      script.text = String(queue[i] || '');
      script.setAttribute('data-vacuus-deferred-script', String(i + 1));
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    }
  }, { once: true });
  function report(severity, message, file){
    try { window.parent.postMessage({ type: 'ORIGINAL_PREVIEW_DIAGNOSTIC', source: 'vacuus-original-preview', severity: severity, message: String(message || 'Unknown preview error').slice(0, 500), file: String(file || '').slice(0, 260) }, '*'); } catch (_) {}
  }
  window.addEventListener('error', function(event){
    if (event && event.target && event.target !== window) {
      var target = event.target; var url = target.src || target.href || target.data || '';
      report('warning', 'Не удалось загрузить ресурс' + (url ? ': ' + url : ''), url);
    } else if (event) report('error', event.message || 'JavaScript runtime error', event.filename || 'srcdoc');
  }, true);
  window.addEventListener('unhandledrejection', function(event){ report('error', 'Необработанное Promise-отклонение: ' + (event.reason && (event.reason.stack || event.reason.message) || event.reason || 'unknown'), 'JavaScript'); });
  // Background images do not reliably fire a window-level resource error. Probe final computed
  // background-image URLs once the page is loaded so inaccessible CSS images are surfaced too.
  function checkBackgroundImages(){
    var seen = Object.create(null);
    var probes = 0;
    var elements = document.querySelectorAll('*');
    var count = Math.min(elements.length, 2500);
    for (var i = 0; i < count; i++) {
      var background = '';
      try { background = window.getComputedStyle(elements[i]).backgroundImage || ''; } catch (_) {}
      var matcher = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/ig;
      var match;
      while ((match = matcher.exec(background))) {
        var url = String(match[1] || match[2] || match[3] || '').trim();
        if (!url || /^(?:data:|blob:|#)/i.test(url) || seen[url]) continue;
        if (probes >= 100) { report('warning', 'Проверка CSS background-image ограничена первыми 100 уникальными URL.', 'CSS'); return; }
        seen[url] = true;
        probes++;
        var probe = new Image();
        probe.onerror = (function(resource){ return function(){ report('warning', 'Не удалось загрузить CSS background-image: ' + resource, resource); }; })(url);
        probe.src = url;
        (function(resource, imageProbe){ window.setTimeout(function(){ if (!imageProbe.complete) report('warning', 'CSS background-image не загрузился за 12 секунд: ' + resource, resource); }, 12000); })(url, probe);
      }
    }
  }
  window.addEventListener('load', function(){ window.setTimeout(checkBackgroundImages, 0); window.setTimeout(checkBackgroundImages, 1200); });
})();
</script>`;
  const headOpen = /<head\b[^>]*>/i.exec(resultHtml);
  if (headOpen) {
    const from = headOpen.index + headOpen[0].length;
    const headEnd = resultHtml.toLowerCase().indexOf('</head>', from);
    const charset = /<meta\b[^>]*charset\s*=[^>]*>/i.exec(resultHtml.slice(from, headEnd < 0 ? resultHtml.length : headEnd));
    const insertAt = charset ? from + charset.index + charset[0].length : from;
    resultHtml = resultHtml.slice(0, insertAt) + headBootstrap + resultHtml.slice(insertAt);
  } else {
    resultHtml = headBootstrap + resultHtml;
  }

  // Deferred local classic scripts are queued at their original source positions and run
  // from the bootstrap's DOMContentLoaded handler, preserving ordering against inline scripts.

  // Dedupe repeated diagnostics emitted by duplicate references to the same missing asset.
  const uniqueDiagnostics = diagnostics.filter((item, index) => diagnostics.findIndex(other => other.severity === item.severity && other.file === item.file && other.message === item.message) === index);
  return { html: resultHtml, diagnostics: uniqueDiagnostics, resources: counts };
}
