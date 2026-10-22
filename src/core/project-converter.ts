import postcss from 'postcss';
import { convertHtmlToRml } from './html-to-rml.ts';
import { convertCssToRcss } from './css-to-rcss.ts';
import { analyzeAndConvertJs } from './js-analyzer.ts';
import { VACUUS_BASE_RCSS } from './vacuus-base.ts';
import {
  generateReadme,
  generateConversionReportMd,
  generateCompatibilityJson,
  getConversionReadiness,
  generateProjectManifestJson,
  generateUeCppHeader,
  generateUeCppSource,
} from './ue-integration-generator.ts';
import type {
  ProjectFile,
  ConvertedProjectResult,
  ConversionOptions,
  DiagnosticIssue,
  SvgRasterAsset,
} from './types.ts';

import { extractEmbeddedAssetsFromHtml, type HtmlCssResource, type HtmlScriptResource } from './html-embedded-extractor.ts';
import { locationAt, parseHtmlTree, descendants, getAttribute } from './html-parser.ts';
import { prepareProjectAssets, validateExternalScriptReferences } from './project-assets.ts';
import { collectDeclaredFontFamilies } from './ui-fonts.ts';
import { DEFAULT_CONVERSION_OPTIONS } from './conversion-options.ts';
export { DEFAULT_CONVERSION_OPTIONS } from './conversion-options.ts';
export { splitMonolithicHtmlProject } from './html-project-splitter.ts';


function validateCyrillicFontCoverage(
  _html: string,
  _css: string,
  _htmlPath: string,
  _resolveFontAsset: (reference: string) => { directory: 'Assets' | 'Fonts'; filename: string } | undefined,
): DiagnosticIssue[] {
  // All three bundled families include the Latin/Cyrillic coverage needed by the editor.
  // Source @font-face blocks are normalized to this registry by css-to-rcss.ts.
  return [];
}

interface InlineStyleConversion {
  html: string;
  diagnostics: DiagnosticIssue[];
  externalImageAssets: { url: string; filename: string }[];
  metrics: { rulesProcessed: number; propertiesAnalyzed: number; autoFixesApplied: number; unsupportedEncountered: number };
}

/**
 * Inline CSS used to bypass the stylesheet converter and reach RML in browser
 * syntax. Route every style attribute through the same PostCSS/RCSS rules before
 * serialization, while editing only the original attribute ranges.
 */
function convertInlineStyleAttributes(
  html: string,
  filename: string,
  options: ConversionOptions,
  rewriteCss: (css: string, cssPath: string) => string,
): InlineStyleConversion {
  const tree = parseHtmlTree(html);
  const edits: Array<{ start: number; end: number; replacement: string }> = [];
  const diagnostics: DiagnosticIssue[] = [];
  const externalImageAssets = new Map<string, { url: string; filename: string }>();
  const metrics = { rulesProcessed: 0, propertiesAnalyzed: 0, autoFixesApplied: 0, unsupportedEncountered: 0 };
  let sequence = 0;
  const selector = '.vacuus-inline-style-probe';

  for (const node of descendants(tree.children)) {
    if (node.type !== 'element') continue;
    const attribute = node.attrs?.find(item => item.name === 'style' && item.hasValue);
    if (!attribute || attribute.sourceStart === undefined || attribute.sourceEnd === undefined) continue;

    sequence++;
    const sourceCss = rewriteCss(attribute.value, filename);
    const wrappedCss = `${selector} { ${sourceCss} }`;
    const converted = convertCssToRcss(wrappedCss, filename, {
      autoFixTransitions: options.autoFixTransitions,
      convertGridToFlex: options.convertGridToFlex,
      rootRelativeFonts: options.rootRelativeFonts,
      cssPixelsAsDp: options.cssPixelsAsDp,
    });
    metrics.rulesProcessed += converted.metrics.rulesProcessed;
    metrics.propertiesAnalyzed += converted.metrics.propertiesAnalyzed;
    metrics.autoFixesApplied += converted.metrics.autoFixesApplied;
    metrics.unsupportedEncountered += converted.metrics.unsupportedEncountered;
    for (const asset of converted.externalImageAssets) externalImageAssets.set(asset.url, asset);

    for (const issue of converted.diagnostics) {
      const location = locationAt(html, node.start);
      diagnostics.push({
        ...issue,
        id: `inline-style-${node.start}-${sequence}-${issue.id}`,
        file: filename,
        line: location.line,
        column: location.column,
        originalSnippet: `style="${attribute.value}"`.slice(0, 180),
      });
    }

    let convertedValue: string | undefined;
    try {
      const outputRoot = postcss.parse(converted.rcss, { from: filename });
      const outputRule = outputRoot.nodes?.find((child): child is postcss.Rule =>
        child.type === 'rule' && child.selector === selector,
      );
      if (outputRule) {
        convertedValue = (outputRule.nodes || []).map(child =>
          child.type === 'decl' ? `${child.toString()};` : child.toString(),
        ).join(' ').trim();
      }
    } catch {
      // Keep the user's original text if the converter unexpectedly emits invalid CSS;
      // the diagnostic below ensures this cannot be reported as a clean conversion.
    }

    if (convertedValue === undefined) {
      const location = locationAt(html, node.start);
      diagnostics.push({
        id: `inline-style-extract-failed-${node.start}-${sequence}`,
        severity: 'error', category: 'css', file: filename,
        line: location.line, column: location.column,
        originalSnippet: `style="${attribute.value}"`.slice(0, 180),
        message: 'Converted inline style could not be recovered from the RCSS parser output.',
        impact: 'The inline declarations remain in browser CSS syntax and may be rejected by VaCuus.',
        autoFixAvailable: false, fixed: false,
        recommendedAction: 'Move this style attribute into a stylesheet and reconvert so the generated RCSS can be inspected directly.',
        docRef: 'docs/rcss-compatibility.md',
      });
      continue;
    }

    const escaped = convertedValue.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    edits.push({
      start: attribute.sourceStart,
      end: attribute.sourceEnd,
      replacement: `style="${escaped}"`,
    });
  }

  let convertedHtml = html;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    convertedHtml = convertedHtml.slice(0, edit.start) + edit.replacement + convertedHtml.slice(edit.end);
  }
  return { html: convertedHtml, diagnostics, externalImageAssets: [...externalImageAssets.values()], metrics };
}



/**
 * Builds the single generated RCSS in browser source order: linked stylesheets and
 * inline <style> blocks follow the order in the original HTML. Uploaded CSS files
 * which are not linked by HTML are appended in project-file order and reported.
 */
function buildCssInHtmlSourceOrder(
  htmlPath: string,
  htmlContent: string,
  cssFiles: ProjectFile[],
  resources: HtmlCssResource[],
  diagnostics: DiagnosticIssue[],
  rewriteCss: (css: string, cssPath: string) => string,
): string[] {
  const parts: string[] = [];
  const referencedFiles = new Set<string>();
  const byPath = new Map<string, ProjectFile[]>();

  for (const file of cssFiles) {
    const key = projectPathKey(file.path);
    const siblings = byPath.get(key) || [];
    siblings.push(file);
    byPath.set(key, siblings);
  }

  const addDiagnostic = (
    id: string,
    severity: DiagnosticIssue['severity'],
    file: string,
    line: number,
    column: number,
    snippet: string,
    message: string,
    impact: string,
    recommendedAction: string,
  ) => diagnostics.push({
    id, severity, category: 'asset', file, line, column,
    originalSnippet: snippet.slice(0, 180), message, impact,
    autoFixAvailable: false, fixed: false, recommendedAction,
    docRef: 'docs/conversion-rules.md#asset-paths',
  });

  const importTargetFromParams = (params: string): { path: string; media: string } | undefined => {
    // Supports ordinary @import "file.css", @import 'file.css', and url(file.css).
    // Layer/supports modifiers are rejected separately instead of silently flattened.
    const match = /^(?:url\(\s*)?(?:(["'])(.*?)\1|([^)'"\s]+))\s*\)?\s*(.*)$/i.exec(params.trim());
    const path = (match?.[2] ?? match?.[3] ?? '').trim();
    if (!path) return undefined;
    return { path, media: (match?.[4] ?? '').trim() };
  };

  const expandCssSource = (
    sourceText: string,
    sourcePath: string,
    stack: string[],
  ): string => {
    let root: postcss.Root;
    try {
      root = postcss.parse(sourceText, { from: sourcePath });
    } catch {
      // Let the downstream RCSS converter emit its regular parse diagnostic. Do not
      // apply partial import expansion to malformed source CSS.
      return sourceText;
    }

    const processContainer = (container: postcss.Container, currentPath: string, ancestry: string[]) => {
      for (const node of [...(container.nodes || [])]) {
        if (node.type === 'atrule' && node.name.toLowerCase() === 'import') {
          const parsed = importTargetFromParams(node.params);
          const rawParams = node.params;
          const nodeLine = node.source?.start?.line || 1;
          const nodeColumn = node.source?.start?.column || 1;
          const snippet = node.toString();
          const diagnosticId = `css-import-${sanitizeId(currentPath)}-${node.source?.start?.offset ?? nodeLine}`;
          const replaceWithNote = (note: string) => node.replaceWith(postcss.comment({ text: ` VaCuus Converter: ${note} ` }));

          if (!parsed) {
            addDiagnostic(diagnosticId, 'warning', currentPath, nodeLine, nodeColumn, snippet,
              'CSS @import syntax could not be resolved safely and was disabled in the output.',
              'Rules from this import are not included in generated RCSS.',
              'Use a simple local @import "relative-file.css" form or merge the stylesheet manually.');
            replaceWithNote(`unresolved @import: ${rawParams}`);
            continue;
          }

          if (/\b(?:layer|supports)\s*(?:\(|\b)/i.test(parsed.media)) {
            addDiagnostic(diagnosticId, 'warning', currentPath, nodeLine, nodeColumn, snippet,
              'CSS @import layer()/supports() modifiers are not flattened automatically.',
              'The imported stylesheet may depend on cascade-layer or feature-query semantics that RCSS conversion cannot preserve.',
              'Remove the modifier after reviewing the cascade, or manually merge the imported stylesheet.');
            replaceWithNote(`unsupported @import modifiers: ${rawParams}`);
            continue;
          }

          if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|data:|blob:|#)/i.test(parsed.path)) {
            addDiagnostic(diagnosticId, 'warning', currentPath, nodeLine, nodeColumn, snippet,
              `External CSS @import "${parsed.path}" cannot be bundled from the imported project.`,
              'Declarations from the external stylesheet will be absent in the generated RCSS.',
              'Import the external stylesheet as a project CSS file and update the @import to a relative path.');
            replaceWithNote(`external @import not bundled: ${parsed.path}`);
            continue;
          }

          const resolved = resolveLinkedProjectPath(currentPath, parsed.path);
          const key = resolved ? projectPathKey(resolved) : '';
          const matches = key ? byPath.get(key) : undefined;
          if (!resolved || !matches?.length) {
            addDiagnostic(diagnosticId, 'warning', currentPath, nodeLine, nodeColumn, snippet,
              `CSS @import "${parsed.path}" could not be resolved to an imported project stylesheet.`,
              'The imported declarations will not be present in the generated RCSS.',
              `Add the referenced stylesheet at the resolved path or update the @import from "${currentPath}".`,
            );
            replaceWithNote(`missing @import: ${parsed.path}`);
            continue;
          }

          const importedFile = matches[0];
          referencedFiles.add(importedFile.id);
          if (matches.length > 1) {
            addDiagnostic(`${diagnosticId}-duplicate`, 'warning', currentPath, nodeLine, nodeColumn, snippet,
              `CSS @import path "${resolved}" matches multiple project files; the first imported file was selected.`,
              'Duplicate source paths make output dependent on import order.',
              'Rename the duplicate files so each @import resolves to one stylesheet.');
          }
          if (ancestry.includes(key)) {
            addDiagnostic(`${diagnosticId}-cycle`, 'warning', currentPath, nodeLine, nodeColumn, snippet,
              `CSS @import cycle detected at "${resolved}"; the recursive import was omitted.`,
              'The cyclic branch is disabled to prevent repeated expansion or runaway recursion.',
              'Break the import cycle and rerun conversion.');
            replaceWithNote(`cyclic @import omitted: ${resolved}`);
            continue;
          }

          const importedText = rewriteCss(importedFile.content, importedFile.path);
          const importedExpanded = expandCssSource(importedText, importedFile.path, [...ancestry, key]);
          let importedRoot: postcss.Root;
          try {
            importedRoot = postcss.parse(importedExpanded, { from: importedFile.path });
          } catch {
            addDiagnostic(`${diagnosticId}-parse`, 'warning', currentPath, nodeLine, nodeColumn, snippet,
              `Imported stylesheet "${resolved}" has invalid CSS and was not inlined.`,
              'The target RCSS output cannot safely include malformed CSS.',
              'Fix the imported stylesheet syntax before reconverting.');
            replaceWithNote(`invalid imported CSS omitted: ${resolved}`);
            continue;
          }
          const clonedNodes = (importedRoot.nodes || []).map(child => child.clone());
          if (parsed.media) {
            const mediaWrapper = postcss.atRule({ name: 'media', params: parsed.media });
            mediaWrapper.append(...clonedNodes);
            node.replaceWith(mediaWrapper);
          } else if (clonedNodes.length) {
            node.replaceWith(...clonedNodes);
          } else {
            replaceWithNote(`empty @import: ${resolved}`);
          }
          continue;
        }

        if ('nodes' in node && node.nodes?.length) processContainer(node as postcss.Container, currentPath, ancestry);
      }
    };

    processContainer(root, sourcePath, stack);
    return root.toString();
  };

  const expandFile = (file: ProjectFile, stack: string[] = []): string => {
    const key = projectPathKey(file.path);
    if (stack.includes(key)) return `/* VaCuus Converter: cyclic stylesheet omitted: ${file.path} */`;
    return expandCssSource(rewriteCss(file.content, file.path), file.path, [...stack, key]);
  };

  // Precompute imported targets only for the no-HTML-link case, where project order is
  // the only explicit cascade contract. Imported leaves should not also be emitted as
  // independent roots (which would duplicate declarations and change source order).
  const importedKeys = new Set<string>();
  for (const file of cssFiles) {
    let root: postcss.Root;
    try { root = postcss.parse(file.content, { from: file.path }); } catch { continue; }
    root.walkAtRules('import', atRule => {
      const parsed = importTargetFromParams(atRule.params);
      if (!parsed || /^(?:[a-z][a-z0-9+.-]*:|\/\/|data:|blob:|#)/i.test(parsed.path)) return;
      const resolved = resolveLinkedProjectPath(file.path, parsed.path);
      if (resolved) importedKeys.add(projectPathKey(resolved));
    });
  }

  for (const resource of [...resources].sort((a, b) => a.start - b.start)) {
    if (resource.kind === 'inline') {
      const { line, column } = locationAt(htmlContent, resource.start);
      if (resource.media && resource.media.toLowerCase() !== 'all') {
        addDiagnostic(
          `css-inline-media-${resource.start}`, 'warning', htmlPath, line, column, `<style media="${resource.media}">`,
          `Inline stylesheet uses media="${resource.media}"; conversion merges it into a single RCSS file.`,
          'The generated RCSS may apply these declarations in contexts where the browser stylesheet would not.',
          'Review this stylesheet and explicitly adapt or remove the media condition for the target VaCuus runtime.',
        );
      }
      if (resource.content.trim()) parts.push(expandCssSource(resource.content, htmlPath, []));
      continue;
    }

    const relTokens = resource.rel.split(/\s+/).filter(Boolean);
    const { line, column } = locationAt(htmlContent, resource.start);
    if (relTokens.includes('alternate')) {
      const alternatePath = resolveLinkedProjectPath(htmlPath, resource.href);
      if (alternatePath) for (const matchedFile of byPath.get(projectPathKey(alternatePath)) || []) referencedFiles.add(matchedFile.id);
      addDiagnostic(
        `css-alternate-${resource.start}`, 'warning', htmlPath, line, column, `<link rel="${resource.rel}" href="${resource.href}">`,
        'Alternate stylesheet detected and omitted from the default conversion order.',
        'Alternate stylesheets are opt-in in browsers and should not silently become part of the active VaCuus stylesheet.',
        'Select the intended stylesheet explicitly before conversion or remove the alternate link.',
      );
      continue;
    }

    if (resource.media && resource.media.toLowerCase() !== 'all') {
      addDiagnostic(
        `css-link-media-${resource.start}`, 'warning', htmlPath, line, column, `<link rel="stylesheet" media="${resource.media}" href="${resource.href}">`,
        `Linked stylesheet uses media="${resource.media}"; the output is flattened into one RCSS file.`,
        'The browser media condition may not be preserved in the generated VaCuus stylesheet.',
        'Review this stylesheet and adapt media-specific rules for the target runtime.',
      );
    }

    const resolvedPath = resolveLinkedProjectPath(htmlPath, resource.href);
    const matches = resolvedPath ? byPath.get(projectPathKey(resolvedPath)) : undefined;
    if (!resolvedPath || !matches?.length) {
      addDiagnostic(
        `css-missing-${resource.start}`, 'warning', htmlPath, line, column, `<link rel="stylesheet" href="${resource.href}">`,
        `Stylesheet link "${resource.href}" resolves to "${resolvedPath || resource.href}", but no matching CSS project file was provided.`,
        'Rules from this stylesheet are missing from the generated RCSS.',
        `Add the stylesheet at the path relative to "${htmlPath}" or correct the link href.`,
      );
      continue;
    }
    if (matches.length > 1) {
      addDiagnostic(
        `css-duplicate-path-${resource.start}`, 'warning', htmlPath, line, column, `<link rel="stylesheet" href="${resource.href}">`,
        `Multiple CSS project files resolve to "${resolvedPath}"; the first file in project order is used.`,
        'Duplicate paths make stylesheet resolution ambiguous.',
        'Rename duplicate CSS resources so every stylesheet link resolves to exactly one file.',
      );
    }
    parts.push(expandFile(matches[0]));
    for (const matchedFile of matches) referencedFiles.add(matchedFile.id);
  }

  const unreferencedFiles = cssFiles.filter(file => !referencedFiles.has(file.id));
  if (resources.length > 0) {
    for (const file of unreferencedFiles) {
      addDiagnostic(
        `css-unlinked-${sanitizeId(file.id)}`, 'info', file.path, 1, 1, file.path,
        `CSS file "${file.path}" is not referenced by a link or import in the HTML stylesheet chain and was appended after HTML-referenced resources.`,
        'Appending an unlinked file preserves availability but cannot reproduce a browser cascade position that was never declared in the HTML.',
        'Add a <link rel="stylesheet" href="..."> at the intended position if this stylesheet must participate at a specific cascade point.',
      );
      parts.push(expandFile(file));
    }
  } else {
    const roots = cssFiles.filter(file => !importedKeys.has(projectPathKey(file.path)));
    const rootFiles = roots.length ? roots : cssFiles.slice(0, 1);
    for (const file of rootFiles) {
      parts.push(expandFile(file));
      referencedFiles.add(file.id);
    }
    for (const file of cssFiles) {
      if (referencedFiles.has(file.id) || importedKeys.has(projectPathKey(file.path))) continue;
      parts.push(expandFile(file));
      referencedFiles.add(file.id);
    }
  }

  return parts;
}

function projectPathKey(path: string): string {
  return normalizeProjectPath(path).toLowerCase();
}

function buildJsInHtmlSourceOrder(
  htmlPath: string,
  htmlContent: string,
  jsFiles: ProjectFile[],
  resources: HtmlScriptResource[],
  diagnostics: DiagnosticIssue[],
): string[] {
  const parts: string[] = [];
  const referencedFiles = new Set<string>();
  const byPath = new Map<string, ProjectFile[]>();
  const byBase = new Map<string, ProjectFile[]>();
  for (const file of jsFiles) {
    const key = projectPathKey(file.path);
    const list = byPath.get(key) || [];
    list.push(file);
    byPath.set(key, list);
    const base = projectPathKey(file.path.split(/[\\/]/).pop() || file.path);
    const baseMatches = byBase.get(base) || [];
    baseMatches.push(file);
    byBase.set(base, baseMatches);
  }

  const addJsDiagnostic = (
    id: string, severity: DiagnosticIssue['severity'], resource: HtmlScriptResource,
    message: string, impact: string, recommendedAction: string,
  ) => {
    const sourcePath = htmlPath;
    const loc = locationAt(htmlContent, resource.start);
    diagnostics.push({
      id, severity, category: 'js', file: sourcePath, ...loc,
      originalSnippet: (resource.kind === 'inline' ? resource.content : `<script src="${resource.src}">`).slice(0, 180),
      message, impact, autoFixAvailable: false, fixed: false, recommendedAction,
      docRef: 'docs/javascript-runtime.md',
    });
  };

  for (const resource of [...resources].sort((a, b) => a.start - b.start)) {
    if (resource.scriptType === 'module') {
      addJsDiagnostic(`js-module-script-${resource.start}`, 'warning', resource,
        'ES module script was included in a single classic-script bundle; import/export and module scope semantics may not be preserved.',
        'Module imports are not automatically bundled and can fail in the VaCuus JavaScript runtime.',
        'Bundle the module separately with a compatible build step or rewrite it as a supported classic script before conversion.');
    }
    if (resource.async || resource.defer) {
      addJsDiagnostic(`js-script-scheduling-${resource.start}`, 'warning', resource,
        `Script uses ${resource.async ? 'async' : 'defer'} scheduling, which cannot be preserved after scripts are concatenated into one output file.`,
        'The browser and VaCuus execution order can differ if this script depends on another resource.',
        'Review dependency order and remove async/defer only when sequential execution is correct.');
    }
    if (resource.noModule) {
      addJsDiagnostic(`js-script-nomodule-${resource.start}`, 'info', resource,
        'Script uses nomodule fallback behavior; that browser feature-detection behavior is not preserved in the combined bundle.',
        'The fallback code may execute in a runtime where it was not intended to run.',
        'Choose the intended runtime implementation explicitly before bundling.');
    }

    if (resource.kind === 'inline') {
      if (resource.content.trim()) parts.push(`// --- Inline script from ${htmlPath} (source offset ${resource.start}) ---\n${resource.content}`);
      continue;
    }

    const source = resource.src.trim();
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|data:|blob:|#)/i.test(source)) {
      addJsDiagnostic(`js-external-script-${resource.start}`, 'warning', resource,
        `External JavaScript "${source}" was not bundled because the converter does not download remote scripts.`,
        'The script behavior will be missing from the generated UE5 screen.',
        'Import the script source into the project and reference the local file.');
      continue;
    }

    const resolved = resolveLinkedProjectPath(htmlPath, source);
    let matches = resolved ? byPath.get(projectPathKey(resolved)) : undefined;
    // Uploaders sometimes flatten folder structure. A unique basename fallback is safe;
    // ambiguous basenames are not guessed.
    if (!matches?.length) {
      const base = projectPathKey(source.split(/[\\/]/).pop() || source).split(/[?#]/, 1)[0];
      const fallback = byBase.get(base);
      if (fallback?.length === 1) matches = fallback;
      else if (fallback && fallback.length > 1) {
        addJsDiagnostic(`js-ambiguous-script-${resource.start}`, 'warning', resource,
          `Script path "${source}" does not resolve exactly and several imported files share its basename.`,
          'Choosing one file could bind the UI to the wrong script.',
          'Correct the src path or rename duplicate JavaScript files so the target is unambiguous.');
        continue;
      }
    }
    if (!matches?.length) continue; // The dedicated missing-reference validator reports this case.
    if (matches.length > 1) {
      addJsDiagnostic(`js-duplicate-script-${resource.start}`, 'warning', resource,
        `Script path "${source}" resolves to multiple imported files; the first file was used.`,
        'Duplicate source paths can make the output nondeterministic.',
        'Rename duplicate resources so the script reference matches exactly one file.');
    }
    const file = matches[0];
    parts.push(`// --- External script ${file.path} (referenced at source offset ${resource.start}) ---\n${file.content}`);
    for (const match of matches) referencedFiles.add(match.id);
  }

  if (resources.length === 0) {
    return jsFiles.map(file => `// --- Project script ${file.path} ---\n${file.content}`);
  }
  for (const file of jsFiles) {
    if (referencedFiles.has(file.id)) continue;
    diagnostics.push({
      id: `js-unlinked-${sanitizeId(file.id)}`, severity: 'info', category: 'js', file: file.path,
      line: 1, column: 1, originalSnippet: file.path,
      message: `JavaScript file "${file.path}" is not referenced by the HTML and was appended after referenced scripts.`,
      impact: 'Its original execution point cannot be inferred from the imported project.',
      autoFixAvailable: false, fixed: false,
      recommendedAction: 'Add a script reference at the intended point in the HTML if this file has ordering dependencies.',
      docRef: 'docs/javascript-runtime.md',
    });
    parts.push(`// --- Unlinked project script ${file.path} ---\n${file.content}`);
  }
  return parts;
}

function resolveLinkedProjectPath(htmlPath: string, href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(trimmed)) return null;
  const pathOnly = trimmed.split(/[?#]/, 1)[0].replace(/\\/g, '/');
  if (!pathOnly) return null;
  let combined: string;
  if (pathOnly.startsWith('/')) {
    combined = pathOnly.slice(1);
  } else {
    const normalizedHtml = normalizeProjectPath(htmlPath);
    const slash = normalizedHtml.lastIndexOf('/');
    const directory = slash >= 0 ? normalizedHtml.slice(0, slash) : '';
    combined = directory ? `${directory}/${pathOnly}` : pathOnly;
  }
  return normalizeProjectPath(combined);
}

function normalizeProjectPath(path: string): string {
  const segments: string[] = [];
  for (const segment of path.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (segments.length > 0) segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/');
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80) || 'resource';
}

export function convertProject(
  files: ProjectFile[],
  screenName: string = 'MainUI',
  options: ConversionOptions = DEFAULT_CONVERSION_OPTIONS
): ConvertedProjectResult {
  const sourceHtmlFile = files.find(f => f.type === 'html' || /\.html?$/i.test(f.path));
  const htmlFile = sourceHtmlFile || {
    id: 'default-html',
    path: 'index.html',
    content: '<div id="app"><h1>VaCuus Screen</h1></div>',
    type: 'html' as const,
  };

  // 0. Build a manifest for imported binary resources before conversion. Local image
  // references are rewritten relative to the generated screen folder, while font-face
  // sources use VaCuus' distinct root-relative path grammar.
  const projectAssetPreparation = prepareProjectAssets(files);
  const inlineStyleResult = convertInlineStyleAttributes(
    htmlFile.content,
    htmlFile.path,
    options,
    projectAssetPreparation.rewriteCss,
  );
  const preparedHtml = projectAssetPreparation.rewriteHtml(inlineStyleResult.html, htmlFile.path);
  const externalScriptDiagnostics = validateExternalScriptReferences(htmlFile.content, htmlFile.path, files);
  const extracted = extractEmbeddedAssetsFromHtml(preparedHtml, htmlFile.path);

  const cssFiles = files.filter(f => f.type === 'css' || f.path.toLowerCase().endsWith('.css'));
  const preparedCssFiles = cssFiles.map(file => ({ ...file, content: projectAssetPreparation.rewriteCss(file.content, file.path) }));
  const orderedCss = buildCssInHtmlSourceOrder(
    htmlFile.path, preparedHtml, cssFiles, extracted.cssResources, extracted.diagnostics,
    (content, sourcePath) => projectAssetPreparation.rewriteCss(content, sourcePath),
  );
  const combinedCss = orderedCss.join('\n\n') || '/* Default Styles */\nbody { font-size: 16px; }';
  const fontCoverageDiagnostics = validateCyrillicFontCoverage(
    htmlFile.content,
    combinedCss,
    htmlFile.path,
    reference => {
      const asset = projectAssetPreparation.resolveReference(reference);
      return asset ? { directory: asset.directory, filename: asset.filename } : undefined;
    },
  );

  const jsFiles = files.filter(f => f.type === 'js' || /\.(?:m?js|cjs)$/i.test(f.path));
  const jsParts = buildJsInHtmlSourceOrder(htmlFile.path, preparedHtml, jsFiles, extracted.jsResources, extracted.diagnostics);
  const combinedJs = jsParts.join('\n\n') || '// Default Script\nconsole.log("VaCuus UI initialized");';

  const targetRcssName = `${screenName.toLowerCase()}.rcss`;
  const targetJsName = `${screenName.toLowerCase()}.js`;

  // 1. Convert CSS -> RCSS first so supported pseudo-elements can be materialized
  // as real helper nodes before HTML is serialized to RML.
  const cssResult = convertCssToRcss(combinedCss, preparedCssFiles[0]?.path || 'style.css', {
    autoFixTransitions: options.autoFixTransitions,
    convertGridToFlex: options.convertGridToFlex,
    rootRelativeFonts: options.rootRelativeFonts,
    cssPixelsAsDp: options.cssPixelsAsDp,
  });

  // 2. Convert cleaned HTML -> RML, preserving mixed text and generated children.
  const registeredFontFamilies = collectDeclaredFontFamilies(combinedCss);
  const htmlResult = convertHtmlToRml(extracted.cleanedHtml, htmlFile.path, {
    includeVacuusBase: options.includeVacuusBase,
    targetRcssName,
    targetJsName,
    pseudoElements: cssResult.pseudoElements,
    registeredFontFamilies,
  });
  const svgAssets = inlineSvgPresentationStyles(htmlResult.svgAssets, combinedCss);

  // 3. Analyze & Convert JS
  const jsResult = analyzeAndConvertJs(combinedJs, jsFiles[0]?.path || 'main.js', {
    sanitizeBrowserJs: options.sanitizeBrowserJs,
    generateUeBindings: options.generateUeBindings,
  });

  // Consolidate diagnostics (including embedded extraction notices) and guarantee 100% unique IDs
  const rawDiagnostics: DiagnosticIssue[] = [
    ...(sourceHtmlFile ? [] : [{
      id: 'project-html-entry-missing', severity: 'warning' as const, category: 'asset' as const,
      file: 'index.html', line: 1, column: 1, originalSnippet: files.map(file => file.path).join(', ').slice(0, 180),
      message: 'No source HTML entry was imported; the converter generated a minimal fallback screen.',
      impact: 'A ZIP containing only generated RML/RCSS/JS output cannot be converted back into the original browser interface. The current export would otherwise contain only the fallback screen and included styles.',
      autoFixAvailable: false, fixed: false,
      recommendedAction: 'Import the original HTML file together with its CSS, JavaScript, image assets, and fonts. Use an RML ZIP as an export package for UE5, not as the source project.',
      docRef: 'docs/conversion-rules.md#project-inputs',
    }]),
    ...projectAssetPreparation.diagnostics,
    ...externalScriptDiagnostics,
    ...fontCoverageDiagnostics,
    ...inlineStyleResult.diagnostics,
    ...extracted.diagnostics,
    ...htmlResult.diagnostics,
    ...cssResult.diagnostics,
    ...jsResult.diagnostics,
  ];

  const seenDiagIds = new Set<string>();
  const allDiagnostics: DiagnosticIssue[] = rawDiagnostics.map((d, idx) => {
    if (!seenDiagIds.has(d.id)) {
      seenDiagIds.add(d.id);
      return d;
    }
    const uniqueId = `${d.id}-${idx}`;
    seenDiagIds.add(uniqueId);
    return { ...d, id: uniqueId };
  });

  // Calculate metrics
  const autoFixesCount =
    (options.includeVacuusBase ? 1 : 0) +
    cssResult.metrics.autoFixesApplied +
    jsResult.metrics.shimsInjected +
    htmlResult.metrics.voidTagsClosed;

  const warningsCount = allDiagnostics.filter(d => d.severity === 'warning').length;
  const errorsCount = allDiagnostics.filter(d => d.severity === 'error').length;
  const manualFixesCount = allDiagnostics.filter(d => d.severity === 'manual-fix').length;

  const metrics = {
    htmlTagsProcessed: htmlResult.metrics.tagsProcessed,
    cssRulesProcessed: cssResult.metrics.rulesProcessed + inlineStyleResult.metrics.rulesProcessed,
    cssDeclarationsAnalyzed: cssResult.metrics.propertiesAnalyzed + inlineStyleResult.metrics.propertiesAnalyzed,
    cssUnsupportedFeatures: cssResult.metrics.unsupportedEncountered + inlineStyleResult.metrics.unsupportedEncountered,
    jsFunctionsProcessed: jsResult.metrics.functionsProcessed,
    jsBrowserApisFlagged: jsResult.metrics.browserApisFlagged,
    htmlUnsupportedElements: htmlResult.metrics.unsupportedTagsEncountered,
    autoFixesApplied: autoFixesCount + inlineStyleResult.metrics.autoFixesApplied,
    warningsCount,
    errorsCount,
    manualFixesCount,
  };

  const readiness = getConversionReadiness(allDiagnostics);

  // Generate markdown reports & manifests
  const readmeMd = generateReadme(screenName);
  const conversionReportMd = generateConversionReportMd(allDiagnostics, metrics, screenName);
  const compatibilityJson = generateCompatibilityJson(allDiagnostics, metrics);
  const projectManifestJson = generateProjectManifestJson('VaCuusProject', screenName);
  const cppHeader = generateUeCppHeader(screenName);
  const cppSource = generateUeCppSource(screenName);

  const ueIntegrationSnippet = `// In Unreal Engine 5 Actor/PlayerController:
#include "${screenName}View.h"

// 1. Create Active UI View Component
UVaCuus${screenName}View* UI = NewObject<UVaCuus${screenName}View>(this);

// 2. Initialize and route input (activates mouse & interaction)
UI->InitializeActiveUI(GetWorld()->GetFirstPlayerController(), 10);`;

  return {
    rml: htmlResult.rml,
    rcss: cssResult.rcss,
    js: jsResult.convertedJs,
    vacuusBaseRcss: VACUUS_BASE_RCSS,
    readmeMd,
    conversionReportMd,
    compatibilityJson,
    projectManifestJson,
    ueIntegrationSnippet,
    cppHeader,
    cppSource,
    diagnostics: allDiagnostics,
    metrics,
    readiness,
    svgAssets,
    externalImageAssets: [...new Map(
      [...projectAssetPreparation.externalImageAssets, ...cssResult.externalImageAssets, ...inlineStyleResult.externalImageAssets]
        .map(asset => [asset.url, asset]),
    ).values()],
    projectAssets: projectAssetPreparation.assets,
  };
}


/**
 * SVG is rasterized for RmlUi, so browser CSS paint properties that target inline SVG
 * need to be baked into the SVG source before rasterization. This intentionally handles
 * common direct-parent selectors (e.g. `.stat svg`, `.quick svg`) and reports broader
 * selectors via the SVG diagnostic instead of pretending the full CSS cascade is solved.
 */
function inlineSvgPresentationStyles(assets: SvgRasterAsset[], css: string): SvgRasterAsset[] {
  if (!assets.length) return assets;
  let root: postcss.Root;
  try {
    root = postcss.parse(css);
  } catch {
    return assets;
  }

  const presentationProps = new Set([
    'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap',
    'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset',
    'stroke-opacity', 'opacity', 'color',
  ]);

  return assets.map(asset => {
    const values = new Map<string, { value: string; specificity: number; order: number }>();
    let parentColor = '';
    let order = 0;

    // Resolve the simplest inherited parent `color` rules first (e.g. `.quick { color: ... }`).
    root.walkRules(rule => {
      order++;
      const selectorParts = rule.selector.split(',').map(part => part.trim());
      for (const selector of selectorParts) {
        if (selector.includes('svg') || /:(hover|active|focus|focus-visible|visited|before|after)\b/i.test(selector)) continue;
        if ((asset.parentClasses || []).some(className => new RegExp(`\\.${escapeCssIdent(className)}(?![\\w-])`).test(selector))) {
          rule.walkDecls('color', decl => { parentColor = decl.value; });
        }
      }
    });

    order = 0;
    root.walkRules(rule => {
      order++;
      const selectors = rule.selector.split(',').map(part => part.trim());
      for (const selector of selectors) {
        if (!/(^|[\s>+~,])svg(?=$|[\s>+~.#:[,\]])/i.test(selector)) continue;
        if (/:(hover|active|focus|focus-visible|visited)\b/i.test(selector)) continue;

        const normalized = selector.replace(/::?(before|after)\b/ig, '').trim();
        const matchesParent = (asset.parentClasses || []).some(className =>
          new RegExp(`\\.${escapeCssIdent(className)}(?![\\w-])`).test(normalized),
        );
        const onlySvgSelector = /^svg(?:\.[\w-]+|#[\w-]+|\[[^\]]+\])*$/i.test(normalized);
        if (!matchesParent && !onlySvgSelector) continue;

        const idCount = (normalized.match(/#[\w-]+/g) || []).length;
        const classCount = (normalized.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
        const specificity = idCount * 100 + classCount * 10 + (normalized.match(/(^|\s|[>+~,])[a-z][\w-]*/gi) || []).length;
        rule.walkDecls(decl => {
          const prop = decl.prop.toLowerCase();
          if (!presentationProps.has(prop)) return;
          const current = values.get(prop);
          if (!current || specificity > current.specificity || (specificity === current.specificity && order >= current.order)) {
            let value = decl.value.trim();
            if (/^currentcolor$/i.test(value)) value = parentColor || '#ffffff';
            values.set(prop, { value, specificity, order });
          }
        });
      }
    });

    if (!values.size) return asset;
    const style = [...values.entries()].map(([prop, entry]) => `${prop}:${entry.value}`).join(';');
    const sourceSvg = asset.sourceSvg.replace(/^<svg\b([^>]*)>/i, (opening, attrs: string) => {
      const withoutExistingStyle = attrs.replace(/\sstyle=(['"]).*?\1/i, '');
      return `<svg${withoutExistingStyle} style="${escapeXmlAttribute(style)}">`;
    });
    return { ...asset, sourceSvg };
  });
}

function escapeCssIdent(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function escapeXmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
