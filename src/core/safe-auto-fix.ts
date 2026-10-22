import type { DiagnosticIssue, ProjectFile } from './types.ts';
import { getAttribute, locationAt, parseHtmlTree, descendants } from './html-parser.ts';

export interface SafeAutoFixResult {
  files: ProjectFile[];
  appliedIssueIds: string[];
  skippedIssueIds: string[];
}

/**
 * Only advertise an editor-side fix when we can safely update the source without
 * approximating CSS layout or changing application behavior. Most CSS/JS
 * compatibility repairs belong to the generated RML/RCSS/JS pipeline; rewriting
 * source HTML/CSS/JS for those repairs breaks browser preview and original intent.
 */
export function isSafeSourceAutoFix(issue: DiagnosticIssue): boolean {
  return issue.autoFixAvailable && !issue.fixed && /^html-data-for-alias-/.test(issue.id);
}

export function getSafeSourceAutoFixes(diagnostics: DiagnosticIssue[]): DiagnosticIssue[] {
  return diagnostics.filter(isSafeSourceAutoFix);
}

/** Applies only scoped, syntax-aware source fixes. It never mass-rewrites CSS or JS. */
export function applySafeSourceAutoFixes(
  inputFiles: ProjectFile[],
  diagnostics: DiagnosticIssue[],
): SafeAutoFixResult {
  const files = inputFiles.map(file => ({ ...file }));
  const appliedIssueIds: string[] = [];
  const skippedIssueIds: string[] = [];
  const issues = getSafeSourceAutoFixes(diagnostics).slice().sort((a, b) => b.line - a.line || b.column - a.column);

  for (const issue of issues) {
    const fileIndex = files.findIndex(file => normalizePath(file.path) === normalizePath(issue.file));
    if (fileIndex < 0) {
      skippedIssueIds.push(issue.id);
      continue;
    }

    const file = files[fileIndex];
    if (!(file.type === 'html' || /\.html?$/i.test(file.path))) {
      skippedIssueIds.push(issue.id);
      continue;
    }

    const result = renameReservedLoopAlias(file.content, issue.line, issue.column);
    if (!result) {
      skippedIssueIds.push(issue.id);
      continue;
    }

    files[fileIndex] = { ...file, content: result };
    appliedIssueIds.push(issue.id);
  }

  return { files, appliedIssueIds, skippedIssueIds };
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function renameReservedLoopAlias(source: string, targetLine: number, targetColumn: number): string | undefined {
  const tree = parseHtmlTree(source);
  const node = descendants(tree.children).find(candidate => {
    if (candidate.type !== 'element' || !candidate.attrs) return false;
    const location = locationAt(source, candidate.start);
    if (location.line !== targetLine || location.column !== targetColumn) return false;
    const value = getAttribute(candidate, 'data-for');
    return /^\s*t\s*:/i.test(value) && value.trim().split(':').length === 2;
  });
  if (!node || !node.name) return undefined;

  const openingEnd = findTagEnd(source, node.start);
  if (openingEnd === undefined) return undefined;
  const openingTag = source.slice(node.start, openingEnd);
  if (/\/\s*>$/.test(openingTag)) return undefined;

  const rangeEnd = findMatchingElementEnd(source, openingEnd, node.name);
  if (rangeEnd === undefined) return undefined;
  const block = source.slice(node.start, rangeEnd);

  // We only rename references whose meaning can be established: template bindings
  // like {{t.Name}} within this loop. If `t.` is used in arbitrary JS or elsewhere,
  // leave the issue for a human instead of risking a behavior change.
  const referenceRegex = /\bt\s*\./g;
  let reference: RegExpExecArray | null;
  while ((reference = referenceRegex.exec(block)) !== null) {
    if (!isInsideTemplateBinding(block, reference.index)) return undefined;
  }

  const alias = chooseNonConflictingAlias(block);
  if (!alias) return undefined;

  const updatedOpening = openingTag.replace(
    /(\bdata-for\s*=\s*)(["'])\s*t(\s*:)/i,
    (_match, prefix: string, quote: string, rest: string) => `${prefix}${quote}${alias}${rest}`,
  );
  if (updatedOpening === openingTag) return undefined;

  let updatedBlock = updatedOpening + block.slice(openingTag.length);
  updatedBlock = updatedBlock.replace(/\{\{[\s\S]*?\}\}/g, binding =>
    binding.replace(/\bt\s*\./g, `${alias}.`)
  );
  return source.slice(0, node.start) + updatedBlock + source.slice(rangeEnd);
}

function isInsideTemplateBinding(source: string, index: number): boolean {
  const opening = source.lastIndexOf('{{', index);
  const closingBefore = source.lastIndexOf('}}', index);
  if (opening < 0 || opening < closingBefore) return false;
  const closing = source.indexOf('}}', index);
  return closing >= index;
}

function chooseNonConflictingAlias(block: string): string | undefined {
  const candidates = ['item', 'entry', 'row', 'record', 'element'];
  for (const candidate of candidates) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\bdata-for\\s*=\\s*(["'])\\s*${escaped}\\s*:`, 'i').test(block)) continue;
    if (new RegExp(`\\b${escaped}\\s*\\.`, 'i').test(block)) continue;
    return candidate;
  }
  return undefined;
}

function findTagEnd(source: string, start: number): number | undefined {
  let quote = '';
  for (let index = source.indexOf('<', start); index >= 0 && index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '>') return index + 1;
  }
  return undefined;
}

/** Find the matching close tag while ignoring comments and raw script/style text. */
function findMatchingElementEnd(
  source: string,
  openingEnd: number,
  tagName: string,
): number | undefined {
  const wanted = tagName.toLowerCase();
  let depth = 1;
  let cursor = openingEnd;
  while (cursor < source.length) {
    const open = source.indexOf('<', cursor);
    if (open < 0) return undefined;
    if (source.startsWith('<!--', open)) {
      const commentEnd = source.indexOf('-->', open + 4);
      if (commentEnd < 0) return undefined;
      cursor = commentEnd + 3;
      continue;
    }

    const match = /^<\s*(\/?)\s*([a-zA-Z][\w:-]*)\b/.exec(source.slice(open));
    if (!match) {
      cursor = open + 1;
      continue;
    }

    const closing = match[1] === '/';
    const name = match[2].toLowerCase();
    const tagEnd = findTagEnd(source, open);
    if (tagEnd === undefined) return undefined;
    const token = source.slice(open, tagEnd);
    const selfClosing = /\/\s*>$/.test(token);

    if (!closing && !selfClosing && (name === 'script' || name === 'style')) {
      const closePattern = new RegExp(`<\\/\\s*${name}\\s*>`, 'ig');
      closePattern.lastIndex = tagEnd;
      const rawClose = closePattern.exec(source);
      if (!rawClose) return undefined;
      cursor = rawClose.index + rawClose[0].length;
      continue;
    }

    if (name === wanted) {
      if (closing) {
        depth--;
        if (depth === 0) return tagEnd;
      } else if (!selfClosing) {
        depth++;
      }
    }

    cursor = tagEnd;
  }
  return undefined;
}
