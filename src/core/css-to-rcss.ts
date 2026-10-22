import postcss from 'postcss';
import type { AtRule, Declaration, Node, Rule } from 'postcss';
import { RCSS_PROPERTY_CATALOG, TIMING_FUNCTION_MAP } from './rcss-matrix.ts';
import type { DiagnosticIssue, ExternalImageAsset, PseudoElementSpec } from './types.ts';
import { DEFAULT_UI_FONT_FAMILY, UI_FONT_FAMILIES, resolveUiFontFamily } from './ui-fonts.ts';

export interface CssConversionResult {
  rcss: string;
  diagnostics: DiagnosticIssue[];
  externalImageAssets: ExternalImageAsset[];
  pseudoElements: PseudoElementSpec[];
  metrics: {
    rulesProcessed: number;
    propertiesAnalyzed: number;
    autoFixesApplied: number;
    unsupportedEncountered: number;
  };
}

interface CssConversionOptions {
  autoFixTransitions?: boolean;
  convertGridToFlex?: boolean;
  rootRelativeFonts?: boolean;
  /** Convert browser CSS px lengths/breakpoints to RmlUi dp for Slate DPI scaling; disabled by default for pixel-fidelity conversion. */
  cssPixelsAsDp?: boolean;
}

/**
 * Convert CSS to the verified subset used by the project's VaCuus/RmlUi build.
 * PostCSS is used to parse rules and declarations so comments, strings, nested
 * at-rules and function arguments are not mistaken for CSS declarations.
 */
export function convertCssToRcss(
  cssContent: string,
  filename = 'style.css',
  options: CssConversionOptions = {},
): CssConversionResult {
  const diagnostics: DiagnosticIssue[] = [];
  const externalImageAssets: ExternalImageAsset[] = [];
  const pseudoElements: PseudoElementSpec[] = [];
  const externalImageByUrl = new Map<string, ExternalImageAsset>();
  const autoFixTransitions = options.autoFixTransitions !== false;
  const convertGrid = options.convertGridToFlex !== false;
  const rootRelativeFonts = options.rootRelativeFonts !== false;
  const cssPixelsAsDp = options.cssPixelsAsDp === true;
  let diagSeq = 0;
  let propertiesAnalyzed = 0;
  let autoFixesApplied = 0;
  let unsupportedEncountered = 0;

  let root: postcss.Root;
  try {
    root = postcss.parse(cssContent, { from: filename });
  } catch (error) {
    const e = error as { reason?: string; line?: number; column?: number };
    const line = e.line || 1;
    const column = e.column || 1;
    diagnostics.push({
      id: `css-parse-error-${line}-${column}`,
      severity: 'error',
      category: 'css',
      file: filename,
      line,
      column,
      originalSnippet: getSourceLine(cssContent, line),
      message: `CSS parser error: ${e.reason || 'Unable to parse stylesheet.'}`,
      impact: 'The stylesheet could not be parsed reliably. No automatic CSS-to-RCSS transformations were applied.',
      autoFixAvailable: false,
      fixed: false,
      recommendedAction: 'Fix the reported CSS syntax error, then run conversion again.',
      docRef: 'docs/validation-strategy.md',
    });
    return {
      rcss: cssContent,
      diagnostics,
      externalImageAssets,
      pseudoElements,
      metrics: { rulesProcessed: 0, propertiesAnalyzed: 0, autoFixesApplied: 0, unsupportedEncountered: 0 },
    };
  }

  const addDiagnostic = (
    node: Node,
    details: Omit<DiagnosticIssue, 'id' | 'category' | 'file' | 'line' | 'column'> & { idPrefix: string },
  ) => {
    diagSeq++;
    const line = node.source?.start?.line || 1;
    const column = node.source?.start?.column || 1;
    diagnostics.push({
      id: `${details.idPrefix}-${line}-${diagSeq}`,
      severity: details.severity,
      category: 'css',
      file: filename,
      line,
      column,
      originalSnippet: details.originalSnippet,
      message: details.message,
      impact: details.impact,
      autoFixAvailable: details.autoFixAvailable,
      autoFixDescription: details.autoFixDescription,
      fixed: details.fixed,
      recommendedAction: details.recommendedAction,
      docRef: details.docRef,
    });
  };

  // RmlUi's stylesheet parser accepts only a small, explicit set of at-rules.
  // Keeping browser-only blocks such as @supports/@container in emitted RCSS makes
  // the entire conversion look successful while the target logs "Invalid at-rule".
  // Remove unsupported blocks at the boundary and report the exact source location.
  const supportedAtRules = new Set(['keyframes', 'decorator', 'spritesheet', 'media', 'font-face']);
  const atRulesToDisable: AtRule[] = [];
  root.walkAtRules((atRule: AtRule) => {
    const name = atRule.name.toLowerCase();
    if (supportedAtRules.has(name) || name === 'charset') return;

    let ancestor: Node | undefined = atRule.parent;
    while (ancestor && ancestor !== root) {
      if (ancestor.type === 'atrule' && !supportedAtRules.has((ancestor as AtRule).name.toLowerCase())) return;
      ancestor = ancestor.parent;
    }
    atRulesToDisable.push(atRule);
  });

  root.walkAtRules('charset', (atRule: AtRule) => {
    addDiagnostic(atRule, {
      idPrefix: 'css-charset-removed', severity: 'info', originalSnippet: atRule.toString(),
      message: 'Removed CSS @charset metadata from generated RCSS.',
      impact: 'The source file has already been decoded before conversion; @charset is not a VaCuus stylesheet rule.',
      autoFixAvailable: true, autoFixDescription: 'Removed the source encoding marker.', fixed: true,
      recommendedAction: 'No action is needed; save the source file using the intended encoding.',
      docRef: 'rcss-matrix.md#at-rules',
    });
    atRule.remove();
    autoFixesApplied++;
  });

  for (const atRule of atRulesToDisable) {
    if (!atRule.parent) continue;
    const name = atRule.name.toLowerCase();
    addDiagnostic(atRule, {
      idPrefix: 'css-unsupported-at-rule', severity: 'warning', originalSnippet: atRule.toString(),
      message: `CSS @${name} is not supported by the target VaCuus stylesheet parser and was omitted.`,
      impact: 'The rules inside this block will not be emitted; applying them unconditionally could change the original browser behavior.',
      autoFixAvailable: true, autoFixDescription: `Omitted the unsupported @${name} block from generated RCSS.`, fixed: true,
      recommendedAction: 'Move required declarations into supported rules after reviewing the condition, or replace this construct with a VaCuus-supported @media rule where appropriate.',
      docRef: 'rcss-matrix.md#at-rules',
    });
    atRule.replaceWith(postcss.comment({ text: ` VaCuus Converter: unsupported @${name} block omitted ` }));
    unsupportedEncountered++;
    autoFixesApplied++;
  }

  // VaCuus supports packaged custom faces. Preserve source @font-face registrations and
  // validate/rewrite their VFS paths below instead of imposing the editor's font-picker list
  // as an engine limitation. Arbitrary unregistered selector stacks still get a safe fallback.

  // Preserve the source declaration text before any automatic transformation so
  // diagnostics can still point to the user's original CSS (e.g. 18px rather than 18dp).
  const originalDeclarationText = new WeakMap<Declaration, string>();
  root.walkDecls((decl: Declaration) => { originalDeclarationText.set(decl, decl.toString()); });

  // Browser :root targets the document element; in RML, body is the reliable
  // inherited root for theme custom properties and var() references.
  root.walkRules((rule: Rule) => {
    const rewritten = rewriteRootPseudoSelector(rule.selector);
    if (rewritten === rule.selector) return;
    const original = rule.selector;
    rule.selector = rewritten;
    addDiagnostic(rule, {
      idPrefix: 'css-root-selector', severity: 'info', originalSnippet: original,
      message: 'Rewrote :root to body so theme custom properties inherit through the RML document.',
      impact: 'If the source root selector does not match an RML element, CSS variables used for colors and backgrounds may be undefined.',
      autoFixAvailable: true, autoFixDescription: 'Replaced :root with body.', fixed: true,
      recommendedAction: 'No action needed; verify color variables on the target VaCuus runtime.',
      docRef: 'rcss-matrix.md#custom-properties',
    });
    autoFixesApplied++;
  });

  // Build a sheet-wide inventory of declared custom properties. VaCuus supports
  // custom properties/inheritance in the pinned runtime, so var(--accent) is not
  // an error merely because it has no inline fallback when --accent is defined in
  // :root/body or another rule in the same stylesheet.
  const definedCustomProperties = new Set<string>();
  root.walkDecls((decl: Declaration) => {
    if (/^--[\w-]+$/.test(decl.prop)) definedCustomProperties.add(decl.prop);
  });

  const commentOutDeclaration = (decl: Declaration, reason: string) => {
    const oldText = decl.toString().replace(/\*\//g, '* /');
    decl.replaceWith(postcss.comment({ text: ` VaCuus ${reason}: ${oldText} ` }));
  };

  // @font-face src paths are resolved from the DevUI VFS root in this VaCuus build.
  root.walkAtRules('font-face', (atRule: AtRule) => {
    atRule.walkDecls('src', (decl: Declaration) => {
      const urls: Array<{ raw: string; quote?: string }> = [];
      const urlRegex = /url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi;
      let match: RegExpExecArray | null;
      while ((match = urlRegex.exec(decl.value)) !== null) urls.push({ raw: match[2], quote: match[1] });
      if (!urls.length) {
        addDiagnostic(decl, {
          idPrefix: 'css-font-src-unverified', severity: 'warning', originalSnippet: decl.toString(),
          message: '@font-face src is not a simple url(...) path and was not rewritten automatically.',
          impact: 'Data URLs, local() sources, src lists or unusual URL syntax may not resolve as intended by VaCuus.',
          autoFixAvailable: false, fixed: false,
          recommendedAction: 'Use a packaged font file under the DevUI virtual root and verify its resolved path in the VaCuus runtime.',
          docRef: 'gotchas.md#font-face-paths',
        });
        return;
      }

      let changed = false;
      let firstLocalRootPath: string | undefined;
      let externalOrEmbeddedSourceSeen = false;
      for (const item of urls) {
        if (/^(data:|https?:|\/\/)/i.test(item.raw)) {
          externalOrEmbeddedSourceSeen = true;
          addDiagnostic(decl, {
            idPrefix: 'css-font-path-external', severity: 'warning', originalSnippet: decl.toString(),
            message: `Font source "${item.raw.slice(0, 90)}" is external or embedded; automatic VFS path rewriting was skipped.`,
            impact: 'The target runtime may not be able to fetch this font source.',
            autoFixAvailable: false, fixed: false,
            recommendedAction: 'Bundle the font as a local asset and use a root-relative bare path according to the installed VaCuus documentation.',
            docRef: 'gotchas.md#font-face-paths',
          });
          continue;
        }
        const normalized = item.raw.replace(/\\/g, '/').replace(/^\/+/, '');
        const basename = normalized.split('/').filter(Boolean).pop();
        if (!basename) continue;
        // VaCuus paths are rooted at the DevUI VFS root but the path token itself
        // must not start with '/'. Example: Fonts/Onest-Regular.ttf.
        const existingFontsPath = normalized.match(/(?:^|\/)Fonts\/(.+)$/i)?.[1];
        const rootPath = existingFontsPath ? `Fonts/${existingFontsPath}` : `Fonts/${basename}`;
        if (!firstLocalRootPath) firstLocalRootPath = rootPath;
        addDiagnostic(decl, {
          idPrefix: 'css-font-path', severity: 'info', originalSnippet: decl.toString(),
          message: 'Checked @font-face src path for VaCuus VFS resolution.',
          impact: 'VaCuus expects a root-relative bare path for @font-face src; browser url(...) wrappers are removed in the generated RCSS.',
          autoFixAvailable: true, autoFixDescription: `Use root-relative font path ${rootPath}.`, fixed: rootRelativeFonts,
          recommendedAction: `Verify that the font is exported to the VFS location corresponding to ${rootPath}.`,
          docRef: 'gotchas.md#font-face-paths',
        });
      }
      if (rootRelativeFonts && firstLocalRootPath && (urls.length !== 1 || decl.value.trim() !== firstLocalRootPath)) {
        // VaCuus' @font-face parser expects a bare root-relative file path, not CSS url(...).
        // A multi-source browser fallback cannot be represented faithfully, so use the first local source.
        if (urls.length > 1) {
          addDiagnostic(decl, {
            idPrefix: 'css-font-src-fallback-list', severity: 'warning', originalSnippet: decl.toString(),
            message: 'Multiple @font-face src candidates were reduced to the first local asset for VaCuus.',
            impact: 'Browser font fallback/source lists are not preserved by the target parser.',
            autoFixAvailable: true, autoFixDescription: `Use the first local source ${firstLocalRootPath}.`, fixed: true,
            recommendedAction: 'Package the intended TTF/OTF as a single local asset and verify the family loads in UE5.',
            docRef: 'gotchas.md#font-face-paths',
          });
        }
        decl.value = firstLocalRootPath;
        changed = true;
      } else if (!firstLocalRootPath && externalOrEmbeddedSourceSeen) {
        // Keep an external/data src intact but its warning above makes the limitation explicit.
      }
      if (changed) autoFixesApplied++;
    });

    atRule.walkDecls('font-family', (decl: Declaration) => {
      const value = decl.value.trim();
      if (value && !/^(['"]).+\1$/.test(value) && /\s/.test(value)) {
        decl.value = `"${value.replace(/^['"]|['"]$/g, '')}"`;
        autoFixesApplied++;
      }
    });
  });

  // In the pinned VaCuus build, RmlUi px stays a physical pixel while dp follows
  // Slate's geometry/DPI scale. The target screenshot showed that this project's
  // view scale makes px -> dp shrink the 398px source card to roughly 252px, so
  // preserving px is the visual-fidelity default. cssPixelsAsDp is an explicit,
  // project-specific opt-in when measured DPI behavior calls for logical sizing.
  let pxDeclarationsConverted = 0;
  let mediaQueriesConverted = 0;
  let firstPxConvertedNode: Node | null = null;
  if (cssPixelsAsDp) {
    root.walkDecls((decl: Declaration) => {
      const converted = convertCssPixelsToDp(decl.value);
      if (converted !== decl.value) {
        if (!firstPxConvertedNode) firstPxConvertedNode = decl;
        decl.value = converted;
        pxDeclarationsConverted++;
      }
    });
    root.walkAtRules((atRule: AtRule) => {
      if (atRule.name.toLowerCase() !== 'media') return;
      const converted = convertCssPixelsToDp(atRule.params);
      if (converted !== atRule.params) {
        if (!firstPxConvertedNode) firstPxConvertedNode = atRule;
        atRule.params = converted;
        mediaQueriesConverted++;
      }
    });
    if (firstPxConvertedNode) {
      const unitsConverted = pxDeclarationsConverted + mediaQueriesConverted;
      addDiagnostic(firstPxConvertedNode, {
        idPrefix: 'css-px-to-dp', severity: 'info', originalSnippet: 'px → dp',
        message: `Converted CSS px units to dp in ${pxDeclarationsConverted} declaration(s) and ${mediaQueriesConverted} media query(s).`,
        impact: 'RmlUi px remains a physical pixel while dp follows Slate DPI scaling. Opt in only when the target view’s measured geometry scale requires logical DPI-scaled sizing; it can shrink or enlarge the layout depending on that scale.',
        autoFixAvailable: true, autoFixDescription: 'Converted dimensional px tokens outside strings and url(...) values into dp.', fixed: true,
        recommendedAction: 'Leave cssPixelsAsDp disabled for pixel-fidelity conversion. Enable it only after measuring the target widget scale and confirming DPI-scaled sizing is desired.',
        docRef: 'setup.md#dpi-and-length-units',
      });
      autoFixesApplied += unitsConverted;
    }
  }

  // Counts the source declarations before we insert fallback declarations.
  root.walkDecls(() => { propertiesAnalyzed++; });

  const sourceDeclarations: Declaration[] = [];
  root.walkDecls((decl: Declaration) => { sourceDeclarations.push(decl); });
  for (const decl of sourceDeclarations) {
    if (!decl.parent) continue;
    const prop = decl.prop.toLowerCase();
    const value = decl.value.trim();
    const original = originalDeclarationText.get(decl) ?? decl.toString();

    // RCSS does not implement the browser `font` shorthand consistently.
    // In ordinary CSS, `font: inherit` copies the computed font from the parent.
    // Emitting five explicit `inherit` longhands proved unsafe for VaCuus labels
    // (button content could disappear despite other text rendering). Since these
    // are inherited font properties, omitting this shorthand preserves normal
    // inheritance and avoids emitting the unsupported browser shorthand.
    if (prop === 'font' && /^inherit$/i.test(value)) {
      decl.remove();
      addDiagnostic(decl, {
        idPrefix: 'css-font-inherit', severity: 'info', originalSnippet: original,
        message: 'Removed font: inherit; font properties will inherit naturally in RCSS.',
        impact: 'Avoids an unsupported browser shorthand and explicit inherited font values that may fail to resolve in the target runtime.',
        autoFixAvailable: true, autoFixDescription: 'Removed the shorthand and let inherited font properties follow the parent element.', fixed: true,
        recommendedAction: 'If the target element needs a specific typeface or size, declare font-family and font-size explicitly on that element.',
        docRef: 'rcss-matrix.md#typography',
      });
      autoFixesApplied++;
      continue;
    }

    // Explicit inherit values in longhand font declarations are redundant for
    // inherited properties and can trigger the same runtime issue as font:inherit.
    if (/^font-(?:family|size|style|weight|stretch|variant)$/.test(prop) && /^inherit$/i.test(value)) {
      decl.remove();
      addDiagnostic(decl, {
        idPrefix: 'css-font-longhand-inherit', severity: 'info', originalSnippet: original,
        message: `Removed ${prop}: inherit; natural CSS inheritance supplies this font property.`,
        impact: 'Prevents explicit inherit tokens from leaving text without a resolved font in the target runtime.',
        autoFixAvailable: true, autoFixDescription: 'Removed redundant font inheritance declaration.', fixed: true,
        recommendedAction: 'Declare a concrete value when the element needs to differ from its parent.',
        docRef: 'rcss-matrix.md#typography',
      });
      autoFixesApplied++;
      continue;
    }

    // Other font shorthand forms are not emitted as-is: RCSS's longhands are
    // supported, but the browser shorthand grammar is not guaranteed in the target.
    if (prop === 'font') {
      addDiagnostic(decl, {
        idPrefix: 'css-font-shorthand', severity: 'manual-fix', originalSnippet: original,
        message: 'The CSS font shorthand cannot be mapped safely to RCSS automatically.',
        impact: 'Leaving the shorthand live may cause the target parser to discard font settings or text layout to differ from the browser.',
        autoFixAvailable: false, fixed: false,
        recommendedAction: 'Specify font-family, font-size, font-style, font-weight and line-height as separate declarations.',
        docRef: 'rcss-matrix.md#typography',
      });
      commentOutDeclaration(decl, 'manual font shorthand conversion required');
      unsupportedEncountered++;
      continue;
    }

    // CSS inset shorthand is not part of the target RCSS matrix. Expand it to the
    // four supported positional properties before the rule reaches RmlUi.
    if (prop === 'inset') {
      const parts = splitCssWhitespace(value);
      if (parts.length >= 1 && parts.length <= 4) {
        const [top, right = top, bottom = top, left = right] = parts.length === 1
          ? [parts[0], parts[0], parts[0], parts[0]]
          : parts.length === 2
            ? [parts[0], parts[1], parts[0], parts[1]]
            : parts.length === 3
              ? [parts[0], parts[1], parts[2], parts[1]]
              : [parts[0], parts[1], parts[2], parts[3]];
        [
          postcss.decl({ prop: 'top', value: top }),
          postcss.decl({ prop: 'right', value: right }),
          postcss.decl({ prop: 'bottom', value: bottom }),
          postcss.decl({ prop: 'left', value: left }),
        ].forEach(node => decl.before(node));
        decl.remove();
        addDiagnostic(decl, {
          idPrefix: 'css-inset', severity: 'info', originalSnippet: original,
          message: 'Expanded the CSS inset shorthand into top, right, bottom and left declarations.',
          impact: 'The target RCSS runtime can then resolve position values using its supported positional properties.',
          autoFixAvailable: true, autoFixDescription: 'Expanded inset to the four positional properties.', fixed: true,
          recommendedAction: 'No action needed for this shorthand; verify the containing positioned element in VaCuus.',
          docRef: 'rcss-matrix.md#positioning',
        });
        autoFixesApplied++;
      } else {
        addDiagnostic(decl, {
          idPrefix: 'css-inset-invalid', severity: 'error', originalSnippet: original,
          message: 'The inset shorthand could not be expanded safely.',
          impact: 'Position offsets may be ignored, causing absolutely positioned elements to appear at their static position.',
          autoFixAvailable: false, fixed: false,
          recommendedAction: 'Replace inset with explicit top/right/bottom/left values.',
        });
        commentOutDeclaration(decl, 'manual inset conversion required');
        unsupportedEncountered++;
      }
      continue;
    }

    // place-items comes from Grid. Once the container is approximated as flex,
    // center is represented by the cross-axis and main-axis alignment properties.
    if (prop === 'place-items') {
      const parts = splitCssWhitespace(value);
      if (parts.length === 1 && ['start', 'end', 'center', 'stretch', 'flex-start', 'flex-end'].includes(parts[0])) {
        const align = parts[0] === 'start' ? 'flex-start' : parts[0] === 'end' ? 'flex-end' : parts[0];
        const justify = parts[0] === 'start' ? 'flex-start' : parts[0] === 'end' ? 'flex-end' : parts[0];
        decl.before(postcss.decl({ prop: 'align-items', value: align }));
        decl.before(postcss.decl({ prop: 'justify-content', value: justify }));
        decl.remove();
        addDiagnostic(decl, {
          idPrefix: 'css-place-items', severity: 'info', originalSnippet: original,
          message: 'Converted place-items into flex-compatible alignment properties.',
          impact: 'This is an approximation of Grid alignment, not a full Grid track layout.',
          autoFixAvailable: true, autoFixDescription: 'Mapped place-items to align-items and justify-content.', fixed: true,
          recommendedAction: 'Review child sizing and spacing because CSS Grid geometry is not preserved.',
        });
        autoFixesApplied++;
      } else {
        addDiagnostic(decl, {
          idPrefix: 'css-place-items-manual', severity: 'manual-fix', originalSnippet: original,
          message: `place-items value "${value}" cannot be mapped safely to flex alignment.`,
          impact: 'The alignment may differ if the original relies on Grid-specific behavior.',
          autoFixAvailable: false, fixed: false,
          recommendedAction: 'Set align-items and justify-content explicitly for the target flex container.',
        });
        commentOutDeclaration(decl, 'manual place-items conversion required');
        unsupportedEncountered++;
      }
      continue;
    }

    // Resolve functions that are unsupported by this RCSS build. In contrast to
    // dropping the entire declaration, use a deterministic static/percentage fallback
    // and tell the user exactly what approximation was made.
    const responsiveFallback = resolveUnsupportedCssFunctions(prop, value);
    if (responsiveFallback.changed) {
      unsupportedEncountered++;
      if (responsiveFallback.value !== null) {
        decl.value = responsiveFallback.value;
        addDiagnostic(decl, {
          idPrefix: 'css-responsive-fallback', severity: 'warning', originalSnippet: original,
          message: `Responsive CSS function(s) were replaced with the VaCuus fallback "${responsiveFallback.value}".`,
          impact: 'The value is renderable by RCSS, but viewport-dependent browser behavior is approximated rather than reproduced exactly.',
          autoFixAvailable: true, autoFixDescription: `Use ${responsiveFallback.value} as a deterministic RCSS fallback.`, fixed: true,
          recommendedAction: 'Check this value at the intended game viewport. For exact responsiveness, create explicit UE/VaCuus layout variants.',
          docRef: 'rcss-matrix.md#what-is-not-here',
        });
        autoFixesApplied++;
      } else {
        addDiagnostic(decl, {
          idPrefix: 'css-responsive-unresolved', severity: 'error', originalSnippet: original,
          message: 'Unsupported CSS value function could not be mapped to a safe RCSS fallback.',
          impact: 'The renderer may reject this whole declaration; leaving it live would make the layout fail silently.',
          autoFixAvailable: false, fixed: false,
          recommendedAction: 'Replace the expression with an explicit px/dp/% value designed for the target viewport.',
          docRef: 'rcss-matrix.md#what-is-not-here',
        });
        commentOutDeclaration(decl, 'unsupported responsive value without safe fallback');
      }
      continue;
    }

    // CSS Grid cannot be mapped one-for-one. Convert only the container display;
    // template/placement declarations are commented out and diagnosed for manual layout work.
    if (prop === 'display' && (value.toLowerCase() === 'grid' || value.toLowerCase() === 'inline-grid')) {
      unsupportedEncountered++;
      addDiagnostic(decl, {
        idPrefix: 'css-grid', severity: 'warning', originalSnippet: original,
        message: `CSS Grid display value "${value}" is unsupported by RmlUi/VaCuus.`,
        impact: 'Changing the container to flex does not automatically reproduce grid tracks, gaps, spanning or intrinsic sizing.',
        autoFixAvailable: true,
        autoFixDescription: 'Changed the container display to flex/inline-flex and added flex-wrap: wrap as a layout starting point.',
        fixed: convertGrid,
        recommendedAction: 'Review the children and assign explicit flex-basis/widths or use absolute positioning to reproduce the original grid.',
        docRef: 'rcss-matrix.md#display',
      });
      if (convertGrid) {
        decl.value = value.toLowerCase() === 'inline-grid' ? 'inline-flex' : 'flex';
        const siblings = (decl.parent as Rule | AtRule).nodes || [];
        const hasWrap = siblings.some(n => n.type === 'decl' && (n as Declaration).prop.toLowerCase() === 'flex-wrap');
        if (!hasWrap) decl.cloneAfter({ prop: 'flex-wrap', value: 'wrap' });
        autoFixesApplied++;
      }
      continue;
    }

    if (['grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row', 'grid-area', 'grid-auto-flow', 'grid-auto-columns', 'grid-auto-rows'].includes(prop)) {
      unsupportedEncountered++;
      addDiagnostic(decl, {
        idPrefix: 'css-grid-placement', severity: 'manual-fix', originalSnippet: original,
        message: `"${decl.prop}" has no direct equivalent in the target RCSS runtime.`,
        impact: 'The declaration cannot control grid tracks or item placement after display:grid has been converted.',
        autoFixAvailable: false, fixed: false,
        recommendedAction: 'Manually translate the layout to flex containers with explicit child sizing, or absolute positioning where necessary. Do not use calc() in the fallback.',
        docRef: 'gotchas.md#no-css-grid',
      });
      commentOutDeclaration(decl, 'manual grid conversion required');
      continue;
    }

    if (prop === 'grid-gap' || prop === 'grid-row-gap' || prop === 'grid-column-gap') {
      decl.prop = prop === 'grid-gap' ? 'gap' : (prop === 'grid-row-gap' ? 'row-gap' : 'column-gap');
      addDiagnostic(decl, {
        idPrefix: 'css-grid-gap', severity: 'info', originalSnippet: original,
        message: `Converted legacy ${prop} to ${decl.prop}.`,
        impact: 'Gap spacing is preserved, but this does not reproduce CSS Grid track sizing.',
        autoFixAvailable: true, autoFixDescription: `Renamed ${prop} to ${decl.prop}.`, fixed: true,
        recommendedAction: 'Review the flex layout because the container layout algorithm has changed.',
      });
      autoFixesApplied++;
      continue;
    }

    if (prop === 'box-shadow') {
      unsupportedEncountered++;
      addDiagnostic(decl, {
        idPrefix: 'css-box-shadow', severity: 'warning', originalSnippet: original,
        message: 'CRITICAL GOTCHA: box-shadow may parse successfully, but it does NOT render in this VaCuus/RmlUi renderer.',
        impact: 'Leaving it as a live declaration creates a false impression that the visual effect was converted.',
        autoFixAvailable: true, autoFixDescription: 'Commented out the unsupported declaration.', fixed: true,
        recommendedAction: 'Use a pre-rendered nine-patch/shadow texture or a supported decorator and verify it in UE5.',
        docRef: 'gotchas.md#box-shadow',
      });
      commentOutDeclaration(decl, 'unsupported visual effect');
      autoFixesApplied++;
      continue;
    }

    if (prop === 'mask-image' || prop === '-webkit-mask-image') {
      unsupportedEncountered++;
      addDiagnostic(decl, {
        idPrefix: 'css-mask-image', severity: 'warning', originalSnippet: original,
        message: 'Mask-image syntax may parse, but alpha masking is not applied by this renderer.',
        impact: 'The element will render without the expected mask.',
        autoFixAvailable: false, fixed: false,
        recommendedAction: 'Use a pre-masked PNG texture or an explicitly supported clipping/decorator approach.',
        docRef: 'gotchas.md#mask-image',
      });
      commentOutDeclaration(decl, 'unsupported mask');
      continue;
    }

    const noFallbackVars = [...value.matchAll(/var\s*\(\s*(--[\w-]+)\s*\)/gi)]
      .map(match => match[1])
      .filter(name => !definedCustomProperties.has(name));
    const noFallbackVar = noFallbackVars[0];
    if (noFallbackVar) {
      addDiagnostic(decl, {
        idPrefix: 'css-var-fallback', severity: 'warning', originalSnippet: original,
        message: `CSS custom property "${noFallbackVar}" is used without a fallback value and was not declared in this stylesheet.`,
        impact: 'If this variable is also missing from imported/inherited stylesheets, the declaration is dropped at runtime.',
        autoFixAvailable: false, fixed: false,
        recommendedAction: 'Define the custom property in the cascade or provide var(--name, fallback).',
        docRef: 'rcss-matrix.md#custom-properties',
      });
    }

    if (['transition', 'transition-timing-function', 'animation-timing-function', 'animation'].includes(prop)) {
      if (prop === 'transition' && /var\s*\(/i.test(value)) {
        addDiagnostic(decl, {
          idPrefix: 'css-transition-var', severity: 'warning', originalSnippet: original,
          message: 'var() inside a transition declaration has a known evaluation-order limitation in this VaCuus build.',
          impact: 'The whole transition declaration may be dropped without resolving the variable.',
          autoFixAvailable: false, fixed: false,
          recommendedAction: 'Use literal duration/timing values in transition declarations; keep custom properties for other declarations.',
          docRef: 'gotchas.md#transition-var',
        });
      }
      const normalized = normalizeTimingFunctions(value);
      if (normalized !== value) {
        addDiagnostic(decl, {
          idPrefix: 'css-transition-timing', severity: 'warning', originalSnippet: original,
          message: 'Normalized browser timing-function keywords to the target RmlUi tween vocabulary.',
          impact: 'Unrecognized timing keywords cause the transition/animation declaration to be rejected.',
          autoFixAvailable: true, autoFixDescription: `Changed value to: ${normalized}`, fixed: autoFixTransitions,
          recommendedAction: 'Verify the timing on the target VaCuus runtime; use supported lowercase tween keywords.',
          docRef: 'gotchas.md#transition-timing-casing',
        });
        if (autoFixTransitions) {
          decl.value = normalized;
          autoFixesApplied++;
        }
      }
      if (prop === 'transition' && /\b(width|height|margin|padding|top|left|right|bottom)\b/i.test(value)) {
        addDiagnostic(decl, {
          idPrefix: 'css-perf-layout-thrashing', severity: 'warning', originalSnippet: original,
          message: 'This transition includes geometry properties that may trigger repeated layout work.',
          impact: 'Frequent geometry animation can cause avoidable UI-thread/layout cost.',
          autoFixAvailable: false, fixed: false,
          recommendedAction: 'Prefer transforms or visual properties when equivalent behavior is possible.',
          docRef: 'perf-guide.md#layout-thrashing',
        });
      }
    }

    const radiusProps = new Set(['border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius']);
    if (radiusProps.has(prop) && /%/.test(value)) {
      const parts = value.split(/\s+/).filter(Boolean);
      const simplePillOrCircle = parts.length > 0 && parts.every(part => /^50%$/.test(part));
      addDiagnostic(decl, {
        idPrefix: 'css-border-radius-percent', severity: simplePillOrCircle ? 'warning' : 'manual-fix', originalSnippet: original,
        message: simplePillOrCircle
          ? 'Converted a 50% radius to a large fixed radius approximation; verify it against the element size.'
          : 'Percentage border-radius values cannot be mapped reliably to the target RCSS length-only radius.',
        impact: 'The browser computes percentage radii from element dimensions; RCSS expects a length in this target build.',
        autoFixAvailable: simplePillOrCircle,
        autoFixDescription: simplePillOrCircle ? 'Replaced 50% radius with 9999dp as a pill/circle approximation.' : undefined,
        fixed: simplePillOrCircle,
        recommendedAction: simplePillOrCircle ? 'Verify the shape at all target sizes.' : 'Set explicit radius lengths per corner based on the target design dimensions.',
        docRef: 'rcss-matrix.md#border-radius',
      });
      if (simplePillOrCircle) {
        decl.value = value.replace(/50%/g, cssPixelsAsDp ? '9999dp' : '9999px');
        autoFixesApplied++;
      } else {
        commentOutDeclaration(decl, 'manual percentage-radius conversion required');
      }
      continue;
    }

    if (/\b(?:\d*\.)?\d+sp\b/i.test(value)) {
      decl.value = value.replace(/\b(\d*\.)?\d+sp\b/gi, token => token.slice(0, -2) + 'dp');
      addDiagnostic(decl, {
        idPrefix: 'css-unit-sp', severity: 'info', originalSnippet: original,
        message: 'Converted sp units to dp units.', impact: 'VaCuus RCSS uses dp in the project examples; confirm expected scaling for this app.',
        autoFixAvailable: true, autoFixDescription: 'Replaced sp with dp.', fixed: true,
        recommendedAction: 'Review typography size against the target viewport.', docRef: 'rcss-matrix.md#units',
      });
      autoFixesApplied++;
    }

    if (prop === 'font-family' && !isInsideAtRule(decl, 'font-face')) {
      const requestedFamilies = splitFontFamilies(value);
      const knownFamilies = collectRegisteredFontFamilies(root);
      const matchedFamily = requestedFamilies.find(family => knownFamilies.has(normalizeFontFamily(family)));
      const genericMonospace = requestedFamilies.some(family => /^(?:ui-)?monospace$/i.test(family));
      const targetFamily = matchedFamily || (genericMonospace ? 'JetBrains Mono' : DEFAULT_UI_FONT_FAMILY);
      const normalizedFamily = quoteFontFamily(targetFamily);
      if (decl.value.trim() !== normalizedFamily) {
        decl.value = normalizedFamily;
        addDiagnostic(decl, {
          idPrefix: 'css-font-family-normalized', severity: 'warning', originalSnippet: original,
          message: matchedFamily
            ? `Normalized the source font stack to the registered VaCuus font "${targetFamily}".`
            : `Source font stack "${value}" is outside the approved font list; mapped it to "${targetFamily}".`,
          impact: 'VaCuus does not use the operating system browser font set. Every emitted family must be registered by an available font asset.',
          autoFixAvailable: true, autoFixDescription: `Use ${normalizedFamily} for this declaration.`, fixed: true,
          recommendedAction: 'If a custom family is intended, add a valid @font-face and package its font file under Content/DevUI/Fonts; otherwise use bundled Onest, Tektur or JetBrains Mono.',
          docRef: 'localization.md#font-glyph-ranges',
        });
        autoFixesApplied++;
      }
    }

    if (prop === 'opacity' && Number.isFinite(Number(value)) && Number(value) < 1) {
      addDiagnostic(decl, {
        idPrefix: 'css-opacity', severity: 'info', originalSnippet: original,
        message: 'Opacity behavior differs from browser compositing in this RmlUi renderer.',
        impact: 'Parent and child opacity do not necessarily compound like a browser compositing group.',
        autoFixAvailable: false, fixed: false,
        recommendedAction: 'Use alpha in the specific text/image/background color where the intended result requires independent transparency.',
        docRef: 'rcss-compatibility.md#non-compositing-opacity',
      });
    }

    if (prop === 'backdrop-filter') {
      if (/^blur\s*\([^)]*\)$/i.test(value)) {
        // Verified native VaCuus 1.1.0 path: this is a built-in backdrop/scene effect.
        // Do not impose the old, undocumented same-rule glass-panel shader condition.
        addDiagnostic(decl, {
          idPrefix: 'css-backdrop-filter-native-blur', severity: 'info', originalSnippet: original,
          message: 'Preserved native VaCuus backdrop-filter: blur(...), confirmed by the VaCuus 1.1.0 / UE 5.8 RCSS matrix.',
          impact: 'The plugin records the scene blur and recomposes it per engine frame. Verify blur quality and cost in the target runtime.',
          autoFixAvailable: false, fixed: false,
          recommendedAction: 'No shader decorator is required by the official target matrix for this declaration; verify the effect in UE5.',
          docRef: 'docs/vacuus-source-audit-1.1.0-ue5.8.md#backdrop-filter',
        });
        continue;
      }
      unsupportedEncountered++;
      addDiagnostic(decl, {
        idPrefix: 'css-backdrop-filter', severity: 'warning', originalSnippet: original,
        message: 'The target VaCuus release supports backdrop-filter: blur(...) only; other backdrop-filter functions are refused.',
        impact: 'A chain containing other backdrop filter functions will not be reproduced by the target renderer.',
        autoFixAvailable: true, autoFixDescription: 'Commented out the unsupported backdrop-filter declaration.', fixed: true,
        recommendedAction: 'Use a single blur(...) if scene blur is intended; otherwise bake the effect into a local texture or use a translucent panel.',
        docRef: 'docs/vacuus-source-audit-1.1.0-ue5.8.md#backdrop-filter',
      });
      commentOutDeclaration(decl, 'unsupported backdrop-filter function');
      autoFixesApplied++;
      continue;
    }

    if (prop === 'filter' || prop === 'clip-path' || prop === '-webkit-clip-path') {
      unsupportedEncountered++;
      addDiagnostic(decl, {
        idPrefix: `css-${prop.replace(/[^a-z0-9]+/g, '-')}`, severity: 'manual-fix', originalSnippet: original,
        message: `CSS property "${prop}" is not supported by the target RmlUi renderer.`,
        impact: 'The browser visual effect will not be reproduced by this declaration.',
        autoFixAvailable: true, autoFixDescription: 'Commented out the unsupported declaration.', fixed: true,
        recommendedAction: prop === 'filter'
          ? 'Use a preprocessed texture, a supported decorator, or an Unreal post-process effect as appropriate.'
          : 'Use a supported border-radius/overflow approach or a pre-cut texture where visually acceptable.',
        docRef: 'rcss-matrix.md#what-is-not-here',
      });
      commentOutDeclaration(decl, 'unsupported visual property');
      autoFixesApplied++;
      continue;
    }

    const catalogEntry = RCSS_PROPERTY_CATALOG[prop];
    if (!catalogEntry && !prop.startsWith('--') && !prop.startsWith('-webkit-') && !prop.startsWith('-moz-')) {
      addDiagnostic(decl, {
        idPrefix: 'css-unknown-property', severity: 'unverified', originalSnippet: original,
        message: `Property "${decl.prop}" is not in the current RCSS compatibility catalog.`,
        impact: 'It may be rejected by the target RCSS parser or parse without visible effect.',
        autoFixAvailable: false, fixed: false,
        recommendedAction: 'Check the exact VaCuus version’s rcss-matrix.md or add a runtime test before relying on the property.',
        docRef: 'rcss-matrix.md',
      });
    } else if (catalogEntry?.status === 'unsupported' && !['grid', 'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row', 'filter', 'backdrop-filter'].includes(prop)) {
      unsupportedEncountered++;
      addDiagnostic(decl, {
        idPrefix: 'css-catalog-unsupported', severity: 'warning', originalSnippet: original,
        message: `The compatibility catalog marks "${decl.prop}" as unsupported.`,
        impact: 'The target renderer is not expected to reproduce this declaration.',
        autoFixAvailable: false, fixed: false,
        recommendedAction: 'Replace it with an implementation verified for the target VaCuus build.',
        docRef: 'rcss-matrix.md',
      });
    }
  }

  // RmlUi does not generate browser pseudo-elements. Materialize the simple quoted
  // content variants as real RML spans, and rewrite their selectors to those spans.
  // One source element may have base/hover/focus rules for the same pseudo-element;
  // they must share a helper node instead of inserting one span per rule.
  const pseudoContentByHelper = new Map<string, string>();
  root.walkRules((rule: Rule) => {
    const selectorParts = splitCssSelectorList(rule.selector);
    if (!selectorParts.some(part => /::?(?:before|after)\b/i.test(part))) return;

    const contentDecl = rule.nodes?.find((node): node is Declaration => node.type === 'decl' && node.prop.toLowerCase() === 'content');
    const contentText = contentDecl ? parseQuotedCssContent(contentDecl.value) : undefined;
    const rewrittenParts: string[] = [];
    let materialized = false;
    let removedPseudoArm = false;

    for (const part of selectorParts) {
      const match = part.match(/::?(before|after)\b/i);
      if (!match) {
        rewrittenParts.push(part);
        continue;
      }
      const position = match[1].toLowerCase() as 'before' | 'after';
      const targetSelector = part.replace(/::?(?:before|after)\b/i, '').trim();
      if (contentText === undefined || !isSupportedPseudoSelectorTarget(targetSelector)) {
        removedPseudoArm = true;
        continue;
      }
      const className = makePseudoHelperClass(position, targetSelector);
      const existingContent = pseudoContentByHelper.get(className);
      if (existingContent !== undefined && existingContent !== contentText) {
        removedPseudoArm = true;
        addDiagnostic(rule, {
          idPrefix: 'css-pseudo-element-content-conflict', severity: 'warning', originalSnippet: part,
          message: `The same ${position} pseudo-element uses different generated text across state selectors; the conflicting content was not materialized.`,
          impact: 'A generated RML span has fixed text content, so separate hover/focus text would otherwise create duplicate visible elements.',
          autoFixAvailable: false, fixed: false,
          recommendedAction: 'Use one content value for this pseudo-element across states, or add a real HTML span and toggle its text/state explicitly.',
          docRef: 'rcss-matrix.md#pseudo-elements',
        });
        continue;
      }
      if (existingContent === undefined) {
        pseudoContentByHelper.set(className, contentText);
        pseudoElements.push({ targetSelector, position, className, contentText });
      }
      rewrittenParts.push(`${targetSelector} .${className}`);
      materialized = true;
    }

    if (materialized) {
      rule.selector = rewrittenParts.join(', ');
      if (contentDecl?.parent) contentDecl.remove();
      // Generated helper nodes are real RML <span>s. An explicit display value
      // avoids relying on browser pseudo-element display behavior in RmlUi.
      const hasDisplay = rule.nodes?.some(node => node.type === 'decl' && (node as Declaration).prop.toLowerCase() === 'display');
      if (!hasDisplay) rule.prepend(postcss.decl({ prop: 'display', value: 'block' }));
      addDiagnostic(rule, {
        idPrefix: 'css-pseudo-element-materialized', severity: 'info', originalSnippet: selectorParts.join(', '),
        message: 'Converted a simple ::before/::after into an explicit RML span and retargeted its RCSS selector.',
        impact: 'Decorative elements can render in RmlUi because the pseudo-element is now a real child node.',
        autoFixAvailable: true, autoFixDescription: 'Added a generated helper span and rewrote the selector.', fixed: true,
        recommendedAction: 'Verify position, dimensions and unsupported visual effects against the source screenshot.',
        docRef: 'rcss-matrix.md#pseudo-elements',
      });
      autoFixesApplied++;
    } else if (removedPseudoArm) {
      rule.selector = rewrittenParts.join(', ');
      addDiagnostic(rule, {
        idPrefix: 'css-pseudo-element-unhandled', severity: 'warning', originalSnippet: selectorParts.join(', '),
        message: 'Removed a pseudo-element selector without a supported quoted content value; a helper node was not generated.',
        impact: 'CSS generated content using attr(), counters, image content or complex selectors needs a source element or a specialized fallback.',
        autoFixAvailable: false, fixed: false,
        recommendedAction: 'Add a real span/div to the HTML for this complex pseudo-element.',
        docRef: 'rcss-matrix.md#pseudo-elements',
      });
      if (!rule.selector.trim()) rule.remove();
    }
  });

  // SVG nodes are exported as PNG assets because RmlUi does not rasterize inline SVG.
  // Retarget simple element selectors to the generated <img class="vacuus-svg-raster">.
  root.walkRules((rule: Rule) => {
    const rewritten = rewriteSvgTypeSelectors(rule.selector);
    if (rewritten === rule.selector) return;
    const originalSelector = rule.selector;
    rule.selector = rewritten;
    addDiagnostic(rule, {
      idPrefix: 'css-svg-selector', severity: 'info', originalSnippet: originalSelector,
      message: 'Retargeted CSS selectors from inline SVG elements to generated PNG image nodes.',
      impact: 'Geometry declarations such as width, height and alignment now target the rasterized icon; SVG-specific stroke/fill declarations must be baked into the image.',
      autoFixAvailable: true, autoFixDescription: 'Replaced SVG type selectors with img.vacuus-svg-raster.', fixed: true,
      recommendedAction: 'Keep layout declarations in this selector. Bake any SVG stroke/fill styles into the SVG source before rasterization.',
    });
    autoFixesApplied++;
  });

  // Browser `background: linear-gradient(...)` is not a valid RCSS background value.
  // VaCuus renders these through the RmlUi `decorator: linear-gradient(...)` API.
  // Preserve simple gradient layers and localize remote URL layers into a decorator
  // list rather than replacing a layered background with the image alone.
  root.walkDecls((decl: Declaration) => {
    if (!decl.parent) return;
    const prop = decl.prop.toLowerCase();
    if (prop !== 'background' && prop !== 'background-image') return;

    const layers = splitCssFunctionArgs(decl.value);
    const parsedLayers: string[] = [];
    let hasGradient = false;
    let hasRemoteImage = false;
    let hasLocalImage = false;
    let hasUnsupportedLayer = false;
    let hasImagePositionSuffix = false;

    for (const layer of layers) {
      const leading = readLeadingCssFunction(layer);
      if (!leading) {
        hasUnsupportedLayer = true;
        break;
      }

      if (/^(?:repeating-)?(?:linear|radial|conic)-gradient$/i.test(leading.name) && !leading.remainder) {
        parsedLayers.push(leading.raw);
        hasGradient = true;
        continue;
      }

      if (leading.name.toLowerCase() === 'url') {
        const url = unquoteCssString(leading.arguments).trim();
        if (/^https?:\/\//i.test(url)) {
          let asset = externalImageByUrl.get(url);
          if (!asset) {
            asset = { url, filename: `remote-image-${stableStringHash(url)}.png` };
            externalImageByUrl.set(url, asset);
            externalImageAssets.push(asset);
          }
          parsedLayers.push(`image(../Assets/${asset.filename})`);
          hasRemoteImage = true;
          if (leading.remainder) hasImagePositionSuffix = true;
          continue;
        }
        if (!url || /^(?:data:|blob:|file:|javascript:)/i.test(url)) {
          hasUnsupportedLayer = true;
          break;
        }
        // Local images are normalized by prepareProjectAssets() before the CSS
        // parser sees them. RmlUi's image() decorator path is document-relative.
        if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && /\.(?:png|jpe?g|webp|bmp|tga|gif)(?:[?#].*)?$/i.test(url)) {
          parsedLayers.push(`image(${url.replace(/^\.\//, '')})`);
          hasLocalImage = true;
          if (leading.remainder) hasImagePositionSuffix = true;
          continue;
        }
      }

      hasUnsupportedLayer = true;
      break;
    }

    // Avoid rewriting arbitrary backgrounds, gradients with browser positioning,
    // or shorthand forms whose layers cannot be represented safely.
    if (hasUnsupportedLayer || parsedLayers.length !== layers.length || (!hasGradient && !hasRemoteImage && !hasLocalImage)) return;

    const original = decl.toString();
    decl.prop = 'decorator';
    decl.value = parsedLayers.join(', ');
    const layered = parsedLayers.length > 1;
    addDiagnostic(decl, {
      idPrefix: hasRemoteImage ? 'css-remote-background' : 'css-background-gradient',
      severity: hasRemoteImage || hasImagePositionSuffix ? 'warning' : 'info',
      originalSnippet: original,
      message: hasRemoteImage
        ? 'Converted CSS background layers into VaCuus decorators and scheduled remote images for local export.'
        : 'Converted the CSS gradient into the RmlUi decorator syntax required by RCSS.',
      impact: hasImagePositionSuffix
        ? 'The image decorator is sized to the element; browser image-position / cover sizing from this layer is approximated. Gradient layers are preserved.'
        : layered
          ? 'Layer order is preserved in the decorator list; verify the composite visually in the target renderer.'
          : 'The gradient should render as a decorator instead of being silently ignored as a browser background value.',
      autoFixAvailable: true,
      autoFixDescription: `Generated decorator: ${decl.value}`,
      fixed: true,
      recommendedAction: hasImagePositionSuffix
        ? 'Verify image crop and position in UE5; use a prepared texture if exact cover positioning is required.'
        : 'Compare the output against the browser reference at the target viewport.',
      docRef: 'rcss-compatibility.md#images-and-backgrounds',
    });
    autoFixesApplied++;
    if (hasRemoteImage) unsupportedEncountered++;
  });

  let rulesProcessed = 0;
  root.walkRules(() => { rulesProcessed++; });

  return {
    rcss: root.toString(),
    diagnostics,
    externalImageAssets,
    pseudoElements,
    metrics: { rulesProcessed, propertiesAnalyzed, autoFixesApplied, unsupportedEncountered },
  };
}

/**
 * Rewrites CSS dimensional px tokens to dp without touching quoted text or url(...)
 * payloads. Values are processed only after PostCSS has tokenized the stylesheet, so
 * comments and selectors never enter this scanner. Media query parameters use the same
 * function to preserve browser-like logical breakpoints under Slate DPI scaling.
 */
function convertCssPixelsToDp(input: string): string {
  let output = '';
  let i = 0;
  let quote = '';

  while (i < input.length) {
    const ch = input[i];

    if (quote) {
      output += ch;
      if (ch === '\\' && i + 1 < input.length) {
        output += input[i + 1];
        i += 2;
        continue;
      }
      if (ch === quote) quote = '';
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      output += ch;
      i++;
      continue;
    }

    const previous = i > 0 ? input[i - 1] : '';
    const urlMatch = /^url\s*\(/i.exec(input.slice(i));
    if (urlMatch && (!previous || !/[\w-]/.test(previous))) {
      const open = i + urlMatch[0].lastIndexOf('(');
      let depth = 0;
      let urlQuote = '';
      let close = -1;
      for (let j = open; j < input.length; j++) {
        const current = input[j];
        if (urlQuote) {
          if (current === '\\') { j++; continue; }
          if (current === urlQuote) urlQuote = '';
          continue;
        }
        if (current === '"' || current === "'") { urlQuote = current; continue; }
        if (current === '(') depth++;
        else if (current === ')') {
          depth--;
          if (depth === 0) { close = j; break; }
        }
      }
      if (close >= 0) {
        output += input.slice(i, close + 1);
        i = close + 1;
        continue;
      }
    }

    // Require a token boundary before the number so identifiers such as --size20px
    // are not partially modified. Keep the numeric spelling exactly as authored.
    const previousIsBoundary = !previous || !/[\w.-]/.test(previous);
    if (previousIsBoundary) {
      const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))px(?![\w-])/i.exec(input.slice(i));
      if (match) {
        output += `${match[1]}dp`;
        i += match[0].length;
        continue;
      }
    }

    output += ch;
    i++;
  }

  return output;
}

/** Read a CSS function at the start of a background layer without splitting nested commas. */
function readLeadingCssFunction(input: string): { name: string; raw: string; arguments: string; remainder: string } | null {
  const value = input.trim();
  const match = /^([a-z_-][\w-]*)\s*\(/i.exec(value);
  if (!match) return null;
  const openAt = match[0].lastIndexOf('(');
  let depth = 0;
  let quote = '';
  let closeAt = -1;
  for (let i = openAt; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      if (ch === quote && value[i - 1] !== '\\') quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) { closeAt = i; break; }
    }
  }
  if (closeAt < 0) return null;
  return {
    name: match[1],
    raw: value.slice(0, closeAt + 1),
    arguments: value.slice(openAt + 1, closeAt),
    remainder: value.slice(closeAt + 1).trim(),
  };
}

function unquoteCssString(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed[0] === '"' && trimmed.at(-1) === '"') || (trimmed[0] === "'" && trimmed.at(-1) === "'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Split CSS tokens on top-level whitespace without splitting inside function calls or quotes. */
function splitCssWhitespace(value: string): string[] {
  const result: string[] = [];
  let token = '';
  let depth = 0;
  let quote = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      token += ch;
      if (ch === quote && value[i - 1] !== '\\') quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; token += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (/\s/.test(ch) && depth === 0) {
      if (token) result.push(token);
      token = '';
    } else token += ch;
  }
  if (token) result.push(token);
  return result;
}

function splitCssFunctionArgs(value: string): string[] {
  const args: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      if (ch === quote && value[i - 1] !== '\\') quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) { args.push(value.slice(start, i).trim()); start = i + 1; }
  }
  args.push(value.slice(start).trim());
  return args;
}

interface ResponsiveFallbackResult { value: string | null; changed: boolean; functions: string[]; }

function resolveUnsupportedCssFunctions(prop: string, input: string): ResponsiveFallbackResult {
  let changed = false;
  const functions: string[] = [];
  const dimensionProps = new Set(['width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'flex-basis']);
  const positionProps = new Set(['top', 'right', 'bottom', 'left']);

  const resolve = (value: string): string | null => {
    let output = '';
    let i = 0;
    let quote = '';
    while (i < value.length) {
      const ch = value[i];
      if (quote) {
        output += ch;
        if (ch === quote && value[i - 1] !== '\\') quote = '';
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; output += ch; i++; continue; }

      const fnMatch = /^(clamp|min|max|calc)\s*\(/i.exec(value.slice(i));
      if (!fnMatch) { output += ch; i++; continue; }

      const name = fnMatch[1].toLowerCase();
      const openAt = i + fnMatch[0].lastIndexOf('(');
      let depth = 0;
      let innerQuote = '';
      let closeAt = -1;
      for (let j = openAt; j < value.length; j++) {
        const c = value[j];
        if (innerQuote) {
          if (c === innerQuote && value[j - 1] !== '\\') innerQuote = '';
          continue;
        }
        if (c === '"' || c === "'") { innerQuote = c; continue; }
        if (c === '(') depth++;
        else if (c === ')' && --depth === 0) { closeAt = j; break; }
      }
      if (closeAt < 0) return null;

      const rawInner = value.slice(openAt + 1, closeAt);
      const resolvedInner = resolve(rawInner);
      if (resolvedInner === null) return null;
      const fallback = chooseFunctionFallback(name, resolvedInner, prop, dimensionProps, positionProps);
      if (fallback === null) return null;

      changed = true;
      functions.push(name);
      output += fallback;
      i = closeAt + 1;
    }
    return output;
  };

  const value = resolve(input);
  return { value, changed, functions: [...new Set(functions)] };
}

function chooseFunctionFallback(
  name: string,
  inner: string,
  prop: string,
  dimensionProps: Set<string>,
  positionProps: Set<string>,
): string | null {
  if (name === 'calc') {
    // Conservative, documented approximations for common responsive size expressions.
    if (dimensionProps.has(prop) && /(?:\d+(?:\.\d+)?(?:vw|vh|vmin|vmax)|100%)/i.test(inner)) return '100%';
    if (positionProps.has(prop)) {
      const percent = inner.match(/(?:^|[^\w.])((?:\d*\.)?\d+%)/);
      if (percent) return percent[1];
    }
    const simpleLength = inner.match(/(?:^|[^\w.])([-+]?(?:\d*\.)?\d+(?:px|dp|em|rem))\b/i);
    return simpleLength?.[1] || null;
  }

  const args = splitCssFunctionArgs(inner);
  if (name === 'clamp') {
    if (args.length !== 3) return null;
    // Use a declared absolute upper bound when available: it maintains a deliberate
    // desktop size rather than dropping positioning/dimensions to static defaults.
    const absolute = (arg: string) => /^[-+]?(?:\d*\.)?\d+(?:px|dp|em|rem)$/i.test(arg.trim());
    if (absolute(args[2])) return args[2].trim();
    if (absolute(args[0])) return args[0].trim();
    const percent = args.find(arg => /^[-+]?(?:\d*\.)?\d+%$/.test(arg.trim()));
    return percent?.trim() || null;
  }

  if (name === 'min' || name === 'max') {
    const absoluteArgs = args.filter(arg => /^[-+]?(?:\d*\.)?\d+(?:px|dp|em|rem)$/i.test(arg.trim()));
    if (absoluteArgs.length) {
      const numeric = absoluteArgs.map(arg => ({ arg: arg.trim(), value: Number.parseFloat(arg) }));
      numeric.sort((a, b) => a.value - b.value);
      return (name === 'min' ? numeric[0] : numeric[numeric.length - 1]).arg;
    }
    const simpleArgs = args.find(arg => /^[-+]?(?:\d*\.)?\d+(?:%|px|dp|em|rem)$/i.test(arg.trim()));
    if (simpleArgs) return simpleArgs.trim();
  }
  return null;
}

function splitFontFamilies(value: string): string[] {
  return splitCssFunctionArgs(value).map(family => family.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

function normalizeFontFamily(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '').toLowerCase().replace(/\s+/g, ' ');
}

function collectRegisteredFontFamilies(root: postcss.Root): Set<string> {
  const registered = new Set(UI_FONT_FAMILIES.map(item => normalizeFontFamily(item.family)));
  root.walkAtRules('font-face', atRule => {
    const familyDecl = atRule.nodes?.find(node => node.type === 'decl' && node.prop.toLowerCase() === 'font-family');
    if (!familyDecl || familyDecl.type !== 'decl') return;
    const family = familyDecl.value.trim().replace(/^['"]|['"]$/g, '');
    if (family) registered.add(normalizeFontFamily(family));
  });
  return registered;
}

function quoteFontFamily(value: string): string {
  return /\s/.test(value) ? `"${value.replace(/^['"]|['"]$/g, '')}"` : value;
}

function normalizeTimingFunctions(value: string): string {
  // Match longest tokens first: matching `ease` first corrupts `ease-in-out`.
  const names = Object.keys(TIMING_FUNCTION_MAP).sort((a, b) => b.length - a.length);
  let result = value;
  for (const original of names) {
    const replacement = TIMING_FUNCTION_MAP[original];
    if (original.toLowerCase() === replacement.toLowerCase()) continue;
    const expression = new RegExp(`\\b${escapeRegExp(original)}\\b`, 'gi');
    result = result.replace(expression, replacement);
  }
  // Handle CSS timing keywords independent of how the catalog keys are cased.
  result = result.replace(/\bease-in-out\b/gi, 'cubic-in-out')
    .replace(/\bease-in\b/gi, 'cubic-in')
    .replace(/\bease-out\b/gi, 'cubic-out')
    .replace(/\bease\b/gi, 'cubic-in-out')
    .replace(/\bCubic-(In-Out|In|Out)\b/gi, (_match, suffix: string) => `cubic-${suffix.toLowerCase()}`);
  return result;
}

function isInsideAtRule(node: Node, name: string): boolean {
  let current = node.parent;
  while (current) {
    if (current.type === 'atrule' && (current as AtRule).name.toLowerCase() === name.toLowerCase()) return true;
    current = current.parent;
  }
  return false;
}

function getSourceLine(content: string, line: number): string {
  return content.split(/\r?\n/)[Math.max(0, line - 1)]?.trim().slice(0, 180) || '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


/** Extract URL arguments from CSS values while leaving the surrounding syntax intact. */
function extractCssUrls(value: string): string[] {
  const result: string[] = [];
  const regex = /url\(\s*([\"']?)(.*?)\1\s*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    const url = match[2].trim();
    if (url) result.push(url);
  }
  return result;
}

/** Rewrite SVG type selectors without touching class names or attribute values. */
function rewriteSvgTypeSelectors(selector: string): string {
  return selector.replace(/(^|[\s>+~,])svg(?=$|[\s>+~.#:[,\]])/gi, '$1img.vacuus-svg-raster');
}

function stableStringHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}


function rewriteRootPseudoSelector(selector: string): string {
  // Rewrite the browser document root to RML's body node. Keep the rule scoped to
  // selector tokens so identifiers such as :rooted are not modified.
  return selector.replace(/:root\b/gi, 'body');
}


function splitCssSelectorList(selector: string): string[] {
  const parts: string[] = [];
  let start = 0, quote = '', bracketDepth = 0, parenDepth = 0, escaped = false;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (quote) { if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '[') bracketDepth++;
    else if (c === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (c === '(') parenDepth++;
    else if (c === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (c === ',' && bracketDepth === 0 && parenDepth === 0) { parts.push(selector.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(selector.slice(start).trim());
  return parts.filter(Boolean);
}

function parseQuotedCssContent(value: string): string | undefined {
  const text = value.trim();
  if (text === 'none' || text === 'normal' || text.length < 2) return undefined;
  if (!['"', "'"].includes(text[0]) || text[text.length - 1] !== text[0]) return undefined;
  return text.slice(1, -1).replace(/\\([\\"'])/g, '$1').replace(/\\n/g, '\n').replace(/\\a\s?/gi, '\n');
}

function isSupportedPseudoSelectorTarget(selector: string): boolean {
  return Boolean(selector) && !selector.includes(',') && !selector.includes('[') && !selector.includes(']') && !selector.includes('(') && !selector.includes(')');
}

function makePseudoHelperClass(position: 'before' | 'after', targetSelector: string): string {
  // Runtime states such as :hover/:active do not identify a different source
  // element. If they were included in the hash, each state generated a separate
  // real RML span and users saw duplicate pseudo-element content. Keep those
  // states in the RCSS selector, but remove them from the helper-node identity.
  const identitySelector = targetSelector
    .replace(/:(?:focus-visible|hover|active|focus|disabled|enabled)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const slug = identitySelector.toLowerCase().replace(/:[a-z-]+/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'node';
  let hash = 2166136261;
  for (let i = 0; i < identitySelector.length; i++) { hash ^= identitySelector.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return `vacuus-pseudo-${position}-${slug}-${(hash >>> 0).toString(16).slice(0, 6)}`;
}
