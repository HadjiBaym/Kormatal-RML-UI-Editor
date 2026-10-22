import type { ExternalImageAsset, PackagedProjectAsset, SvgRasterAsset } from './types.ts';
import postcss from 'postcss';
import { DEFAULT_UI_FONT_FAMILY, bundledFontPreviewUrl, resolveUiFontFamily } from './ui-fonts.ts';
import { normalizeResourcePath } from './project-assets.ts';

export type PreviewAssetUrlMap = Record<string, string>;

function basenameOf(path: string): string {
  return (path.replace(/\\/g, '/').split('/').pop() || '').replace(/[?#].*$/, '').toLowerCase();
}

function svgDataUrl(sourceSvg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sourceSvg)}`;
}

/** Creates browser-usable URLs for files that will be emitted into Content/DevUI. */
export function buildPreviewAssetUrlMap(
  projectAssets: PackagedProjectAsset[] = [],
  svgAssets: SvgRasterAsset[] = [],
  externalImages: ExternalImageAsset[] = [],
): PreviewAssetUrlMap {
  const result: PreviewAssetUrlMap = {};
  const register = (reference: string, url: string) => {
    const raw = reference.trim();
    if (!raw) return;
    result[raw] = url;
    result[raw.toLowerCase()] = url;
    result[normalizeResourcePath(raw)] = url;
    result[normalizeResourcePath(raw).toLowerCase()] = url;
  };

  for (const asset of projectAssets) {
    const url = asset.previewDataUrl;
    [
      asset.sourcePath,
      ...asset.sourceAliases,
      asset.filename,
      asset.referencePath,
      `./${asset.referencePath}`,
      `/${asset.referencePath}`,
      asset.directory === 'Assets' ? `../Assets/${asset.filename}` : `Fonts/${asset.filename}`,
      asset.directory === 'Assets' ? `/Assets/${asset.filename}` : `/Fonts/${asset.filename}`,
    ].forEach(reference => register(reference, url));
  }

  for (const asset of svgAssets) {
    const url = svgDataUrl(asset.sourceSvg);
    [asset.filename, `../Assets/${asset.filename}`, `/Assets/${asset.filename}`, `Assets/${asset.filename}`]
      .forEach(reference => register(reference, url));
  }

  for (const asset of externalImages) {
    [asset.filename, `../Assets/${asset.filename}`, `/Assets/${asset.filename}`, `Assets/${asset.filename}`]
      .forEach(reference => register(reference, asset.url));
    // An external image already displayed by the browser can keep its source URL.
    register(asset.url, asset.url);
  }

  return result;
}

export function resolvePreviewAssetUrl(reference: string, map: PreviewAssetUrlMap): string | undefined {
  const raw = reference.trim().replace(/^['"]|['"]$/g, '');
  if (!raw) return undefined;
  const normalized = normalizeResourcePath(raw);
  return map[raw] || map[raw.toLowerCase()] || map[normalized] || map[normalized.toLowerCase()] || map[basenameOf(raw)];
}

/** Resolves src attributes that point to imported images/SVGs before the preview iframe loads. */
export function rewriteHtmlResourceUrls(html: string, map: PreviewAssetUrlMap): string {
  return html.replace(/<(img|source|track|input)\b[^>]*>/gi, tag => {
    if (/^<input\b/i.test(tag) && !/\btype\s*=\s*(['"]?)image\1/i.test(tag)) return tag;
    return tag.replace(/(\bsrc\s*=\s*)(['"])(.*?)\2/i, (whole, prefix: string, quote: string, reference: string) => {
      const next = resolvePreviewAssetUrl(reference, map);
      return next ? `${prefix}${quote}${next}${quote}` : whole;
    });
  });
}

/** Normalizes source CSS to the three bundled families for the browser-side comparison preview. */
export function normalizeCssFontFamilies(css: string): string {
  try {
    const root = postcss.parse(css);
    root.walkAtRules('font-face', atRule => { atRule.remove(); });
    root.walkDecls('font', decl => { decl.remove(); });
    root.walkDecls('font-family', decl => {
      const requested = decl.value.split(',').map(part => part.trim().replace(/^['\"]|['\"]$/g, ''));
      const selected = requested.map(resolveUiFontFamily).find(Boolean)
        || (requested.some(part => /^(?:ui-)?monospace$/i.test(part)) ? 'JetBrains Mono' : DEFAULT_UI_FONT_FAMILY);
      decl.value = selected === 'JetBrains Mono' ? '\"JetBrains Mono\"' : selected;
    });
    return root.toString();
  } catch {
    return css;
  }
}

/** Converts VaCuus RCSS-only image decorators/font paths into equivalent browser CSS for preview only. */
export function rewriteRcssForBrowser(css: string, map: PreviewAssetUrlMap): string {
  let result = css
    .replace(/box-shadow\s*:[^;]+;/gi, '/* [RmlUi: box-shadow suppressed] */')
    .replace(/\bdecorator\s*:/gi, 'background-image:')
    .replace(/image\(\s*([^),]+?)(?:\s*,[^)]*)?\s*\)/gi, (whole, rawPath: string) => {
      const resolved = resolvePreviewAssetUrl(rawPath, map);
      return resolved ? `url("${resolved.replace(/"/g, '%22')}")` : whole;
    })
    .replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi, (whole, _quote: string, reference: string) => {
      const resolved = resolvePreviewAssetUrl(reference, map);
      return resolved ? `url("${resolved.replace(/"/g, '%22')}")` : whole;
    });

  result = result.replace(/@font-face\s*\{[^}]*\}/gi, block => block.replace(/\bsrc\s*:\s*([^;]+);/i, (whole, source: string) => {
    const reference = source.trim().replace(/^url\(\s*(['"]?)(.*?)\1\s*\)$/i, '$2');
    const resolved = resolvePreviewAssetUrl(reference, map) || bundledFontPreviewUrl(reference);
    return resolved ? `src: url("${resolved.replace(/"/g, '%22')}");` : whole;
  }));

  // Browser iframe has no RmlUi unit parser. Represent dp as same-scale px on the
  // selected artboard so these declarations are not silently discarded by Chromium.
  // Walk declaration/at-rule values rather than the full stylesheet so comments,
  // selectors and quoted text such as URLs are not rewritten.
  const rewriteDpUnits = (value: string): string => {
    let output = '';
    for (let i = 0; i < value.length;) {
      const char = value[i];
      if (char === '\"' || char === "'") {
        const quote = char;
        const start = i++;
        while (i < value.length) {
          if (value[i] === '\\') { i += 2; continue; }
          if (value[i++] === quote) break;
        }
        output += value.slice(start, i);
        continue;
      }
      if (value.startsWith('/*', i)) {
        const end = value.indexOf('*/', i + 2);
        const next = end < 0 ? value.length : end + 2;
        output += value.slice(i, next); i = next; continue;
      }
      const urlMatch = value.slice(i).match(/^url\s*\(/i);
      if (urlMatch) {
        const start = i; let depth = 0; let quote = '';
        while (i < value.length) {
          const current = value[i++];
          if (quote) { if (current === '\\') i++; else if (current === quote) quote = ''; continue; }
          if (current === '\"' || current === "'") { quote = current; continue; }
          if (current === '(') depth++;
          else if (current === ')' && --depth === 0) break;
        }
        output += value.slice(start, i); continue;
      }
      const unitMatch = value.slice(i).match(/^(-?(?:\d+\.?\d*|\.\d+))dp\b/i);
      if (unitMatch) { output += `${unitMatch[1]}px`; i += unitMatch[0].length; continue; }
      output += char; i++;
    }
    return output;
  };
  try {
    const root = postcss.parse(result);
    root.walkDecls(declaration => { declaration.value = rewriteDpUnits(declaration.value); });
    root.walkAtRules(rule => { rule.params = rewriteDpUnits(rule.params); });
    result = root.toString();
  } catch {
    result = result.replace(/(-?(?:\d+\.?\d*|\.\d+))dp\b/gi, '$1px');
  }

  return result;
}
