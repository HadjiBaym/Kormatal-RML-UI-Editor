import React, { useState } from 'react';
import {
  Download,
  X,
  FileCode,
  FolderArchive,
  CheckCircle2,
  Copy,
  Check,
  FileText,
  Code,
  Folder,
  Layers,
  Sparkles,
  Zap,
  Type,
  AlertCircle,
} from 'lucide-react';
import JSZip from 'jszip';
import type { ConvertedProjectResult, ExternalImageAsset, ProjectFile, SvgRasterAsset } from '../core/types.ts';
import { BUNDLED_UI_FONT_FILES, normalizeNativeRcssFontFamilies } from '../core/ui-fonts.ts';
import { fetchResourceWithTimeout, promiseWithTimeout } from '../core/export-resources.ts';
import {
  generateUeCppHeader,
  generateUeCppSource,
  generateFontsReadme,
  generateAssetsReadme,
} from '../core/ue-integration-generator.ts';

async function blobToPngFromImage(image: HTMLImageElement, maxDimension = 2048): Promise<Blob> {
  const naturalWidth = image.naturalWidth || image.width || 24;
  const naturalHeight = image.naturalHeight || image.height || 24;
  const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Не удалось создать Canvas для преобразования изображения в PNG.');
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Браузер не смог сформировать PNG-ресурс для VaCuus.');
  return blob;
}

async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        image.onload = null; image.onerror = null;
        error ? reject(error) : resolve();
      };
      const timer = window.setTimeout(() => finish(new Error('Тайм-аут декодирования изображения (15 с). Проверьте SVG/изображение и повторите экспорт.')), 15_000);
      image.onload = () => finish();
      image.onerror = () => finish(new Error('Не удалось декодировать изображение для экспорта.'));
      image.src = objectUrl;
    });
    return image;
  } finally {
    // Revoke after decode; the decoded image remains drawable.
    URL.revokeObjectURL(objectUrl);
  }
}

async function rasterizeSvgAsset(asset: SvgRasterAsset): Promise<Blob> {
  const svgBlob = new Blob([asset.sourceSvg], { type: 'image/svg+xml;charset=utf-8' });
  const image = await loadImageFromBlob(svgBlob);
  // SVGs usually have no width/height attributes; use the dimensions inferred from viewBox.
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error(`SVG ${asset.filename} не содержит читаемых размеров и не может быть преобразован в PNG.`);
  }
  return blobToPngFromImage(image, 512);
}

async function fetchAndRasterizeImage(asset: ExternalImageAsset): Promise<Blob> {
  let response: Response;
  try {
    response = await fetchResourceWithTimeout(asset.url, { mode: 'cors', credentials: 'omit' }, 15_000, `внешнего изображения ${asset.filename}`);
  } catch (error) {
    if (error instanceof Error && /Тайм-аут загрузки/.test(error.message)) throw error;
    throw new Error(`Не удалось получить внешний фон ${asset.url}. Скачайте изображение вручную в Content/DevUI/Assets/${asset.filename} и повторите экспорт без блокировки CORS.`);
  }
  if (!response.ok) {
    throw new Error(`Внешнее изображение вернуло HTTP ${response.status}: ${asset.url}`);
  }
  const sourceBlob = await promiseWithTimeout(
    response.blob(), 15_000, `тела изображения ${asset.filename}`,
    () => { void response.body?.cancel().catch(() => {}); },
  );
  if (!sourceBlob.type.startsWith('image/')) {
    throw new Error(`Ресурс ${asset.url} не вернул image/* и не может использоваться как фон.`);
  }
  const image = await loadImageFromBlob(sourceBlob);
  return blobToPngFromImage(image, 2048);
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: ConvertedProjectResult;
  screenName: string;
  projectFiles: ProjectFile[];
  activeRmlPath?: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  result,
  screenName,
  projectFiles,
  activeRmlPath,
}) => {
  const [selectedFile, setSelectedFile] = useState<string>('rml');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string>('');
  const [exportStage, setExportStage] = useState<string>('');
  const [exportProgress, setExportProgress] = useState<number>(0);

  if (!isOpen) return null;

  const cppHeader = result.cppHeader || generateUeCppHeader(screenName);
  const cppSource = result.cppSource || generateUeCppSource(screenName);
  const fontsReadme = generateFontsReadme();
  const assetsReadme = generateAssetsReadme();
  const nativeRmlMode = projectFiles.some(file => /\.rml$/i.test(file.path));
  const sourceRmlFile = projectFiles.find(file => file.path === activeRmlPath && /\.rml$/i.test(file.path))
    || projectFiles.find(file => /\.rml$/i.test(file.path));
  const sourceRmlDir = sourceRmlFile?.path.replace(/\\/g, '/').split('/').slice(0, -1).join('/') || '';
  const pathForDevUi = (rawPath: string) => rawPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^Content\/DevUI\//i, '');
  const sourceCompanion = (extension: 'rcss' | 'js') => {
    if (!nativeRmlMode || !sourceRmlFile) return undefined;
    const referencePattern = extension === 'rcss'
      ? /<link\b[^>]*href\s*=\s*['\"]([^'\"]+\.rcss(?:[?#][^'\"]*)?)['\"]/gi
      : /<script\b[^>]*src\s*=\s*['\"]([^'\"]+\.(?:m?js|cjs)(?:[?#][^'\"]*)?)['\"]/gi;
    const references = Array.from(sourceRmlFile.content.matchAll(referencePattern), match => match[1].replace(/[?#].*$/, '').replace(/\\/g, '/'));
    for (const reference of references) {
      const joined = pathForDevUi(`${sourceRmlDir}/${reference}`).replace(/\/\.\//g, '/');
      const normalizedJoined = joined.split('/').reduce<string[]>((parts, part) => {
        if (!part || part === '.') return parts;
        if (part === '..') parts.pop(); else parts.push(part);
        return parts;
      }, []).join('/').toLowerCase();
      const normalizedReference = pathForDevUi(reference).toLowerCase();
      const matching = projectFiles.find(file => {
        if (!new RegExp(`\\.${extension === 'rcss' ? 'rcss' : '(?:m?js|cjs)'}$`, 'i').test(file.path)) return false;
        const candidate = pathForDevUi(file.path).toLowerCase();
        return candidate === normalizedJoined || candidate === normalizedReference || candidate.endsWith(`/${normalizedReference}`);
      });
      if (matching) return matching;
    }
    const stem = sourceRmlFile.path.replace(/\.[^/.]+$/, '').toLowerCase();
    const sameStem = projectFiles.find(file => file.path.replace(/\\/g, '/').replace(/\.[^/.]+$/, '').toLowerCase() === stem && (extension === 'rcss' ? /\.rcss$/i.test(file.path) : /\.(?:m?js|cjs)$/i.test(file.path)));
    if (sameStem) return sameStem;
    const siblings = projectFiles.filter(file => {
      const path = file.path.replace(/\\/g, '/');
      const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      return directory.toLowerCase() === sourceRmlDir.toLowerCase()
        && (extension === 'rcss' ? /\.rcss$/i.test(file.path) : /\.(?:m?js|cjs)$/i.test(file.path));
    });
    return siblings.length === 1 ? siblings[0] : undefined;
  };
  const sourceRcssFile = sourceCompanion('rcss');
  const sourceJsFile = sourceCompanion('js');
  const sourceBaseRcssFile = projectFiles.find(file => file.path.split(/[\\/]/).pop()?.toLowerCase() === 'vacuus-base.rcss');
  const makeDevUiPath = (filePath: string, fallbackPath: string) => `Content/DevUI/${pathForDevUi(filePath || fallbackPath)}`;
  const readinessPresentation = result.readiness.status === 'blocked'
    ? {
        icon: <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />,
        className: 'border-rose-900/70 bg-rose-950/30 text-rose-200',
        title: 'Конвертация неполная',
        detail: `${result.readiness.blockingIssues} блокирующих ошибок/ручных исправлений; предупреждений к проверке: ${result.readiness.reviewIssues}.`,
      }
    : result.readiness.status === 'needs-review'
      ? {
          icon: <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />,
          className: 'border-amber-900/70 bg-amber-950/30 text-amber-200',
          title: 'Нужна проверка совместимости',
          detail: `${result.readiness.reviewIssues} предупреждений/непроверенных возможностей.`,
        }
      : {
          icon: <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />,
          className: 'border-emerald-900/70 bg-emerald-950/30 text-emerald-200',
          title: 'Статические проверки чистые',
          detail: result.readiness.status === 'not-run'
            ? 'Конвертация ещё не запускалась.'
            : 'Известных несовместимостей не найдено; совпадение необходимо проверить в UE5 с VaCuus.',
        };

  const filesMap: Record<string, { filename: string; path: string; content: string; lang: string; category: string }> = {
    rml: {
      filename: nativeRmlMode && sourceRmlFile ? sourceRmlFile.path.split(/[\\/]/).pop() || `${screenName.toLowerCase()}.rml` : `${screenName.toLowerCase()}.rml`,
      path: nativeRmlMode && sourceRmlFile ? makeDevUiPath(sourceRmlFile.path, `${screenName}/${screenName.toLowerCase()}.rml`) : `Content/DevUI/${screenName}/${screenName.toLowerCase()}.rml`,
      content: nativeRmlMode && sourceRmlFile ? sourceRmlFile.content : result.rml,
      lang: 'xml',
      category: 'Ресурс активного экрана',
    },
    rcss: {
      filename: nativeRmlMode && sourceRcssFile ? sourceRcssFile.path.split(/[\\/]/).pop() || `${screenName.toLowerCase()}.rcss` : `${screenName.toLowerCase()}.rcss`,
      path: nativeRmlMode && sourceRcssFile ? makeDevUiPath(sourceRcssFile.path, `${screenName}/${screenName.toLowerCase()}.rcss`) : `Content/DevUI/${screenName}/${screenName.toLowerCase()}.rcss`,
      content: nativeRmlMode && sourceRcssFile ? sourceRcssFile.content : result.rcss,
      lang: 'css',
      category: 'Ресурс активного экрана',
    },
    js: {
      filename: nativeRmlMode && sourceJsFile ? sourceJsFile.path.split(/[\\/]/).pop() || `${screenName.toLowerCase()}.js` : `${screenName.toLowerCase()}.js`,
      path: nativeRmlMode && sourceJsFile ? makeDevUiPath(sourceJsFile.path, `${screenName}/${screenName.toLowerCase()}.js`) : `Content/DevUI/${screenName}/${screenName.toLowerCase()}.js`,
      content: nativeRmlMode && sourceJsFile ? sourceJsFile.content : result.js,
      lang: 'javascript',
      category: 'Ресурс активного экрана',
    },
    screenBaseRcss: {
      filename: nativeRmlMode && sourceBaseRcssFile ? sourceBaseRcssFile.path.split(/[\\/]/).pop() || 'vacuus-base.rcss' : 'vacuus-base.rcss',
      path: nativeRmlMode && sourceBaseRcssFile ? makeDevUiPath(sourceBaseRcssFile.path, `${screenName}/vacuus-base.rcss`) : `Content/DevUI/${screenName}/vacuus-base.rcss`,
      content: nativeRmlMode && sourceBaseRcssFile ? sourceBaseRcssFile.content : result.vacuusBaseRcss,
      lang: 'css',
      category: 'Ресурс активного экрана',
    },
    cppHeader: {
      filename: `${screenName}View.h`,
      path: `Content/DevUI/${screenName}/${screenName}View.h`,
      content: cppHeader,
      lang: 'cpp',
      category: 'Unreal Engine 5 C++',
    },
    cppSource: {
      filename: `${screenName}View.cpp`,
      path: `Content/DevUI/${screenName}/${screenName}View.cpp`,
      content: cppSource,
      lang: 'cpp',
      category: 'Unreal Engine 5 C++',
    },
    baseRcss: {
      filename: nativeRmlMode && sourceBaseRcssFile ? sourceBaseRcssFile.path.split(/[\\/]/).pop() || 'vacuus-base.rcss' : 'vacuus-base.rcss',
      path: nativeRmlMode && sourceBaseRcssFile ? makeDevUiPath(sourceBaseRcssFile.path, 'vacuus-base.rcss') : 'Content/DevUI/vacuus-base.rcss',
      content: nativeRmlMode && sourceBaseRcssFile ? sourceBaseRcssFile.content : result.vacuusBaseRcss,
      lang: 'css',
      category: 'Общий Resets',
    },
    fontsReadme: {
      filename: 'README_FONTS.txt',
      path: 'Content/DevUI/Fonts/README_FONTS.txt',
      content: fontsReadme,
      lang: 'markdown',
      category: 'Описание каталога',
    },
    assetsReadme: {
      filename: 'README_ASSETS.txt',
      path: 'Content/DevUI/Assets/README_ASSETS.txt',
      content: assetsReadme,
      lang: 'markdown',
      category: 'Описание каталога',
    },
    manifest: {
      filename: 'project-manifest.json',
      path: 'Content/DevUI/project-manifest.json',
      content: result.projectManifestJson,
      lang: 'json',
      category: 'Манифест и конфигурация',
    },
    readme: {
      filename: 'README.md',
      path: 'Content/DevUI/README.md',
      content: result.readmeMd,
      lang: 'markdown',
      category: 'Руководство по интеграции',
    },
    report: {
      filename: 'conversion-report.md',
      path: 'Content/DevUI/conversion-report.md',
      content: result.conversionReportMd,
      lang: 'markdown',
      category: 'Аудит и диагностика',
    },
    compatibility: {
      filename: 'compatibility.json',
      path: 'Content/DevUI/compatibility.json',
      content: result.compatibilityJson,
      lang: 'json',
      category: 'Аудит и диагностика',
    },
  };

  const currentFile = filesMap[selectedFile] || filesMap.rml;

  const handleDownloadZip = async () => {
    setIsExporting(true);
    setExportSuccess(false);
    setExportError('');
    setExportStage('Подготовка ресурсов…');
    setExportProgress(0);
    try {
      const zip = new JSZip();

      // Convert inline/imported SVGs and remote CSS image URLs to PNG. Each step is bounded
      // and reports progress so a slow external server cannot leave the UI spinning forever.
      const rasterAssets: Array<{ filename: string; blob: Blob }> = [];
      const inlineSvgs = result.svgAssets || [];
      const projectSvgs = (result.projectAssets || []).filter(asset => asset.sourceKind === 'svg' && asset.contentText);
      const remoteImages = result.externalImageAssets || [];
      const rasterTotal = inlineSvgs.length + projectSvgs.length + remoteImages.length;
      let rasterDone = 0;
      const updateRasterProgress = (label: string) => {
        rasterDone++;
        setExportStage(`${label} (${rasterDone}/${rasterTotal})`);
        setExportProgress(rasterTotal ? Math.round(5 + rasterDone / rasterTotal * 30) : 5);
      };
      for (const asset of inlineSvgs) {
        setExportStage(`Преобразование SVG: ${asset.filename}`);
        rasterAssets.push({ filename: asset.filename, blob: await rasterizeSvgAsset(asset) });
        updateRasterProgress(`SVG готов`);
      }
      for (const asset of projectSvgs) {
        setExportStage(`Преобразование SVG: ${asset.filename}`);
        rasterAssets.push({
          filename: asset.filename,
          blob: await rasterizeSvgAsset({ filename: asset.filename, sourceSvg: asset.contentText!, width: 64, height: 64 }),
        });
        updateRasterProgress('Ресурс SVG готов');
      }
      for (const asset of remoteImages) {
        setExportStage(`Загрузка внешнего изображения: ${asset.filename} (лимит 15 с)`);
        rasterAssets.push({ filename: asset.filename, blob: await fetchAndRasterizeImage(asset) });
        updateRasterProgress('Внешнее изображение готово');
      }

      // Root Content/DevUI folder structure
      const devUiFolder = zip.folder('Content')?.folder('DevUI');
      if (devUiFolder) {
        // Общий files
        devUiFolder.file('vacuus-base.rcss', result.vacuusBaseRcss);
        devUiFolder.file('README.md', result.readmeMd);
        devUiFolder.file('conversion-report.md', result.conversionReportMd);
        devUiFolder.file('compatibility.json', result.compatibilityJson);
        devUiFolder.file('project-manifest.json', result.projectManifestJson);

        // Ship only the three approved font families in every export package.
        // The native runtime resolves @font-face src relative to the DevUI VFS root.
        const fontsFolder = devUiFolder.folder('Fonts');
        if (fontsFolder) {
          fontsFolder.file('README_FONTS.txt', fontsReadme);
          let bundledResourceIndex = 0;
          const bundledResourceTotal = BUNDLED_UI_FONT_FILES.length + 3;
          for (const font of BUNDLED_UI_FONT_FILES) {
            setExportStage(`Добавление шрифта ${font.filename}`);
            const response = await fetchResourceWithTimeout(`/fonts/${font.filename}`, { cache: 'no-store' }, 10_000, `шрифта ${font.filename}`);
            if (!response.ok) throw new Error(`Не удалось включить шрифт ${font.filename} в ZIP (HTTP ${response.status}).`);
            fontsFolder.file(font.filename, await promiseWithTimeout(response.arrayBuffer(), 10_000, `данных шрифта ${font.filename}`, () => { void response.body?.cancel().catch(() => {}); }));
            bundledResourceIndex++; setExportProgress(Math.round(35 + bundledResourceIndex / bundledResourceTotal * 25));
          }
          for (const license of ['LICENSE-Onest-OFL.txt', 'LICENSE-Tektur-OFL.txt', 'LICENSE-JetBrains-Mono-OFL.txt']) {
            setExportStage(`Добавление лицензии ${license}`);
            const response = await fetchResourceWithTimeout(`/fonts/${license}`, { cache: 'no-store' }, 10_000, `лицензии ${license}`);
            if (!response.ok) throw new Error(`Не удалось включить лицензию ${license} в ZIP (HTTP ${response.status}).`);
            fontsFolder.file(license, await promiseWithTimeout(response.text(), 10_000, `текста лицензии ${license}`, () => { void response.body?.cancel().catch(() => {}); }));
            bundledResourceIndex++; setExportProgress(Math.round(35 + bundledResourceIndex / bundledResourceTotal * 25));
          }
        }

        const assetsFolder = devUiFolder.folder('Assets');
        if (assetsFolder) {
          assetsFolder.file('README_ASSETS.txt', assetsReadme);
          for (const asset of result.projectAssets || []) {
            if (asset.directory === 'Assets' && asset.sourceKind === 'binary' && asset.contentBase64) {
              assetsFolder.file(asset.filename, asset.contentBase64, { base64: true });
            }
          }
          for (const asset of rasterAssets) {
            assetsFolder.file(asset.filename, asset.blob);
          }
        }

        // Native RML projects must be exported as their original source tree. Running
        // them through HTML→RML again can destroy valid RML/RCSS, so copy text and
        // binary resources to matching relative paths without rewriting content.
        if (nativeRmlMode) {
          for (const file of projectFiles) {
            let relativePath = pathForDevUi(file.path);
            const segments = relativePath.split('/').filter(Boolean);
            if (!relativePath || segments.some(segment => segment === '..' || segment === '.')) continue;
            if (/\.(?:ttf|otf|woff2?)$/i.test(relativePath) && !/(?:onest|tektur|jetbrains[ _-]?mono)/i.test(relativePath.split('/').pop() || '')) continue;
            if (file.contentEncoding === 'base64') devUiFolder.file(relativePath, file.content, { base64: true });
            else devUiFolder.file(relativePath, /\.rcss$/i.test(relativePath) ? normalizeNativeRcssFontFamilies(file.content) : file.content);
          }
        }

        // Screen folder with generated output for converted browser projects.
        const screenFolder = devUiFolder.folder(screenName);
        if (screenFolder) {
          if (!nativeRmlMode) {
            screenFolder.file(`${screenName.toLowerCase()}.rml`, result.rml);
            screenFolder.file(`${screenName.toLowerCase()}.rcss`, result.rcss);
            screenFolder.file(`${screenName.toLowerCase()}.js`, result.js);
            screenFolder.file('vacuus-base.rcss', result.vacuusBaseRcss);
          }
          // Keep the UE5 C++ integration files available in either export mode.
          screenFolder.file(`${screenName}View.h`, cppHeader);
          screenFolder.file(`${screenName}View.cpp`, cppSource);
        }
      }

      setExportStage('Упаковка ZIP…');
      const content = await zip.generateAsync({ type: 'blob' }, metadata => {
        setExportStage(`Упаковка ZIP… ${Math.round(metadata.percent)}%`);
        setExportProgress(Math.round(60 + metadata.percent * 0.4));
      });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `VaCuus_ActiveUI_${screenName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setExportProgress(100);
      setExportStage('Архив готов');
      setExportSuccess(true);
    } catch (err) {
      console.error('Failed to generate ZIP archive', err);
      setExportError(err instanceof Error ? err.message : 'Не удалось собрать ZIP-архив. Проверьте ресурсы и повторите попытку.');
      setExportStage('Экспорт остановлен');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed', e);
    }
  };

  const handleDownloadSingleFile = () => {
    const blob = new Blob([currentFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = currentFile.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="export-modal-title" className="ui-modal-panel flex w-full max-w-5xl min-w-0 max-h-[92dvh] flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-3 py-3 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="shrink-0 rounded border border-emerald-700/80 bg-emerald-950 p-1.5 border border-emerald-700/80 text-emerald-400">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 id="export-modal-title" className="safe-wrap text-sm font-bold text-zinc-100">Экспорт пакета для Unreal Engine 5</h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Пакет UI VaCuus
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Пакет Content/DevUI/ с RML, RCSS, ресурсами и C++ шаблоном
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
            aria-label="Закрыть окно экспорта"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!nativeRmlMode && (
          <div className={`flex items-start gap-2 border-b px-4 py-2.5 text-xs ${readinessPresentation.className}`} role="status">
            {readinessPresentation.icon}
            <div>
              <strong>{readinessPresentation.title}.</strong> {readinessPresentation.detail}
              <span className="ml-1 text-zinc-400">Экспорт ZIP не равен проверке визуального и игрового поведения в нативном runtime.</span>
            </div>
          </div>
        )}

        {/* Info Strip: RML UI Structure & Text Guarantee Banner */}
        <div className="flex flex-col items-start justify-between gap-2 border-b border-emerald-900/50 bg-emerald-950/40 px-3 py-2.5 text-xs text-emerald-200 sm:flex-row sm:items-center sm:px-5">
          <div className="flex items-start sm:items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <strong>Шрифты для UE5:</strong> по умолчанию включены <code>Onest</code>, <code>Tektur</code> и <code>JetBrains Mono</code> с лицензиями OFL; импортированные TTF/OTF/WOFF и корректные <code>@font-face</code> тоже пакуются в <code>Content/DevUI/Fonts/</code>. Пути VaCuus указываются от корня DevUI, например <code>Fonts/Onest-Regular.ttf</code>. Изображения включаются из списка ресурсов проекта.
            </span>
          </div>
          <span className="font-mono text-[11px] text-emerald-400/80 shrink-0">
            UE 5.0–5.5: активный UI
          </span>
        </div>

        {/* Modal Body */}
        <div className="export-modal-layout ui-modal-body flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {/* Left: Package File Tree */}
          <div className="export-file-tree w-64 shrink-0 overflow-y-auto border-r border-zinc-800 bg-zinc-950 p-3 sm:w-72 lg:w-80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                Структура Content/DevUI
              </span>
              <span className="text-[10px] text-cyan-400 font-mono">Файлы интерфейса и ресурсы</span>
            </div>

            <div className="space-y-1 text-xs">
              <div className="font-mono text-zinc-400 font-semibold text-[11px] mb-1 flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-cyan-400" />
                <span>Content/DevUI/ {nativeRmlMode ? "(исходные RML/RCSS)" : "(контент интерфейса)"}</span>
              </div>

              {/* vacuus-base.rcss global */}
              <button
                onClick={() => setSelectedFile('baseRcss')}
                className={`w-full text-left pl-4 py-1.5 rounded flex items-center gap-2 transition-colors ${
                  selectedFile === 'baseRcss' ? 'bg-cyan-950 text-cyan-200 border border-cyan-800 font-medium' : 'text-zinc-400 hover:bg-zinc-900'
                }`}
              >
                <Code className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="truncate">vacuus-base.rcss</span>
                <span className="ml-auto text-[10px] px-1 rounded bg-blue-950 text-blue-300 border border-blue-800/60">Общий</span>
              </button>

              {/* Screen folder */}
              <div className="pl-3 font-mono text-emerald-400 text-[11px] mt-2 mb-1 flex items-center gap-1.5 font-medium">
                <Folder className="w-3.5 h-3.5 text-emerald-400" />
                <span>{screenName}/ (Текущий экран)</span>
              </div>

              <button
                onClick={() => setSelectedFile('rml')}
                className={`w-full text-left pl-7 py-1.5 rounded flex items-center gap-2 transition-colors ${
                  selectedFile === 'rml' ? 'bg-cyan-950 text-cyan-200 border border-cyan-800 font-medium' : 'text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                <FileCode className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                <span className="truncate">{screenName.toLowerCase()}.rml</span>
                <span className="ml-auto text-[9px] px-1 rounded bg-orange-950 text-orange-300 border border-orange-800">RML</span>
              </button>

              <button
                onClick={() => setSelectedFile('rcss')}
                className={`w-full text-left pl-7 py-1.5 rounded flex items-center gap-2 transition-colors ${
                  selectedFile === 'rcss' ? 'bg-cyan-950 text-cyan-200 border border-cyan-800 font-medium' : 'text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                <Code className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="truncate">{screenName.toLowerCase()}.rcss</span>
                <span className="ml-auto text-[9px] px-1 rounded bg-blue-950 text-blue-300 border border-blue-800">RCSS</span>
              </button>

              <button
                onClick={() => setSelectedFile('js')}
                className={`w-full text-left pl-7 py-1.5 rounded flex items-center gap-2 transition-colors ${
                  selectedFile === 'js' ? 'bg-cyan-950 text-cyan-200 border border-cyan-800 font-medium' : 'text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                <FileCode className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                <span className="truncate">{screenName.toLowerCase()}.js</span>
                <span className="ml-auto text-[9px] px-1 rounded bg-yellow-950 text-yellow-300 border border-yellow-800">JS</span>
              </button>

              <button
                onClick={() => setSelectedFile('screenBaseRcss')}
                className={`w-full text-left pl-7 py-1.5 rounded flex items-center gap-2 transition-colors ${
                  selectedFile === 'screenBaseRcss' ? 'bg-cyan-950 text-cyan-200 border border-cyan-800 font-medium' : 'text-zinc-400 hover:bg-zinc-900'
                }`}
              >
                <Code className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="truncate">vacuus-base.rcss</span>
                <span className="ml-auto text-[9px] px-1 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">Локальный</span>
              </button>

              {/* Unreal C++ Source files */}
              <div className="pl-3 font-mono text-purple-400 text-[11px] mt-2.5 mb-1 flex items-center gap-1.5 font-medium">
                <Zap className="w-3.5 h-3.5 text-purple-400" />
                <span>C++ Unreal Engine 5 (активный интерфейс)</span>
              </div>

              <button
                onClick={() => setSelectedFile('cppHeader')}
                className={`w-full text-left pl-7 py-1.5 rounded flex items-center gap-2 transition-colors ${
                  selectedFile === 'cppHeader' ? 'bg-cyan-950 text-cyan-200 border border-cyan-800 font-medium' : 'text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                <Code className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="truncate">{screenName}View.h</span>
                <span className="ml-auto text-[9px] px-1 rounded bg-purple-950 text-purple-300 border border-purple-800">C++</span>
              </button>

              <button
                onClick={() => setSelectedFile('cppSource')}
                className={`w-full text-left pl-7 py-1.5 rounded flex items-center gap-2 transition-colors ${
                  selectedFile === 'cppSource' ? 'bg-cyan-950 text-cyan-200 border border-cyan-800 font-medium' : 'text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                <Code className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="truncate">{screenName}View.cpp</span>
                <span className="ml-auto text-[9px] px-1 rounded bg-purple-950 text-purple-300 border border-purple-800">C++</span>
              </button>

              {/* Font documentation; no binary fonts are bundled */}
              <div className="pl-3 font-mono text-amber-400 text-[11px] mt-2.5 mb-1 flex items-center gap-1.5 font-medium">
                <Type className="w-3.5 h-3.5 text-amber-400" />
                <span>Fonts/ (3 семейства; веса 400–800)</span>
              </div>

              <div className="pl-7 py-1.5 text-[11px] text-zinc-300 flex items-center gap-2">
                <Type className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Onest — по умолчанию (Regular 400, Medium, SemiBold, Bold, ExtraBold)</span>
              </div>
              <div className="pl-7 py-1.5 text-[11px] text-zinc-300 flex items-center gap-2">
                <Type className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Tektur — Regular, Medium, SemiBold, Bold, ExtraBold</span>
              </div>
              <div className="pl-7 py-1.5 text-[11px] text-zinc-300 flex items-center gap-2">
                <Type className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>JetBrains Mono — Regular, Medium, SemiBold, Bold, ExtraBold</span>
              </div>

              <button
                onClick={() => setSelectedFile('fontsReadme')}
                className={`w-full text-left pl-7 py-1.5 rounded flex items-center gap-2 transition-colors ${
                  selectedFile === 'fontsReadme' ? 'bg-cyan-950 text-cyan-200 border border-cyan-800 font-medium' : 'text-zinc-400 hover:bg-zinc-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">README_FONTS.txt — правила шрифтов</span>
              </button>

              {/* Folders */}
              <div className="pl-3 font-mono text-zinc-500 text-[11px] mt-2.5 mb-1 flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-zinc-500" />
                <span>Каталоги ресурсов</span>
              </div>

              <button
                onClick={() => setSelectedFile('assetsReadme')}
                className={`w-full text-left pl-7 py-1.5 rounded flex items-center gap-2 transition-colors ${
                  selectedFile === 'assetsReadme' ? 'bg-cyan-950 text-cyan-200 border border-cyan-800 font-medium' : 'text-zinc-400 hover:bg-zinc-900'
                }`}
              >
                <Folder className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span className="truncate">Assets/ (текстуры и иконки)</span>
              </button>

              {/* Documentation & Reports */}
              <div className="pl-3 font-mono text-zinc-500 text-[11px] mt-2.5 mb-1">Манифест и отчёты</div>

              <button
                onClick={() => setSelectedFile('manifest')}
                className={`w-full text-left pl-4 py-1.5 rounded flex items-center gap-2 transition-colors ${
                  selectedFile === 'manifest' ? 'bg-cyan-950 text-cyan-200 border border-cyan-800 font-medium' : 'text-zinc-400 hover:bg-zinc-900'
                }`}
              >
                <FileCode className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">project-manifest.json</span>
              </button>

              <button
                onClick={() => setSelectedFile('readme')}
                className={`w-full text-left pl-4 py-1.5 rounded flex items-center gap-2 transition-colors ${
                  selectedFile === 'readme' ? 'bg-cyan-950 text-cyan-200 border border-cyan-800 font-medium' : 'text-zinc-400 hover:bg-zinc-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">README.md</span>
              </button>

              <button
                onClick={() => setSelectedFile('report')}
                className={`w-full text-left pl-4 py-1.5 rounded flex items-center gap-2 transition-colors ${
                  selectedFile === 'report' ? 'bg-cyan-950 text-cyan-200 border border-cyan-800 font-medium' : 'text-zinc-400 hover:bg-zinc-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="truncate">conversion-report.md</span>
              </button>

              <button
                onClick={() => setSelectedFile('compatibility')}
                className={`w-full text-left pl-4 py-1.5 rounded flex items-center gap-2 transition-colors ${
                  selectedFile === 'compatibility' ? 'bg-cyan-950 text-cyan-200 border border-cyan-800 font-medium' : 'text-zinc-400 hover:bg-zinc-900'
                }`}
              >
                <FileCode className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="truncate">compatibility.json</span>
              </button>
            </div>
          </div>

          {/* Right: Selected File Viewer */}
          <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden">
            <div className="px-4 py-2.5 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono text-cyan-400 font-semibold">{currentFile.path}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300">
                  {currentFile.category}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center gap-1.5 transition-colors font-medium text-xs"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Скопировано!' : 'Копировать'}</span>
                </button>
                <button
                  onClick={handleDownloadSingleFile}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center gap-1.5 transition-colors font-medium text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Скачать файл</span>
                </button>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-auto font-mono text-xs bg-zinc-950 text-zinc-200 selection:bg-cyan-900 selection:text-cyan-100">
              <pre className="whitespace-pre font-mono leading-relaxed">
                <code>{currentFile.content}</code>
              </pre>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>Распакуйте содержимое архива прямо в папку проекта <code>Content/DevUI/</code>.</span>
            {exportSuccess && (
              <span className="text-emerald-400 font-semibold ml-2 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Архив успешно сформирован и загружен!
              </span>
            )}
            {exportError && (
              <span className="text-red-300 font-medium ml-2 max-w-[440px]" role="alert">
                {exportError}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
            >
              Закрыть
            </button>
            <button
              onClick={handleDownloadZip}
              disabled={isExporting}
              className="px-5 py-2 rounded bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-lg shadow-emerald-900/30"
            >
              {isExporting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  <span>{exportStage || 'Подготовка экспорта…'} {exportProgress > 0 && `· ${exportProgress}%`}</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Скачать полный пакет интерфейса (ZIP)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
