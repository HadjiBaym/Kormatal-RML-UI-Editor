import postcss from 'postcss';
import type { ProjectFile } from './types.ts';
import { resolveUiFontFamily } from './ui-fonts.ts';

export type VisualCssDeclarations = Record<string, string>;

export interface RmlUiVisualValidationIssue {
  property: string;
  value: string;
  severity: 'warning' | 'error';
  message: string;
}

const RMLUI_UNSUPPORTED_PROPERTIES = new Set([
  'display: grid', 'display: inline-grid', 'position: sticky',
  'box-shadow', 'filter', 'clip-path', 'mask-image',
  'grid-template-columns', 'grid-template-rows', 'place-items',
]);

/**
 * Conservative checks for visual-editor declarations targeting RmlUi/RCSS.
 * This is a guardrail, not a substitute for testing against the exact VaCuus build.
 */
export function validateVisualDeclarationsForRmlUi(input: VisualCssDeclarations): RmlUiVisualValidationIssue[] {
  const issues: RmlUiVisualValidationIssue[] = [];
  for (const [rawProperty, rawValue] of Object.entries(input)) {
    const property = rawProperty.trim().toLowerCase();
    const value = String(rawValue).trim();
    if (!value) continue;
    if (property === 'backdrop-filter') {
      if (/^blur\s*\([^)]*\)$/i.test(value)) continue;
      issues.push({
        property, value, severity: 'error',
        message: 'VaCuus 1.1.0 supports the native backdrop-filter: blur(...) path only; other backdrop filter functions are refused.',
      });
      continue;
    }
    if (RMLUI_UNSUPPORTED_PROPERTIES.has(`${property}: ${value.toLowerCase()}`) || RMLUI_UNSUPPORTED_PROPERTIES.has(property)) {
      issues.push({ property, value, severity: 'error', message: `${property} is not supported or not rendered by the current RmlUi compatibility profile.` });
      continue;
    }
    if (/^(width|height|min-width|min-height|max-width|max-height|left|top|right|bottom|margin(?:-\w+)?|padding(?:-\w+)?|gap|font-size|border-width)$/.test(property) && /%$/.test(value)) {
      issues.push({ property, value, severity: 'warning', message: `Percentage ${property} values depend on parent layout; verify the result in the target VaCuus/RmlUi runtime.` });
    }
    if (/^(width|height|min-width|min-height|max-width|max-height|font-size|border-width)$/.test(property) && /^-/.test(value)) {
      issues.push({ property, value, severity: 'error', message: `${property} must not be negative.` });
    }
    if (/^(width|height|min-width|min-height|max-width|max-height|left|top|right|bottom|font-size|border-width)$/.test(property) && !/^-?(?:\d+\.?\d*|\.\d+)(?:px|dp|em|rem|%)?$/.test(value)) {
      issues.push({ property, value, severity: 'warning', message: `Value '${value}' is not a simple numeric length; verify RCSS parser/runtime support.` });
    }
  }
  return issues;
}

const SAFE_VISUAL_PROPERTIES = new Set([
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'left', 'top', 'right', 'bottom', 'position', 'margin', 'margin-top',
  'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top',
  'padding-right', 'padding-bottom', 'padding-left', 'background',
  'background-color', 'color', 'font-size', 'font-weight', 'border',
  'border-color', 'border-width', 'border-radius', 'opacity', 'transform',
  'display', 'gap', 'align-items', 'justify-content', 'font-family', 'backdrop-filter',
]);

export function sanitizeVisualDeclarations(input: VisualCssDeclarations): VisualCssDeclarations {
  const result: VisualCssDeclarations = {};
  for (const [rawProperty, rawValue] of Object.entries(input)) {
    const property = rawProperty.trim().toLowerCase();
    const value = String(rawValue).trim();
    if (!SAFE_VISUAL_PROPERTIES.has(property) || !value) continue;
    if (property === 'font-family') {
      const allowed = resolveUiFontFamily(value);
      if (!allowed) continue;
      result[property] = allowed;
      continue;
    }
    if (property === 'backdrop-filter' && !/^blur\s*\([^)]*\)$/i.test(value)) continue;
    // The viewport color picker emits a hex color for the shorthand background property.
    if (property === 'background' && !/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value)) continue;
    // Disallow declaration breaks, CSS imports, scriptable URLs and braces from viewport messages.
    if (/[{};]/.test(value) || /expression\s*\(|javascript\s*:/i.test(value)) continue;
    result[property] = value;
  }
  return result;
}

function ruleMatchesSelector(css: string, selector: string): boolean {
  try {
    const root = postcss.parse(css, { from: undefined });
    let found = false;
    root.walkRules(rule => {
      if (rule.selectors?.some(part => part.trim() === selector.trim())) found = true;
    });
    return found;
  } catch {
    return false;
  }
}

/**
 * Update the dedicated editor override sheet using PostCSS AST. This intentionally
 * leaves author-written styles untouched and preserves cascade order in one place.
 */
export function upsertVisualOverride(
  css: string,
  selector: string,
  declarations: VisualCssDeclarations,
): string {
  const safe = sanitizeVisualDeclarations(declarations);
  const normalizedSelector = selector.trim();
  if (!normalizedSelector || /[{};<>]/.test(normalizedSelector) || Object.keys(safe).length === 0) return css;

  let root: postcss.Root;
  try {
    root = postcss.parse(css || '', { from: undefined });
  } catch {
    // Do not silently destroy a stylesheet that cannot be parsed.
    return css;
  }

  let target: postcss.Rule | undefined;
  root.walkRules(rule => {
    if (rule.selectors?.some(part => part.trim() === selector.trim())) target = rule;
  });

  if (!target) {
    target = postcss.rule({ selector: normalizedSelector });
    root.append(target);
  }

  for (const [property, value] of Object.entries(safe)) {
    let existing: postcss.Declaration | undefined;
    target.walkDecls(property, decl => { existing = decl; });
    if (existing) existing.value = value;
    else target.append(postcss.decl({ prop: property, value }));
  }

  return root.toString();
}

function addStylesheetLink(html: string, href: string): string {
  if (new RegExp(`<link\\b[^>]*href=["']${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(html)) return html;
  const link = `<link rel="stylesheet" href="${href}">`;
  if (/<\/head\s*>/i.test(html)) return html.replace(/<\/head\s*>/i, `${link}\n</head>`);
  if (/<html\b[^>]*>/i.test(html)) return html.replace(/<html\b[^>]*>/i, match => `${match}\n<head>${link}</head>`);
  return `${link}\n${html}`;
}

/** Apply a viewport edit to project files and keep the generated override stylesheet last. */
export function applyVisualEditToProject(
  files: ProjectFile[],
  selector: string,
  declarations: VisualCssDeclarations,
): ProjectFile[] {
  const safe = sanitizeVisualDeclarations(declarations);
  if (!selector.trim() || /[{};<>]/.test(selector) || !Object.keys(safe).length) return files;

  const next = files.map(file => ({ ...file }));
  const htmlIndex = next.findIndex(file => file.type === 'html' || file.path.toLowerCase().endsWith('.html'));
  if (htmlIndex < 0) return next;
  const htmlPath = next[htmlIndex].path.replace(/\\/g, '/');
  const lastSlash = htmlPath.lastIndexOf('/');
  const htmlDirectory = lastSlash >= 0 ? htmlPath.slice(0, lastSlash) : '';
  const overridePath = `${htmlDirectory ? htmlDirectory + '/' : ''}visual-editor-overrides.css`;
  const overrideHref = 'visual-editor-overrides.css';
  let overrideIndex = next.findIndex(file => file.path.replace(/\\/g, '/') === overridePath);

  if (overrideIndex < 0) {
    next[htmlIndex].content = addStylesheetLink(next[htmlIndex].content, overrideHref);
    const newFile: ProjectFile = {
      id: `visual-editor-overrides-${Date.now()}`,
      path: overridePath,
      type: 'css',
      content: '',
    };
    next.push(newFile);
    overrideIndex = next.length - 1;
  }

  const override = next[overrideIndex];
  // Each selector has one override block. Existing property declarations are updated in place.
  override.content = upsertVisualOverride(override.content, selector, safe);
  // Keep the override last in project file order so it wins over imported author CSS.
  const [moved] = next.splice(overrideIndex, 1);
  next.push(moved);
  return next;
}

export function hasVisualRule(css: string, selector: string): boolean {
  return ruleMatchesSelector(css, selector);
}
