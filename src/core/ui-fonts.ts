import postcss from 'postcss';

/** Bundled font-family choices offered by the editor for newly authored text; imported custom @font-face families are supported separately. */
export const UI_FONT_FAMILIES = [
  { family: 'Onest', label: 'Onest Regular', role: 'По умолчанию' },
  { family: 'Tektur', label: 'Tektur', role: 'Акцентные игровые заголовки' },
  { family: 'JetBrains Mono', label: 'JetBrains Mono', role: 'Код и технические данные' },
] as const;

export type UiFontFamily = typeof UI_FONT_FAMILIES[number]['family'];
export const DEFAULT_UI_FONT_FAMILY: UiFontFamily = 'Onest';

export const BUNDLED_UI_FONT_FILES = [
  { family: 'Onest', filename: 'Onest-Regular.ttf', weight: 400 },
  { family: 'Onest', filename: 'Onest-Medium.ttf', weight: 500 },
  { family: 'Onest', filename: 'Onest-SemiBold.ttf', weight: 600 },
  { family: 'Onest', filename: 'Onest-Bold.ttf', weight: 700 },
  { family: 'Onest', filename: 'Onest-ExtraBold.ttf', weight: 800 },
  { family: 'Tektur', filename: 'Tektur-Regular.ttf', weight: 400 },
  { family: 'Tektur', filename: 'Tektur-Medium.ttf', weight: 500 },
  { family: 'Tektur', filename: 'Tektur-SemiBold.ttf', weight: 600 },
  { family: 'Tektur', filename: 'Tektur-Bold.ttf', weight: 700 },
  { family: 'Tektur', filename: 'Tektur-ExtraBold.ttf', weight: 800 },
  { family: 'JetBrains Mono', filename: 'JetBrainsMono-Regular.ttf', weight: 400 },
  { family: 'JetBrains Mono', filename: 'JetBrainsMono-Medium.ttf', weight: 500 },
  { family: 'JetBrains Mono', filename: 'JetBrainsMono-SemiBold.ttf', weight: 600 },
  { family: 'JetBrains Mono', filename: 'JetBrainsMono-Bold.ttf', weight: 700 },
  { family: 'JetBrains Mono', filename: 'JetBrainsMono-ExtraBold.ttf', weight: 800 },
] as const;

const ALLOWED_FAMILY_SET = new Set(UI_FONT_FAMILIES.map(item => normalizeFontFamily(item.family)));

export function normalizeFontFamily(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '').toLowerCase().replace(/\s+/g, ' ');
}

export function resolveUiFontFamily(value: string): UiFontFamily | undefined {
  const normalized = normalizeFontFamily(value).replace(/-/g, ' ');
  if (normalized === 'jetbrainsmono') return 'JetBrains Mono';
  const matched = UI_FONT_FAMILIES.find(item => normalizeFontFamily(item.family) === normalized);
  return matched?.family;
}

export function isAllowedUiFontFamily(value: string): boolean {
  return ALLOWED_FAMILY_SET.has(normalizeFontFamily(value)) || normalizeFontFamily(value) === 'jetbrainsmono';
}

/** Collect font-family names actually registered by source @font-face rules. */
export function collectDeclaredFontFamilies(css: string): Set<string> {
  const result = new Set<string>(UI_FONT_FAMILIES.map(item => normalizeFontFamily(item.family)));
  try {
    const root = postcss.parse(css);
    root.walkAtRules('font-face', atRule => {
      const familyDecl = atRule.nodes?.find(node => node.type === 'decl' && node.prop.toLowerCase() === 'font-family');
      if (!familyDecl || familyDecl.type !== 'decl') return;
      const family = familyDecl.value.trim().replace(/^['"]|['"]$/g, '');
      if (family) result.add(normalizeFontFamily(family));
    });
  } catch { /* A malformed sheet is diagnosed by the conversion pipeline. */ }
  return result;
}

/**
 * Normalize imported native RCSS: bundled faces use canonical files, while valid custom
 * @font-face registrations are preserved with paths relative to the VaCuus DevUI VFS root.
 */
export function normalizeNativeRcssFontFamilies(css: string): string {
  try {
    const root = postcss.parse(css);
    const registeredFamilies = new Set<string>(UI_FONT_FAMILIES.map(item => normalizeFontFamily(item.family)));
    root.walkAtRules('font-face', atRule => {
      const familyDecl = atRule.nodes?.find(node => node.type === 'decl' && node.prop.toLowerCase() === 'font-family');
      const rawFamily = familyDecl && familyDecl.type === 'decl' ? familyDecl.value.replace(/^['"]|['"]$/g, '') : '';
      const family = resolveUiFontFamily(rawFamily);
      if (family && familyDecl && familyDecl.type === 'decl') {
        // Canonical bundled family declarations are normalized to a known static weight.
        const weightDecl = atRule.nodes?.find(node => node.type === 'decl' && node.prop.toLowerCase() === 'font-weight');
        const parsedWeight = weightDecl && weightDecl.type === 'decl' ? Number.parseInt(weightDecl.value, 10) : 400;
        const weight = [400, 500, 600, 700, 800].includes(parsedWeight) ? parsedWeight : 400;
        const bundled = BUNDLED_UI_FONT_FILES.find(item => item.family === family && item.weight === weight)
          || BUNDLED_UI_FONT_FILES.find(item => item.family === family && item.weight === 400);
        familyDecl.value = `"${family}"`;
        let srcDecl = atRule.nodes?.find(node => node.type === 'decl' && node.prop.toLowerCase() === 'src');
        if (!srcDecl || srcDecl.type !== 'decl') {
          srcDecl = postcss.decl({ prop: 'src', value: `Fonts/${bundled!.filename}` });
          atRule.append(srcDecl);
        } else srcDecl.value = `Fonts/${bundled!.filename}`;
        if (weightDecl && weightDecl.type === 'decl') weightDecl.value = String(weight);
        else atRule.append(postcss.decl({ prop: 'font-weight', value: String(weight) }));
        if (!atRule.nodes?.some(node => node.type === 'decl' && node.prop.toLowerCase() === 'font-style')) atRule.append(postcss.decl({ prop: 'font-style', value: 'normal' }));
        registeredFamilies.add(normalizeFontFamily(family));
        return;
      }

      // Custom faces are valid in VaCuus; do not remove them merely because the UI editor
      // dropdown only lists the three bundled typefaces. Exported assets are packaged under Fonts/.
      const familyName = rawFamily.trim();
      if (!familyName || !(familyDecl && familyDecl.type === 'decl')) {
        atRule.remove();
        return;
      }
      familyDecl.value = /\s/.test(familyName) ? `"${familyName}"` : familyName;
      registeredFamilies.add(normalizeFontFamily(familyName));
      const srcDecl = atRule.nodes?.find(node => node.type === 'decl' && node.prop.toLowerCase() === 'src');
      if (srcDecl && srcDecl.type === 'decl') {
        const match = /url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/i.exec(srcDecl.value);
        if (match) {
          const raw = match[2].replace(/\\/g, '/');
          if (!/^(?:data:|https?:|\/\/)/i.test(raw)) {
            const clean = raw.replace(/^\/+/, '');
            const leaf = clean.split('/').filter(Boolean).pop();
            if (leaf) srcDecl.value = `Fonts/${clean.match(/(?:^|\/)Fonts\/(.+)$/i)?.[1] || leaf}`;
          }
        }
      }
    });
    // Font shorthand is not portable in the target renderer.
    root.walkDecls('font', declaration => { declaration.remove(); });
    root.walkDecls('font-family', declaration => {
      if (declaration.parent?.type === 'atrule' && declaration.parent.name.toLowerCase() === 'font-face') return;
      const requested = declaration.value.split(',').map(part => part.trim().replace(/^['"]|['"]$/g, ''));
      const selected = requested.find(part => registeredFamilies.has(normalizeFontFamily(part)))
        || requested.map(resolveUiFontFamily).find(Boolean)
        || (requested.some(part => /^(?:ui-)?monospace$/i.test(part) || /mono/i.test(part)) ? 'JetBrains Mono' : DEFAULT_UI_FONT_FAMILY);
      declaration.value = /\s/.test(selected) ? `"${selected}"` : selected;
    });
    return root.toString();
  } catch {
    return css;
  }
}

export function getBundledFontFaceRcss(): string {
  return BUNDLED_UI_FONT_FILES.map(font => `@font-face {\n  font-family: "${font.family}";\n  src: Fonts/${font.filename};\n  font-weight: ${font.weight};\n}`).join('\n\n');
}

export function getBundledFontFaceBrowserCss(): string {
  return BUNDLED_UI_FONT_FILES.map(font => `@font-face {\n  font-family: "${font.family}";\n  src: url("/fonts/${font.filename}") format("truetype");\n  font-style: normal;\n  font-weight: ${font.weight};\n  font-display: swap;\n}`).join('\n');
}

export function bundledFontPreviewUrl(reference: string): string | undefined {
  const normalized = reference.trim().replace(/^['"]|['"]$/g, '').replace(/\\/g, '/').toLowerCase();
  const filename = normalized.split('/').pop() || '';
  const font = BUNDLED_UI_FONT_FILES.find(item => item.filename.toLowerCase() === filename);
  return font ? `/fonts/${font.filename}` : undefined;
}


/** Normalize inline font stacks while preserving families registered by a source @font-face. */
export function normalizeInlineFontStyle(style: string, declaredFamilies?: ReadonlySet<string>): string {
  try {
    const root = postcss.parse(`x { ${style} }`);
    const rule = root.nodes?.find(node => node.type === 'rule');
    if (!rule || rule.type !== 'rule') return style;
    rule.walkDecls('font', decl => { decl.remove(); });
    rule.walkDecls('font-family', decl => {
      const requested = decl.value.split(',').map(part => part.trim().replace(/^['\"]|['\"]$/g, ''));
      const registered = requested.find(part => declaredFamilies?.has(normalizeFontFamily(part)));
      const selected = registered
        || requested.map(resolveUiFontFamily).find(Boolean)
        || (requested.some(part => /^(?:ui-)?monospace$/i.test(part)) ? 'JetBrains Mono' : DEFAULT_UI_FONT_FAMILY);
      decl.value = /\s/.test(selected) ? `\"${selected}\"` : selected;
    });
    return (rule.nodes || []).map(node => node.toString()).join('; ');
  } catch {
    // Leave syntactically invalid inline CSS unchanged and let the normal parser diagnostics report it.
    return style;
  }
}
