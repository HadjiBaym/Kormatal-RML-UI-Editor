import { parse } from 'acorn';
import type { DiagnosticIssue } from './types.ts';

export interface JsConversionResult {
  convertedJs: string;
  diagnostics: DiagnosticIssue[];
  metrics: {
    functionsProcessed: number;
    browserApisFlagged: number;
    shimsInjected: number;
  };
}

type AstNode = {
  type: string;
  start: number;
  end: number;
  loc?: { start: { line: number; column: number }; end: { line: number; column: number } };
  [key: string]: any;
};

type ScopeKind = 'program' | 'function' | 'block' | 'catch' | 'class';
interface Scope {
  kind: ScopeKind;
  parent?: Scope;
  bindings: Set<string>;
}

interface ForbiddenApiDefinition {
  name: string;
  severity: 'error' | 'warning' | 'manual-fix';
  message: string;
  impact: string;
  recommendedAction: string;
}

const API_DEFINITIONS: Record<string, ForbiddenApiDefinition> = {
  localStorage: {
    name: 'localStorage', severity: 'error',
    message: 'Browser "localStorage" API is not available in VaCuus / RmlUi embedded runtime.',
    impact: 'The reference will fail at runtime. A memory-only replacement would silently lose persistence and is not injected.',
    recommendedAction: 'Persist state via Unreal Engine SaveGame or bind it to a UE5 data model.',
  },
  sessionStorage: {
    name: 'sessionStorage', severity: 'error',
    message: 'Browser "sessionStorage" is not available in VaCuus.',
    impact: 'The reference will fail unless the host provides an explicit compatible implementation.',
    recommendedAction: 'Store session state in memory or in the Unreal Engine GameInstance and expose it to the UI.',
  },
  'fetch()': {
    name: 'fetch()', severity: 'error',
    message: 'Browser "fetch()" is not part of the VaCuus/RmlUi UI contract documented for this project.',
    impact: 'Network requests should not be assumed to work from document scripts.',
    recommendedAction: 'Perform HTTP requests in Unreal Engine and publish results through the project’s bridge/data model.',
  },
  XMLHttpRequest: {
    name: 'XMLHttpRequest', severity: 'error',
    message: 'Browser "XMLHttpRequest" is not part of the VaCuus/RmlUi UI contract documented for this project.',
    impact: 'The browser network API may be undefined in the embedded runtime.',
    recommendedAction: 'Use Unreal Engine HTTP facilities and pass the result to the UI through a supported bridge.',
  },
  'window.alert': {
    name: 'window.alert', severity: 'error',
    message: '"window.alert" is a browser-specific blocking dialog and is not a reliable in-game UI primitive.',
    impact: 'The call may be absent or behave differently in the embedded runtime.',
    recommendedAction: 'Show an in-game RML dialog or non-blocking notification instead.',
  },
  'window object': {
    name: 'window', severity: 'error',
    message: 'VaCuus does not install the browser global "window".',
    impact: 'Accessing window members such as matchMedia, innerWidth or addEventListener can throw ReferenceError in the embedded runtime.',
    recommendedAction: 'Use the VaCuus document, vacuus.view, supported element events, and host-published data instead of browser window APIs.',
  },
  'textContent': {
    name: 'textContent', severity: 'manual-fix',
    message: 'VaCuus does not expose browser textContent; only plain assignments can be adapted to literal text nodes.',
    impact: 'Reads have no direct browser-compatible getter. Writes must create literal text nodes; innerRML is not a safe equivalent because it parses markup.',
    recommendedAction: 'Use nodeValue/data for text-node reads and traverse children explicitly for element reads. Plain `=` writes may be converted to a text-node adapter when the native document global is not shadowed.',
  },
  'innerText': {
    name: 'innerText', severity: 'manual-fix',
    message: 'The VaCuus 1.1.0 DOM facade does not expose the browser innerText property.',
    impact: 'Text reads and writes are not browser-compatible and may fail at runtime.',
    recommendedAction: 'Use nodeValue/data for text nodes or traverse childNodes explicitly; review whitespace and layout-dependent behavior.',
  },
  'ES module syntax': {
    name: 'ES module syntax', severity: 'manual-fix',
    message: 'Import/export syntax cannot run in the generated classic RML script unless the module graph is bundled first.',
    impact: 'The converter preserves these statements but does not resolve dependencies or rewrite module scope, so the emitted script may fail before initialization.',
    recommendedAction: 'Bundle the entry point into one classic IIFE before import, or use the VaCuus Web CLI for TSX/Preact projects.',
  },
  'location navigation': {
    name: 'location navigation', severity: 'error',
    message: 'Browser URL navigation (location.href/reload) has no direct equivalent inside a VaCuus document.',
    impact: 'The request will not navigate an Unreal viewport to a browser URL.',
    recommendedAction: 'Ask the Unreal host to load another RML document or dispatch a project-defined navigation event.',
  },
  'document.cookie': {
    name: 'document.cookie', severity: 'error',
    message: 'Browser cookies are not part of the RmlUi document API.',
    impact: 'Cookie reads/writes will not provide browser cookie storage.',
    recommendedAction: 'Use the game profile, SaveGame, or an explicit host-provided persistence interface.',
  },
  'DOM Observers': {
    name: 'DOM Observers', severity: 'warning',
    message: 'MutationObserver/ResizeObserver/IntersectionObserver are not guaranteed by the VaCuus JavaScript runtime.',
    impact: 'Observer construction or callbacks may fail.',
    recommendedAction: 'Update UI state explicitly from supported events/data bindings or a host-provided resize signal.',
  },
  'React Framework Bundle': {
    name: 'React Framework Bundle', severity: 'warning',
    message: 'React/ReactDOM usage detected. A browser ReactDOM runtime cannot be assumed compatible with the RmlUi document tree.',
    impact: 'React reconciliation, synthetic events, or browser DOM assumptions may fail.',
    recommendedAction: 'Compile the framework into a VaCuus-compatible rendering adapter or generate RML and use supported runtime APIs.',
  },
  jQuery: {
    name: 'jQuery', severity: 'warning',
    message: 'jQuery usage detected. jQuery assumes browser DOM semantics that may not match RmlUi.',
    impact: 'Traversal, event, and animation helpers may not work as they do in a browser.',
    recommendedAction: 'Replace the affected operations with APIs verified against the target VaCuus build.',
  },
};

const GLOBAL_API_IDENTIFIERS = new Map<string, keyof typeof API_DEFINITIONS>([
  ['localStorage', 'localStorage'],
  ['sessionStorage', 'sessionStorage'],
  ['XMLHttpRequest', 'XMLHttpRequest'],
  ['MutationObserver', 'DOM Observers'],
  ['ResizeObserver', 'DOM Observers'],
  ['IntersectionObserver', 'DOM Observers'],
  ['React', 'React Framework Bundle'],
  ['ReactDOM', 'React Framework Bundle'],
  ['createRoot', 'React Framework Bundle'],
  ['jQuery', 'jQuery'],
]);

function isNode(value: unknown): value is AstNode {
  return !!value && typeof value === 'object' && typeof (value as AstNode).type === 'string' &&
    typeof (value as AstNode).start === 'number' && typeof (value as AstNode).end === 'number';
}

function eachChild(node: AstNode, callback: (child: AstNode, key: string) => void): void {
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    if (isNode(value)) callback(value, key);
    else if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) callback(item, key);
    }
  }
}

function collectAst(root: AstNode): Array<{ node: AstNode; parent?: AstNode; key?: string; scope: Scope }> {
  const records: Array<{ node: AstNode; parent?: AstNode; key?: string; scope: Scope }> = [];
  const rootScope: Scope = { kind: 'program', bindings: new Set() };

  const declarePattern = (pattern: AstNode | undefined, scope: Scope): void => {
    if (!pattern) return;
    switch (pattern.type) {
      case 'Identifier': scope.bindings.add(pattern.name); return;
      case 'RestElement': declarePattern(pattern.argument, scope); return;
      case 'AssignmentPattern': declarePattern(pattern.left, scope); return;
      case 'ArrayPattern': for (const item of pattern.elements || []) declarePattern(item, scope); return;
      case 'ObjectPattern':
        for (const prop of pattern.properties || []) {
          if (prop.type === 'RestElement') declarePattern(prop.argument, scope);
          else declarePattern(prop.value, scope);
        }
        return;
    }
  };

  const nearestFunctionScope = (scope: Scope): Scope => {
    let current: Scope | undefined = scope;
    while (current?.parent && current.kind !== 'function' && current.kind !== 'program') current = current.parent;
    return current || scope;
  };

  const walk = (node: AstNode, parent: AstNode | undefined, key: string | undefined, inheritedScope: Scope): void => {
    let scope = inheritedScope;

    // Declaration names belong to the enclosing scope; function parameters belong to the function scope.
    if (node.type === 'FunctionDeclaration' && node.id?.name) inheritedScope.bindings.add(node.id.name);
    if (node.type === 'ClassDeclaration' && node.id?.name) inheritedScope.bindings.add(node.id.name);

    if (node.type === 'Program') {
      scope = rootScope;
    } else if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
      scope = { kind: 'function', parent: inheritedScope, bindings: new Set() };
      if (node.type === 'FunctionExpression' && node.id?.name) scope.bindings.add(node.id.name);
      for (const param of node.params || []) declarePattern(param, scope);
    } else if (node.type === 'BlockStatement') {
      scope = { kind: 'block', parent: inheritedScope, bindings: new Set() };
    } else if (node.type === 'CatchClause') {
      scope = { kind: 'catch', parent: inheritedScope, bindings: new Set() };
      declarePattern(node.param, scope);
    } else if (node.type === 'ClassExpression') {
      scope = { kind: 'class', parent: inheritedScope, bindings: new Set() };
      if (node.id?.name) scope.bindings.add(node.id.name);
    }

    records.push({ node, parent, key, scope });

    if (node.type === 'VariableDeclarator') {
      const target = parent?.type === 'VariableDeclaration' && parent.kind === 'var'
        ? nearestFunctionScope(scope)
        : scope;
      declarePattern(node.id, target);
    }
    if (node.type === 'ImportDeclaration') {
      for (const specifier of node.specifiers || []) if (specifier.local?.name) scope.bindings.add(specifier.local.name);
    }
    if (node.type === 'ClassDeclaration' && node.id?.name) scope.bindings.add(node.id.name);

    eachChild(node, (child, childKey) => walk(child, node, childKey, scope));
  };

  walk(root, undefined, undefined, rootScope);
  // References need the final binding sets, so return scopes populated by the complete first pass.
  return records;
}

function resolveBinding(name: string, scope: Scope): boolean {
  let current: Scope | undefined = scope;
  while (current) {
    if (current.bindings.has(name)) return true;
    current = current.parent;
  }
  return false;
}

function isDeclarationOrNonReferenceIdentifier(node: AstNode, parent?: AstNode, key?: string): boolean {
  if (!parent) return false;
  if ((parent.type === 'MemberExpression' || parent.type === 'PropertyDefinition') && key === 'property' && !parent.computed) return true;
  if (parent.type === 'Property' && key === 'key' && !parent.computed && !parent.shorthand) return true;
  if (parent.type === 'VariableDeclarator' && key === 'id') return true;
  if (['FunctionDeclaration', 'FunctionExpression', 'ClassDeclaration', 'ClassExpression'].includes(parent.type) && key === 'id') return true;
  if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(parent.type) && key === 'params') return true;
  if (parent.type === 'CatchClause' && key === 'param') return true;
  if (['ImportSpecifier', 'ImportDefaultSpecifier', 'ImportNamespaceSpecifier'].includes(parent.type) && key === 'local') return true;
  if (parent.type === 'LabeledStatement' && key === 'label') return true;
  if (parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') return true;
  return false;
}

function staticPropertyName(member: AstNode): string | undefined {
  if (member.type !== 'MemberExpression') return undefined;
  if (!member.computed && member.property?.type === 'Identifier') return member.property.name;
  if (member.computed && member.property?.type === 'Literal' && typeof member.property.value === 'string') return member.property.value;
  return undefined;
}

function memberRootIdentifier(node: AstNode): string | undefined {
  let current: AstNode = node;
  while (current.type === 'MemberExpression') current = current.object;
  return current.type === 'Identifier' ? current.name : undefined;
}

function isMemberPath(node: AstNode, path: string[]): boolean {
  const parts: string[] = [];
  let current: AstNode = node;
  while (current.type === 'MemberExpression') {
    const property = staticPropertyName(current);
    if (property === undefined) return false;
    parts.unshift(property);
    current = current.object;
  }
  if (current.type !== 'Identifier') return false;
  parts.unshift(current.name);
  return parts.length === path.length && parts.every((part, i) => part === path[i]);
}

function staticMemberPath(node: AstNode): string[] | undefined {
  if (node.type !== 'MemberExpression') return undefined;
  const parts: string[] = [];
  let current: AstNode = node;
  while (current.type === 'MemberExpression') {
    const property = staticPropertyName(current);
    if (property === undefined) return undefined;
    parts.unshift(property);
    current = current.object;
  }
  return current.type === 'Identifier' ? [current.name, ...parts] : undefined;
}

function isGlobalReference(record: { node: AstNode; parent?: AstNode; key?: string; scope: Scope }, name: string): boolean {
  const { node, parent, key, scope } = record;
  if (node.type !== 'Identifier' || node.name !== name) return false;
  if (isDeclarationOrNonReferenceIdentifier(node, parent, key)) return false;
  if (resolveBinding(name, scope)) return false;
  return true;
}

function getLoc(node: AstNode, source: string): { line: number; column: number } {
  if (node.loc) return { line: node.loc.start.line, column: node.loc.start.column + 1 };
  const prefix = source.slice(0, node.start);
  const line = prefix.split('\n').length;
  return { line, column: prefix.length - prefix.lastIndexOf('\n') };
}

export function analyzeAndConvertJs(
  jsContent: string,
  filename: string = 'main.js',
  options: {
    sanitizeBrowserJs?: boolean;
    generateUeBindings?: boolean;
  } = {}
): JsConversionResult {
  const diagnostics: DiagnosticIssue[] = [];
  let browserApisFlagged = 0;
  let shimsInjected = 0;
  let diagSeq = 0;
  const sanitize = options.sanitizeBrowserJs !== false;
  const generateBindings = options.generateUeBindings !== false;
  let ast: AstNode | undefined;
  let parseFailure: Error | undefined;

  try {
    ast = parse(jsContent, { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true }) as unknown as AstNode;
  } catch (moduleError) {
    try {
      ast = parse(jsContent, {
        ecmaVersion: 'latest', sourceType: 'script', locations: true,
        allowHashBang: true, allowReturnOutsideFunction: true,
      } as any) as unknown as AstNode;
    } catch (scriptError) {
      parseFailure = scriptError instanceof Error ? scriptError : moduleError as Error;
    }
  }

  const lineColFromError = (error: Error): { line: number; column: number } => {
    const candidate = error as Error & { loc?: { line: number; column: number }; pos?: number };
    if (candidate.loc) return { line: candidate.loc.line, column: candidate.loc.column + 1 };
    const position = typeof candidate.pos === 'number' ? candidate.pos : 0;
    return getLoc({ type: 'Error', start: position, end: position }, jsContent);
  };

  const addDiagnostic = (
    key: string,
    node: AstNode,
    messageOverride?: Partial<DiagnosticIssue>
  ): void => {
    const definition = API_DEFINITIONS[key];
    const { line, column } = getLoc(node, jsContent);
    diagSeq++;
    diagnostics.push({
      id: `js-${definition?.name.replace(/[^a-zA-Z0-9]/g, '-') || key}-${line}-${diagSeq}`,
      severity: definition?.severity || 'warning',
      category: 'js',
      file: filename,
      line,
      column,
      originalSnippet: jsContent.slice(node.start, Math.min(node.end, node.start + 100)),
      message: definition?.message || key,
      impact: definition?.impact || 'The behavior may differ in the VaCuus embedded runtime.',
      autoFixAvailable: false,
      fixed: false,
      recommendedAction: definition?.recommendedAction || 'Review the usage against the target VaCuus runtime.',
      docRef: 'docs/javascript-runtime.md#unsupported-browser-apis',
      ...messageOverride,
    });
  };

  let sanitizedJs = jsContent;
  let functionCount = 0;
  let textContentWriterName = '__vacuusSetTextContent';

  if (parseFailure || !ast) {
    const { line, column } = lineColFromError(parseFailure || new Error('Unable to parse JavaScript'));
    diagSeq++;
    diagnostics.push({
      id: `js-parse-failed-${line}-${diagSeq}`,
      severity: 'manual-fix',
      category: 'js',
      file: filename,
      line,
      column,
      originalSnippet: jsContent.slice(Math.max(0, (parseFailure as any)?.pos ?? 0), Math.max(0, (parseFailure as any)?.pos ?? 0) + 80),
      message: 'JavaScript could not be parsed as standard ECMAScript. AST-based diagnostics and edits were skipped to avoid modifying source incorrectly.',
      impact: 'This file may contain JSX/TypeScript syntax, unsupported parser syntax, or a JavaScript syntax error. Its browser API issues may remain undetected.',
      autoFixAvailable: false,
      fixed: false,
      recommendedAction: 'For TSX/Preact, use the official VaCuus Web workflow and build a compatible bundle; for other JSX/TypeScript, compile to a reviewed classic script before import. Check source syntax before enabling automatic edits.',
      docRef: 'docs/javascript-runtime.md#module-and-jsx-input',
    });
  } else {
    const records = collectAst(ast);
    const edits: Array<{ start: number; end: number; text: string }> = [];
    const flaggedNodeKeys = new Set<string>();
    const declaredNames = new Set(records.filter(record => record.node.type === 'Identifier').map(record => record.node.name as string));
    while (declaredNames.has(textContentWriterName)) textContentWriterName += '_';
    let needsTextContentWriter = false;
    const addApiOnce = (key: string, node: AstNode): void => {
      const dedupeKey = `${key}:${node.start}:${node.end}`;
      if (flaggedNodeKeys.has(dedupeKey)) return;
      flaggedNodeKeys.add(dedupeKey);
      browserApisFlagged++;
      addDiagnostic(key, node);
    };

    let hasAppendCall = false;
    let hasCleanup = false;
    let hasLoopTimer = false;
    let hasCreateElement = false;

    for (const record of records) {
      const { node, parent, key, scope } = record;
      if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') functionCount++;

      if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportDefaultDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type)) {
        addApiOnce('ES module syntax', node);
      }

      if (node.type === 'Identifier') {
        for (const [identifier, apiKey] of GLOBAL_API_IDENTIFIERS) {
          if (node.name !== identifier) continue;
          const isFrameworkUse = apiKey === 'React Framework Bundle' || apiKey === 'jQuery';
          const matches = isFrameworkUse
            ? !isDeclarationOrNonReferenceIdentifier(node, parent, key)
            : isGlobalReference(record, identifier);
          if (matches) addApiOnce(apiKey, node);
        }
        if (isGlobalReference(record, 'fetch') && parent?.type === 'CallExpression' && key === 'callee') {
          addApiOnce('fetch()', node);
        }
        if (isGlobalReference(record, '$') && parent?.type === 'CallExpression' && key === 'callee') {
          addApiOnce('jQuery', node);
        }
      }

      if (node.type === 'MemberExpression') {
        const isOutermostMember = !(parent?.type === 'MemberExpression' && key === 'object');
        if (isOutermostMember) {
          const path = staticMemberPath(node);
          if (path?.[0] === 'window' && !resolveBinding('window', scope)) {
            if (path[1] === 'alert') addApiOnce('window.alert', node);
            else if (path[1] === 'location') addApiOnce('location navigation', node);
            else addApiOnce('window object', node);
          } else if (path?.[0] === 'location' && path.length > 1 && !resolveBinding('location', scope)) {
            addApiOnce('location navigation', node);
          }
        }
        if (!resolveBinding('document', scope) && isMemberPath(node, ['document', 'cookie'])) addApiOnce('document.cookie', node);
        if (!resolveBinding('document', scope) && node.object?.type === 'Identifier' && node.object.name === 'document' &&
            ['querySelector', 'querySelectorAll'].includes(staticPropertyName(node) || '') &&
            parent?.type === 'CallExpression' && key === 'callee') {
          const { line, column } = getLoc(node, jsContent);
          diagSeq++;
          diagnostics.push({
            id: `js-qs-${line}-${diagSeq}`, severity: 'info', category: 'js', file: filename,
            line, column, originalSnippet: jsContent.slice(node.start, node.end),
            message: 'document.querySelector()/querySelectorAll() detected. Confirm that the selector and query method are supported by the target VaCuus build.',
            impact: 'Selector support may differ from browser DOM; complex selectors should be verified in the runtime.',
            autoFixAvailable: false, fixed: false,
            recommendedAction: 'Prefer document.getElementById() for known unique UI elements where practical.',
            docRef: 'docs/javascript-runtime.md#dom-api',
          });
        }

        if (staticPropertyName(node) === 'innerHTML') {
          const { line, column } = getLoc(node, jsContent);
          diagSeq++;
          diagnostics.push({
            id: `js-innerhtml-${line}-${diagSeq}`, severity: 'info', category: 'js', file: filename,
            line, column, originalSnippet: jsContent.slice(node.start, node.end),
            message: 'Browser innerHTML property detected. VaCuus/RmlUi exposes innerRML for parsing dynamic markup.',
            impact: 'Only the markup-injection property is renamed; strings and unrelated identifiers are intentionally untouched.',
            autoFixAvailable: true, autoFixDescription: 'Rewrite this MemberExpression property to innerRML.',
            fixed: sanitize, recommendedAction: 'Use element.innerRML when the assigned string is intended to be parsed as RML markup.',
            docRef: 'docs/javascript-runtime.md#innerrml',
          });
          if (sanitize) {
            if (!node.computed && node.property?.type === 'Identifier') {
              edits.push({ start: node.property.start, end: node.property.end, text: 'innerRML' });
            } else if (node.computed && node.property?.type === 'Literal' && node.property.value === 'innerHTML') {
              // Keep the source quote character; rewrite only the literal contents.
              edits.push({ start: node.property.start + 1, end: node.property.end - 1, text: 'innerRML' });
            }
          }
        }

        const propertyName = staticPropertyName(node);
        if (propertyName === 'textContent') {
          const assignment = parent?.type === 'AssignmentExpression' && key === 'left' && parent.operator === '='
            ? parent
            : undefined;
          const documentIsShadowed = resolveBinding('document', scope);
          if (!assignment || documentIsShadowed) {
            addApiOnce('textContent', node);
          } else {
            const dedupeKey = `textContent-write:${node.start}:${node.end}`;
            if (!flaggedNodeKeys.has(dedupeKey)) {
              flaggedNodeKeys.add(dedupeKey);
              browserApisFlagged++;
              const { line, column } = getLoc(assignment, jsContent);
              diagSeq++;
              diagnostics.push({
                id: `js-textContent-write-${line}-${diagSeq}`,
                severity: sanitize ? 'warning' : 'manual-fix',
                category: 'js', file: filename, line, column,
                originalSnippet: jsContent.slice(assignment.start, Math.min(assignment.end, assignment.start + 120)),
                message: 'Literal textContent assignment detected; VaCuus requires a text node instead of the browser textContent setter.',
                impact: 'The adapter clears element markup and appends a text node, so assigned content is not parsed as RML. Runtime targets must be an element, text node or document fragment.',
                autoFixAvailable: true,
                autoFixDescription: 'Rewrite plain = assignments through the VaCuus text-node adapter.',
                fixed: sanitize,
                recommendedAction: 'Review non-element target types and verify the update in the VaCuus runtime. Reads, compound assignments and shadowed document bindings still need manual conversion.',
                docRef: 'docs/javascript-runtime.md#dom-api',
              });
              if (sanitize) {
                const target = jsContent.slice(node.object.start, node.object.end);
                const value = jsContent.slice(assignment.right.start, assignment.right.end);
                edits.push({
                  start: assignment.start,
                  end: assignment.end,
                  text: `${textContentWriterName}(${target}, ${value})`,
                });
                needsTextContentWriter = true;
              }
            }
          }
        } else if (propertyName === 'innerText') {
          addApiOnce('innerText', node);
        }
      }

      if (node.type === 'CallExpression') {
        const callee = node.callee;
        if (callee?.type === 'Identifier' && callee.name === 'fetch' && !resolveBinding('fetch', record.scope)) {
          addApiOnce('fetch()', callee);
        }
        if (callee?.type === 'MemberExpression') {
          const method = staticPropertyName(callee);
          if (['appendChild', 'append', 'insertBefore'].includes(method || '')) hasAppendCall = true;
          if (['remove', 'removeChild', 'splice', 'shift', 'pop', 'clear'].includes(method || '')) hasCleanup = true;
          if (['requestAnimationFrame', 'setInterval'].includes(method || '')) hasLoopTimer = true;
        }
        if (callee?.type === 'Identifier' && ['requestAnimationFrame', 'setInterval'].includes(callee.name)) hasLoopTimer = true;
        if (callee?.type === 'MemberExpression' && memberRootIdentifier(callee) === 'document' && staticPropertyName(callee) === 'createElement') hasCreateElement = true;
      }

      if (node.type === 'NewExpression' && node.callee?.type === 'Identifier' && !resolveBinding(node.callee.name, record.scope)) {
        if (['MutationObserver', 'ResizeObserver', 'IntersectionObserver'].includes(node.callee.name)) addApiOnce('DOM Observers', node.callee);
      }

      if (node.type === 'BinaryExpression' && node.operator === '>' && node.left?.type === 'MemberExpression' && staticPropertyName(node.left) === 'length') {
        const lengthOwner = node.left.object;
        if (lengthOwner?.type === 'MemberExpression' && ['children', 'childNodes'].includes(staticPropertyName(lengthOwner) || '')) hasCleanup = true;
      }
    }

    // Function declarations and globals are resolved after a complete binding pass.
    // Re-evaluate potentially shadowed global API references against the final scope maps.
    // Some API matches above are call/member based and intentionally do not rely on identifier-only matches.

    if (hasAppendCall && !hasCleanup) {
      const callRecord = records.find(({ node }) => node.type === 'CallExpression' && node.callee?.type === 'MemberExpression' &&
        ['appendChild', 'append', 'insertBefore'].includes(staticPropertyName(node.callee) || ''));
      if (callRecord) {
        const { node } = callRecord;
        const { line, column } = getLoc(node, jsContent);
        diagSeq++;
        diagnostics.push({
          id: `js-unbounded-list-${line}-${diagSeq}`, severity: 'warning', category: 'js', file: filename,
          line, column, originalSnippet: jsContent.slice(node.start, node.end),
          message: 'Dynamic node insertion detected without a recognized cleanup operation. Review whether the list can grow without a bound.',
          impact: 'Long-running HUDs with unbounded nodes can increase memory use and update costs.',
          autoFixAvailable: false, fixed: false,
          recommendedAction: 'Use a maximum history count or a fixed reusable pool for high-frequency UI elements.',
          docRef: 'docs/knowledge-base.md#bounded-killfeed',
        });
      }
    }

    if (hasLoopTimer && hasCreateElement) {
      const marker = records.find(({ node }) => node.type === 'CallExpression' && node.callee?.type === 'MemberExpression' &&
        memberRootIdentifier(node.callee) === 'document' && staticPropertyName(node.callee) === 'createElement')?.node;
      const target = marker || ast;
      const { line, column } = getLoc(target, jsContent);
      diagSeq++;
      diagnostics.push({
        id: `js-fixed-pool-recommendation-${diagSeq}`, severity: 'info', category: 'js', file: filename,
        line, column, originalSnippet: marker ? jsContent.slice(marker.start, marker.end) : 'document.createElement(...) with animation timers',
        message: 'Element creation and continuous update timers coexist. Review whether a fixed node pool would reduce churn.',
        impact: 'Creating and removing elements during frequent updates may increase garbage collection and tree-update costs.',
        autoFixAvailable: false, fixed: false,
        recommendedAction: 'For high-frequency surfaces such as damage numbers, allocate nodes once and recycle them.',
        docRef: 'docs/knowledge-base.md#fixed-damage-pool',
      });
    }

    if (sanitize && edits.length) {
      // Apply edits from right to left so earlier source offsets remain valid.
      edits.sort((a, b) => b.start - a.start);
      for (const edit of edits) sanitizedJs = sanitizedJs.slice(0, edit.start) + edit.text + sanitizedJs.slice(edit.end);
    }

    if (sanitize && needsTextContentWriter) shimsInjected++;
  }

  // The plugin installs `document`, `console`, timers and `vacuus` itself.
  // Never synthesize browser-shaped globals here: doing so can hide missing host
  // bindings or turn persistent/browser behavior into a silent no-op.
  const headerParts: string[] = [
    '/**',
    ' * VaCuus Compatible UI Script for Unreal Engine 5 (RmlUi Runtime)',
    ' * Generated by Kormatal RML UI Editor',
    ' * ',
    ' * IMPORTANT RUNTIME RULES:',
    ' * 1. UI runs on a dedicated VaCuus UI thread.',
    ' * 2. Interfacing with Unreal Engine is handled via registered game thread events',
    ' *    or UVaCuusView data model bindings (bound prior to LoadDocument).',
    ' * 3. VaCuus provides its own DOM facade and the native `vacuus` host object.',
    ' *    Browser globals such as window, localStorage and fetch are not provided.',
    ' */',
  ];

  if (generateBindings) {
    headerParts.push(
      '// Adapter over VaCuus 1.1.0 native globals; UE must bind UVaCuusView::OnJsEvent to receive emitted events.',
      'const VaCuusBridge = {',
      '  sendToUE: function(eventName, payload) {',
      '    if (typeof vacuus === "undefined" || typeof vacuus.emit !== "function") {',
      '      console.error("VaCuus runtime API is unavailable; enable the VaCuus plugin.");',
      '      return false;',
      '    }',
      '    return vacuus.emit(eventName, payload);',
      '  },',
      '  get: function(id) {',
      '    return typeof document === "undefined" || document === null ? null : document.getElementById(id);',
      '  },',
      '  getModel: function(name, path) {',
      '    return typeof vacuus === "undefined" || typeof vacuus.model !== "function" ? null : vacuus.model(name).get(path);',
      '  }',
      '};',
      '',
    );
  }

  if (sanitize && ast && !parseFailure && diagnostics.some(issue => issue.id.startsWith('js-textContent-write-') && issue.fixed)) {
    headerParts.push(
      '// Preserve literal text: never feed textContent values to the RML markup parser.',
      `function ${textContentWriterName}(element, value) {`,
      '  if (element == null) throw new TypeError("Cannot set textContent on null or undefined");',
      '  var text = value == null ? "" : "" + value;',
      '  var nodeType = element.nodeType;',
      '  if (nodeType === 3) {',
      '    element.nodeValue = text;',
      '    return value;',
      '  }',
      '  if (nodeType === 9) return value;',
      '  if (nodeType !== 1) throw new TypeError("Unsupported VaCuus textContent target node type: " + nodeType);',
      '  var textNode = null;',
      '  if (text) {',
      '    if (typeof document === "undefined" || document === null || typeof document.createTextNode !== "function") {',
      '      throw new Error("VaCuus document is not ready to create a text node");',
      '    }',
      '    textNode = document.createTextNode(text);',
      '    if (!textNode) throw new Error("VaCuus could not create a text node");',
      '  }',
      '  element.innerRML = "";',
      '  if (textNode && !element.appendChild(textNode)) throw new Error("VaCuus could not append the text node");',
      '  return value;',
      '}',
      '',
    );
  }

  const convertedJs = headerParts.join('\n') + sanitizedJs;
  return {
    convertedJs,
    diagnostics,
    metrics: {
      functionsProcessed: Math.max(functionCount, 1),
      browserApisFlagged,
      shimsInjected,
    },
  };
}
