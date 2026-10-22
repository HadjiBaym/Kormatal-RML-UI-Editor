import type { DiagnosticIssue } from './types.ts';
import { collectText, descendants, getAttribute, locationAt, parseHtmlTree } from './html-parser.ts';

export type HtmlCssResource =
  | { kind: 'inline'; start: number; end: number; content: string; media: string }
  | { kind: 'link'; start: number; end: number; href: string; media: string; rel: string };

export type HtmlScriptResource =
  | { kind: 'inline'; start: number; end: number; content: string; scriptType: string; async: boolean; defer: boolean; noModule: boolean }
  | { kind: 'link'; start: number; end: number; src: string; scriptType: string; async: boolean; defer: boolean; noModule: boolean };

export interface ExtractedHtmlAssets {
  cleanedHtml: string;
  extractedCss: string;
  /** CSS resources in original HTML source order, including external stylesheet links. */
  cssResources: HtmlCssResource[];
  /** Executable JS resources in original HTML source order. */
  jsResources: HtmlScriptResource[];
  extractedJs: string;
  hasEmbeddedCss: boolean;
  hasEmbeddedJs: boolean;
  embeddedCssBlocksCount: number;
  embeddedJsBlocksCount: number;
  diagnostics: DiagnosticIssue[];
}

interface SourceRemoval {
  start: number;
  end: number;
  replacement: string;
}

/**
 * Extracts active inline <style> and <script> elements using the shared HTML tree.
 * Tag-like text in comments, attributes, CSS strings, and script bodies is never treated
 * as a second markup element. Source offsets are retained so diagnostics reference the
 * original file and removals can be applied right-to-left without invalidating offsets.
 */
export function extractEmbeddedAssetsFromHtml(
  htmlContent: string,
  filename: string = 'index.html',
): ExtractedHtmlAssets {
  const diagnostics: DiagnosticIssue[] = [];
  const cssBlocks: string[] = [];
  const cssResources: HtmlCssResource[] = [];
  const jsResources: HtmlScriptResource[] = [];
  const jsBlocks: string[] = [];
  const removals: SourceRemoval[] = [];
  const elements = descendants(parseHtmlTree(htmlContent).children).filter(node => node.type === 'element');
  let embeddedCssCount = 0;
  let embeddedJsCount = 0;

  for (const node of elements) {
    if (node.name === 'link') {
      const rel = getAttribute(node, 'rel').trim().toLowerCase();
      const href = getAttribute(node, 'href').trim();
      if (rel.split(/\s+/).includes('stylesheet') && href) {
        cssResources.push({
          kind: 'link', start: node.start, end: node.end, href,
          media: getAttribute(node, 'media').trim(), rel,
        });
      }
      continue;
    }

    if (node.name === 'style') {
      const cssCode = collectText(node).trim();
      // Keep empty style nodes in the ordered resource list so source positions still
      // align with every extraction placeholder during split/export operations.
      cssResources.push({
        kind: 'inline', start: node.start, end: node.end, content: cssCode,
        media: getAttribute(node, 'media').trim(),
      });
      removals.push({
        start: node.start,
        end: node.end,
        replacement: `<!-- [VaCuus Converter: Embedded style extracted to RCSS at ${node.start}] -->`,
      });
      if (!cssCode) continue;

      embeddedCssCount += 1;
      cssBlocks.push(cssCode);
      const loc = locationAt(htmlContent, node.start);
      diagnostics.push({
        id: `html-embedded-css-${loc.line}-${embeddedCssCount}`,
        severity: 'info',
        category: 'html',
        file: filename,
        ...loc,
        originalSnippet: htmlContent.slice(node.start, Math.min(node.end, node.start + 80)),
        message: 'Embedded <style> block detected and extracted into a separate stylesheet.',
        impact: 'The generated RML should link an external RCSS file; inline style blocks are not kept in the document.',
        autoFixAvailable: true,
        autoFixDescription: 'Extracted embedded styles into a dedicated RCSS stylesheet.',
        fixed: true,
        recommendedAction: 'Review the generated RCSS for VaCuus compatibility and preserve the original resource order.',
        docRef: 'docs/rcss-compatibility.md',
      });
      continue;
    }

    if (node.name === 'script') {
      const attrs = node.attrs || [];
      const hasSrcAttribute = attrs.some(attr => attr.name === 'src');
      const scriptType = getAttribute(node, 'type').trim().toLowerCase();
      const isNonExecutableData = new Set([
        'application/json', 'application/ld+json', 'text/template', 'text/x-template', 'importmap',
      ]).has(scriptType);
      if (isNonExecutableData) {
        const loc = locationAt(htmlContent, node.start);
        diagnostics.push({
          id: `html-script-data-dropped-${loc.line}-${embeddedJsCount + 1}`,
          severity: 'warning', category: 'html', file: filename, ...loc,
          originalSnippet: htmlContent.slice(node.start, Math.min(node.end, node.start + 100)),
          message: `Non-executable <script type="${scriptType}"> data is not copied into the generated RML/JS bundle.`,
          impact: 'The RML serializer removes script elements, so JSON/template payloads referenced by browser DOM code would otherwise disappear.',
          autoFixAvailable: false, fixed: false,
          recommendedAction: 'Move the payload into an explicit project data resource or encode it in a supported JS model before converting.',
          docRef: 'docs/javascript-runtime.md',
        });
        continue;
      }

      const hasBooleanAttribute = (name: string) => attrs.some(attr => attr.name === name);
      const scriptFlags = {
        scriptType,
        async: hasBooleanAttribute('async'),
        defer: hasBooleanAttribute('defer'),
        noModule: hasBooleanAttribute('nomodule'),
      };
      if (hasSrcAttribute) {
        const src = getAttribute(node, 'src').trim();
        if (src) jsResources.push({ kind: 'link', start: node.start, end: node.end, src, ...scriptFlags });
        continue;
      }

      // Only known JavaScript MIME types and module scripts are executable. Other
      // script types are data/template payloads, not code to concatenate into the bundle.
      const isExecutableType = !scriptType || scriptType === 'module' || [
        'text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript',
      ].includes(scriptType);
      if (!isExecutableType) {
        const loc = locationAt(htmlContent, node.start);
        diagnostics.push({
          id: `html-script-type-unsupported-${loc.line}-${embeddedJsCount + 1}`,
          severity: 'warning', category: 'html', file: filename, ...loc,
          originalSnippet: htmlContent.slice(node.start, Math.min(node.end, node.start + 100)),
          message: `Script type "${scriptType}" is not recognized as executable JavaScript and was not bundled.`,
          impact: 'Behavior implemented by this script type will be absent in the generated UE5 output.',
          autoFixAvailable: false, fixed: false,
          recommendedAction: 'Transpile the source to a supported JavaScript file or handle the feature outside the RML UI bundle.',
          docRef: 'docs/javascript-runtime.md',
        });
        continue;
      }

      const jsCode = collectText(node).trim();
      removals.push({
        start: node.start,
        end: node.end,
        replacement: `<!-- [VaCuus Converter: Inline script extracted to JavaScript at ${node.start}] -->`,
      });
      if (!jsCode) continue;

      embeddedJsCount += 1;
      jsBlocks.push(jsCode);
      jsResources.push({ kind: 'inline', start: node.start, end: node.end, content: jsCode, ...scriptFlags });
      const loc = locationAt(htmlContent, node.start);
      diagnostics.push({
        id: `html-embedded-js-${loc.line}-${embeddedJsCount}`,
        severity: 'info',
        category: 'html',
        file: filename,
        ...loc,
        originalSnippet: htmlContent.slice(node.start, Math.min(node.end, node.start + 80)),
        message: 'Inline <script> block detected and extracted into a separate JavaScript file.',
        impact: 'Browser globals and DOM APIs still need analysis for compatibility with the VaCuus JavaScript runtime.',
        autoFixAvailable: true,
        autoFixDescription: 'Extracted inline script into a dedicated JavaScript file.',
        fixed: true,
        recommendedAction: 'Review the generated JS for browser-only APIs before running the screen in Unreal Engine.',
        docRef: 'docs/javascript-runtime.md',
      });
    }
  }

  let cleanedHtml = htmlContent;
  removals.sort((a, b) => b.start - a.start);
  for (const removal of removals) {
    cleanedHtml = cleanedHtml.slice(0, removal.start) + removal.replacement + cleanedHtml.slice(removal.end);
  }

  // Inline style attributes are inspected on parsed elements, never with a raw source regex.
  let inlineStyleCount = 0;
  for (const node of elements) {
    const styleAttr = (node.attrs || []).find(attr => attr.name === 'style');
    if (!styleAttr) continue;
    inlineStyleCount += 1;
    if (inlineStyleCount > 5) continue;
    const loc = locationAt(htmlContent, node.start);
    diagnostics.push({
      id: `html-inline-style-attr-${loc.line}-${inlineStyleCount}`,
      severity: 'info',
      category: 'html',
      file: filename,
      ...loc,
      originalSnippet: htmlContent.slice(node.start, Math.min(node.end, node.start + 100)),
      message: `Inline style attribute detected on <${node.name}>.`,
      impact: 'RmlUi supports inline style attributes in supported cases, but extracting styles into RCSS classes is easier to maintain.',
      autoFixAvailable: false,
      fixed: false,
      recommendedAction: `Review style="${styleAttr.value.slice(0, 48)}" and move stable declarations to a class when appropriate.`,
      docRef: 'docs/conversion-rules.md',
    });
  }

  return {
    cleanedHtml,
    extractedCss: cssBlocks.join('\n\n/* --- Next Extracted Style Block --- */\n\n'),
    cssResources: cssResources.sort((a, b) => a.start - b.start),
    jsResources: jsResources.sort((a, b) => a.start - b.start),
    extractedJs: jsBlocks.join('\n\n// --- Next Extracted Script Block ---\n\n'),
    hasEmbeddedCss: embeddedCssCount > 0,
    hasEmbeddedJs: embeddedJsCount > 0,
    embeddedCssBlocksCount: embeddedCssCount,
    embeddedJsBlocksCount: embeddedJsCount,
    diagnostics,
  };
}

