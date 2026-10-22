export const IMPORT_LIMITS = {
  maxFiles: 500,
  maxTotalBytes: 60 * 1024 * 1024,
  maxArchiveBytes: 60 * 1024 * 1024,
  maxArchiveExpandedBytes: 80 * 1024 * 1024,
  maxHtmlBytes: 10 * 1024 * 1024,
  maxCssBytes: 8 * 1024 * 1024,
  maxJsBytes: 5 * 1024 * 1024,
  maxTextAssetBytes: 4 * 1024 * 1024,
  maxBinaryAssetBytes: 20 * 1024 * 1024,
} as const;

export interface ImportFileInfo { name: string; size: number; }
export interface ImportValidation {
  accepted: ImportFileInfo[];
  rejected: Array<{ name: string; reason: string }>;
  acceptedBytes: number;
}

const archiveIgnoredSegments = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.cache', 'coverage', '.turbo', '.vite', '__macosx',
]);
const supportedProjectPath = /\.(?:html?|rml|css|rcss|m?js|cjs|json|txt|md|xml|ya?ml|toml|ini|svg|csv|log|h|hpp|cpp|c|uproject|uplugin|png|jpe?g|webp|tga|bmp|gif|ttf|otf|woff2?)$/i;

export function isIgnoredArchivePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) return true;
  const segments = normalized.split('/').filter(Boolean);
  if (segments.some(segment => segment === '..' || archiveIgnoredSegments.has(segment.toLowerCase()))) return true;
  return segments.some(segment => segment === '.DS_Store' || segment.startsWith('._'));
}

export function isSupportedProjectPath(path: string): boolean {
  return supportedProjectPath.test(path) && !isIgnoredArchivePath(path);
}

export function maximumBytesForPath(path: string): number {
  if (/\.html?$/i.test(path)) return IMPORT_LIMITS.maxHtmlBytes;
  if (/\.(?:css|rcss)$/i.test(path)) return IMPORT_LIMITS.maxCssBytes;
  if (/\.(?:m?js|cjs)$/i.test(path)) return IMPORT_LIMITS.maxJsBytes;
  if (/\.(?:png|jpe?g|webp|tga|bmp|gif|ttf|otf|woff2?)$/i.test(path)) return IMPORT_LIMITS.maxBinaryAssetBytes;
  return IMPORT_LIMITS.maxTextAssetBytes;
}

export function validateImportSelection(files: readonly ImportFileInfo[]): ImportValidation {
  const accepted: ImportFileInfo[] = [];
  const rejected: Array<{ name: string; reason: string }> = [];
  if (files.length > IMPORT_LIMITS.maxFiles) {
    return {
      accepted: [],
      rejected: files.map((file, index) => ({
        name: file.name,
        reason: index >= IMPORT_LIMITS.maxFiles
          ? `Превышен лимит ${IMPORT_LIMITS.maxFiles} файлов за один импорт.`
          : 'Импорт отменён: выбрано слишком много файлов.',
      })),
      acceptedBytes: 0,
    };
  }

  let acceptedBytes = 0;
  for (const file of files) {
    const size = Math.max(0, Number.isFinite(file.size) ? file.size : 0);
    const limit = /\.zip$/i.test(file.name) ? IMPORT_LIMITS.maxArchiveBytes : maximumBytesForPath(file.name);
    if (size > limit) {
      rejected.push({ name: file.name, reason: `Файл ${formatBytes(size)} превышает лимит ${formatBytes(limit)} для этого типа.` });
      continue;
    }
    if (acceptedBytes + size > IMPORT_LIMITS.maxTotalBytes) {
      rejected.push({ name: file.name, reason: `Превышен общий лимит импорта ${formatBytes(IMPORT_LIMITS.maxTotalBytes)}.` });
      continue;
    }
    accepted.push(file);
    acceptedBytes += size;
  }
  return { accepted, rejected, acceptedBytes };
}

export function validateArchiveManifest(entries: readonly { path: string; size: number; isDirectory?: boolean }[]): {
  accepted: Array<{ path: string; size: number; isDirectory?: boolean }>;
  rejected: Array<{ path: string; reason: string }>;
  expandedBytes: number;
} {
  const accepted: Array<{ path: string; size: number; isDirectory?: boolean }> = [];
  const rejected: Array<{ path: string; reason: string }> = [];
  let expandedBytes = 0;
  let considered = 0;
  for (const entry of entries) {
    if (entry.isDirectory || isIgnoredArchivePath(entry.path) || !isSupportedProjectPath(entry.path)) continue;
    considered++;
    const size = Math.max(0, Number.isFinite(entry.size) ? entry.size : 0);
    if (considered > IMPORT_LIMITS.maxFiles) {
      rejected.push({ path: entry.path, reason: `Пропущено: превышен лимит ${IMPORT_LIMITS.maxFiles} файлов из ZIP.` });
      continue;
    }
    const limit = maximumBytesForPath(entry.path);
    if (size > limit) {
      rejected.push({ path: entry.path, reason: `Пропущено: ${formatBytes(size)} превышает лимит ${formatBytes(limit)}.` });
      continue;
    }
    if (expandedBytes + size > IMPORT_LIMITS.maxArchiveExpandedBytes) {
      rejected.push({ path: entry.path, reason: `Пропущено: превышен лимит распакованного ZIP ${formatBytes(IMPORT_LIMITS.maxArchiveExpandedBytes)}.` });
      continue;
    }
    accepted.push(entry);
    expandedBytes += size;
  }
  return { accepted, rejected, expandedBytes };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
