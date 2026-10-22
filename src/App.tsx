import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  FileCode,
  Code,
  FileType,
  Sparkles,
  BookOpen,
  Layout,
  Columns,
  Eye,
  AlertTriangle,
  Layers,
  Terminal,
  Settings,
  ShieldCheck,
  Check,
  ArrowRight,
  FileCheck,
  FilePlus,
  PanelRightOpen,
} from 'lucide-react';
import { Header } from './components/Header.tsx';
import { ProjectTree } from './components/ProjectTree.tsx';
import { CodeEditor } from './components/CodeEditor.tsx';
import { DiagnosticsPanel } from './components/DiagnosticsPanel.tsx';
import { PreviewPanel } from './components/PreviewPanel.tsx';
import { ExportModal } from './components/ExportModal.tsx';
import { UnrealGuideModal } from './components/UnrealGuideModal.tsx';
import { KnowledgeBaseModal } from './components/KnowledgeBaseModal.tsx';
import { readSavedProjects, writeSavedProject, type SavedProject } from './core/saved-projects.ts';
import { SaveProjectModal } from './components/SaveProjectModal.tsx';
import { LayoutGeneratorModal } from './components/LayoutGeneratorModal.tsx';
import { listFigmaFrames } from './core/layout-generator.ts';
import { planLayoutImport } from './core/layout-import-router.ts';
import { splitMonolithicHtmlProject } from './core/html-project-splitter.ts';
import { DEFAULT_CONVERSION_OPTIONS } from './core/conversion-options.ts';
import { createEmptyConversionResult } from './core/empty-conversion-result.ts';
import { extractEmbeddedAssetsFromHtml } from './core/html-embedded-extractor.ts';
import type { ProjectFile, ConvertedProjectResult } from './core/types.ts';
import { applyVisualEditToProject } from './core/visual-editor.ts';
import type { VisualCssDeclarations } from './core/visual-editor.ts';
import { buildPreviewAssetUrlMap } from './core/preview-assets.ts';
import { analyzeNativeRcssFiles } from './core/native-rcss-diagnostics.ts';
import { applySafeSourceAutoFixes, getSafeSourceAutoFixes, isSafeSourceAutoFix } from './core/safe-auto-fix.ts';

export default function App() {
  // Start with an intentionally empty workspace. No demo project is loaded by default.
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const filesRef = useRef<ProjectFile[]>([]);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>(() => {
    try { return typeof window === 'undefined' ? [] : readSavedProjects(window.localStorage); } catch { return []; }
  });
  const [currentSavedProjectId, setCurrentSavedProjectId] = useState<string | null>(null);
  const [isSaveProjectOpen, setIsSaveProjectOpen] = useState(false);
  const [isLayoutGeneratorOpen, setIsLayoutGeneratorOpen] = useState(false);
  const [pendingLayoutImport, setPendingLayoutImport] = useState<{ token: number; kind: 'svg' | 'figma' | 'image'; name: string; content: string; companionSvg?: { name: string; content: string }; companionPng?: { name: string; dataUrl: string } } | null>(null);
  const [isDiagnosticsCollapsed, setIsDiagnosticsCollapsed] = useState(true);
  const visualEditHistoryRef = useRef<ProjectFile[][]>([]);
  const visualEditRedoRef = useRef<ProjectFile[][]>([]);
  const [canUndoVisualEdit, setCanUndoVisualEdit] = useState(false);
  const [canRedoVisualEdit, setCanRedoVisualEdit] = useState(false);
  const [activeFileId, setActiveFileId] = useState<string>('');
  const [screenName, setScreenName] = useState<string>('MainMenu');
  const [cssPixelsAsDp, setCssPixelsAsDp] = useState<boolean>(DEFAULT_CONVERSION_OPTIONS.cssPixelsAsDp);

  const [viewMode, setViewMode] = useState<'editor' | 'preview' | 'split'>('split');
  const [highlightLine, setHighlightLine] = useState<number | null>(null);

  // Modals
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isKnowledgeOpen, setIsKnowledgeOpen] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [conversionRevision, setConversionRevision] = useState(0);
  const conversionWorkerRef = useRef<Worker | null>(null);
  const conversionRequestIdRef = useRef(0);
  const [fixFeedback, setFixFeedback] = useState<string | null>(null);

  // Active source file
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const activeFile = useMemo(() => {
    return files.find(f => f.id === activeFileId) || files[0];
  }, [files, activeFileId]);

  // Check if active file is an HTML document containing embedded <style> or <script>
  const isHtmlWithEmbedded = useMemo(() => {
    if (!activeFile) return false;
    const isHtml = /\.html?$/i.test(activeFile.path);
    if (!isHtml) return false;
    return /<style\b/i.test(activeFile.content) || /<script(?![^>]*\bsrc\s*=)/i.test(activeFile.content);
  }, [activeFile]);

  // Main conversion pipeline runs in a dedicated worker so a complex HTML/CSS/JS
  // project cannot block React rendering or freeze the editor during import/typing.
  const conversionOptions = useMemo(() => ({ ...DEFAULT_CONVERSION_OPTIONS, cssPixelsAsDp }), [cssPixelsAsDp]);
  const [convertedResult, setConvertedResult] = useState<ConvertedProjectResult>(() => createEmptyConversionResult());

  useEffect(() => {
    const requestId = ++conversionRequestIdRef.current;
    const oldWorker = conversionWorkerRef.current;
    if (oldWorker) oldWorker.terminate();
    conversionWorkerRef.current = null;
    setConversionError(null);

    if (!files.length) {
      setConvertedResult(createEmptyConversionResult());
      setIsConverting(false);
      return;
    }

    setIsConverting(true);
    const debounceId = window.setTimeout(() => {
      let worker: Worker;
      try {
        worker = new Worker(new URL('./workers/project-conversion.worker.ts', import.meta.url), { type: 'module' });
      } catch (error) {
        setIsConverting(false);
        setConversionError(`Не удалось запустить фоновый конвертер: ${error instanceof Error ? error.message : 'Worker недоступен'}`);
        return;
      }
      conversionWorkerRef.current = worker;
      const closeWorker = () => {
        if (conversionWorkerRef.current === worker) conversionWorkerRef.current = null;
        worker.terminate();
      };
      worker.onmessage = (event: MessageEvent) => {
        const message = event.data as { requestId?: number; ok?: boolean; result?: ConvertedProjectResult; error?: string };
        if (message.requestId !== requestId || requestId !== conversionRequestIdRef.current) return;
        closeWorker();
        setIsConverting(false);
        if (message.ok && message.result) {
          setConvertedResult(message.result);
          setConversionError(null);
        } else {
          setConversionError(message.error || 'Фоновая конвертация завершилась без результата.');
        }
      };
      worker.onerror = (event) => {
        if (requestId !== conversionRequestIdRef.current) return;
        event.preventDefault();
        closeWorker();
        setIsConverting(false);
        setConversionError(`Ошибка фонового конвертера: ${event.message || 'не удалось обработать исходники'}`);
      };
      worker.onmessageerror = () => {
        if (requestId !== conversionRequestIdRef.current) return;
        closeWorker();
        setIsConverting(false);
        setConversionError('Не удалось передать результат конвертации из фонового потока. Проверьте размер импортированного проекта.');
      };
      try {
        worker.postMessage({ requestId, files, screenName, options: conversionOptions });
      } catch (error) {
        closeWorker();
        setIsConverting(false);
        setConversionError(`Не удалось отправить проект в фоновый конвертер: ${error instanceof Error ? error.message : 'ошибка передачи данных'}`);
      }
    }, 120);

    return () => {
      window.clearTimeout(debounceId);
      if (conversionWorkerRef.current) {
        conversionWorkerRef.current.terminate();
        conversionWorkerRef.current = null;
      }
    };
  }, [files, screenName, conversionOptions, conversionRevision]);

  const previewAssetUrls = useMemo(() => buildPreviewAssetUrlMap(
    convertedResult.projectAssets,
    convertedResult.svgAssets,
    convertedResult.externalImageAssets,
  ), [convertedResult.projectAssets, convertedResult.svgAssets, convertedResult.externalImageAssets]);
  const hasNativeRmlProject = files.some(file => /\.rml$/i.test(file.path));
  const nativeRcssDiagnostics = useMemo(() => analyzeNativeRcssFiles(files), [files]);
  const visibleDiagnostics = !files.length || isConverting ? [] : (hasNativeRmlProject ? nativeRcssDiagnostics : convertedResult.diagnostics);
  const workspaceMetrics = !hasNativeRmlProject ? convertedResult.metrics : {
    ...convertedResult.metrics,
    htmlTagsProcessed: 0,
    cssRulesProcessed: files.filter(file => /\.rcss$/i.test(file.path)).length,
    jsFunctionsProcessed: 0,
    errorsCount: visibleDiagnostics.filter(issue => issue.severity === 'error').length,
    warningsCount: visibleDiagnostics.filter(issue => issue.severity === 'warning' || issue.severity === 'unverified').length,
    autoFixesApplied: 0,
    manualFixesCount: 0,
  };

  const clearVisualEditHistory = useCallback(() => {
    visualEditHistoryRef.current = [];
    visualEditRedoRef.current = [];
    setCanUndoVisualEdit(false);
    setCanRedoVisualEdit(false);
  }, []);

  // Handle source file content edits. Manual code changes reset the visual-edit-only undo stack.
  const handleUpdateFileContent = useCallback((newContent: string) => {
    visualEditHistoryRef.current = [];
    visualEditRedoRef.current = [];
    setCanUndoVisualEdit(false);
    setCanRedoVisualEdit(false);
    const nextFiles = filesRef.current.map(f => (f.id === activeFileId ? { ...f, content: newContent } : f));
    filesRef.current = nextFiles;
    setFiles(nextFiles);
  }, [activeFileId]);

  // Apply edits made directly in the visual viewport back to a dedicated source CSS file.
  const handleApplyVisualEdit = useCallback((selector: string, declarations: VisualCssDeclarations) => {
    const before = filesRef.current;
    const after = applyVisualEditToProject(before, selector, declarations);
    if (after === before || after.every((file, i) => file.path === before[i]?.path && file.content === before[i]?.content)) return;
    visualEditHistoryRef.current.push(before.map(file => ({ ...file })));
    if (visualEditHistoryRef.current.length > 80) visualEditHistoryRef.current.shift();
    visualEditRedoRef.current = [];
    setCanRedoVisualEdit(false);
    filesRef.current = after;
    setFiles(after);
    setCanUndoVisualEdit(visualEditHistoryRef.current.length > 0);
  }, []);

  const handleUndoVisualEdit = useCallback(() => {
    const previous = visualEditHistoryRef.current.pop();
    if (!previous) return;
    visualEditRedoRef.current.push(filesRef.current.map(file => ({ ...file })));
    filesRef.current = previous;
    setFiles(previous);
    setCanUndoVisualEdit(visualEditHistoryRef.current.length > 0);
    setCanRedoVisualEdit(visualEditRedoRef.current.length > 0);
  }, []);

  const handleRedoVisualEdit = useCallback(() => {
    const next = visualEditRedoRef.current.pop();
    if (!next) return;
    visualEditHistoryRef.current.push(filesRef.current.map(file => ({ ...file })));
    filesRef.current = next;
    setFiles(next);
    setCanUndoVisualEdit(visualEditHistoryRef.current.length > 0);
    setCanRedoVisualEdit(visualEditRedoRef.current.length > 0);
  }, []);

  // Open a saved project from the header selector.
  const handleLoadSavedProject = (project: SavedProject) => {
    clearVisualEditHistory();
    const restoredFiles = project.files.map(file => ({ ...file }));
    filesRef.current = restoredFiles;
    setFiles(restoredFiles);
    setActiveFileId(restoredFiles[0]?.id ?? '');
    setScreenName(project.screenName || 'MainMenu');
    setCssPixelsAsDp(project.cssPixelsAsDp);
    setCurrentSavedProjectId(project.id);
    setHighlightLine(null);
    setFixFeedback(null);
  };

  const handleNewProject = () => {
    clearVisualEditHistory();
    filesRef.current = [];
    setFiles([]);
    setActiveFileId('');
    setScreenName('MainMenu');
    setCssPixelsAsDp(DEFAULT_CONVERSION_OPTIONS.cssPixelsAsDp);
    setCurrentSavedProjectId(null);
    setHighlightLine(null);
    setFixFeedback(null);
  };

  const handleSaveProject = (name: string): string | null => {
    if (!filesRef.current.length) return 'Нельзя сохранить пустой проект. Сначала добавьте или импортируйте файлы.';
    try {
      const id = currentSavedProjectId || (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      const saved: SavedProject = {
        id,
        name,
        savedAt: new Date().toISOString(),
        screenName,
        cssPixelsAsDp,
        files: filesRef.current.map(file => ({ ...file })),
      };
      const next = writeSavedProject(window.localStorage, saved);
      setSavedProjects(next);
      setCurrentSavedProjectId(id);
      setIsSaveProjectOpen(false);
      setFixFeedback(`Проект «${name}» сохранён в этом браузере.`);
      return null;
    } catch (error) {
      console.error('Не удалось сохранить проект', error);
      return error instanceof Error ? `Не удалось сохранить проект: ${error.message}` : 'Не удалось сохранить проект. Проверьте доступное место в хранилище браузера.';
    }
  };

  // Add new file
  const handleAddFile = (type: 'html' | 'css' | 'js') => {
    clearVisualEditHistory();
    const ext = type === 'html' ? '.html' : type === 'css' ? '.css' : '.js';
    const filename = `new_file_${files.length + 1}${ext}`;
    const defaultContent =
      type === 'html'
        ? '<!doctype html>\n<html lang="ru">\n<head>\n  <meta charset="utf-8">\n  <title>Новый экран</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <main class="new-panel"></main>\n  <script src="app.js"></script>\n</body>\n</html>'
        : type === 'css'
        ? '/* Стили нового экрана */\n.new-panel { display: block; padding: 16px; }'
        : '// Логика нового экрана\n';

    const newFile: ProjectFile = {
      id: `file-${Date.now()}`,
      path: filename,
      type,
      content: defaultContent,
    };

    const nextFiles = [...files, newFile];
    filesRef.current = nextFiles;
    setFiles(nextFiles);
    setActiveFileId(newFile.id);
  };

  // Delete file
  const handleDeleteFile = (fileId: string) => {
    clearVisualEditHistory();
    const remaining = files.filter(f => f.id !== fileId);
    filesRef.current = remaining;
    setFiles(remaining);
    if (activeFileId === fileId) {
      setActiveFileId(remaining[0]?.id ?? '');
    }
  };

  // Import files
  const handleSyncFolderFiles = useCallback((newFiles: ProjectFile[]) => {
    filesRef.current = newFiles;
    setFiles(newFiles);
    if (!newFiles.some(file => file.id === activeFileId)) setActiveFileId(newFiles[0]?.id ?? '');
  }, [activeFileId]);

  const handleImportFiles = (newFiles: ProjectFile[]) => {
    const layoutPlan = planLayoutImport(newFiles);
    if (layoutPlan) {
      clearVisualEditHistory();
      const supplementalFiles = layoutPlan.supplementalFiles;
      if (supplementalFiles.length) {
        const supplementalPaths = new Set(supplementalFiles.map(file => file.path.toLowerCase()));
        const retained = filesRef.current.filter(file => !supplementalPaths.has(file.path.toLowerCase()));
        const nextFiles = [...retained, ...supplementalFiles];
        filesRef.current = nextFiles;
        setFiles(nextFiles);
        setCurrentSavedProjectId(null);
      }

      let frameCount = 0;
      let frameError = '';
      if (layoutPlan.kind === 'figma') {
        try { frameCount = listFigmaFrames(layoutPlan.content).length; }
        catch (error) { frameError = error instanceof Error ? error.message : 'Структура JSON пока не распознана.'; }
      }
      setPendingLayoutImport({
        token: Date.now() + Math.random(),
        kind: layoutPlan.kind,
        name: layoutPlan.name,
        content: layoutPlan.content,
        companionSvg: layoutPlan.companionSvg,
        companionPng: layoutPlan.companionPng,
      });
      setIsLayoutGeneratorOpen(true);
      if (layoutPlan.kind === 'figma') {
        setFixFeedback(`Открываю макет «${layoutPlan.name}» в генераторе. Найдено Frame: ${frameCount}.${frameError ? ` Причина будет показана в генераторе: ${frameError}` : ''}${supplementalFiles.length ? ` Дополнительных источников: ${supplementalFiles.length}.` : ''}`);
      } else if (layoutPlan.kind === 'svg') {
        setFixFeedback(`Открываю SVG «${layoutPlan.name}» в генераторе макетов.${layoutPlan.companionPng ? ' PNG подключён как визуальный эталон.' : ''}`);
      } else {
        setFixFeedback(`Открываю изображение «${layoutPlan.name}» в генераторе макетов. Для автоматической реконструкции элементов выберите локальную vision-модель; без неё можно добавить слои вручную.`);
      }
      return;
    }

    // HTML/CSS/JS (and native RML/RCSS) remain in the regular source converter.
    clearVisualEditHistory();
    filesRef.current = newFiles;
    setFiles(newFiles);
    setCurrentSavedProjectId(null);
    const preferredEntry = newFiles.find(file => /\.rml$/i.test(file.path))
      || newFiles.find(file => /\.html?$/i.test(file.path))
      || newFiles.find(file => file.type === 'css' || /\.(?:css|rcss)$/i.test(file.path))
      || newFiles.find(file => file.type === 'js' || /\.m?js$/i.test(file.path))
      || newFiles[0];
    setActiveFileId(preferredEntry?.id ?? '');
  };

  // Insert generated Layout IR output into the actual project workspace. The modal used
  // to exist in isolation; without this bridge, imported SVG/Figma JSON had no visible effect
  // on the main editor or preview.
  const handleApplyGeneratedLayout = useCallback((generatedFiles: ProjectFile[], generatedScreenName: string) => {
    clearVisualEditHistory();
    const normalizedPrefix = `${generatedScreenName}/`.replace(/\\/g, '/').toLowerCase();
    const existing = filesRef.current.filter(file => !file.path.replace(/\\/g, '/').toLowerCase().startsWith(normalizedPrefix));
    const nextFiles = [...existing, ...generatedFiles];
    filesRef.current = nextFiles;
    setFiles(nextFiles);
    // Open the editable RML first. main.rml is the pixel-reference entrypoint and is
    // intentionally a bitmap-backed visual baseline, not the default editing surface.
    const entry = generatedFiles.find(file => /main-editable\.rml$/i.test(file.path))
      || generatedFiles.find(file => /\.rml$/i.test(file.path))
      || generatedFiles[0];
    setActiveFileId(entry?.id || '');
    setScreenName(generatedScreenName);
    setCurrentSavedProjectId(null);
    setHighlightLine(null);
    setFixFeedback(`Макет создан: добавлено ${generatedFiles.length} файлов в «${generatedScreenName}». Открыт редактируемый main-editable.rml; main.rml сохранён как визуальный эталон.`);
    setViewMode('split');
  }, [clearVisualEditHistory]);

  // Split embedded CSS/JS from active HTML file into separate project files
  const handleSplitHtmlFile = (fileId: string) => {
    clearVisualEditHistory();
    const targetFile = files.find(f => f.id === fileId);
    if (!targetFile) return;

    const split = splitMonolithicHtmlProject(targetFile.content, targetFile.path);
    // Replace the single file with the split files
    const remaining = files.filter(f => f.id !== fileId);
    const updated = [...remaining, ...split];
    filesRef.current = updated;
    setFiles(updated);
    setActiveFileId(split[0]?.id ?? '');
  };

  // Manual reconvert restarts the background conversion worker.
  const handleReconvert = () => {
    setConversionRevision(value => value + 1);
  };

  // Navigate to specific line from Diagnostics Panel
  const handleNavigateToLine = (targetFileName: string, line: number) => {
    const targetFile = files.find(f => f.path.includes(targetFileName) || targetFileName.includes(f.path));
    if (targetFile) {
      setActiveFileId(targetFile.id);
    }
    setHighlightLine(line);
    // If in full preview mode, switch to editor or split to see line
    if (viewMode === 'preview') {
      setViewMode('split');
    }
  };

  // Source auto-fixes are deliberately conservative. CSS/JS compatibility fallbacks are
  // produced by the conversion pipeline; mutating browser source for them can destroy layout
  // (Grid -> Flex), visuals (shadow -> border), asset paths, or application behavior.
  const commitSafeSourceFixes = (issues: typeof convertedResult.diagnostics) => {
    const before = filesRef.current.map(file => ({ ...file }));
    const result = applySafeSourceAutoFixes(before, issues);
    if (result.appliedIssueIds.length === 0) {
      setFixFeedback(
        result.skippedIssueIds.length > 0
          ? 'Некоторые исправления пропущены: структуру исходника нельзя безопасно изменить автоматически. Макет и JavaScript оставлены без изменений.'
          : 'Нет безопасных исправлений исходников. Совместимые CSS/JS-преобразования выполняются в сгенерированном выводе; остальные требуют ручной проверки.'
      );
      return;
    }

    visualEditHistoryRef.current.push(before);
    if (visualEditHistoryRef.current.length > 80) visualEditHistoryRef.current.shift();
    visualEditRedoRef.current = [];
    setCanUndoVisualEdit(visualEditHistoryRef.current.length > 0);
    setCanRedoVisualEdit(false);
    filesRef.current = result.files;
    setFiles(result.files);
    setFixFeedback(
      `Применено безопасных исправлений: ${result.appliedIssueIds.length}. ` +
      (result.skippedIssueIds.length
        ? `Пропущено неоднозначных случаев: ${result.skippedIssueIds.length}. `
        : '') +
      'Исходные CSS и JavaScript не переписывались.'
    );
  };

  // One-click fix uses the same conservative implementation as Fix All.
  const handleApplyFix = (issueId: string) => {
    const issue = visibleDiagnostics.find(d => d.id === issueId);
    if (!issue || !isSafeSourceAutoFix(issue)) {
      setFixFeedback('Это исправление не изменяет исходник автоматически: изменение CSS/JS может нарушить макет или логику. Проверь рекомендацию диагностики; конвертер применит поддерживаемые преобразования к выходным RML/RCSS/JS.');
      return;
    }
    commitSafeSourceFixes([issue]);
  };

  // Apply only fixes that can be proven safe at source level. Never run broad CSS/JS regexes.
  const handleApplyAllFixes = () => {
    setFixFeedback(null);
    commitSafeSourceFixes(getSafeSourceAutoFixes(visibleDiagnostics));
  };

  // Pick the native RML screen associated with the selected source file. This matters
  // when a folder contains several screens; editing one screen must not preview another.
  const nativeRmlFiles = files.filter(file => /\.rml$/i.test(file.path));
  const sourceRmlFile = useMemo(() => {
    if (activeFile && /\.html?$/i.test(activeFile.path)) return undefined;
    if (activeFile && /\.rml$/i.test(activeFile.path)) return activeFile;
    if (activeFile && nativeRmlFiles.length) {
      const activePath = activeFile.path.replace(/\\/g, '/');
      const activeDirectory = activePath.includes('/') ? activePath.slice(0, activePath.lastIndexOf('/')).toLowerCase() : '';
      const activeStem = activePath.replace(/\.[^/.]+$/, '').toLowerCase();
      const sameScreen = nativeRmlFiles.find(file => file.path.replace(/\\/g, '/').replace(/\.[^/.]+$/, '').toLowerCase() === activeStem);
      if (sameScreen) return sameScreen;
      const siblings = nativeRmlFiles.filter(file => {
        const normalized = file.path.replace(/\\/g, '/');
        const directory = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')).toLowerCase() : '';
        return directory === activeDirectory;
      });
      if (siblings.length === 1) return siblings[0];
    }
    return nativeRmlFiles[0];
  }, [activeFile, files]);
  const sourceRml = sourceRmlFile?.content || '';
  const sourceHtmlFile = activeFile && /\.html?$/i.test(activeFile.path)
    ? activeFile
    : files.find(file => /\.html?$/i.test(file.path));
  const sourceHtml = sourceHtmlFile?.content || (!sourceRml ? files.find(file => file.type === 'html')?.content || '' : '');

  const sourceRcss = useMemo(() => {
    const styleFiles = files.filter(file => /\.rcss$/i.test(file.path));
    if (!styleFiles.length) return '';
    if (!sourceRmlFile) return styleFiles.map(file => `/* ${file.path} */\n${file.content}`).join('\n\n');

    const normalizePath = (value: string) => {
      const parts: string[] = [];
      for (const part of value.replace(/\\/g, '/').replace(/^\/+/, '').split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') parts.pop();
        else parts.push(part.toLowerCase());
      }
      return parts.join('/');
    };
    const rmlPath = sourceRmlFile.path.replace(/\\/g, '/');
    const rmlDirectory = rmlPath.includes('/') ? rmlPath.slice(0, rmlPath.lastIndexOf('/')) : '';
    const references = Array.from(sourceRmlFile.content.matchAll(/<link\b[^>]*href\s*=\s*['\"]([^'\"]+\.rcss(?:[?#][^'\"]*)?)['\"]/gi), match => match[1].replace(/[?#].*$/, '').replace(/\\/g, '/'));
    const ordered: typeof styleFiles = [];
    const add = (candidate: typeof styleFiles[number] | undefined) => {
      if (candidate && !ordered.includes(candidate)) ordered.push(candidate);
    };
    const base = styleFiles.find(file => normalizePath(file.path) === normalizePath(`${rmlDirectory}/vacuus-base.rcss`))
      || styleFiles.find(file => file.path.split('/').pop()?.toLowerCase() === 'vacuus-base.rcss');
    add(base);
    for (const reference of references) {
      const expected = normalizePath(reference.startsWith('/') ? reference : `${rmlDirectory}/${reference}`);
      const exact = styleFiles.find(file => normalizePath(file.path) === expected)
        || styleFiles.find(file => normalizePath(file.path) === normalizePath(reference));
      const suffix = styleFiles.filter(file => normalizePath(file.path).endsWith(`/${normalizePath(reference)}`));
      const basename = reference.split('/').pop()?.toLowerCase();
      const byName = styleFiles.filter(file => file.path.split('/').pop()?.toLowerCase() === basename);
      add(exact || (suffix.length === 1 ? suffix[0] : undefined) || (byName.length === 1 ? byName[0] : undefined));
    }
    // If the RML has no explicit link, include only a same-screen RCSS companion—not stylesheets belonging to every screen in the folder.
    const stem = rmlPath.replace(/\.[^/.]+$/, '').toLowerCase();
    add(styleFiles.find(file => file.path.replace(/\\/g, '/').replace(/\.[^/.]+$/, '').toLowerCase() === stem));
    if (ordered.length === (base ? 1 : 0)) {
      const siblingStyles = styleFiles.filter(file => {
        const path = file.path.replace(/\\/g, '/');
        const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')).toLowerCase() : '';
        return dir === rmlDirectory.toLowerCase() && file !== base;
      });
      if (siblingStyles.length === 1) add(siblingStyles[0]);
    }
    return ordered.map(file => `/* ${file.path} */\n${file.content}`).join('\n\n');
  }, [files, sourceRmlFile?.path, sourceRmlFile?.content]);

  const embeddedAssets = useMemo(() => extractEmbeddedAssetsFromHtml(sourceHtml), [sourceHtml]);
  // Preserve browser source CSS for comparison, but use the selected screen's RCSS in native VaCuus emulation.
  const sourceCss = useMemo(() => [
    embeddedAssets.extractedCss,
    ...files.filter(file => (file.type === 'css' || /\.css$/i.test(file.path)) && !/\.rcss$/i.test(file.path)).map(file => file.content),
  ].filter(Boolean).join('\n'), [embeddedAssets.extractedCss, files]);
  const sourceJs = useMemo(() => {
    const jsFiles = files.filter(file => file.type === 'js' || /\.(?:m?js|cjs)$/i.test(file.path));
    if (sourceRmlFile) {
      const normalizePath = (value: string) => value.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
      const rmlPath = sourceRmlFile.path.replace(/\\/g, '/');
      const dir = rmlPath.includes('/') ? rmlPath.slice(0, rmlPath.lastIndexOf('/')) : '';
      const refs = Array.from(sourceRmlFile.content.matchAll(/<script\b[^>]*src\s*=\s*['\"]([^'\"]+\.(?:m?js|cjs)(?:[?#][^'\"]*)?)['\"]/gi), match => match[1].replace(/[?#].*$/, ''));
      const ordered: typeof jsFiles = [];
      for (const ref of refs) {
        const expected = normalizePath(`${dir}/${ref}`.replace(/^\//, ''));
        const candidates = jsFiles.filter(file => normalizePath(file.path) === expected || normalizePath(file.path) === normalizePath(ref));
        if (candidates.length === 1 && !ordered.includes(candidates[0])) ordered.push(candidates[0]);
        else if (!candidates.length) {
          const named = jsFiles.filter(file => file.path.split(/[\\/]/).pop()?.toLowerCase() === ref.split(/[\\/]/).pop()?.toLowerCase());
          if (named.length === 1 && !ordered.includes(named[0])) ordered.push(named[0]);
        }
      }
      if (!ordered.length) {
        const stem = rmlPath.replace(/\.[^/.]+$/, '').toLowerCase();
        const companion = jsFiles.find(file => file.path.replace(/\\/g, '/').replace(/\.[^/.]+$/, '').toLowerCase() === stem);
        if (companion) ordered.push(companion);
      }
      return (ordered.length ? ordered : jsFiles.filter(file => {
        const path = file.path.replace(/\\/g, '/');
        const fileDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')).toLowerCase() : '';
        return fileDir === dir.toLowerCase();
      }).slice(0, 1)).map(file => file.content).join('\n') || embeddedAssets.extractedJs;
    }
    return jsFiles.map(file => file.content).join('\n') || embeddedAssets.extractedJs;
  }, [files, sourceRmlFile?.path, sourceRmlFile?.content, embeddedAssets.extractedJs]);

  return (
    <div className="app-shell flex h-dvh min-h-0 w-full min-w-0 flex-col overflow-hidden bg-zinc-950 font-sans text-zinc-100 select-none">
      {/* 1. Header with branding, screen selector, and actions */}
      <Header
        screenName={screenName}
        setScreenName={setScreenName}
        savedProjects={savedProjects}
        currentSavedProjectId={currentSavedProjectId}
        onSelectSavedProject={handleLoadSavedProject}
        onOpenSaveProject={() => setIsSaveProjectOpen(true)}
        onConvert={handleReconvert}
        onOpenExport={() => { if (isConverting) { setFixFeedback('Подождите: проект ещё пересчитывается в фоновом потоке. Экспорт откроется после завершения.'); return; } if (conversionError) { setFixFeedback('Экспорт заблокирован: конвертация завершилась ошибкой. Исправьте источник и повторите пересчёт.'); return; } setIsExportOpen(true); }}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenKnowledge={() => setIsKnowledgeOpen(true)}
        onOpenLayoutGenerator={() => setIsLayoutGeneratorOpen(true)}
        onNewProject={handleNewProject}
        hasFiles={files.length > 0}
        isConverting={isConverting}
        metrics={workspaceMetrics}
        safeFixesAvailable={getSafeSourceAutoFixes(visibleDiagnostics).length}
        onApplyAllFixes={handleApplyAllFixes}
      />

      {fixFeedback && (
        <div role="status" className="flex items-start justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-4 py-2 text-xs text-zinc-200">
          <span className="safe-wrap min-w-0 flex-1">{fixFeedback}</span>
          <button onClick={() => setFixFeedback(null)} className="shrink-0 text-zinc-400 hover:text-white" aria-label="Закрыть сообщение">×</button>
        </div>
      )}

      {/* 2. Main Workspace Layout */}
      <div className="app-workspace flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* Leftmost Sidebar: Project Files Tree */}
        <ProjectTree
          files={files}
          activeFileId={activeFileId}
          onSelectFile={(id) => {
            setActiveFileId(id);
            setHighlightLine(null);
          }}
          onAddFile={handleAddFile}
          onDeleteFile={handleDeleteFile}
          onImportFiles={handleImportFiles}
          onSyncFolderFiles={handleSyncFolderFiles}
          onSplitHtmlFile={handleSplitHtmlFile}
        />

        {/* Center Workspace */}
        <div className="app-center-column flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* Workspace Sub-Header / View Switcher */}
          <div className="workspace-toolbar flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/90 px-3 py-2 text-xs sm:px-4">
            {/* View layout mode switch */}
            <div className="workspace-view-modes flex max-w-full flex-wrap items-center gap-1 rounded border border-zinc-800 bg-zinc-950 p-0.5">
              <button
                aria-pressed={viewMode === 'editor'}
                onClick={() => setViewMode('editor')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  viewMode === 'editor' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Редактор кода"
              >
                <Code className="w-3.5 h-3.5 text-cyan-400" />
                <span>Только код</span>
              </button>
              <button
                aria-pressed={viewMode === 'split'}
                onClick={() => setViewMode('split')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  viewMode === 'split' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Код и предпросмотр"
              >
                <Columns className="w-3.5 h-3.5 text-emerald-400" />
                <span>Код и предпросмотр</span>
              </button>
              <button
                aria-pressed={viewMode === 'preview'}
                onClick={() => setViewMode('preview')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  viewMode === 'preview' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Интерактивный предпросмотр"
              >
                <Eye className="w-3.5 h-3.5 text-blue-400" />
                <span>Только предпросмотр</span>
              </button>
            </div>

            {/* Generated file contents are available from Export ZIP. Keep this workspace focused on Active UI. */}
            <div className="workspace-status flex min-w-0 max-w-full flex-wrap items-center gap-2 rounded border border-emerald-900/80 bg-emerald-950/40 px-2.5 py-1.5 text-[11px] text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>{isConverting ? 'Пересчёт в фоновом потоке…' : conversionError ? 'Ошибка конвертации' : 'Предпросмотр интерфейса'}</span>
              <span className="text-zinc-500">·</span>
              <span className="text-zinc-400">{isConverting ? 'Интерфейс остаётся отзывчивым' : conversionError ? 'Экспорт заблокирован до исправления' : 'Файлы для UE5: экспорт ZIP'}</span>
              <button
                onClick={() => setCssPixelsAsDp(value => !value)}
                className={`ml-1 px-2 py-1 rounded border font-mono text-[10px] transition-colors ${cssPixelsAsDp ? 'border-amber-700 bg-amber-950/60 text-amber-300' : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-100'}`}
                title={cssPixelsAsDp ? 'CSS px преобразуются в VaCuus dp с учётом DPI Slate/UMG. Нажмите, чтобы вернуться к физическим пикселям.' : 'CSS px остаются физическими пикселями в экранном пространстве UE5. Включайте режим, только если размеры и медиазапросы должны учитывать DPI Slate/UMG.'}
                aria-pressed={cssPixelsAsDp}
              >px→dp {cssPixelsAsDp ? 'ON' : 'OFF'}</button>
            </div>
          </div>
          {conversionError && (
            <div role="alert" className="flex flex-wrap items-start justify-between gap-2 border-b border-rose-800/80 bg-rose-950/50 px-3 py-2 text-[11px] text-rose-200">
              <span className="safe-wrap min-w-0 flex-1">Конвертация не завершилась: {conversionError}</span>
              <button onClick={handleReconvert} className="shrink-0 rounded border border-rose-700 px-2 py-1 hover:bg-rose-900">Повторить</button>
            </div>
          )}

          {/* Main Middle Split View */}
          <div className="workspace-main-panels flex min-h-0 min-w-0 flex-1 overflow-hidden">
            {/* Left Editor: Source Code (when not preview-only) */}
            {viewMode !== 'preview' && (
              <div className="workspace-editor-pane flex min-h-0 min-w-0 flex-1 flex-col p-2">
                {!activeFile ? (
                  <div className="flex-1 rounded-lg border border-dashed border-zinc-800 bg-zinc-950/60 p-8 flex flex-col items-center justify-center text-center">
                    <FilePlus className="w-9 h-9 text-zinc-600 mb-3" />
                    <h2 className="text-sm font-semibold text-zinc-200">Исходные файлы не добавлены</h2>
                    <p className="mt-2 max-w-md text-xs leading-relaxed text-zinc-500">Создайте HTML, CSS или JavaScript. Чтобы построить RML-интерфейс из Figma, откройте «По макету» или импортируйте одиночный SVG / Figma JSON через панель файлов слева.</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <button onClick={() => setIsLayoutGeneratorOpen(true)} className="flex items-center gap-2 rounded border border-fuchsia-700 bg-fuchsia-950/60 px-3 py-2 text-xs text-fuchsia-200 hover:bg-fuchsia-900"><Sparkles className="h-3.5 w-3.5" /> Создать UI по макету</button>
                      <button onClick={() => handleAddFile('html')} className="rounded border border-cyan-800 bg-cyan-950/60 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-900">+ Создать HTML</button>
                    </div>
                  </div>
                ) : <>
                {isHtmlWithEmbedded && (
                  <div className="mb-2 p-2.5 rounded bg-cyan-950/80 border border-cyan-700/80 flex items-center justify-between text-xs gap-3 shadow-lg">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded bg-cyan-900 text-cyan-300 shrink-0">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-cyan-200 text-xs">
                          В HTML файле обнаружены встроенные CSS (&lt;style&gt;) и/или JS (&lt;script&gt;)
                        </div>
                        <div className="text-[11px] text-zinc-300">
                          Конвертер автоматически преобразует их в отдельные файлы для Unreal Engine 5 (<code className="text-cyan-300 font-mono">{screenName.toLowerCase()}.rcss</code> и <code className="text-yellow-300 font-mono">{screenName.toLowerCase()}.js</code>).
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleSplitHtmlFile(activeFile.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs shadow transition-colors shrink-0 cursor-pointer"
                      title="Выделить CSS и JS в отдельные файлы проекта"
                    >
                      <FilePlus className="w-3.5 h-3.5" />
                      <span>Разделить на отдельные файлы</span>
                    </button>
                  </div>
                )}
                {activeFile.contentEncoding === 'base64' ? (
                  <div className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950/80 p-6 flex items-start gap-4 overflow-auto">
                    <div className="p-3 rounded-lg bg-cyan-950/70 border border-cyan-900 text-cyan-300">
                      <FileType className="w-6 h-6" />
                    </div>
                    <div className="max-w-2xl space-y-2">
                      <h2 className="text-sm font-semibold text-zinc-100">Ресурс, не исходный код</h2>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        <span className="text-zinc-200">{activeFile.path}</span> импортирован как бинарный ресурс. Редактор сохраняет его байты и не показывает Base64 как исходный код.
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded border border-zinc-800 bg-zinc-900 p-3">
                          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Тип MIME</div>
                          <div className="mt-1 text-cyan-200 font-mono">{activeFile.mimeType || 'application/octet-stream'}</div>
                        </div>
                        <div className="rounded border border-zinc-800 bg-zinc-900 p-3">
                          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Папка экспорта UE5</div>
                          <div className="mt-1 text-emerald-300 font-mono">{/\.(ttf|otf|woff2?)$/i.test(activeFile.path) ? 'Content/DevUI/Fonts/' : 'Content/DevUI/Assets/'}</div>
                        </div>
                      </div>
                      <p className="text-[11px] text-zinc-500">Этот ресурс будет включён в ZIP-экспорт. Совпадающие пути HTML/RCSS автоматически нормализуются, если это возможно.</p>
                    </div>
                  </div>
                ) : (
                  <CodeEditor
                    title={`Исходник: ${activeFile.path}`}
                    badge={activeFile.type.toUpperCase()}
                    value={activeFile.content}
                    onChange={handleUpdateFileContent}
                    language={activeFile.type === 'html' || /\.(rml|svg|xml)$/i.test(activeFile.path) ? 'html' : activeFile.type === 'css' || /\.rcss$/i.test(activeFile.path) ? 'css' : 'js'}
                    highlightLine={highlightLine}
                  />
                )}
                </>}
              </div>
            )}

            {/* Right Pane: Active UI preview */}
            {viewMode === 'split' && (
              <div className="workspace-preview-pane flex min-h-0 min-w-0 flex-1 flex-col border-l border-zinc-800/80 p-2">
                <PreviewPanel
                  sourceHtml={sourceHtml}
                  sourceHtmlPath={sourceHtmlFile?.path || 'index.html'}
                  sourceFiles={files}
                  sourceRml={sourceRml}
                  sourceRcss={sourceRcss}
                  sourceCss={sourceCss}
                  sourceJs={sourceJs}
                  convertedRml={convertedResult.rml}
                  convertedRcss={convertedResult.rcss}
                  convertedJs={convertedResult.js}
                  vacuusBaseRcss={convertedResult.vacuusBaseRcss}
                  conversionDiagnostics={visibleDiagnostics.slice(0, 24).map(issue => `${issue.severity.toUpperCase()} ${issue.file}:${issue.line} ${issue.message} ${issue.recommendedAction}`).join('\n')}
                  previewAssetUrls={previewAssetUrls}
                  onApplyVisualEdit={handleApplyVisualEdit}
                  onUndoVisualEdit={handleUndoVisualEdit}
                  onRedoVisualEdit={handleRedoVisualEdit}
                  canUndoVisualEdit={canUndoVisualEdit}
                  canRedoVisualEdit={canRedoVisualEdit}
                />
              </div>
            )}

            {/* Code workspace retains source editing; generated files are viewed during export. */}
            {viewMode === 'editor' && (
              <div className="workspace-preview-pane flex min-h-0 min-w-0 flex-1 flex-col border-l border-zinc-800/80 p-2">
                <PreviewPanel
                  sourceHtml={sourceHtml}
                  sourceHtmlPath={sourceHtmlFile?.path || 'index.html'}
                  sourceFiles={files}
                  sourceRml={sourceRml}
                  sourceRcss={sourceRcss}
                  sourceCss={sourceCss}
                  sourceJs={sourceJs}
                  convertedRml={convertedResult.rml}
                  convertedRcss={convertedResult.rcss}
                  convertedJs={convertedResult.js}
                  vacuusBaseRcss={convertedResult.vacuusBaseRcss}
                  conversionDiagnostics={visibleDiagnostics.slice(0, 24).map(issue => `${issue.severity.toUpperCase()} ${issue.file}:${issue.line} ${issue.message} ${issue.recommendedAction}`).join('\n')}
                  previewAssetUrls={previewAssetUrls}
                  onApplyVisualEdit={handleApplyVisualEdit}
                  onUndoVisualEdit={handleUndoVisualEdit}
                  onRedoVisualEdit={handleRedoVisualEdit}
                  canUndoVisualEdit={canUndoVisualEdit}
                  canRedoVisualEdit={canRedoVisualEdit}
                />
              </div>
            )}

            {/* Full Preview View (When in 'preview' mode) */}
            {viewMode === 'preview' && (
              <div className="workspace-preview-pane flex min-h-0 min-w-0 flex-1 flex-col p-2">
                <PreviewPanel
                  sourceHtml={sourceHtml}
                  sourceHtmlPath={sourceHtmlFile?.path || 'index.html'}
                  sourceFiles={files}
                  sourceRml={sourceRml}
                  sourceRcss={sourceRcss}
                  sourceCss={sourceCss}
                  sourceJs={sourceJs}
                  convertedRml={convertedResult.rml}
                  convertedRcss={convertedResult.rcss}
                  convertedJs={convertedResult.js}
                  vacuusBaseRcss={convertedResult.vacuusBaseRcss}
                  conversionDiagnostics={visibleDiagnostics.slice(0, 24).map(issue => `${issue.severity.toUpperCase()} ${issue.file}:${issue.line} ${issue.message} ${issue.recommendedAction}`).join('\n')}
                  previewAssetUrls={previewAssetUrls}
                  onApplyVisualEdit={handleApplyVisualEdit}
                  onUndoVisualEdit={handleUndoVisualEdit}
                  onRedoVisualEdit={handleRedoVisualEdit}
                  canUndoVisualEdit={canUndoVisualEdit}
                  canRedoVisualEdit={canRedoVisualEdit}
                />
              </div>
            )}
          </div>
        </div>

        {/* Rightmost Sidebar: Compatibility Report & Diagnostics */}
        <aside className={`diagnostics-sidebar ${isDiagnosticsCollapsed ? 'is-collapsed w-10' : 'w-80'} shrink-0 bg-zinc-950 border-l border-zinc-800 flex flex-col h-full transition-[width] duration-150`}>
          {isDiagnosticsCollapsed ? (
            <button onClick={() => setIsDiagnosticsCollapsed(false)} className="flex h-full w-full flex-col items-center gap-3 py-3 text-zinc-400 hover:bg-zinc-900 hover:text-cyan-300" title="Развернуть панель диагностики совместимости" aria-label="Развернуть панель диагностики">
              <PanelRightOpen className="h-4 w-4" />
              <span className="text-[10px] font-semibold [writing-mode:vertical-rl] rotate-180">Диагностика</span>
              <span className="text-[10px] font-mono">{convertedResult.diagnostics.length}</span>
            </button>
          ) : (
            <DiagnosticsPanel
              diagnostics={visibleDiagnostics}
              onApplyFix={handleApplyFix}
              onApplyAllFixes={handleApplyAllFixes}
              onNavigateToLine={handleNavigateToLine}
              onCollapse={() => setIsDiagnosticsCollapsed(true)}
            />
          )}
        </aside>
      </div>

      <LayoutGeneratorModal
        isOpen={isLayoutGeneratorOpen}
        baseRcss={convertedResult.vacuusBaseRcss}
        initialImport={pendingLayoutImport}
        onClose={() => setIsLayoutGeneratorOpen(false)}
        onApply={handleApplyGeneratedLayout}
      />

      <SaveProjectModal
        isOpen={isSaveProjectOpen}
        initialName={savedProjects.find(project => project.id === currentSavedProjectId)?.name ?? screenName}
        isUpdating={Boolean(currentSavedProjectId)}
        onClose={() => setIsSaveProjectOpen(false)}
        onSave={handleSaveProject}
      />

      {/* 3. Окно экспорта */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        result={convertedResult}
        screenName={screenName}
        projectFiles={files}
        activeRmlPath={sourceRmlFile?.path}
      />

      {/* 4. Unreal Engine Guide Modal */}
      <UnrealGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        screenName={screenName}
      />

      {/* 5. Compatibility Knowledge Base Modal */}
      <KnowledgeBaseModal
        isOpen={isKnowledgeOpen}
        onClose={() => setIsKnowledgeOpen(false)}
      />
    </div>
  );
}
