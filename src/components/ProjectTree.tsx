import React, { useEffect, useRef, useState } from 'react';
import {
  FileCode,
  FileText,
  FilePlus,
  Trash2,
  Upload,
  FolderTree,
  FolderOpen,
  Check,
  Code,
  FileType,
  Sparkles,
} from 'lucide-react';
import JSZip from 'jszip';
import { ProjectFile } from '../core/types.ts';
import { splitMonolithicHtmlProject } from '../core/html-project-splitter.ts';
import { formatBytes, IMPORT_LIMITS, isIgnoredArchivePath, isSupportedProjectPath, maximumBytesForPath, validateArchiveManifest, validateImportSelection } from '../core/import-safety.ts';

interface ProjectTreeProps {
  files: ProjectFile[];
  activeFileId: string;
  onSelectFile: (fileId: string) => void;
  onAddFile: (type: 'html' | 'css' | 'js') => void;
  onDeleteFile: (fileId: string) => void;
  onImportFiles: (newFiles: ProjectFile[]) => void;
  onSyncFolderFiles?: (newFiles: ProjectFile[]) => void;
  onSplitHtmlFile?: (fileId: string) => void;
}

type WritableFileLike = {
  write: (data: string | BufferSource) => Promise<void>;
  close: () => Promise<void>;
};
type FileHandleLike = {
  kind: 'file';
  name: string;
  getFile: () => Promise<File>;
  createWritable?: () => Promise<WritableFileLike>;
};
type DirectoryHandleLike = {
  kind: 'directory';
  name: string;
  values: () => AsyncIterable<DirectoryHandleLike | FileHandleLike>;
  getDirectoryHandle?: (name: string, options?: { create?: boolean }) => Promise<DirectoryHandleLike>;
  getFileHandle?: (name: string, options?: { create?: boolean }) => Promise<FileHandleLike>;
  removeEntry?: (name: string, options?: { recursive?: boolean }) => Promise<void>;
};
type DiskEntry = { relativePath: string; handle: FileHandleLike; parent: DirectoryHandleLike; name: string };

const ignoredFolderNames = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.cache', 'coverage', '.turbo']);
const textExtensions = /\.(html?|css|rcss|rml|m?js|cjs|json|txt|md|xml|ya?ml|toml|ini|svg|csv|log|h|hpp|cpp|c|uproject|uplugin)$/i;
const supportedFolderFile = /\.(html?|css|rcss|rml|m?js|cjs|json|txt|md|xml|ya?ml|toml|ini|svg|csv|log|h|hpp|cpp|c|uproject|uplugin|png|jpe?g|webp|tga|bmp|gif|ttf|otf|woff2?)$/i;
const folderMimeTypes: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  tga: 'image/x-tga', bmp: 'image/bmp', gif: 'image/gif', svg: 'image/svg+xml',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
};

function typeFromPath(path: string): ProjectFile['type'] {
  if (/\.(html?|rml)$/i.test(path)) return 'html';
  if (/\.(css|rcss)$/i.test(path)) return 'css';
  if (/\.(m?js|cjs)$/i.test(path)) return 'js';
  return 'asset';
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkBytes = 3 * 16_384;
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkBytes, bytes.length));
    let binary = '';
    for (let index = 0; index < chunk.length; index += 0x4000) binary += String.fromCharCode(...chunk.subarray(index, Math.min(index + 0x4000, chunk.length)));
    chunks.push(btoa(binary));
  }
  return chunks.join('');
}

function base64ToBytes(content: string): Uint8Array {
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function readDirectoryTree(root: DirectoryHandleLike): Promise<DiskEntry[]> {
  const result: DiskEntry[] = [];
  const walk = async (directory: DirectoryHandleLike, prefix: string): Promise<void> => {
    for await (const entry of directory.values()) {
      if (result.length > IMPORT_LIMITS.maxFiles) return;
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
      if (entry.kind === 'directory') {
        if (ignoredFolderNames.has(entry.name.toLowerCase())) continue;
        const childPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
        await walk(entry, childPrefix);
        continue;
      }
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (supportedFolderFile.test(relativePath)) {
        result.push({ relativePath, handle: entry, parent: directory, name: entry.name });
      }
    }
  };
  await walk(root, '');
  return result.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function createDiskEntry(root: DirectoryHandleLike, relativePath: string): Promise<DiskEntry | null> {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (!parts.length) return null;
  let parent = root;
  for (const part of parts.slice(0, -1)) {
    if (!parent.getDirectoryHandle) return null;
    parent = await parent.getDirectoryHandle(part, { create: true });
  }
  if (!parent.getFileHandle) return null;
  const name = parts[parts.length - 1];
  const handle = await parent.getFileHandle(name, { create: true });
  return { relativePath, handle, parent, name };
}

async function readProjectFile(entry: DiskEntry, existingFile?: File): Promise<ProjectFile> {
  const file = existingFile || await entry.handle.getFile();
  const extension = entry.relativePath.toLowerCase().split('.').pop() || '';
  const type = typeFromPath(entry.relativePath);
  const common = {
    id: `folder-${entry.relativePath}`,
    path: entry.relativePath,
    type,
    isEntry: /(?:^|\/)(?:index|main)[.]html?$/i.test(entry.relativePath) || /\.rml$/i.test(entry.relativePath),
  };
  if (textExtensions.test(entry.relativePath)) {
    return { ...common, content: await file.text(), contentEncoding: 'text', mimeType: /\.svg$/i.test(entry.relativePath) ? 'image/svg+xml' : undefined };
  }
  return {
    ...common,
    type: 'asset',
    content: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
    contentEncoding: 'base64',
    mimeType: file.type || folderMimeTypes[extension] || 'application/octet-stream',
  };
}

export const ProjectTree: React.FC<ProjectTreeProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onAddFile,
  onDeleteFile,
  onImportFiles,
  onSyncFolderFiles,
  onSplitHtmlFile,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryHandleRef = useRef<DirectoryHandleLike | null>(null);
  const diskEntriesRef = useRef<Map<string, DiskEntry>>(new Map());
  const diskContentRef = useRef<Map<string, string>>(new Map());
  const diskMetadataRef = useRef<Map<string, { size: number; lastModified: number }>>(new Map());
  const folderLoadedBytesRef = useRef(0);
  const currentFilesRef = useRef<ProjectFile[]>(files);
  const pollingRef = useRef(false);
  const writingPathsRef = useRef(new Set<string>());
  const queuedWriteContentRef = useRef(new Map<string, string>());
  const onImportFilesRef = useRef(onImportFiles);
  const onSyncFolderFilesRef = useRef(onSyncFolderFiles || onImportFiles);
  const [folderName, setFolderName] = useState('');
  const [folderSession, setFolderSession] = useState(0);
  const [folderStatus, setFolderStatus] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  useEffect(() => { currentFilesRef.current = files; }, [files]);
  useEffect(() => { onImportFilesRef.current = onImportFiles; }, [onImportFiles]);
  useEffect(() => { onSyncFolderFilesRef.current = onSyncFolderFiles || onImportFiles; }, [onSyncFolderFiles, onImportFiles]);

  const handleOpenFolder = async () => {
    const fileSystemWindow = window as unknown as { showDirectoryPicker?: (options?: unknown) => Promise<DirectoryHandleLike> };
    if (!fileSystemWindow.showDirectoryPicker) { setFolderStatus('Открытие папки требует Chrome/Edge и защищённого контекста (localhost или HTTPS).'); return; }
    try {
      // Call as a window method: the File System Access API may reject an unbound picker.
      const root = await fileSystemWindow.showDirectoryPicker({ mode: 'readwrite' });
      const entries = await readDirectoryTree(root);
      if (entries.length > IMPORT_LIMITS.maxFiles) {
        setFolderStatus(`В папке найдено более ${IMPORT_LIMITS.maxFiles} исходников. Исключите node_modules/dist/build и откройте папку повторно.`);
        return;
      }
      const imported: ProjectFile[] = [];
      const entryMap = new Map<string, DiskEntry>();
      const baselines = new Map<string, string>();
      const metadata = new Map<string, { size: number; lastModified: number }>();
      const skipped: string[] = [];
      let totalBytes = 0;
      for (const entry of entries) {
        const diskFile = await entry.handle.getFile();
        const maxBytes = maximumBytesForPath(entry.relativePath);
        if (diskFile.size > maxBytes) { skipped.push(`${entry.relativePath} (${formatBytes(diskFile.size)})`); continue; }
        if (totalBytes + diskFile.size > IMPORT_LIMITS.maxTotalBytes) { skipped.push(`${entry.relativePath} (общий лимит ${formatBytes(IMPORT_LIMITS.maxTotalBytes)})`); continue; }
        const projectFile = await readProjectFile(entry, diskFile);
        imported.push(projectFile);
        entryMap.set(entry.relativePath, entry);
        baselines.set(entry.relativePath, projectFile.content);
        metadata.set(entry.relativePath, { size: diskFile.size, lastModified: diskFile.lastModified });
        totalBytes += diskFile.size;
      }
      directoryHandleRef.current = root;
      diskEntriesRef.current = entryMap;
      diskContentRef.current = baselines;
      diskMetadataRef.current = metadata;
      folderLoadedBytesRef.current = totalBytes;
      setFolderName(root.name);
      setFolderSession(value => value + 1);
      setFolderStatus(`Папка «${root.name}»: ${imported.length} файлов (${formatBytes(totalBytes)}) · синхронизация включена${skipped.length ? ` · пропущено ${skipped.length} больших файлов` : ''}`);
      onImportFilesRef.current(imported);
      if (!imported.length) setFolderStatus(`Папка «${root.name}» не содержит поддерживаемых файлов подходящего размера.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFolderStatus(error instanceof Error ? `Не удалось открыть папку: ${error.message}` : 'Не удалось открыть папку.');
    }
  };

  // Persist code edits to the opened folder. Serial writes per path avoid overwriting a newer keystroke.
  useEffect(() => {
    const entries = diskEntriesRef.current;
    if (!directoryHandleRef.current) return;
    for (const file of files) {
      let entry = entries.get(file.path);
      const baseline = diskContentRef.current.get(file.path);
      if (baseline === file.content) continue;
      if (writingPathsRef.current.has(file.path)) { queuedWriteContentRef.current.set(file.path, file.content); continue; }
      if (!entry && baseline !== undefined) continue; // Removed from the workspace: do not recreate it silently.
      writingPathsRef.current.add(file.path);
      void (async () => {
        let contentToWrite = file.content;
        try {
          if (!entry) {
            const root = directoryHandleRef.current;
            if (!root) throw new Error('Папка проекта больше не открыта.');
            entry = await createDiskEntry(root, file.path) || undefined;
            if (!entry) throw new Error('Не удалось создать файл по указанному пути.');
            entries.set(file.path, entry);
          }
          while (true) {
            if (!entry.handle.createWritable) throw new Error('Браузер не поддерживает запись в файл.');
            const writable = await entry.handle.createWritable();
            const decodedBytes = file.contentEncoding === 'base64' ? base64ToBytes(contentToWrite) : undefined;
            await writable.write(decodedBytes ? decodedBytes.slice().buffer as ArrayBuffer : contentToWrite);
            await writable.close();
            diskContentRef.current.set(file.path, contentToWrite);
            const writtenFile = await entry.handle.getFile();
            const oldMetadata = diskMetadataRef.current.get(file.path);
            folderLoadedBytesRef.current = Math.max(0, folderLoadedBytesRef.current - (oldMetadata?.size || 0) + writtenFile.size);
            diskMetadataRef.current.set(file.path, { size: writtenFile.size, lastModified: writtenFile.lastModified });
            const queued = queuedWriteContentRef.current.get(file.path);
            queuedWriteContentRef.current.delete(file.path);
            if (queued === undefined || queued === contentToWrite) break;
            contentToWrite = queued;
          }
          setFolderStatus(`Изменения сохранены в папку: ${file.path}`);
        } catch (error) {
          setFolderStatus(error instanceof Error ? `Ошибка записи ${file.path}: ${error.message}` : `Не удалось сохранить ${file.path}.`);
        } finally { writingPathsRef.current.delete(file.path); }
      })();
    }
  }, [files]);

  // Watch external modifications and new/deleted UI files while a directory is open.
  useEffect(() => {
    const root = directoryHandleRef.current;
    if (!root) return;
    let cancelled = false;
    const scan = async () => {
      if (cancelled || pollingRef.current) return;
      pollingRef.current = true;
      try {
        const entries = await readDirectoryTree(root); if (cancelled) return;
        if (entries.length > IMPORT_LIMITS.maxFiles) {
          setFolderStatus(`Синхронизация приостановлена: найдено более ${IMPORT_LIMITS.maxFiles} файлов. Исключите node_modules/dist/build.`);
          return;
        }
        const nextMap = new Map(entries.map(entry => [entry.relativePath, entry]));
        const merged = currentFilesRef.current.map(file => ({ ...file }));
        let changed = false;
        for (const entry of entries) {
          if (writingPathsRef.current.has(entry.relativePath)) continue;
          const diskMetaFile = await entry.handle.getFile(); if (cancelled) return;
          const previousMeta = diskMetadataRef.current.get(entry.relativePath);
          if (previousMeta && previousMeta.size === diskMetaFile.size && previousMeta.lastModified === diskMetaFile.lastModified) continue;
          if (diskMetaFile.size > maximumBytesForPath(entry.relativePath)) {
            setFolderStatus(`Пропущен большой файл ${entry.relativePath} (${formatBytes(diskMetaFile.size)}).`);
            continue;
          }
          const projectedLoadedBytes = folderLoadedBytesRef.current - (previousMeta?.size || 0) + diskMetaFile.size;
          if (projectedLoadedBytes > IMPORT_LIMITS.maxTotalBytes) {
            setFolderStatus(`Синхронизация пропустила ${entry.relativePath}: общий лимит ${formatBytes(IMPORT_LIMITS.maxTotalBytes)}.`);
            continue;
          }
          const diskFile = await readProjectFile(entry, diskMetaFile); if (cancelled) return;
          folderLoadedBytesRef.current = projectedLoadedBytes;
          diskMetadataRef.current.set(entry.relativePath, { size: diskMetaFile.size, lastModified: diskMetaFile.lastModified });
          const previousDisk = diskContentRef.current.get(entry.relativePath);
          const index = merged.findIndex(item => item.path === entry.relativePath);
          if (previousDisk === undefined) {
            merged.push(diskFile); diskContentRef.current.set(entry.relativePath, diskFile.content); changed = true;
          } else if (previousDisk !== diskFile.content) {
            if (index >= 0 && merged[index].content === previousDisk) { merged[index] = diskFile; changed = true; }
            diskContentRef.current.set(entry.relativePath, diskFile.content);
          }
        }
        for (const knownPath of [...diskContentRef.current.keys()]) {
          if (!nextMap.has(knownPath)) {
            diskContentRef.current.delete(knownPath);
            const removedMeta = diskMetadataRef.current.get(knownPath);
            if (removedMeta) folderLoadedBytesRef.current = Math.max(0, folderLoadedBytesRef.current - removedMeta.size);
            diskMetadataRef.current.delete(knownPath);
            const index = merged.findIndex(item => item.path === knownPath);
            if (index >= 0) { changed = true; merged.splice(index, 1); }
          }
        }
        diskEntriesRef.current = nextMap;
        if (changed && !cancelled) {
          currentFilesRef.current = merged;
          onSyncFolderFilesRef.current(merged);
          setFolderStatus(`Папка «${root.name}» синхронизирована · ${merged.length} файлов`);
        }
      } catch (error) { if (!cancelled) setFolderStatus(error instanceof Error ? `Ошибка синхронизации: ${error.message}` : 'Ошибка синхронизации папки.'); }
      finally { pollingRef.current = false; }
    };
    const id = window.setInterval(() => { void scan(); }, 2500);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [folderSession]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.currentTarget.files || []);
    if (!selected.length || isImporting) return;
    setIsImporting(true);
    setImportStatus(`Проверка ${selected.length} выбранных файлов…`);

    const imported: ProjectFile[] = [];
    const rejected: Array<{ name: string; reason: string }> = [];
    const idFor = (prefix: string, path: string) => {
      const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      return `${prefix}-${random}-${path.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
    };
    const getMimeType = (path: string) => {
      const ext = path.toLowerCase().split('.').pop() || '';
      const types: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
        tga: 'image/x-tga', bmp: 'image/bmp', gif: 'image/gif', svg: 'image/svg+xml',
        ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
      };
      return types[ext] || 'application/octet-stream';
    };
    const isTextAsset = (path: string) => /\.(html?|css|js|mjs|cjs|json|txt|md|rml|rcss|h|hpp|cpp|c|ini|xml|ya?ml|toml|svg|csv|log)$/i.test(path);
    const extensionType = (path: string): ProjectFile['type'] => {
      if (/\.(html?|rml)$/i.test(path)) return 'html';
      if (/\.(css|rcss)$/i.test(path)) return 'css';
      if (/\.(?:m?js|cjs)$/i.test(path)) return 'js';
      return 'asset';
    };
    const bytesToBase64 = (bytes: Uint8Array): string => {
      // Encode 3-byte-aligned chunks to avoid holding a second full-size binary string.
      const chunkBytes = 3 * 16_384;
      const chunks: string[] = [];
      for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
        const chunk = bytes.subarray(offset, Math.min(offset + chunkBytes, bytes.length));
        let binary = '';
        for (let i = 0; i < chunk.length; i += 0x4000) {
          binary += String.fromCharCode(...chunk.subarray(i, Math.min(i + 0x4000, chunk.length)));
        }
        chunks.push(btoa(binary));
      }
      return chunks.join('');
    };

    try {
      const selectionCheck = validateImportSelection(selected.map(file => ({ name: file.name, size: file.size })));
      rejected.push(...selectionCheck.rejected);
      const allowedOccurrences = new Map<string, number>();
      for (const item of selectionCheck.accepted) {
        const key = `${item.name}\u0000${item.size}`;
        allowedOccurrences.set(key, (allowedOccurrences.get(key) || 0) + 1);
      }
      const acceptedFiles = selected.filter(file => {
        const key = `${file.name}\u0000${file.size}`;
        const remaining = allowedOccurrences.get(key) || 0;
        if (!remaining) return false;
        allowedOccurrences.set(key, remaining - 1);
        return true;
      });
      let completed = 0;

      for (const file of acceptedFiles) {
        completed++;
        setImportStatus(`Импорт ${completed}/${acceptedFiles.length}: ${file.name}`);
        if (/\.zip$/i.test(file.name)) {
          try {
            const zip = await JSZip.loadAsync(file);
            const candidates: Array<{ path: string; size: number; isDirectory: boolean }> = [];
            for (const path in zip.files) {
              const entry = zip.files[path];
              if (entry.dir || isIgnoredArchivePath(path) || !isSupportedProjectPath(path)) continue;
              candidates.push({
                path,
                size: Number((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0),
                isDirectory: false,
              });
              if (candidates.length >= IMPORT_LIMITS.maxFiles + 1) break;
            }
            const manifest = validateArchiveManifest(candidates);
            rejected.push(...manifest.rejected.map(item => ({ name: `${file.name} :: ${item.path}`, reason: item.reason })));
            for (const item of manifest.accepted) {
              const zipEntry = zip.files[item.path];
              if (!zipEntry || zipEntry.dir) continue;
              const type = extensionType(item.path);
              const id = idFor('zip', item.path);
              if (isTextAsset(item.path)) {
                const text = await zipEntry.async('string');
                imported.push({
                  id, path: item.path, content: text, type,
                  contentEncoding: 'text',
                  mimeType: /\.svg$/i.test(item.path) ? 'image/svg+xml' : undefined,
                  isEntry: /(?:^|\/)index\.html?$/i.test(item.path) || /(?:^|\/)main\.html?$/i.test(item.path),
                });
              } else {
                const base64 = await zipEntry.async('base64');
                imported.push({ id, path: item.path, content: base64, type: 'asset', contentEncoding: 'base64', mimeType: getMimeType(item.path) });
              }
            }
          } catch (err) {
            rejected.push({ name: file.name, reason: `Не удалось безопасно распаковать ZIP: ${err instanceof Error ? err.message : 'ошибка архива'}` });
          }
          continue;
        }

        try {
          const limit = maximumBytesForPath(file.name);
          if (file.size > limit) {
            rejected.push({ name: file.name, reason: `Файл ${formatBytes(file.size)} превышает лимит ${formatBytes(limit)}.` });
            continue;
          }
          const type = extensionType(file.name);
          if (type === 'html') {
            const text = await file.text();
            if (/\.html?$/i.test(file.name) && (/<style\b/i.test(text) || /<script(?![^>]*\bsrc\s*=)/i.test(text))) {
              const split = splitMonolithicHtmlProject(text, file.name);
              imported.push(...split.map(item => ({ ...item, id: idFor('upload', `${file.name}:${item.path}`) })));
              continue;
            }
            imported.push({ id: idFor('upload', file.name), path: file.name, content: text, type, contentEncoding: 'text', isEntry: true });
          } else if (type === 'css' || type === 'js' || isTextAsset(file.name)) {
            const text = await file.text();
            imported.push({
              id: idFor('upload', file.name), path: file.name, content: text, type, contentEncoding: 'text',
              mimeType: /\.svg$/i.test(file.name) ? 'image/svg+xml' : undefined,
            });
          } else {
            const bytes = new Uint8Array(await file.arrayBuffer());
            imported.push({
              id: idFor('upload', file.name), path: file.name, content: bytesToBase64(bytes), type: 'asset',
              contentEncoding: 'base64', mimeType: file.type || getMimeType(file.name),
            });
          }
        } catch (error) {
          rejected.push({ name: file.name, reason: error instanceof Error ? error.message : 'Не удалось прочитать файл.' });
        }
      }

      if (imported.length > 0) {
        onImportFiles(imported);
        const totalImported = imported.reduce((sum, file) => sum + (file.contentEncoding === 'base64' ? Math.floor(file.content.length * 3 / 4) : new TextEncoder().encode(file.content).length), 0);
        const summary = `Импортировано ${imported.length} файлов (${formatBytes(totalImported)}).`;
        const detail = rejected.slice(0, 2).map(item => `${item.name}: ${item.reason}`).join(' · ');
        const remaining = rejected.length > 2 ? ` · ещё ${rejected.length - 2}` : '';
        setImportStatus(rejected.length ? `${summary} Пропущено ${rejected.length}. ${detail}${remaining}` : summary);
      } else {
        const detail = rejected.slice(0, 2).map(item => `${item.name}: ${item.reason}`).join(' · ');
        const remaining = rejected.length > 2 ? ` · ещё ${rejected.length - 2}` : '';
        setImportStatus(rejected.length ? `Не импортировано файлов: ${rejected.length}. ${detail}${remaining}` : 'Не найдены поддерживаемые файлы.');
      }
      if (rejected.length) console.warn('[Project import] Файлы пропущены:', rejected);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка импорта.';
      setImportStatus(`Импорт остановлен безопасно: ${message}`);
      console.error('[Project import] Ошибка импорта:', error);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getFileIcon = (type: string, path: string) => {
    if (type === 'html' || path.endsWith('.html')) return <FileCode className="w-3.5 h-3.5 text-orange-400" />;
    if (type === 'css' || path.endsWith('.css')) return <Code className="w-3.5 h-3.5 text-blue-400" />;
    if (type === 'js' || path.endsWith('.js')) return <FileType className="w-3.5 h-3.5 text-yellow-400" />;
    return <FileText className="w-3.5 h-3.5 text-zinc-400" />;
  };

  const activeHtmlFile = files.find(
    f => f.id === activeFileId && /\.html?$/i.test(f.path)
  );
  const hasEmbeddedAssets =
    activeHtmlFile &&
    (/<style\b/i.test(activeHtmlFile.content) || /<script(?![^>]*\bsrc\s*=)/i.test(activeHtmlFile.content));

  return (
    <aside className="project-tree-sidebar flex h-full min-h-0 min-w-0 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-300 select-none">
      {/* Sidebar Header */}
      <div className="sidebar-header flex items-center justify-between gap-2 border-b border-zinc-800/80 p-3">
        <div className="sidebar-title-text flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <FolderTree className="w-3.5 h-3.5 text-cyan-400" />
          <span className="truncate">Файлы проекта</span>
        </div>
        <div className="sidebar-header-actions flex shrink-0 items-center gap-1">
          <button onClick={handleOpenFolder} className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-emerald-300 rounded transition-colors" title="Открыть папку проекта и синхронизировать изменения с диском" aria-label="Открыть папку проекта"><FolderOpen className="w-3.5 h-3.5" /></button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 rounded transition-colors disabled:opacity-40 disabled:cursor-wait"
            title="Импорт HTML/CSS/JS/RML/RCSS и ресурсов. Архивы node_modules/dist/build автоматически пропускаются."
            aria-label="Импортировать файлы"
          >
            <Upload className={`w-3.5 h-3.5 ${isImporting ? 'animate-pulse' : ''}`} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".html,.htm,.rml,.css,.rcss,.js,.mjs,.zip,.json,.txt,.png,.jpg,.jpeg,.webp,.tga,.bmp,.gif,.svg,.ttf,.otf,.woff,.woff2"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>

      {folderStatus && <div className="border-b border-zinc-800 bg-zinc-900/70 px-3 py-1.5 text-[10px] leading-relaxed text-emerald-200 safe-wrap" title={folderName ? `Папка: ${folderName}` : undefined}>{folderStatus}</div>}
      {importStatus && <div role="status" aria-live="polite" className="border-b border-zinc-800 bg-zinc-900/70 px-3 py-1.5 text-[10px] leading-relaxed text-cyan-200 safe-wrap" title={importStatus}>{importStatus}</div>}

      {/* Embedded Assets Detected Notice */}
      {hasEmbeddedAssets && (
        <div className="embedded-assets-notice m-2 rounded border border-cyan-800/80 bg-cyan-950/50 p-2 text-[11px] text-cyan-200">
          <div className="font-semibold flex items-center gap-1 mb-1">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>Встроенные CSS/JS найдены</span>
          </div>
          <p className="text-[10px] text-zinc-400 mb-2 leading-tight">
            В этом HTML есть встроенные &lt;style&gt; или &lt;script&gt;.
          </p>
          {onSplitHtmlFile && (
            <button
              onClick={() => onSplitHtmlFile(activeHtmlFile.id)}
              className="w-full py-1 px-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-[10px] shadow transition-colors"
            >
              Разделить на отдельные файлы
            </button>
          )}
        </div>
      )}

      {/* Files List */}
      <div className="project-file-list min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        <div className="text-[10px] font-semibold text-zinc-500 uppercase px-2 py-1 tracking-wider">
          Исходный интерфейс
        </div>
        {files.length === 0 && (
          <div className="mx-1 mt-3 rounded-md border border-dashed border-zinc-800 p-3 text-center">
            <FolderTree className="mx-auto mb-2 h-5 w-5 text-zinc-600" />
            <p className="text-[11px] font-medium text-zinc-300">Пока нет файлов</p>
            <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">Создайте файл кнопками ниже или импортируйте существующий проект.</p>
          </div>
        )}
        {files.map((file) => {
          const isActive = file.id === activeFileId;
          const isBinaryResource = file.contentEncoding === 'base64';
          const lineCount = isBinaryResource ? 0 : file.content.split('\n').length;
          const resourceSize = isBinaryResource ? `${Math.max(1, Math.round(file.content.length * 0.75 / 1024))} KB` : `${lineCount}L`;
          const isFileWithEmbedded =
            /\.html?$/i.test(file.path) &&
            (/<style\b/i.test(file.content) || /<script(?![^>]*\bsrc\s*=)/i.test(file.content));

          return (
            <div
              key={file.id}
              onClick={() => onSelectFile(file.id)}
              className={`group flex items-center justify-between px-2.5 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                isActive
                  ? 'bg-cyan-950/70 text-cyan-200 border border-cyan-800/60 font-medium'
                  : 'hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                {getFileIcon(file.type, file.path)}
                <span className="project-file-name truncate" title={file.path}>{file.path}</span>
                {file.isEntry && (
                  <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800 text-cyan-400 font-mono">
                    входной
                  </span>
                )}
                {isFileWithEmbedded && (
                  <span
                    className="text-[8px] px-1 py-0.2 rounded bg-cyan-900/80 text-cyan-300 font-semibold uppercase tracking-wider"
                    title="Файл содержит встроенные <style> или <script>"
                  >
                    CSS/JS
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5 opacity-60 group-hover:opacity-100 group-focus-within:opacity-100">
                {isFileWithEmbedded && onSplitHtmlFile && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSplitHtmlFile(file.id);
                    }}
                    className="p-0.5 hover:text-cyan-400 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Разделить встроенные CSS и JS в отдельные файлы"
                    aria-label={`Разделить ${file.path}`}
                  >
                    <FilePlus className="w-3 h-3" />
                  </button>
                )}
                <span className="file-resource-size shrink-0 text-[10px] text-zinc-500 font-mono">{resourceSize}</span>
                {files.length >= 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteFile(file.id);
                    }}
                    className="p-0.5 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Удалить файл из проекта"
                    aria-label={`Удалить ${file.path}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Quick Add Controls */}
      <div className="sidebar-footer-actions border-t border-zinc-800/80 bg-zinc-900/40 p-2">
        <div className="text-[10px] text-zinc-500 font-semibold mb-1 px-1 uppercase tracking-wider">
          Добавить файл
        </div>
        <div className="grid grid-cols-3 gap-1 text-[11px]">
          <button
            onClick={() => onAddFile('html')}
            className="flex items-center justify-center gap-1 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800"
            title="Добавить HTML-файл"
          >
            <FilePlus className="w-3 h-3 text-orange-400" />
            <span>+ HTML</span>
          </button>
          <button
            onClick={() => onAddFile('css')}
            className="flex items-center justify-center gap-1 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800"
            title="Добавить CSS-файл"
          >
            <FilePlus className="w-3 h-3 text-blue-400" />
            <span>+ CSS</span>
          </button>
          <button
            onClick={() => onAddFile('js')}
            className="flex items-center justify-center gap-1 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800"
            title="Добавить JS-файл"
          >
            <FilePlus className="w-3 h-3 text-yellow-400" />
            <span>+ JS</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
