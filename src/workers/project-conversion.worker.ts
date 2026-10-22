import { convertProject } from '../core/project-converter.ts';
import { analyzeAndConvertJs } from '../core/js-analyzer.ts';
import { extractEmbeddedAssetsFromHtml } from '../core/html-embedded-extractor.ts';
import { generateCompatibilityJson, generateConversionReportMd, getConversionReadiness } from '../core/ue-integration-generator.ts';
import type { ConversionOptions, ConvertedProjectResult, ProjectFile } from '../core/types.ts';

type ConversionRequest = {
  requestId: number;
  files: ProjectFile[];
  screenName: string;
  options: ConversionOptions;
};
type ConversionResponse =
  | { requestId: number; ok: true; result: ConvertedProjectResult }
  | { requestId: number; ok: false; error: string };

type WorkerScope = {
  onmessage: ((event: MessageEvent<ConversionRequest>) => void) | null;
  postMessage: (message: ConversionResponse) => void;
};

const scope = self as unknown as WorkerScope;

interface ModuleEntryPlan {
  entryPath: string;
  syntheticEntry?: { path: string; content: string };
  sourceFiles: Array<{ path: string; content: string }>;
  jsSourcePaths: string[];
}

function normalizeProjectReference(htmlPath: string, reference: string): string | undefined {
  const clean = reference.trim().split(/[?#]/, 1)[0].replace(/\\/g, '/');
  if (!clean || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(clean)) return undefined;
  const htmlDirectory = htmlPath.replace(/\\/g, '/').split('/').slice(0, -1);
  const segments = clean.startsWith('/') ? [] : [...htmlDirectory];
  for (const part of clean.replace(/^\/+/, '').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!segments.length) return undefined;
      segments.pop();
    } else segments.push(part);
  }
  return segments.join('/');
}

function findLinkedScript(reference: string, htmlPath: string, files: ProjectFile[]): ProjectFile | undefined {
  const resolved = normalizeProjectReference(htmlPath, reference);
  const byPath = resolved ? files.filter(file => file.path.replace(/\\/g, '/').toLowerCase() === resolved.toLowerCase()) : [];
  if (byPath.length === 1) return byPath[0];
  const basename = reference.trim().split(/[?#]/, 1)[0].split(/[\\/]/).pop()?.toLowerCase();
  const byName = files.filter(file => file.path.split(/[\\/]/).pop()?.toLowerCase() === basename);
  return byName.length === 1 ? byName[0] : undefined;
}

function sourceHasModuleSyntax(source: string, filename: string): boolean {
  return analyzeAndConvertJs(source, filename).diagnostics.some(issue => issue.id.includes('ES-module-syntax'));
}

function planModuleBundle(files: ProjectFile[], converted: ConvertedProjectResult): ModuleEntryPlan | undefined {
  const htmlFile = files.find(file => file.type === 'html' || /\.html?$/i.test(file.path));
  const jsFiles = files.filter(file => (file.type === 'js' || /\.(?:m?js|cjs)$/i.test(file.path)) && file.contentEncoding !== 'base64');
  const moduleDiagnostic = converted.diagnostics.some(issue => issue.id.includes('ES-module-syntax'));
  let htmlPath = htmlFile?.path || 'index.html';
  const resources = htmlFile ? extractEmbeddedAssetsFromHtml(htmlFile.content, htmlPath).jsResources : [];
  const explicitModuleResource = resources.some(resource => resource.scriptType === 'module' ||
    (resource.kind === 'link' && /\.mjs(?:[?#]|$)/i.test(resource.src.trim())));
  if (!jsFiles.length && !resources.some(resource => resource.kind === 'inline')) return undefined;
  if (!moduleDiagnostic && !explicitModuleResource && !jsFiles.some(file => /\.mjs$/i.test(file.path))) return undefined;
  const moduleResources = resources.map(resource => {
    if (resource.kind === 'inline') {
      const isModule = resource.scriptType === 'module' || sourceHasModuleSyntax(resource.content, htmlPath);
      if (!isModule) return undefined;
      const directory = htmlPath.replace(/\\/g, '/').split('/').slice(0, -1).filter(Boolean).join('/');
      const base = directory ? `${directory}/` : '';
      const syntheticEntry = { path: `${base}__vacuus_inline_module__.mjs`, content: resource.content };
      return { entryPath: syntheticEntry.path, syntheticEntry };
    }
    const linkedFile = findLinkedScript(resource.src, htmlPath, jsFiles);
    if (!linkedFile) return undefined;
    const isModule = resource.scriptType === 'module' || /\.mjs$/i.test(linkedFile.path) || sourceHasModuleSyntax(linkedFile.content, linkedFile.path);
    return isModule ? { entryPath: linkedFile.path } : undefined;
  }).filter((item): item is NonNullable<typeof item> => !!item);

  if (moduleResources.length > 1 || resources.length > 1) return {
    entryPath: moduleResources[0]?.entryPath || jsFiles[0].path,
    sourceFiles: [],
    jsSourcePaths: jsFiles.map(file => file.path),
  };

  let entryPath = moduleResources[0]?.entryPath;
  let syntheticEntry = moduleResources[0]?.syntheticEntry;
  if (!entryPath && resources.length === 0 && jsFiles.length === 1) {
    const file = jsFiles[0];
    if (/\.mjs$/i.test(file.path) || sourceHasModuleSyntax(file.content, file.path)) entryPath = file.path;
  }
  if (!entryPath) return undefined;

  const dependencyFiles = files.filter(file => {
    if (file.contentEncoding === 'base64') return false;
    return /\.(?:m?js|cjs|jsx|css|json)$/i.test(file.path);
  }).map(file => ({ path: file.path, content: file.content }));
  if (syntheticEntry) dependencyFiles.push(syntheticEntry);
  return {
    entryPath,
    syntheticEntry,
    sourceFiles: dependencyFiles,
    jsSourcePaths: jsFiles.map(file => file.path),
  };
}

function appendBundleFailure(result: ConvertedProjectResult, entryPath: string, message: string): void {
  result.diagnostics.push({
    id: 'js-module-bundle-failed', severity: 'manual-fix', category: 'js', file: entryPath,
    line: 1, column: 1, originalSnippet: entryPath,
    message: `Локальный граф ES-модулей не собран: ${message}`,
    impact: 'Встроенный RML runtime загружает classic script; исходные import/export могут не выполниться.',
    autoFixAvailable: false, fixed: false,
    recommendedAction: 'Исправьте локальные импорты и повторите сборку. Для пакетов npm, TSX/Preact и сложных entrypoint используйте официальный VaCuus Web CLI.',
    docRef: 'docs/javascript-runtime.md#module-and-jsx-input',
  });
}

async function bundleModuleIfNeeded(
  files: ProjectFile[],
  screenName: string,
  options: ConversionOptions,
  result: ConvertedProjectResult,
): Promise<ConvertedProjectResult> {
  const plan = planModuleBundle(files, result);
  if (!plan) return result;
  if (!plan.sourceFiles.length) {
    appendBundleFailure(result, plan.entryPath, 'в HTML найдено несколько активных script entrypoint, их порядок и область видимости нельзя безопасно свести к одному bundle.');
    return result;
  }

  try {
    const response = await fetch('/local-ai/bundle-js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryPath: plan.entryPath, files: plan.sourceFiles }),
    });
    const payload = await response.json() as { js?: string; entryPath?: string; includedFiles?: string[]; error?: string };
    if (!response.ok || !payload.js || !Array.isArray(payload.includedFiles)) {
      appendBundleFailure(result, plan.entryPath, payload.error || `локальный сборщик вернул HTTP ${response.status}.`);
      return result;
    }

    const included = new Set(payload.includedFiles.map(value => value.toLowerCase()));
    const omitted = plan.jsSourcePaths.filter(path => !included.has(path.toLowerCase()));
    if (omitted.length) {
      appendBundleFailure(result, plan.entryPath, `в граф не вошли дополнительные JS-файлы: ${omitted.slice(0, 8).join(', ')}${omitted.length > 8 ? '…' : ''}.`);
      return result;
    }

    const analysis = analyzeAndConvertJs(payload.js, payload.entryPath || plan.entryPath, {
      sanitizeBrowserJs: options.sanitizeBrowserJs,
      generateUeBindings: options.generateUeBindings,
    });
    result.js = analysis.convertedJs;
    result.diagnostics = result.diagnostics.filter(issue => {
      if (issue.id.includes('ES-module-syntax') || issue.id.startsWith('js-module-script-')) return false;
      if (issue.id.startsWith('js-unlinked-')) {
        const source = files.find(file => `js-unlinked-${file.id.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80) || 'resource'}` === issue.id);
        if (source && included.has(source.path.toLowerCase())) return false;
      }
      return true;
    });
    const seen = new Set(result.diagnostics.map(issue => `${issue.message}\0${issue.originalSnippet}`));
    for (const issue of analysis.diagnostics) {
      const key = `${issue.message}\0${issue.originalSnippet}`;
      if (!seen.has(key)) { result.diagnostics.push(issue); seen.add(key); }
    }
    result.diagnostics.push({
      id: 'js-module-bundled', severity: 'info', category: 'js', file: plan.entryPath,
      line: 1, column: 1, originalSnippet: plan.entryPath,
      message: `Локальный ES-модульный граф собран в один classic IIFE для VaCuus (${payload.includedFiles.length} JS-файлов).`,
      impact: 'Локальные импорты объединены; внешние package/network imports не разрешаются. Проверка API VaCuus остаётся отдельной.',
      autoFixAvailable: true, autoFixDescription: 'Создан classic IIFE-бандл.', fixed: true,
      recommendedAction: 'Проверьте оставшиеся browser API диагностики и подтвердите визуальное поведение в UE5/VaCuus.',
      docRef: 'docs/javascript-runtime.md#module-and-jsx-input',
    });
    result.metrics.jsFunctionsProcessed = Math.max(result.metrics.jsFunctionsProcessed, analysis.metrics.functionsProcessed);
  } catch (error) {
    appendBundleFailure(result, plan.entryPath, error instanceof Error ? error.message : 'локальный сервис сборки недоступен.');
  }

  result.metrics.warningsCount = result.diagnostics.filter(issue => issue.severity === 'warning').length;
  result.metrics.errorsCount = result.diagnostics.filter(issue => issue.severity === 'error').length;
  result.metrics.manualFixesCount = result.diagnostics.filter(issue => issue.severity === 'manual-fix').length;
  result.readiness = getConversionReadiness(result.diagnostics);
  result.conversionReportMd = generateConversionReportMd(result.diagnostics, result.metrics, screenName);
  result.compatibilityJson = generateCompatibilityJson(result.diagnostics, result.metrics);
  return result;
}

scope.onmessage = async (event) => {
  const request = event.data;
  if (!request || !Number.isFinite(request.requestId) || !Array.isArray(request.files)) return;
  try {
    const result = convertProject(request.files, request.screenName, request.options);
    await bundleModuleIfNeeded(request.files, request.screenName, request.options, result);
    scope.postMessage({ requestId: request.requestId, ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : 'Неизвестная ошибка конвертации.';
    scope.postMessage({ requestId: request.requestId, ok: false, error: message.slice(0, 2000) });
  }
};
