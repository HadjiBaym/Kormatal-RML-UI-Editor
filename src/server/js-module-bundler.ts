import { build, type PluginBuild } from 'esbuild';
import path from 'node:path';

export interface JsModuleBundleFile {
  path: string;
  content: string;
}

export interface JsModuleBundleRequest {
  entryPath: string;
  files: JsModuleBundleFile[];
}

export interface JsModuleBundleResult {
  js: string;
  entryPath: string;
  includedFiles: string[];
}

export class JsModuleBundleError extends Error {
  constructor(message: string, readonly statusCode = 422) {
    super(message);
    this.name = 'JsModuleBundleError';
  }
}

const MAX_FILES = 500;
const MAX_TOTAL_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 12 * 1024 * 1024;
const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx']);

function canonicalProjectPath(value: string): string {
  const candidate = value.replace(/\\/g, '/').trim();
  if (!candidate || candidate.startsWith('/') || /^[a-z]:/i.test(candidate) || candidate.includes('\0')) {
    throw new JsModuleBundleError(`Недопустимый путь в графе модулей: «${value.slice(0, 120)}».`);
  }

  const segments: string[] = [];
  for (const segment of candidate.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (!segments.length) throw new JsModuleBundleError('Импорт выходит за пределы корня проекта.');
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  if (!segments.length) throw new JsModuleBundleError(`Путь «${value.slice(0, 120)}» не указывает на файл.`);
  return segments.join('/');
}

function sourceCandidates(candidate: string): string[] {
  const ext = path.posix.extname(candidate).toLowerCase();
  if (ext) return [candidate];
  return [
    candidate,
    `${candidate}.js`, `${candidate}.mjs`, `${candidate}.cjs`, `${candidate}.jsx`,
    `${candidate}.json`, `${candidate}.css`,
    `${candidate}/index.js`, `${candidate}/index.mjs`, `${candidate}/index.cjs`, `${candidate}/index.jsx`,
  ];
}

/**
 * Bundle only the explicitly imported, in-memory project graph. No package lookup,
 * filesystem access, network resolution, or output files are permitted here.
 */
export async function bundleVaCuusModuleGraph(input: JsModuleBundleRequest): Promise<JsModuleBundleResult> {
  if (!input || typeof input.entryPath !== 'string' || !Array.isArray(input.files)) {
    throw new JsModuleBundleError('Ожидаются entryPath и список исходных файлов.');
  }
  if (input.files.length === 0 || input.files.length > MAX_FILES) {
    throw new JsModuleBundleError(`Граф должен содержать от 1 до ${MAX_FILES} файлов.`);
  }

  const byKey = new Map<string, JsModuleBundleFile>();
  let totalBytes = 0;
  for (const file of input.files) {
    if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') {
      throw new JsModuleBundleError('Каждый файл графа должен содержать текстовые поля path и content.');
    }
    const projectPath = canonicalProjectPath(file.path);
    const bytes = Buffer.byteLength(file.content, 'utf8');
    if (bytes > MAX_FILE_SOURCE_BYTES) {
      throw new JsModuleBundleError(`Файл «${projectPath}» превышает лимит ${MAX_FILE_SOURCE_BYTES / 1024 / 1024} МиБ.`);
    }
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_SOURCE_BYTES) {
      throw new JsModuleBundleError(`Исходники графа превышают лимит ${MAX_TOTAL_SOURCE_BYTES / 1024 / 1024} МиБ.`);
    }
    const key = projectPath.toLowerCase();
    if (byKey.has(key)) throw new JsModuleBundleError(`Путь «${projectPath}» передан больше одного раза.`);
    byKey.set(key, { path: projectPath, content: file.content });
  }

  const entryPath = canonicalProjectPath(input.entryPath);
  const entry = byKey.get(entryPath.toLowerCase());
  if (!entry) throw new JsModuleBundleError(`Точка входа «${entryPath}» отсутствует в импортированном проекте.`);
  if (!JS_EXTENSIONS.has(path.posix.extname(entry.path).toLowerCase())) {
    throw new JsModuleBundleError('Точкой входа должен быть локальный JavaScript-файл (.js, .mjs, .cjs или .jsx).');
  }

  const included = new Set<string>();
  const plugin = {
    name: 'vacuus-in-memory-project',
    setup(buildApi: PluginBuild) {
      buildApi.onResolve({ filter: /.*/ }, args => {
        if (args.kind === 'entry-point') {
          try { return { path: canonicalProjectPath(args.path), namespace: 'vacuus-project' }; }
          catch (error) { return { errors: [{ text: error instanceof Error ? error.message : 'Недопустимая точка входа.' }] }; }
        }

        const specifier = args.path;
        if (specifier.includes('?') || specifier.includes('#')) {
          return { errors: [{ text: `Импорты с query/hash не поддерживаются: ${specifier}` }] };
        }
        if (/^(?:[a-z][a-z0-9+.-]*:|\\\\|\/\/)/i.test(specifier)) {
          return { errors: [{ text: `Внешний модуль не включён в локальный пакет: ${specifier}` }] };
        }
        if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
          return { errors: [{ text: `Пакетный импорт «${specifier}» не найден в проекте. Для Preact/TSX используйте официальный VaCuus Web CLI.` }] };
        }

        let requestedPath: string;
        try {
          const base = specifier.startsWith('/') ? '' : path.posix.dirname(args.importer);
          requestedPath = canonicalProjectPath(path.posix.join(base, specifier.replace(/^\/+/, '')));
        } catch (error) {
          return { errors: [{ text: error instanceof Error ? error.message : `Недопустимый импорт: ${specifier}` }] };
        }

        for (const candidate of sourceCandidates(requestedPath)) {
          const resolved = byKey.get(candidate.toLowerCase());
          if (resolved) return { path: resolved.path, namespace: 'vacuus-project' };
        }
        return { errors: [{ text: `Локальный импорт «${specifier}» из «${args.importer}» не найден среди загруженных файлов.` }] };
      });

      buildApi.onLoad({ filter: /.*/, namespace: 'vacuus-project' }, args => {
        const file = byKey.get(args.path.toLowerCase());
        if (!file) return { errors: [{ text: `Файл «${args.path}» отсутствует в памяти.` }] };
        const ext = path.posix.extname(file.path).toLowerCase();
        if (JS_EXTENSIONS.has(ext)) included.add(file.path);
        if (ext === '.css') return { contents: 'export {};', loader: 'js', resolveDir: '/' };
        if (ext === '.json') return { contents: file.content, loader: 'json', resolveDir: '/' };
        if (!JS_EXTENSIONS.has(ext)) return { errors: [{ text: `Тип локального импорта «${ext || '(без расширения)'}» не поддерживается: ${file.path}` }] };
        return {
          contents: file.content,
          loader: ext === '.jsx' ? 'jsx' : 'js',
          resolveDir: '/',
        };
      });
    },
  };

  let output: string;
  try {
    const result = await build({
      entryPoints: [entry.path],
      outfile: 'vacuus-bundle.js',
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'neutral',
      target: 'es2020',
      sourcemap: 'inline',
      charset: 'utf8',
      legalComments: 'none',
      logLevel: 'silent',
      plugins: [plugin],
    });
    output = result.outputFiles.find(file => file.path.endsWith('.js'))?.text || '';
  } catch (error) {
    const details = (error as { errors?: Array<{ text?: string; location?: { file?: string; line?: number; column?: number } }> }).errors;
    const message = details?.map(item => {
      const where = item.location ? `${item.location.file || entry.path}:${item.location.line || 1}:${(item.location.column || 0) + 1}: ` : '';
      return `${where}${item.text || 'Ошибка сборки JavaScript.'}`;
    }).join('\n') || (error instanceof Error ? error.message : 'Не удалось собрать граф модулей.');
    throw new JsModuleBundleError(message.slice(0, 2400));
  }

  if (!output) throw new JsModuleBundleError('Сборщик не вернул JavaScript-файл.');
  if (Buffer.byteLength(output, 'utf8') > MAX_OUTPUT_BYTES) {
    throw new JsModuleBundleError(`Размер готового JS-бандла превышает ${MAX_OUTPUT_BYTES / 1024 / 1024} МиБ.`);
  }
  return { js: output, entryPath: entry.path, includedFiles: [...included].sort() };
}
