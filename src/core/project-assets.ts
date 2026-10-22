import { parseHtmlTree, descendants, getAttribute, locationAt, type HtmlNode } from './html-parser.ts';
import type { DiagnosticIssue, ExternalImageAsset, ProjectFile, PackagedProjectAsset } from './types.ts';

const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.woff', '.woff2']);
const SVG_EXTENSION = '.svg';
const BINARY_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tga', '.bmp', '.gif']);

export interface ProjectAssetPreparation {
  assets: PackagedProjectAsset[];
  externalImageAssets: ExternalImageAsset[];
  diagnostics: DiagnosticIssue[];
  rewriteHtml(html: string, htmlPath: string): string;
  rewriteCss(css: string, cssPath: string): string;
  resolveReference(reference: string, fromPath?: string): PackagedProjectAsset | undefined;
}

interface AssetCandidate {
  file: ProjectFile;
  sourcePath: string;
  basename: string;
  extension: string;
  outputDirectory: 'Assets' | 'Fonts';
  outputFilename: string;
  referencePath: string;
  outputMimeType: string;
  sourceKind: 'binary' | 'svg';
}

function extensionOf(path: string): string {
  const leaf = path.replace(/\\/g, '/').split('/').pop() || '';
  const index = leaf.lastIndexOf('.');
  return index >= 0 ? leaf.slice(index).toLowerCase() : '';
}

function basenameOf(path: string): string {
  return (path.replace(/\\/g, '/').split('/').pop() || 'asset').replace(/[?#].*$/, '');
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 8);
}

function sanitizeFilename(filename: string): string {
  return filename.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'asset';
}

export function normalizeResourcePath(path: string): string {
  const segments: string[] = [];
  const decoded = safeDecode(path.replace(/\\/g, '/'));
  for (const segment of decoded.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (segments.length) segments.pop();
      continue;
    }
    segments.push(segment.toLowerCase());
  }
  return segments.join('/');
}

function safeDecode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function pathWithoutQuery(reference: string): string {
  return safeDecode(reference.trim().replace(/[?#].*$/, '').replace(/\\/g, '/'));
}

function isExternalReference(reference: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(reference.trim());
}

function isSvgAsset(file: ProjectFile): boolean {
  return extensionOf(file.path) === SVG_EXTENSION && file.type === 'asset' && file.contentEncoding !== 'base64';
}

function isPackagableAsset(file: ProjectFile): boolean {
  if (file.type !== 'asset') return false;
  const extension = extensionOf(file.path);
  return file.contentEncoding === 'base64' || isSvgAsset(file) || (FONT_EXTENSIONS.has(extension) && Boolean(file.mimeType));
}

function mimeForExtension(extension: string): string {
  const known: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.tga': 'image/x-tga', '.bmp': 'image/bmp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  };
  return known[extension] || 'application/octet-stream';
}

function htmlAttributeValue(tag: string, name: string, value: string): string {
  const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const doubleQuoted = new RegExp(`(\\b${name}\\s*=\\s*)"[^"]*"`, 'i');
  if (doubleQuoted.test(tag)) return tag.replace(doubleQuoted, `$1"${escaped}"`);
  const singleQuoted = new RegExp(`(\\b${name}\\s*=\\s*)'[^']*'`, 'i');
  if (singleQuoted.test(tag)) return tag.replace(singleQuoted, (_whole, prefix: string) => `${prefix}"${escaped}"`);
  const unquoted = new RegExp(`(\\b${name}\\s*=\\s*)[^\\s>]+`, 'i');
  if (unquoted.test(tag)) return tag.replace(unquoted, `$1"${escaped}"`);
  return tag;
}

function openingTagEnd(source: string, start: number): number {
  let quote = '';
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return i + 1;
    }
  }
  return source.length;
}

function addResourceDiagnostic(
  diagnostics: DiagnosticIssue[],
  file: string,
  source: string,
  offset: number,
  ref: string,
  categoryMessage: string,
  impact: string,
  recommendedAction: string,
  idPrefix: string,
): void {
  const loc = locationAt(source, offset);
  diagnostics.push({
    id: `${idPrefix}-${file.replace(/[^a-zA-Z0-9_-]+/g, '-')}-${loc.line}-${diagnostics.length + 1}`,
    severity: 'warning', category: 'asset', file, ...loc,
    originalSnippet: ref.slice(0, 140), message: categoryMessage, impact,
    autoFixAvailable: false,
    fixed: false, recommendedAction, docRef: 'docs/conversion-rules.md#asset-paths',
  });
}

export function prepareProjectAssets(files: ProjectFile[]): ProjectAssetPreparation {
  const diagnostics: DiagnosticIssue[] = [];
  const importedFontFiles = files.filter(file => file.type === 'asset' && FONT_EXTENSIONS.has(extensionOf(file.path)) && isPackagableAsset(file));
  for (const file of importedFontFiles) {
    diagnostics.push({
      id: `asset-font-packaged-${file.id.replace(/[^a-zA-Z0-9_-]+/g, '-')}`,
      severity: 'info', category: 'asset', file: file.path, line: 1, column: 1,
      originalSnippet: basenameOf(file.path),
      message: `Font asset "${basenameOf(file.path)}" will be packaged under Content/DevUI/Fonts and can be registered by @font-face.`,
      impact: 'The target VaCuus plugin supports packaged custom font faces. The declared font-family must match the @font-face family and the file must be included in the exported package.',
      autoFixAvailable: false, fixed: false,
      recommendedAction: 'Keep one local static TTF/OTF/WOFF/WOFF2 font source per @font-face and confirm its glyph coverage in UE5.',
      docRef: 'docs/vacuus-source-audit-1.1.0-ue5.8.md#custom-fonts',
    });
  }
  // Preserve supported local font files. The editor's property picker still offers bundled
  // defaults, but source projects may register any packaged custom family with @font-face.
  const sourceFiles = files.filter(file => isPackagableAsset(file));
  const usedNames = new Map<string, Set<string>>();
  const candidates: AssetCandidate[] = sourceFiles.map(file => {
    const extension = extensionOf(file.path);
    const sourceKind = isSvgAsset(file) ? 'svg' : 'binary';
    const outputDirectory: 'Assets' | 'Fonts' = FONT_EXTENSIONS.has(extension) ? 'Fonts' : 'Assets';
    let outputFilename = sanitizeFilename(basenameOf(file.path));
    if (sourceKind === 'svg') outputFilename = outputFilename.replace(/\.svg$/i, '.png');
    const directorySet = usedNames.get(outputDirectory) || new Set<string>();
    if (directorySet.has(outputFilename)) {
      const currentExtension = extensionOf(outputFilename);
      const stem = outputFilename.slice(0, outputFilename.length - currentExtension.length) || 'asset';
      outputFilename = `${stem}-${stableHash(file.path)}${currentExtension}`;
    }
    directorySet.add(outputFilename);
    usedNames.set(outputDirectory, directorySet);
    return {
      file,
      sourcePath: file.path,
      basename: basenameOf(file.path),
      extension,
      outputDirectory,
      outputFilename,
      referencePath: outputDirectory === 'Fonts' ? `Fonts/${outputFilename}` : `../Assets/${outputFilename}`,
      outputMimeType: sourceKind === 'svg' ? 'image/png' : (file.mimeType || mimeForExtension(extension)),
      sourceKind,
    };
  });

  const aliases = new Map<string, AssetCandidate[]>();
  const addAlias = (alias: string, candidate: AssetCandidate) => {
    const key = normalizeResourcePath(alias);
    if (!key) return;
    const values = aliases.get(key) || [];
    if (!values.some(value => value.file.id === candidate.file.id)) values.push(candidate);
    aliases.set(key, values);
  };

  for (const candidate of candidates) {
    const source = normalizeResourcePath(candidate.sourcePath);
    addAlias(source, candidate);
    const withoutDevUi = source.replace(/^content\/devui\//, '');
    addAlias(withoutDevUi, candidate);
    const folderIndex = withoutDevUi.indexOf('/assets/');
    if (folderIndex >= 0) addAlias(withoutDevUi.slice(folderIndex + 1), candidate);
    const fontsIndex = withoutDevUi.indexOf('/fonts/');
    if (fontsIndex >= 0) addAlias(withoutDevUi.slice(fontsIndex + 1), candidate);
    // A unique basename lets assets referenced as e.g. ./map.jpg resolve even if the
    // source archive kept the image in a neighbouring folder.
    addAlias(candidate.basename, candidate);
  }

  // Remove ambiguous aliases such as icons/check.png and avatars/check.png from the
  // shortcut map; exact project-relative paths still resolve safely.
  const uniqueAliases = new Map<string, AssetCandidate>();
  for (const [alias, values] of aliases) {
    if (values.length === 1) uniqueAliases.set(alias, values[0]);
  }

  const assets: PackagedProjectAsset[] = candidates.map(candidate => {
    const aliasesForFile = [...uniqueAliases.entries()]
      .filter(([, target]) => target.file.id === candidate.file.id)
      .map(([alias]) => alias);
    const previewDataUrl = candidate.sourceKind === 'svg'
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(candidate.file.content)}`
      : `data:${candidate.outputMimeType};base64,${candidate.file.content}`;
    return {
      sourcePath: candidate.sourcePath,
      filename: candidate.outputFilename,
      directory: candidate.outputDirectory,
      referencePath: candidate.referencePath,
      outputPath: `Content/DevUI/${candidate.outputDirectory}/${candidate.outputFilename}`,
      mimeType: candidate.outputMimeType,
      contentBase64: candidate.sourceKind === 'binary' ? candidate.file.content : undefined,
      contentText: candidate.sourceKind === 'svg' ? candidate.file.content : undefined,
      sourceKind: candidate.sourceKind,
      previewDataUrl,
      sourceAliases: aliasesForFile,
    };
  });

  const externalByUrl = new Map<string, ExternalImageAsset>();
  const externalImageAssets: ExternalImageAsset[] = [];
  const resolveReference = (reference: string, fromPath = ''): PackagedProjectAsset | undefined => {
    const trimmed = reference.trim();
    if (!trimmed || isExternalReference(trimmed) || /^(?:data:|blob:)/i.test(trimmed)) return undefined;
    const path = pathWithoutQuery(trimmed);
    const candidatesToTry: string[] = [];
    if (fromPath) {
      const directory = normalizeResourcePath(fromPath).split('/').slice(0, -1).join('/');
      candidatesToTry.push(normalizeResourcePath(directory ? `${directory}/${path}` : path));
    }
    candidatesToTry.push(normalizeResourcePath(path));
    candidatesToTry.push(normalizeResourcePath(path.replace(/^\/+/, '')));
    candidatesToTry.push(normalizeResourcePath(path.replace(/^content\/devui\//i, '')));
    candidatesToTry.push(normalizeResourcePath(basenameOf(path)));
    for (const key of candidatesToTry) {
      const match = uniqueAliases.get(key);
      if (match) return assets.find(asset => asset.sourcePath === match.sourcePath);
    }
    return undefined;
  };

  const createExternalImage = (url: string): ExternalImageAsset => {
    const known = externalByUrl.get(url);
    if (known) return known;
    const asset = { url, filename: `remote-image-${stableHash(url)}.png` };
    externalByUrl.set(url, asset);
    externalImageAssets.push(asset);
    return asset;
  };

  const rewriteHtml = (html: string, htmlPath: string): string => {
    const tree = parseHtmlTree(html);
    const replacements: Array<{ start: number; end: number; text: string }> = [];
    const imageTags = new Set(['img', 'source', 'track']);
    for (const node of descendants(tree.children)) {
      if (node.type !== 'element' || !node.name) continue;

      // Inline <style> blocks are raw-text nodes in the HTML tree. Normalize their
      // local image/font references too; otherwise single-file HTML imports diverge
      // from projects that supply a separate CSS file.
      if (node.name === 'style') {
        for (const child of node.children) {
          if (child.type !== 'text' || !child.value) continue;
          const rewrittenCss = rewriteCss(child.value, htmlPath);
          if (rewrittenCss !== child.value) replacements.push({ start: child.start, end: child.end, text: rewrittenCss });
        }
      }

      const hasImageSrc = imageTags.has(node.name) || (node.name === 'input' && getAttribute(node, 'type').toLowerCase() === 'image');
      const inlineStyle = getAttribute(node, 'style');
      if (!hasImageSrc && !inlineStyle) continue;

      const tagEnd = openingTagEnd(html, node.start);
      const sourceTag = html.slice(node.start, tagEnd);
      let updatedTag = sourceTag;
      if (inlineStyle) {
        const rewrittenStyle = rewriteCss(inlineStyle, htmlPath);
        if (rewrittenStyle !== inlineStyle) updatedTag = htmlAttributeValue(updatedTag, 'style', rewrittenStyle);
      }

      if (hasImageSrc) {
        const src = getAttribute(node, 'src').trim();
        if (src && !/^(?:data:|blob:)/i.test(src)) {
          let nextPath = src;
          if (/^https?:\/\//i.test(src)) {
            const external = createExternalImage(src);
            nextPath = `../Assets/${external.filename}`;
          } else if (!isExternalReference(src)) {
            const found = resolveReference(src, htmlPath);
            if (found) {
              nextPath = found.referencePath;
            } else {
              const leaf = sanitizeFilename(basenameOf(pathWithoutQuery(src)));
              const canonical = `../Assets/${leaf}`;
              addResourceDiagnostic(
                diagnostics, htmlPath, html, node.start, src,
                `Image resource "${src}" was not found in the imported project; the output path was normalized to "${canonical}".`,
                'The RML can be structurally valid while the texture still fails to load in UE5 because no matching binary asset is included in the ZIP.',
                `Import the image file into the editor project or add it under Content/DevUI/Assets/${leaf}, then export the full ZIP again.`,
                'asset-html-image-missing',
              );
              nextPath = canonical;
            }
          }
          if (nextPath !== src) updatedTag = htmlAttributeValue(updatedTag, 'src', nextPath);
        }
      }

      if (updatedTag !== sourceTag) replacements.push({ start: node.start, end: tagEnd, text: updatedTag });
    }
    for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
      html = html.slice(0, replacement.start) + replacement.text + html.slice(replacement.end);
    }
    return html;
  };

  const rewriteCss = (css: string, cssPath: string): string => {
    // PostCSS would be ideal for all CSS tokenization, but this scoped replacement only
    // touches url(...) payloads (including URLs with commas) and leaves other syntax alone.
    return css.replace(/url\(\s*(?:(['"])(.*?)\1|([^)]*?))\s*\)/gi, (whole, _quote: string, quoted: string | undefined, unquoted: string | undefined, offset: number) => {
      const url = (quoted ?? unquoted ?? '').trim();
      if (!url || isExternalReference(url) || /^(?:data:|blob:)/i.test(url)) return whole;
      const fontContext = /@font-face\s*\{[^}]*$/i.test(css.slice(0, offset));
      const found = resolveReference(url, cssPath);
      let replacement = found?.referencePath;
      if (!replacement) {
        const leaf = sanitizeFilename(basenameOf(pathWithoutQuery(url)));
        replacement = fontContext || FONT_EXTENSIONS.has(extensionOf(url)) ? `Fonts/${leaf}` : `../Assets/${leaf}`;
        addResourceDiagnostic(
          diagnostics, cssPath, css, offset, url,
          `Local CSS resource "${url}" was not found in the imported project; the output path was normalized to "${replacement}".`,
          'Missing images render as empty areas and a missing font face can trigger repeated "No font face defined" warnings or fallback glyphs in UE5.',
          fontContext || FONT_EXTENSIONS.has(extensionOf(url))
            ? `Import the matching TTF/OTF/WOFF file into the editor or place it at Content/DevUI/${replacement}. Ensure @font-face uses the exact packaged path.`
            : `Import the image file into the editor project or add it under Content/DevUI/Assets/${leaf}, then export again.`,
          fontContext || FONT_EXTENSIONS.has(extensionOf(url)) ? 'asset-css-font-missing' : 'asset-css-url-missing',
        );
      }
      return `url("${replacement}")`;
    });
  };

  return { assets, externalImageAssets, diagnostics, rewriteHtml, rewriteCss, resolveReference };
}

export function validateExternalScriptReferences(html: string, htmlPath: string, files: ProjectFile[]): DiagnosticIssue[] {
  const scripts = files.filter(file => file.type === 'js' || /\.(?:m?js|cjs)$/i.test(file.path));
  const tree = parseHtmlTree(html);
  const diagnostics: DiagnosticIssue[] = [];
  const reportedMissingPaths = new Set<string>();
  const scriptAlias = new Set<string>();
  for (const file of scripts) {
    const normalized = normalizeResourcePath(file.path);
    scriptAlias.add(normalized);
    scriptAlias.add(normalized.replace(/^content\/devui\//, ''));
    scriptAlias.add(basenameOf(normalized));
  }
  for (const node of descendants(tree.children)) {
    if (node.type !== 'element' || node.name !== 'script') continue;
    const src = getAttribute(node, 'src').trim();
    if (!src || isExternalReference(src) || /^(?:data:|blob:)/i.test(src)) continue;
    const path = pathWithoutQuery(src);
    const directory = normalizeResourcePath(htmlPath).split('/').slice(0, -1).join('/');
    const resolved = normalizeResourcePath(directory ? `${directory}/${path}` : path);
    const resolvedWithoutRoot = resolved.replace(/^content\/devui\//, '');
    const basename = basenameOf(path);
    if (scriptAlias.has(resolved) || scriptAlias.has(resolvedWithoutRoot) || scriptAlias.has(basename)) continue;
    if (reportedMissingPaths.has(resolved)) continue;
    reportedMissingPaths.add(resolved);
    const loc = locationAt(html, node.start);
    diagnostics.push({
      id: `asset-script-missing-${node.start}-${diagnostics.length + 1}`,
      severity: 'warning', category: 'asset', file: htmlPath, ...loc,
      originalSnippet: `<script src="${src}">`,
      message: `Script reference "${src}" does not match any imported JS file.`,
      impact: 'The converter generates one screen JS bundle. A missing source script cannot be included, so its behavior will be absent from the UE5 output.',
      autoFixAvailable: false, fixed: false,
      recommendedAction: `Import the missing JavaScript file "${basename}" or remove the unused script reference, then reconvert.`,
      docRef: 'docs/conversion-rules.md#asset-paths',
    });
  }
  return diagnostics;
}

export function findPreviewUrl(reference: string, previewAssetUrls: Record<string, string>): string | undefined {
  const trimmed = reference.trim().replace(/^['"]|['"]$/g, '');
  if (previewAssetUrls[trimmed]) return previewAssetUrls[trimmed];
  const normalized = normalizeResourcePath(trimmed);
  if (previewAssetUrls[normalized]) return previewAssetUrls[normalized];
  const base = basenameOf(trimmed).toLowerCase();
  if (previewAssetUrls[base]) return previewAssetUrls[base];
  return undefined;
}
