import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Upload, Image as ImageIcon, FileCode2, WandSparkles, Layers3, Plus, Trash2,
  CheckCircle2, AlertTriangle, RotateCcw, Sparkles, ScanLine, MousePointer2, Cpu, Server, Info,
} from 'lucide-react';
import type { ProjectFile } from '../core/types.ts';
import {
  createManualLayoutNode, createImageReferenceStarter, figmaJsonHasCompleteCoordinates, generateLayoutSources, layoutDocumentFromAi, listFigmaFrames, parseFigmaJsonLayout, parseFigmaJsonReferenceImage,
  getLayoutNodeAbsolutePosition, parseSvgLayout, renderLayoutDocumentSvg, updateLayoutNode, combineLayoutPipelineDocuments, scaleLayoutDocumentTo, validateLayoutPipelineDocument, generateReferenceScreenSources, validateGeneratedLayoutBundle,
} from '../core/layout-generator.ts';
import type { FigmaFrameOption, LayoutDocument, LayoutNode, AiLayoutElement } from '../core/layout-generator.ts';

interface LayoutInitialImport { token: number; kind: 'svg' | 'figma' | 'image'; name: string; content: string; companionSvg?: { name: string; content: string }; companionPng?: { name: string; dataUrl: string } }
interface LayoutGeneratorModalProps {
  isOpen: boolean;
  baseRcss: string;
  initialImport?: LayoutInitialImport | null;
  onClose: () => void;
  onApply: (files: ProjectFile[], screenName: string) => void;
}
type PipelineStageStatus = 'idle' | 'running' | 'done' | 'warning' | 'error' | 'skipped';
interface PipelineStage { id: 'json' | 'svg' | 'consistency' | 'png' | 'ir' | 'output'; label: string; status: PipelineStageStatus; detail: string }
type AiModelChoice = 'none' | 'qwen3vl' | 'custom';
type LocalAiStatus = { available: boolean; baseUrl: string; models: string[]; message: string };
type LocalConnectionMode = 'app-server' | 'bridge';

function defaultLocalConnectionMode(): LocalConnectionMode {
  try {
    const host = window.location.hostname.toLowerCase();
    return ['localhost', '127.0.0.1', '::1'].includes(host) ? 'app-server' : 'bridge';
  } catch { return 'app-server'; }
}
function normalizeBridgeUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error('Некорректный адрес локального моста.'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname.toLowerCase()) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Локальный мост должен иметь адрес вида http://127.0.0.1:17891 и работать на этом компьютере.');
  }
  return url.origin;
}

function readPreference<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try { const value = localStorage.getItem(key); return value && allowed.includes(value as T) ? value as T : fallback; } catch { return fallback; }
}
function readTextPreference(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Не удалось прочитать файл.'));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));
    reader.readAsDataURL(file);
  });
}
async function svgToPngBase64(svg: string, width: number, height: number, preserveNativeResolution = false): Promise<string> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Не удалось растрировать векторный элемент. Проверьте используемые SVG-фильтры и ссылки.'));
      image.src = url;
    });
    const scale = preserveNativeResolution ? Math.min(1, 16384 / Math.max(1, width, height)) : Math.min(3, 2048 / Math.max(1, width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas недоступен в этом браузере.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blobPng = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blobPng) throw new Error('Не удалось сохранить PNG-ресурс.');
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const data = String(reader.result || '');
        const index = data.indexOf(',');
        index >= 0 ? resolve(data.slice(index + 1)) : reject(new Error('Не удалось закодировать PNG-ресурс.'));
      };
      reader.onerror = () => reject(new Error('Не удалось прочитать PNG-ресурс.'));
      reader.readAsDataURL(blobPng);
    });
  } finally { URL.revokeObjectURL(url); }
}
function sanitizeSvgForPreview(source: string): string {
  return source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/\s+on[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(?:xlink:)?href\s*=\s*(["'])(?!#|data:image\/)[^"']*\1/gi, '')
    .replace(/@import\s+[^;]+;?/gi, '')
    .replace(/url\(\s*(["']?)(?!#|data:image\/)[^)]*\1\s*\)/gi, 'none');
}

/** Sanitize active/external SVG content while retaining visual SVG constructs such as foreignObject for reference rasterization. */
function sanitizeSvgForPixelReference(source: string): string {
  return source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
    .replace(/\s+on[\w:-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(?:xlink:)?href\s*=\s*(["'])(?!#|data:image\/)[^"']*\1/gi, '')
    .replace(/url\(\s*(["']?)(?!#|data:image\/)[^)]*\1\s*\)/gi, 'none');
}

/** Converts JPEG/WebP data URLs to lossless PNG without reducing the source resolution. PNG inputs pass through byte-for-byte. */
async function imageDataUrlToPngBase64(dataUrl: string): Promise<string> {
  const pngMatch = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
  if (pngMatch) return pngMatch[1];
  const image = new Image();
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Не удалось декодировать эталонное изображение для экспорта.')); image.src = dataUrl; });
  const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
  if (!width || !height || width > 16384 || height > 16384) throw new Error('Размер эталонного изображения не поддерживается для pixel-reference экспорта.');
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas недоступен: не удалось подготовить PNG-эталон.');
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Не удалось сформировать PNG-эталон.');
  const converted = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Не удалось прочитать подготовленный PNG.')); reader.onerror = () => reject(new Error('Не удалось прочитать подготовленный PNG.')); reader.readAsDataURL(blob); });
  const comma = converted.indexOf(',');
  if (comma < 0) throw new Error('Некорректный результат кодирования PNG-эталона.');
  return converted.slice(comma + 1);
}

function decodeImage(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Не удалось декодировать изображение.'));
    image.src = dataUrl;
  });
}

async function prepareImageForAi(dataUrl: string, maxDimension = 1280): Promise<{ dataUrl: string; mimeType: string; width: number; height: number; resized: boolean }> {
  const original = await decodeImage(dataUrl);
  const scale = Math.min(1, maxDimension / Math.max(original.width, original.height));
  const mimeType = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)?.[1] || 'image/png';
  if (scale >= 1) return { dataUrl, mimeType, width: original.width, height: original.height, resized: false };

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Не удалось подготовить уменьшенную копию для локального AI.'));
    image.src = dataUrl;
  });
  const width = Math.max(1, Math.round(original.width * scale));
  const height = Math.max(1, Math.round(original.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas недоступен: не удалось уменьшить изображение для AI.');
  context.drawImage(image, 0, 0, width, height);
  // Preserve alpha and avoid turning UI screenshots into a lossy image.
  return { dataUrl: canvas.toDataURL('image/png'), mimeType: 'image/png', width, height, resized: true };
}
function projectTextFile(id: string, path: string, content: string, type: ProjectFile['type']): ProjectFile {
  return { id, path, content, type, contentEncoding: 'text', isEntry: /\.rml$/i.test(path) };
}

export const LayoutGeneratorModal: React.FC<LayoutGeneratorModalProps> = ({ isOpen, baseRcss, initialImport, onClose, onApply }) => {
  const [layoutName, setLayoutName] = useState('GeneratedLayout');
  const [screenName, setScreenName] = useState('GeneratedLayout');
  const [document, setDocument] = useState<LayoutDocument | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // Combined workflow inputs: each file is optional; PNG validation always runs last.
  const [pipelineSvgSource, setPipelineSvgSource] = useState('');
  const [pipelineSvgName, setPipelineSvgName] = useState('');
  const [pipelineJsonSource, setPipelineJsonSource] = useState('');
  const [pipelineJsonName, setPipelineJsonName] = useState('');
  const [pipelineFigmaFrames, setPipelineFigmaFrames] = useState<FigmaFrameOption[]>([]);
  const [pipelineSelectedFrameId, setPipelineSelectedFrameId] = useState('');
  const [pipelinePngDataUrl, setPipelinePngDataUrl] = useState('');
  const [pipelinePngUrl, setPipelinePngUrl] = useState('');
  const [pipelinePngName, setPipelinePngName] = useState('');
  const [pipelinePngSize, setPipelinePngSize] = useState<{ width: number; height: number } | null>(null);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([
    { id: 'json', label: '1. Проверка JSON', status: 'idle', detail: 'Необязательный источник семантики и структуры.' },
    { id: 'svg', label: '2. Проверка SVG', status: 'idle', detail: 'Необязательный источник точной геометрии и графики.' },
    { id: 'consistency', label: '3. Сверка источников', status: 'idle', detail: 'Сопоставление размеров и доступной структуры.' },
    { id: 'png', label: '4. Финальный PNG-анализ', status: 'idle', detail: 'Последний этап анализа: исходный PNG или растрированная копия доступного источника.' },
    { id: 'ir', label: '5. Объединение Layout IR', status: 'idle', detail: 'Слияние геометрии, текста и результатов визуального анализа.' },
    { id: 'output', label: '6. Проверка RML/RCSS', status: 'idle', detail: 'Код можно создавать после успешной проверки Layout IR.' },
  ]);
  const [pipelineValidated, setPipelineValidated] = useState(false);
  const [pipelineValidationErrors, setPipelineValidationErrors] = useState<string[]>([]);
  const [pipelineValidationWarnings, setPipelineValidationWarnings] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('Загрузите SVG, PNG или экспорт дерева слоёв из Figma.');
  const [error, setError] = useState('');
  const [svgPreviewUrlForPipeline, setSvgPreviewUrlForPipeline] = useState('');
  const [layoutIrPreviewUrl, setLayoutIrPreviewUrl] = useState('');
  const [outputView, setOutputView] = useState<'preview' | 'rml' | 'rcss' | 'report'>('preview');
  const [mobileWorkspaceTab, setMobileWorkspaceTab] = useState<'sources' | 'preview' | 'structure' | 'code' | 'checks'>('sources');
  const [rightPaneTab, setRightPaneTab] = useState<'structure' | 'code' | 'checks'>('structure');
  const [previewLayerMode, setPreviewLayerMode] = useState<'source' | 'ir'>('source');
  const [analysisModelChoice, setAnalysisModelChoice] = useState<AiModelChoice>(() => readPreference('kormatal.layout-ai-model', ['none', 'qwen3vl', 'custom'] as const, 'none'));
  const [localModelAlias, setLocalModelAlias] = useState(() => readTextPreference('kormatal.layout-ai-model-alias', ''));
  const [localModelBaseUrl, setLocalModelBaseUrl] = useState(() => readTextPreference('kormatal.layout-ai-base-url', 'http://127.0.0.1:1234/v1'));
  const [localAiTimeoutSeconds, setLocalAiTimeoutSeconds] = useState(() => readTextPreference('kormatal.layout-ai-timeout-seconds', '600'));
  const [localConnectionMode, setLocalConnectionMode] = useState<LocalConnectionMode>(() => readPreference('kormatal.layout-ai-connection-mode', ['app-server', 'bridge'] as const, defaultLocalConnectionMode()));
  const [localBridgeUrl, setLocalBridgeUrl] = useState(() => readTextPreference('kormatal.layout-ai-bridge-url', 'http://127.0.0.1:17891'));
  const [localBridgeToken, setLocalBridgeToken] = useState(() => readTextPreference('kormatal.layout-ai-bridge-token', ''));
  const [localAiStatus, setLocalAiStatus] = useState<LocalAiStatus | null>(null);
  const [checkingLocalAi, setCheckingLocalAi] = useState(false);
  const pipelineSvgInputRef = useRef<HTMLInputElement>(null);
  const pipelineJsonInputRef = useRef<HTMLInputElement>(null);
  const pipelinePngInputRef = useRef<HTMLInputElement>(null);
  const lastInitialImportTokenRef = useRef<number | null>(null);
  const selectedNode = document?.nodes.find(node => node.id === selectedNodeId) || null;
  const sources = useMemo(() => document ? generateLayoutSources(document) : null, [document]);
  const absolutePositions = useMemo(() => { const positions = new Map<string, { x: number; y: number }>(); if (document) for (const node of document.nodes) positions.set(node.id, getLayoutNodeAbsolutePosition(document, node.id)); return positions; }, [document]);
  const selectedAiModelId = analysisModelChoice === 'qwen3vl' ? 'Qwen3VL-2B-Instruct-Q4_K_M' : analysisModelChoice === 'custom' ? localModelAlias.trim() : '';
  const canAnalyzeWithAi = analysisModelChoice !== 'none' && Boolean(selectedAiModelId) && Boolean(localModelBaseUrl.trim());

  useEffect(() => {
    if (!pipelineSvgSource.trim()) { setSvgPreviewUrlForPipeline(''); return; }
    const url = URL.createObjectURL(new Blob([sanitizeSvgForPreview(pipelineSvgSource)], { type: 'image/svg+xml;charset=utf-8' }));
    setSvgPreviewUrlForPipeline(url);
    return () => URL.revokeObjectURL(url);
  }, [pipelineSvgSource]);
  useEffect(() => () => { if (pipelinePngUrl) URL.revokeObjectURL(pipelinePngUrl); }, [pipelinePngUrl]);

  useEffect(() => {
    if (!document) { setLayoutIrPreviewUrl(''); return; }
    const svg = renderLayoutDocumentSvg(document);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    setLayoutIrPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [document]);
  useEffect(() => {
    if (!isOpen) return;
    setError('');
  }, [isOpen]);
  useEffect(() => {
    try {
      localStorage.setItem('kormatal.layout-ai-model', analysisModelChoice);
      localStorage.setItem('kormatal.layout-ai-model-alias', localModelAlias);
      localStorage.setItem('kormatal.layout-ai-base-url', localModelBaseUrl);
      localStorage.setItem('kormatal.layout-ai-timeout-seconds', localAiTimeoutSeconds);
      localStorage.setItem('kormatal.layout-ai-connection-mode', localConnectionMode);
      localStorage.setItem('kormatal.layout-ai-bridge-url', localBridgeUrl);
      localStorage.setItem('kormatal.layout-ai-bridge-token', localBridgeToken);
    } catch { /* Private browsing can disable localStorage; the selector still works for this session. */ }
  }, [analysisModelChoice, localModelAlias, localModelBaseUrl, localAiTimeoutSeconds, localConnectionMode, localBridgeUrl, localBridgeToken]);

  const applyParsedDocument = useCallback((next: LayoutDocument) => {
    setLayoutName(next.name.replace(/\.[^.]+$/, '') || 'GeneratedLayout');
    setScreenName((next.name.replace(/[^a-zA-Z0-9_]/g, '') || 'GeneratedLayout').slice(0, 48));
    setSelectedNodeId(next.nodes[0]?.id || null);
    setDocument(next);
    setError('');
    setStatus(`Анализ завершён: ${next.nodes.length} элементов, холст ${Math.round(next.width)} × ${Math.round(next.height)}.`);
  }, []);

  // Every imported design enters the same optional-source pipeline. A single file can
  // start the workflow; companion sources can then be added before the final PNG pass.
  useEffect(() => {
    if (!isOpen || !initialImport || lastInitialImportTokenRef.current === initialImport.token) return;
    lastInitialImportTokenRef.current = initialImport.token;
    setError(''); setOutputView('preview'); setMobileWorkspaceTab('sources'); setPreviewLayerMode('source');
    setPipelineSvgSource(''); setPipelineSvgName('');
    setPipelineJsonSource(''); setPipelineJsonName(''); setPipelineFigmaFrames([]); setPipelineSelectedFrameId('');
    setPipelinePngDataUrl(''); setPipelinePngName(''); setPipelinePngSize(null);
    if (pipelinePngUrl) URL.revokeObjectURL(pipelinePngUrl);
    setPipelinePngUrl('');
    resetPipelineRun();

    const attachReferenceImage = (image?: { name: string; dataUrl: string }) => {
      if (!image) return;
      setPipelinePngDataUrl(image.dataUrl);
      setPipelinePngName(image.name);
      void Promise.all([
        decodeImage(image.dataUrl),
        fetch(image.dataUrl).then(response => {
          if (!response.ok) throw new Error('Не удалось подготовить изображение для предпросмотра.');
          return response.blob();
        }),
      ]).then(([size, blob]) => {
        if (lastInitialImportTokenRef.current !== initialImport.token) return;
        setPipelinePngSize(size);
        setPipelinePngUrl(URL.createObjectURL(blob));
      }).catch(err => {
        if (lastInitialImportTokenRef.current === initialImport.token) {
          setError(err instanceof Error ? err.message : 'Не удалось прочитать PNG-эталон.');
        }
      });
    };

    try {
      if (initialImport.kind === 'image') {
        setLayoutName(initialImport.name || 'GeneratedLayout');
        setScreenName((initialImport.name.replace(/[^a-zA-Z0-9_]/g, '') || 'GeneratedLayout').slice(0, 48));
        attachReferenceImage({ name: initialImport.name, dataUrl: initialImport.content });
        setDocument(null); setSelectedNodeId(null);
        setStatus(`Изображение «${initialImport.name}» добавлено как визуальный эталон. Нажмите «Запустить анализ»: без локальной AI-модели откроется пустая редактируемая сцена, в которую можно вручную добавить слои.`);
      } else if (initialImport.kind === 'svg') {
        setPipelineSvgSource(initialImport.content); setPipelineSvgName(initialImport.name);
        setLayoutName(initialImport.name.replace(/\.svg$/i, '') || 'GeneratedLayout');
        setScreenName((initialImport.name.replace(/\.svg$/i, '').replace(/[^a-zA-Z0-9_]/g, '') || 'GeneratedLayout').slice(0, 48));
        attachReferenceImage(initialImport.companionPng);
        const parsed = parseSvgLayout(initialImport.content, initialImport.name);
        setDocument(parsed); setSelectedNodeId(parsed.nodes[0]?.id || null);
        setStatus(`SVG «${initialImport.name}» добавлен в источники.${initialImport.companionPng ? ` PNG «${initialImport.companionPng.name}» подключён как визуальный эталон.` : ''} Запустите анализ, чтобы собрать RML/RCSS.`);
        if (!parsed.nodes.length) setError(`SVG «${initialImport.name}» прочитан, но редактируемые элементы не обнаружены. ${parsed.diagnostics.join(' ')}`);
      } else {
        setPipelineJsonSource(initialImport.content); setPipelineJsonName(initialImport.name);
        const options = listFigmaFrames(initialImport.content);
        setPipelineFigmaFrames(options); setPipelineSelectedFrameId(options[0]?.id || '');
        setLayoutName(initialImport.name.replace(/\.json$/i, '') || 'GeneratedLayout');
        setScreenName((initialImport.name.replace(/\.json$/i, '').replace(/[^a-zA-Z0-9_]/g, '') || 'GeneratedLayout').slice(0, 48));
        const embeddedReference = parseFigmaJsonReferenceImage(initialImport.content, options[0]?.id);
        attachReferenceImage(initialImport.companionPng || (embeddedReference ? {
          name: embeddedReference.name,
          dataUrl: `data:${embeddedReference.mimeType};base64,${embeddedReference.contentBase64}`,
        } : undefined));
        if (initialImport.companionSvg) {
          setPipelineSvgSource(initialImport.companionSvg.content); setPipelineSvgName(initialImport.companionSvg.name);
          const svgDoc = parseSvgLayout(initialImport.companionSvg.content, initialImport.companionSvg.name || initialImport.name);
          setDocument(svgDoc); setSelectedNodeId(svgDoc.nodes[0]?.id || null);
          setStatus(`Добавлены JSON «${initialImport.name}» и SVG «${initialImport.companionSvg.name}».${initialImport.companionPng ? ` PNG «${initialImport.companionPng.name}» подключён как визуальный эталон.` : ''} Запустите полный анализ.`);
        } else {
          setDocument(null); setSelectedNodeId(null);
          setStatus(`JSON «${initialImport.name}» добавлен в источники.${initialImport.companionPng ? ` PNG «${initialImport.companionPng.name}» подключён как визуальный эталон.` : ''} При наличии добавьте SVG/PNG и запустите анализ.`);
        }
      }
    } catch (err) {
      setDocument(null); setSelectedNodeId(null);
      setError(err instanceof Error ? err.message : 'Не удалось импортировать макет.');
      setStatus(`Не удалось разобрать файл «${initialImport.name}». Проверьте формат и экспорт из Figma.`);
    }
  }, [isOpen, initialImport, applyParsedDocument, pipelinePngUrl]);

  const resetPipelineRun = () => {
    setPipelineValidated(false);
    setPipelineValidationErrors([]);
    setPipelineValidationWarnings([]);
    setPipelineStages([
      { id: 'json', label: '1. Проверка JSON', status: 'idle', detail: 'Необязательный источник семантики и структуры; будет разобран при запуске.' },
      { id: 'svg', label: '2. Проверка SVG', status: 'idle', detail: 'Необязательный источник точной геометрии и графики; будет разобран при запуске.' },
      { id: 'consistency', label: '3. Сверка источников', status: 'idle', detail: 'При запуске будут сверены размеры и доступная структура.' },
      { id: 'png', label: '4. Финальный PNG-анализ', status: 'idle', detail: 'PNG будет обработан последним; при отсутствии файла будет создана проверочная копия доступного источника.' },
      { id: 'ir', label: '5. Объединение Layout IR', status: 'idle', detail: 'Ожидает завершения анализа источников.' },
      { id: 'output', label: '6. Проверка RML/RCSS', status: 'idle', detail: 'Станет доступна после успешной валидации Layout IR.' },
    ]);
  };
  const setPipelineStage = (id: PipelineStage['id'], status: PipelineStageStatus, detail: string) => {
    setPipelineStages(current => current.map(stage => stage.id === id ? { ...stage, status, detail } : stage));
  };

  const handlePipelineSvgFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { setError('SVG больше 12 МБ. Оптимизируйте файл перед импортом.'); return; }
    try {
      const raw = await file.text();
      // Parse once here to fail early, but keep sources separate until the full pipeline is run.
      parseSvgLayout(raw, file.name.replace(/\.svg$/i, ''));
      setPipelineSvgSource(raw); setPipelineSvgName(file.name); setMobileWorkspaceTab('sources'); setPreviewLayerMode('source'); setError(''); resetPipelineRun();
      setStatus(`SVG добавлен в конвейер: ${file.name}. Можно добавить JSON и/или PNG, затем запустить полный анализ.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось прочитать SVG.'); }
  };
  const handlePipelineJsonFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { setError('JSON больше 12 МБ.'); return; }
    try {
      const raw = await file.text();
      const frames = listFigmaFrames(raw);
      setPipelineJsonSource(raw); setPipelineJsonName(file.name); setPipelineFigmaFrames(frames); setPipelineSelectedFrameId(frames[0]?.id || '');
      const embeddedReference = parseFigmaJsonReferenceImage(raw, frames[0]?.id);
      if (embeddedReference) {
        const dataUrl = `data:${embeddedReference.mimeType};base64,${embeddedReference.contentBase64}`;
        const [size, response] = await Promise.all([decodeImage(dataUrl), fetch(dataUrl)]);
        if (!response.ok) throw new Error('Не удалось прочитать встроенный PNG-эталон из Figma JSON.');
        const blob = await response.blob();
        if (pipelinePngUrl) URL.revokeObjectURL(pipelinePngUrl);
        setPipelinePngDataUrl(dataUrl); setPipelinePngName(embeddedReference.name); setPipelinePngSize(size); setPipelinePngUrl(URL.createObjectURL(blob));
      }
      setMobileWorkspaceTab('sources'); setError(''); resetPipelineRun();
      setStatus(`JSON добавлен в конвейер: ${file.name}.${embeddedReference ? ' Встроенный PNG-эталон загружен автоматически.' : ' Можно добавить SVG и/или PNG.'}`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось прочитать Figma JSON.'); }
  };
  const handlePipelinePngFile = async (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Для PNG-анализатора поддерживаются PNG, JPEG и WebP.'); return; }
    if (file.size > 8 * 1024 * 1024) { setError('Изображение больше 8 МБ. Уменьшите размер и повторите импорт.'); return; }
    try {
      const dataUrl = await fileToDataUrl(file);
      const size = await decodeImage(dataUrl);
      if (pipelinePngUrl) URL.revokeObjectURL(pipelinePngUrl);
      setPipelinePngDataUrl(dataUrl); setPipelinePngUrl(URL.createObjectURL(file)); setPipelinePngName(file.name); setPipelinePngSize(size);
      setMobileWorkspaceTab('sources'); setPreviewLayerMode('source'); setError(''); resetPipelineRun();
      setStatus(`PNG добавлен в конвейер: ${file.name} (${size.width} × ${size.height}). PNG-анализ будет последним этапом.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось открыть PNG.'); }
  };

  const handleRunFullPipeline = async () => {
    if (!pipelineSvgSource.trim() && !pipelineJsonSource.trim() && !pipelinePngDataUrl) {
      setError('Добавьте хотя бы один файл: SVG, PNG или JSON. Остальные файлы необязательны.');
      return;
    }
    setIsAnalyzing(true); setError(''); setDocument(null); setSelectedNodeId(null); setPipelineValidated(false); setPipelineValidationErrors([]); setPipelineValidationWarnings([]);
    setPipelineStages([
      { id: 'json', label: '1. Проверка JSON', status: pipelineJsonSource ? 'running' : 'skipped', detail: pipelineJsonSource ? 'Разбираю дерево слоёв и выбираю Frame…' : 'Пропущено: JSON не предоставлен.' },
      { id: 'svg', label: '2. Проверка SVG', status: 'idle', detail: pipelineSvgSource ? 'Ожидает разбора.' : 'Пропущено: SVG не предоставлен.' },
      { id: 'consistency', label: '3. Сверка источников', status: 'idle', detail: 'Ожидает разбора JSON и SVG.' },
      { id: 'png', label: '4. Финальный PNG-анализ', status: 'idle', detail: 'Будет запущен после проверки структурных источников.' },
      { id: 'ir', label: '5. Объединение Layout IR', status: 'idle', detail: 'Ожидает результатов анализа.' },
      { id: 'output', label: '6. Проверка RML/RCSS', status: 'idle', detail: 'Доступна после успешной проверки IR.' },
    ]);
    let jsonDoc: LayoutDocument | null = null;
    let svgDoc: LayoutDocument | null = null;
    let visionDoc: LayoutDocument | null = null;
    const blockingSourceErrors: string[] = [];
    try {
      const verifiedPngSize = pipelinePngDataUrl
        ? (pipelinePngSize || await decodeImage(pipelinePngDataUrl))
        : null;
      if (verifiedPngSize && !pipelinePngSize) setPipelinePngSize(verifiedPngSize);
      // Stage 1: JSON is an optional source of semantics and hierarchy.
      if (pipelineJsonSource.trim()) {
        try {
          jsonDoc = parseFigmaJsonLayout(pipelineJsonSource, pipelineJsonName.replace(/\.json$/i, '') || layoutName, pipelineSelectedFrameId || undefined);
          setPipelineStage('json', 'done', `Прочитано ${jsonDoc.nodes.length} узлов, холст ${Math.round(jsonDoc.width)} × ${Math.round(jsonDoc.height)}. ${figmaJsonHasCompleteCoordinates(pipelineJsonSource) ? 'Есть абсолютные координаты.' : 'Точные абсолютные координаты отсутствуют; потребуется SVG/PNG для геометрии.'}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Не удалось разобрать JSON.';
          blockingSourceErrors.push(`JSON «${pipelineJsonName || 'источник'}»: ${message}`);
          setPipelineStage('json', 'error', message);
        }
      } else setPipelineStage('json', 'skipped', 'JSON не предоставлен; обработка продолжится по оставшимся источникам.');

      // Stage 2: SVG provides precise visual geometry/resources where supported.
      if (pipelineSvgSource.trim()) {
        setPipelineStage('svg', 'running', 'Разбираю SVG, viewBox, трансформации, группы и растеризуемые фрагменты…');
        try {
          svgDoc = parseSvgLayout(pipelineSvgSource, pipelineSvgName.replace(/\.svg$/i, '') || layoutName);
          setPipelineStage('svg', svgDoc.nodes.length ? 'done' : 'warning', `Найдено ${svgDoc.nodes.length} узлов; диагностик SVG: ${svgDoc.diagnostics.length}.`);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Не удалось разобрать SVG.';
          blockingSourceErrors.push(`SVG «${pipelineSvgName || 'источник'}»: ${message}`);
          setPipelineStage('svg', 'error', message);
        }
      } else setPipelineStage('svg', 'skipped', 'SVG не предоставлен; геометрия будет взята из JSON или PNG-анализатора.');

      // Stage 3: choose a source of geometry before the final PNG pass.
      setPipelineStage('consistency', 'running', 'Сверяю доступность узлов и размеры холста…');
      const jsonHasCoordinates = pipelineJsonSource ? figmaJsonHasCompleteCoordinates(pipelineJsonSource) : false;
      let geometryDoc: LayoutDocument | null = (jsonDoc && jsonHasCoordinates) ? jsonDoc : (svgDoc || jsonDoc);
      const sourceNotes: string[] = [];
      // A screenshot is still a useful starting point with AI disabled: keep its pixel
      // reference and create a valid empty IR so users can build the editable tree by hand.
      if (!geometryDoc && pipelinePngDataUrl && !canAnalyzeWithAi && verifiedPngSize) {
        geometryDoc = createImageReferenceStarter(verifiedPngSize.width, verifiedPngSize.height, layoutName);
        sourceNotes.push('Создан режим ручной реконструкции: скриншот доступен для сравнения, слои добавляются пользователем.');
      }
      if (pipelineJsonSource && !jsonDoc) sourceNotes.push('JSON был пропущен из-за ошибки разбора.');
      if (pipelineSvgSource && !svgDoc) sourceNotes.push('SVG был пропущен из-за ошибки разбора.');
      if (jsonDoc && svgDoc) {
        const deltaW = Math.abs(jsonDoc.width - svgDoc.width), deltaH = Math.abs(jsonDoc.height - svgDoc.height);
        if (deltaW > 1 || deltaH > 1) sourceNotes.push(`Размеры отличаются: JSON ${Math.round(jsonDoc.width)}×${Math.round(jsonDoc.height)}, SVG ${Math.round(svgDoc.width)}×${Math.round(svgDoc.height)}. Источник геометрии: ${geometryDoc === jsonDoc ? 'JSON с абсолютными координатами' : 'SVG'}.`);
        if (!jsonHasCoordinates && geometryDoc === svgDoc) sourceNotes.push('JSON не имеет достоверных X/Y: SVG выбран главным источником геометрии, JSON будет использоваться для текстовой семантики при сопоставлении.');
      }
      if (geometryDoc && verifiedPngSize) {
        const geometryAspect = geometryDoc.width / Math.max(1, geometryDoc.height);
        const pngAspect = verifiedPngSize.width / Math.max(1, verifiedPngSize.height);
        const aspectDeltaPercent = Math.abs(pngAspect / geometryAspect - 1) * 100;
        if (aspectDeltaPercent > 1) sourceNotes.push(`Пропорции PNG (${verifiedPngSize.width}×${verifiedPngSize.height}) отличаются от холста ${Math.round(geometryDoc.width)}×${Math.round(geometryDoc.height)} на ${aspectDeltaPercent.toFixed(2)}%. Проверьте, что это тот же кадр без обрезки; координаты PNG-анализатора будут преобразованы в систему координат Layout IR.`);
        else if (Math.abs(verifiedPngSize.width - geometryDoc.width) > 1 || Math.abs(verifiedPngSize.height - geometryDoc.height) > 1) sourceNotes.push(`Размер PNG (${verifiedPngSize.width}×${verifiedPngSize.height}) отличается от размера холста, но пропорции совпадают; координаты будут масштабированы к ${Math.round(geometryDoc.width)}×${Math.round(geometryDoc.height)}.`);
      }
      if (geometryDoc) setPipelineStage('consistency', sourceNotes.length ? 'warning' : 'done', `${geometryDoc.sourceKind}: ${geometryDoc.nodes.length} узлов. ${sourceNotes.join(' ') || 'Источники согласованы по доступной структуре.'}`);
      else if (pipelinePngDataUrl) setPipelineStage('consistency', 'warning', 'Нет пригодного SVG/JSON. Layout IR будет создан на основе финального PNG-анализа.');
      else throw new Error('Ни SVG, ни JSON не удалось разобрать. Загрузите PNG либо исправьте структурный источник.');

      // Stage 4 must be the last analysis step. Use supplied PNG if present; otherwise rasterize
      // the original SVG, or a deterministic preview of the JSON-derived Layout IR.
      setPipelineStage('png', 'running', 'Подготавливаю финальное изображение для проверки…');
      let referenceDataUrl = pipelinePngDataUrl;
      let referenceName = pipelinePngName;
      let referenceSize = verifiedPngSize;
      if (!referenceDataUrl) {
        if (pipelineSvgSource.trim()) {
          const base64 = await svgToPngBase64(sanitizeSvgForPreview(pipelineSvgSource), svgDoc?.width || geometryDoc?.width || 1920, svgDoc?.height || geometryDoc?.height || 1080);
          referenceDataUrl = `data:image/png;base64,${base64}`;
          referenceName = `${pipelineSvgName || 'SVG'} · проверочная PNG-копия`;
        } else if (geometryDoc) {
          const previewSvg = renderLayoutDocumentSvg(geometryDoc);
          const base64 = await svgToPngBase64(previewSvg, geometryDoc.width, geometryDoc.height);
          referenceDataUrl = `data:image/png;base64,${base64}`;
          referenceName = `${pipelineJsonName || 'Layout IR'} · проверочный рендер`;
        }
        if (referenceDataUrl) referenceSize = await decodeImage(referenceDataUrl);
      }
      if (!referenceDataUrl || !referenceSize) throw new Error('Не удалось подготовить PNG для финального этапа анализа.');
      if (!pipelinePngDataUrl && !pipelineSvgSource.trim() && pipelineJsonSource.trim()) sourceNotes.push('Исходный PNG отсутствует: PNG-анализатор увидит визуализацию JSON/Layout IR, а не исходный скриншот. Это помогает проверить сформированную структуру, но не подтверждает совпадение с оригинальным макетом.');

      if (canAnalyzeWithAi) {
        // Qwen3.8-27B on laptop GPUs (8 GB VRAM) is particularly sensitive to
        // vision-token count. Keep its input smaller; SVG/JSON remain the geometry
        // authority when supplied, and PNG is used for visual semantics/refinement.
        const qwen38FastMode = /qwen[\s._-]*3[\s._-]*8/i.test(selectedAiModelId);
        const analysisImage = await prepareImageForAi(referenceDataUrl, qwen38FastMode ? 768 : 1024);
        const comma = analysisImage.dataUrl.indexOf(',');
        const useBridge = localConnectionMode === 'bridge';
        let endpoint = '/local-ai/analyze';
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (useBridge) {
          if (!localBridgeToken.trim()) throw new Error('Для финального PNG-анализа запустите local-ai-bridge\\Start-Local-Bridge.bat и вставьте токен.');
          endpoint = `${normalizeBridgeUrl(localBridgeUrl)}/analyze`;
          headers['X-Local-Bridge-Token'] = localBridgeToken.trim();
        }
        const response = await fetch(endpoint, {
          method: 'POST', headers,
          body: JSON.stringify({ imageBase64: analysisImage.dataUrl.slice(comma + 1), mimeType: analysisImage.mimeType, width: analysisImage.width, height: analysisImage.height, name: layoutName, model: selectedAiModelId, baseUrl: localModelBaseUrl.trim(), timeoutMs: Math.max(60, Math.min(900, Number(localAiTimeoutSeconds) || 600)) * 1000 }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `PNG-анализатор вернул HTTP ${response.status}.`);
        const targetWidth = geometryDoc?.width || referenceSize.width;
        const targetHeight = geometryDoc?.height || referenceSize.height;
        const sx = targetWidth / analysisImage.width, sy = targetHeight / analysisImage.height;
        const uniform = Math.min(sx, sy);
        const scaledElements = ((result.elements || []) as AiLayoutElement[]).map(element => ({
          ...element, x: Number(element.x) * sx, y: Number(element.y) * sy,
          width: Number(element.width) * sx, height: Number(element.height) * sy,
          radius: Number(element.radius || 0) * uniform, fontSize: Number(element.fontSize || 16) * uniform,
          layoutItemSpacing: Number(element.layoutItemSpacing || 0) * uniform,
          layoutPaddingTop: Number(element.layoutPaddingTop || 0) * uniform,
          layoutPaddingRight: Number(element.layoutPaddingRight || 0) * uniform,
          layoutPaddingBottom: Number(element.layoutPaddingBottom || 0) * uniform,
          layoutPaddingLeft: Number(element.layoutPaddingLeft || 0) * uniform,
        }));
        visionDoc = layoutDocumentFromAi(targetWidth, targetHeight, scaledElements, layoutName);
        if (Array.isArray(result.notes)) visionDoc.diagnostics.push(...result.notes.slice(0, 20));
        if (result.knowledgeContext) {
          visionDoc.diagnostics.push(`Knowledge Engine: передано ${result.knowledgeContext.entriesUsed || 0} записей, разделов документации: ${result.knowledgeContext.documentSections || 0}; источники: ${(result.knowledgeContext.sources || []).slice(0, 8).join(', ')}.`);
        }
        setPipelineStage('png', visionDoc.nodes.length ? 'done' : 'warning', `${referenceName}: PNG-анализатор обнаружил ${visionDoc.nodes.length} элементов с помощью ${result.model || selectedAiModelId}. ${result.knowledgeContext ? `Knowledge Engine: ${result.knowledgeContext.entriesUsed} записей, ${result.knowledgeContext.documentSections} разделов docs. ` : ''}${analysisImage.resized ? `Для запроса использована копия ${analysisImage.width}×${analysisImage.height}.` : ''}`);
      } else {
        setPipelineStage('png', 'warning', `${referenceName}: PNG подготовлен и проверен (${referenceSize.width}×${referenceSize.height}), но AI выключен. Визуальное распознавание пропущено; структурный Layout IR будет построен из SVG/JSON.`);
      }
      if (referenceName.includes('проверочная PNG-копия') || referenceName.includes('проверочный рендер')) {
        setStatus(`PNG-файл не был предоставлен: создана проверочная копия из ${referenceName}.`);
      }

      // Stage 5: merge the structured source with final vision observations and validate it.
      setPipelineStage('ir', 'running', 'Объединяю геометрию и семантику, затем проверяю Layout IR…');
      const semanticDoc = jsonDoc && jsonDoc !== geometryDoc ? jsonDoc : null;
      const supplementalSvgDoc = svgDoc && svgDoc !== geometryDoc && geometryDoc ? scaleLayoutDocumentTo(svgDoc, geometryDoc.width, geometryDoc.height) : null;
      const finalDoc = combineLayoutPipelineDocuments(geometryDoc, visionDoc, semanticDoc, supplementalSvgDoc);
      const finalValidation = validateLayoutPipelineDocument(finalDoc);
      if (!finalDoc) throw new Error('Не удалось создать Layout IR: нет пригодных данных ни из одного источника.');
      finalDoc.name = layoutName || finalDoc.name;
      finalDoc.diagnostics.push(...sourceNotes.map(note => `Сверка источников: ${note}`));
      finalDoc.diagnostics.push(`Полный конвейер: JSON ${pipelineJsonSource ? (jsonDoc ? 'прочитан' : 'ошибка') : 'пропущен'} → SVG ${pipelineSvgSource ? (svgDoc ? 'прочитан' : 'ошибка') : 'пропущен'} → PNG ${visionDoc ? 'анализирован локальной моделью' : 'проверен без AI'} → Layout IR.`);
      const validation = validateLayoutPipelineDocument(finalDoc);
      validation.errors.push(...blockingSourceErrors);
      validation.valid = validation.errors.length === 0;
      setPipelineValidationErrors(validation.errors);
      setPipelineValidationWarnings([...finalValidation.warnings, ...validation.warnings]);
      setPipelineValidated(validation.valid);
      setPipelineStage('ir', validation.valid ? (validation.warnings.length ? 'warning' : 'done') : 'error', validation.valid ? `Layout IR готов: ${finalDoc.nodes.length} элементов, холст ${Math.round(finalDoc.width)}×${Math.round(finalDoc.height)}.` : validation.errors.join(' '));
      setPipelineStage('output', validation.valid ? 'idle' : 'error', validation.valid ? 'Готово к генерации. Проверьте элементы и нажмите «Создать RML/RCSS».' : 'Генерация заблокирована до исправления ошибок Layout IR.');
      applyParsedDocument(finalDoc);
      if (validation.valid) { setMobileWorkspaceTab('preview'); setRightPaneTab('structure'); setPreviewLayerMode('source'); } else { setMobileWorkspaceTab('checks'); setRightPaneTab('checks'); }
      setStatus(validation.valid ? `Полный анализ завершён: ${finalDoc.nodes.length} элементов. PNG-анализ выполнен последним; Layout IR ${validation.warnings.length ? 'готов с предупреждениями' : 'прошёл проверку'}.` : 'Layout IR не прошёл проверку. Исправьте ошибки перед генерацией.');
      if (!validation.valid) setError(validation.errors.join(' '));
      else if (visionDoc?.nodes.length === 0 && !geometryDoc?.nodes.length) setError('PNG-анализ не обнаружил элементов. Попробуйте другую локальную vision-модель или добавьте элементы вручную.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось завершить полный конвейер.';
      setError(message); setMobileWorkspaceTab('checks'); setRightPaneTab('checks');
      setStatus('Конвейер остановлен с ошибкой. Доступные источники сохранены; исправьте отмеченный этап и повторите запуск.');
      setPipelineStages(current => current.map(stage => stage.status === 'running' ? { ...stage, status: 'error', detail: message } : stage));
    } finally { setIsAnalyzing(false); }
  };

  const handleCheckLocalAi = async () => {
    if (analysisModelChoice === 'none') {
      setLocalAiStatus({ available: false, baseUrl: localModelBaseUrl, models: [], message: 'AI выключен. Выберите локальную модель, чтобы проверить подключение.' });
      return;
    }
    setCheckingLocalAi(true); setLocalAiStatus(null); setError('');
    try {
      const query = new URLSearchParams({ baseUrl: localModelBaseUrl.trim() });
      const useBridge = localConnectionMode === 'bridge';
      let endpoint = `/local-ai/status?${query.toString()}`;
      const headers: Record<string, string> = {};
      if (useBridge) {
        if (!localBridgeToken.trim()) throw new Error('Локальный мост не авторизован. Запустите local-ai-bridge\\Start-Local-Bridge.bat на компьютере и вставьте его токен сюда.');
        endpoint = `${normalizeBridgeUrl(localBridgeUrl)}/status?${query.toString()}`;
        headers['X-Local-Bridge-Token'] = localBridgeToken.trim();
      }
      const response = await fetch(endpoint, { cache: 'no-store', headers });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Проверка локальной модели завершилась с HTTP ${response.status}.`);
      const status = result as LocalAiStatus;
      if (status.available && selectedAiModelId && status.models?.length && !status.models.includes(selectedAiModelId)) {
        status.message += ` Выбранный alias «${selectedAiModelId}» не найден в списке активной модели.`;
      }
      setLocalAiStatus(status);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось проверить локальную модель.';
      const bridgeHint = localConnectionMode === 'bridge' && /failed to fetch|networkerror|load failed/i.test(message)
        ? ' Браузер не смог обратиться к localhost-мосту. Убедитесь, что Start-Local-Bridge.bat запущен, разрешите браузеру доступ к локальной сети и проверьте адрес моста.' : '';
      setLocalAiStatus({ available: false, baseUrl: localModelBaseUrl, models: [], message: message + bridgeHint });
    } finally { setCheckingLocalAi(false); }
  };

  const handleAddNode = (kind: 'container' | 'text' | 'shape' | 'line') => {
    if (!document) return;
    const node = createManualLayoutNode(kind, document.nodes.length + 1, document.width, document.height);
    const next = { ...document, nodes: [...document.nodes, node] };
    setDocument(next); setSelectedNodeId(node.id);
  };
  const patchNode = (patch: Partial<LayoutNode>) => {
    if (!document || !selectedNode) return;
    setDocument({ ...document, nodes: updateLayoutNode(document.nodes, selectedNode.id, patch) });
    // Manual edits are validated again in handleGenerate; keep the existing IR and avoid rerunning the AI unnecessarily.
    setPipelineStage('output', 'idle', 'Layout IR изменён. Перед экспортом изменения будут проверены повторно.');
  };
  const setSelectedNodeParent = (parentId: string) => {
    if (!document || !selectedNode) return;
    const parent = parentId ? document.nodes.find(item => item.id === parentId && item.kind === 'container') : undefined;
    const oldAbsolute = getLayoutNodeAbsolutePosition(document, selectedNode.id);
    const parentAbsolute = parent ? getLayoutNodeAbsolutePosition(document, parent.id) : { x: 0, y: 0 };
    const localX = oldAbsolute.x - parentAbsolute.x;
    const localY = oldAbsolute.y - parentAbsolute.y;
    setDocument({ ...document, nodes: updateLayoutNode(document.nodes, selectedNode.id, {
      parentId: parent?.id, x: localX, y: localY,
      layoutPositioning: parent && (parent.layoutMode || 'none') !== 'none' ? 'flow' : 'absolute',
    }) });
  };
  const deleteSelectedNode = () => {
    if (!document || !selectedNode) return;
    const parentAbs = selectedNode.parentId ? getLayoutNodeAbsolutePosition(document, selectedNode.parentId) : { x: 0, y: 0 };
    const next = document.nodes.filter(node => node.id !== selectedNode.id).map(node => {
      if (node.parentId !== selectedNode.id) return node;
      const absolute = getLayoutNodeAbsolutePosition(document, node.id);
      // Preserve immediate children visually when their container is removed.
      return { ...node, parentId: selectedNode.parentId, x: absolute.x - parentAbs.x, y: absolute.y - parentAbs.y, layoutPositioning: 'absolute' as const };
    });
    setDocument({ ...document, nodes: next }); setSelectedNodeId(next[0]?.id || null);
  };
  const resetAnalysis = () => {
    setDocument(null); setSelectedNodeId(null); setError(''); setMobileWorkspaceTab('sources'); setRightPaneTab('structure'); setPreviewLayerMode('source'); setOutputView('preview'); setStatus('Загрузите любой набор файлов: SVG, PNG, JSON; все источники необязательны.');
    setPipelineSvgSource(''); setPipelineSvgName(''); setPipelineJsonSource(''); setPipelineJsonName(''); setPipelineFigmaFrames([]); setPipelineSelectedFrameId(''); setPipelinePngDataUrl(''); if (pipelinePngUrl) URL.revokeObjectURL(pipelinePngUrl); setPipelinePngUrl(''); setPipelinePngName(''); setPipelinePngSize(null); resetPipelineRun();
  };

  const handleGenerate = async () => {
    if (!pipelineValidated) { setError('Запустите полный анализ и исправьте ошибки Layout IR до генерации RML/RCSS.'); return; }
    const currentValidation = validateLayoutPipelineDocument(document);
    setPipelineValidationErrors(currentValidation.errors);
    setPipelineValidationWarnings(currentValidation.warnings);
    if (!currentValidation.valid) { setPipelineValidated(false); setPipelineStage('ir', 'error', currentValidation.errors.join(' ')); setError(currentValidation.errors.join(' ')); return; }
    if (!document || !document.nodes.length) { setError('В сцене пока нет элементов. Добавьте хотя бы одну панель, текст, фигуру или линию в разделе «Слои», затем повторите генерацию.'); return; }
    setIsGenerating(true); setError('');
    try {
      const normalizedName = (screenName.replace(/[^a-zA-Z0-9_-]/g, '') || 'GeneratedLayout').slice(0, 48);
      const rasterNodes = document.nodes.filter(node => node.visible !== false && node.kind === 'raster' && node.rasterSvg);
      const assets: ProjectFile[] = [];
      const nextNodes = [...document.nodes];
      const rasterWarnings: string[] = [];
      const embeddedAssetNodes = document.nodes.filter(node => node.visible !== false && node.assetContentBase64 && node.assetMimeType === 'image/png');
      for (const [index, node] of embeddedAssetNodes.entries()) {
        const nodeIndex = nextNodes.findIndex(item => item.id === node.id);
        const assetPath = node.assetPath && /^Assets\/[a-zA-Z0-9._-]+\.png$/i.test(node.assetPath)
          ? node.assetPath
          : `Assets/figma-layer-${String(index + 1).padStart(3, '0')}.png`;
        if (nodeIndex >= 0) {
          const { assetContentBase64: _assetContentBase64, assetMimeType: _assetMimeType, ...nodeWithoutEmbeddedData } = nextNodes[nodeIndex];
          nextNodes[nodeIndex] = { ...nodeWithoutEmbeddedData, kind: 'raster', assetPath };
        }
        assets.push({ id: `figma-asset-${index + 1}-${Date.now()}`, path: `${normalizedName}/${assetPath}`, type: 'asset', content: node.assetContentBase64!, contentEncoding: 'base64', mimeType: 'image/png' });
      }
      for (const [index, node] of rasterNodes.entries()) {
        const nodeIndex = nextNodes.findIndex(item => item.id === node.id);
        try {
          const content = await svgToPngBase64(node.rasterSvg!, node.width, node.height);
          const filename = `vector-${String(index + 1).padStart(3, '0')}.png`;
          const assetPath = `Assets/${filename}`;
          if (nodeIndex >= 0) nextNodes[nodeIndex] = { ...nextNodes[nodeIndex], kind: 'raster', assetPath };
          assets.push({ id: `layout-asset-${index + 1}-${Date.now()}`, path: `${normalizedName}/${assetPath}`, type: 'asset', content, contentEncoding: 'base64', mimeType: 'image/png' });
        } catch (err) {
          rasterWarnings.push(`«${node.name}»: не удалось создать PNG: ${err instanceof Error ? err.message : 'неизвестная ошибка'}. В RML будет создана выделенная заглушка.`);
          if (nodeIndex >= 0) nextNodes[nodeIndex] = { ...nextNodes[nodeIndex], assetPath: undefined };
        }
      }
      const finalDoc = { ...document, name: layoutName, nodes: nextNodes, diagnostics: [...document.diagnostics, ...rasterWarnings] };
      const generated = generateLayoutSources(finalDoc);
      // The primary entrypoint preserves source pixels. The editable variant is included beside it.
      // A PNG input is packaged byte-for-byte; SVG is sanitized and rasterized at its source canvas size.
      let referencePngBase64 = '';
      let referenceDescription = '';
      if (pipelinePngDataUrl) {
        referencePngBase64 = await imageDataUrlToPngBase64(pipelinePngDataUrl);
        referenceDescription = /^data:image\/png;base64,/i.test(pipelinePngDataUrl) ? 'Исходный PNG (пиксели сохранены напрямую)' : 'Исходное изображение, lossless-конвертация в PNG';
      } else if (pipelineSvgSource.trim()) {
        referencePngBase64 = await svgToPngBase64(sanitizeSvgForPixelReference(pipelineSvgSource), finalDoc.width, finalDoc.height, true);
        referenceDescription = 'SVG, растеризованный в PNG при исходном разрешении';
      } else {
        // Render from the in-memory IR before stripping embedded PNG payloads for the editable export.
        referencePngBase64 = await svgToPngBase64(renderLayoutDocumentSvg({ ...document, name: finalDoc.name }), finalDoc.width, finalDoc.height, true);
        referenceDescription = 'Синтетический PNG из Layout IR: исходного изображения нет, поэтому визуальная точность не подтверждена';
      }
      const referenceSources = generateReferenceScreenSources(finalDoc, 'Assets/design-reference.png');
      const reportText = `${generated.report}\n\n## Пиксельный и редактируемый экспорт\n\n- Основной entrypoint: \`main.rml\` — ${referenceDescription}.\n- Редактируемый entrypoint: \`main-editable.rml\` + \`layout.rcss\`. Возможны визуальные отличия из-за ограничений RCSS или неполных данных источника.\n- PNG-эталон содержит изображение целиком. Нативными RML-элементами остаются только интерактивные зоны, явно отмеченные в редакторе.\n- Интерактивные зоны: ${finalDoc.nodes.filter(node => node.interaction && node.interaction !== 'none').length}. Они отправляют \`layout_ui_action\`; реальные игровые действия должны быть связаны на стороне UE.\n- Runtime-рендеринг в UE 5.8/VaCuus не был выполнен этой сборкой, поэтому нативная 100% визуальная точность не заявляется.\n\n## Диагностика pixel-reference entrypoint\n\n${referenceSources.diagnostics.length ? referenceSources.diagnostics.map(item => `- ${item}`).join('\n') : '- Ошибок генерации pixel-reference entrypoint не обнаружено.'}\n`;
      const files: ProjectFile[] = [
        // First RML is intentionally the visual-reference entrypoint so the initial preview matches the source.
        projectTextFile(`layout-reference-rml-${Date.now()}`, `${normalizedName}/main.rml`, referenceSources.rml, 'html'),
        projectTextFile(`layout-reference-rcss-${Date.now()}`, `${normalizedName}/reference.rcss`, referenceSources.rcss, 'css'),
        projectTextFile(`layout-rml-editable-${Date.now()}`, `${normalizedName}/main-editable.rml`, generated.rml, 'html'),
        projectTextFile(`layout-rcss-${Date.now()}`, `${normalizedName}/layout.rcss`, generated.rcss, 'css'),
        projectTextFile(`layout-js-${Date.now()}`, `${normalizedName}/layout.js`, generated.js, 'js'),
        projectTextFile(`layout-base-${Date.now()}`, `${normalizedName}/vacuus-base.rcss`, baseRcss, 'css'),
        projectTextFile(`layout-report-${Date.now()}`, `${normalizedName}/layout-report.md`, reportText, 'asset'),
        { id: `layout-design-reference-${Date.now()}`, path: `${normalizedName}/Assets/design-reference.png`, type: 'asset', content: referencePngBase64, contentEncoding: 'base64', mimeType: 'image/png' },
        ...assets,
      ];
      const bundleValidation = validateGeneratedLayoutBundle(files.map(file => ({ path: file.path, content: file.content, contentEncoding: file.contentEncoding, mimeType: file.mimeType })));
      if (!bundleValidation.valid) {
        const message = `Пакет не прошёл проверку ссылок RML/RCSS. Генерация отменена:
${bundleValidation.errors.map(item => `• ${item}`).join('\n')}`;
        setPipelineStage('output', 'error', message);
        throw new Error(message);
      }
      const qualityManifest = {
        schemaVersion: 1,
        generator: 'Kormatal VaCuus UI Converter',
        layoutName,
        sourceKind: finalDoc.sourceKind,
        canvas: { width: finalDoc.width, height: finalDoc.height, unit: 'source-px' },
        entrypoints: {
          visualReference: 'main.rml',
          editableStructure: 'main-editable.rml',
        },
        visualReference: {
          asset: 'Assets/design-reference.png',
          method: pipelinePngDataUrl ? 'source-png-pixels-preserved' : pipelineSvgSource.trim() ? 'svg-rasterized-at-canvas-size' : 'synthetic-raster-from-layout-ir',
          description: referenceDescription,
        },
        editableStructure: {
          files: ['main-editable.rml', 'layout.rcss', 'layout.js'],
          fidelity: 'structural-reconstruction-not-guaranteed-pixel-identical',
          elementCount: nextNodes.filter(node => node.visible !== false).length,
        },
        interactions: nextNodes.filter(node => node.visible !== false && node.interaction && node.interaction !== 'none').map(node => ({
          elementId: node.id,
          elementName: node.name,
          type: node.interaction,
          actionName: node.actionName || node.text || node.name,
          confidence: node.confidence ?? null,
          requiresUnrealBinding: true,
        })),
        qualityGate: {
          relativeReferencesValid: bundleValidation.valid,
          checkedReferences: bundleValidation.checkedReferences,
          warnings: [...currentValidation.warnings, ...bundleValidation.warnings, ...finalDoc.diagnostics, ...referenceSources.diagnostics, ...rasterWarnings],
          nativeVaCuusRuntimeVerified: false,
        },
      };
      const manifestText = JSON.stringify(qualityManifest, null, 2);
      files.push(projectTextFile(`layout-manifest-${Date.now()}`, `${normalizedName}/layout-manifest.json`, manifestText, 'asset'));
      const reportFile = files.find(file => file.path.toLowerCase().endsWith('/layout-report.md'));
      if (reportFile) reportFile.content += `\n\n## Проверка готового пакета\n\n- Внутренние ссылки RML проверены: ${bundleValidation.checkedReferences}.\n- Все обязательные входные файлы пакета найдены.\n- Нативный runtime VaCuus/UE5 не запускался; готовность в игре не подтверждена.\n- См. \`layout-manifest.json\` для entrypoints, способа сохранения визуального эталона, списка интерактивных зон и состояния quality gate.\n`;
      onApply(files, normalizedName);
      setPipelineStage('output', referenceSources.diagnostics.length || rasterWarnings.length || bundleValidation.warnings.length ? 'warning' : 'done', `Пакет проверен (${bundleValidation.checkedReferences} внутренних ссылок): pixel-reference и редактируемый RML, ${nextNodes.length} элементов, ${assets.length + 1} PNG-ресурсов, layout.js.`);
      setStatus(`Пакет проверен и создан: main.rml (визуальный эталон), main-editable.rml (редактируемая структура), layout.js. Эталон: ${referenceDescription}.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сгенерировать RML/RCSS.');
    } finally { setIsGenerating(false); }
  };

  if (!isOpen) return null;

  const renderNodeEditor = (node: LayoutNode) => (
    <div key={node.id} className={`rounded-lg border p-2.5 transition-colors ${node.id === selectedNodeId ? 'border-cyan-500/70 bg-cyan-950/20' : 'border-zinc-800 bg-zinc-950/40'}`}>
      <button type="button" onClick={() => setSelectedNodeId(node.id)} className="flex w-full items-center gap-2 text-left">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-zinc-800 text-zinc-300"><Layers3 className="h-3.5 w-3.5" /></span>
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-zinc-100">{node.name}</span><span className="block text-[10px] text-zinc-500">{node.kind} · {Math.round(node.x)},{Math.round(node.y)} · {Math.round(node.width)}×{Math.round(node.height)}</span></span>
        {node.confidence !== undefined && <span className={`text-[10px] tabular-nums ${node.confidence < 0.7 ? 'text-amber-400' : 'text-zinc-500'}`}>{Math.round(node.confidence * 100)}%</span>}
      </button>
      {node.id === selectedNodeId && <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-[10px] text-zinc-500">Название<input value={node.name} onChange={e => patchNode({ name: e.target.value })} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-cyan-600" /></label>
        {node.kind === 'text' || (node.kind === 'container' && node.text) ? <label className="col-span-2 text-[10px] text-zinc-500">Текст<input value={node.text || ''} onChange={e => patchNode({ text: e.target.value })} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-cyan-600" /></label> : null}
        {(['x','y','width','height'] as const).map(key => <label key={key} className="text-[10px] text-zinc-500">{{x:'X',y:'Y',width:'Ширина',height:'Высота'}[key]}<input type="number" value={Math.round(node[key])} min={key === 'width' || key === 'height' ? 1 : -document!.width} onChange={e => patchNode({ [key]: clamp(Number(e.target.value), key === 'width' || key === 'height' ? 1 : -document!.width, key === 'x' || key === 'width' ? document!.width * 2 : document!.height * 2) })} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-cyan-600" /></label>)}
        <label className="col-span-2 text-[10px] text-zinc-500">Родительский контейнер<select value={node.parentId || ''} onChange={e => setSelectedNodeParent(e.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"><option value="">Корневой холст</option>{document!.nodes.filter(candidate => candidate.kind === 'container' && candidate.id !== node.id && (() => { let cursor: LayoutNode | undefined = candidate; const seen = new Set<string>(); while (cursor && !seen.has(cursor.id)) { if (cursor.id === node.id) return false; seen.add(cursor.id); cursor = cursor.parentId ? document!.nodes.find(item => item.id === cursor!.parentId) : undefined; } return true; })()).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.layoutMode && candidate.layoutMode !== 'none' ? ` · ${candidate.layoutMode === 'horizontal' ? 'горизонтальный Flex' : 'вертикальный Flex'}` : ''}</option>)}</select><span className="mt-1 block text-[9px] text-zinc-600">Координаты X/Y отображаются относительно выбранного родителя.</span></label>
        {node.parentId && ((document!.nodes.find(item => item.id === node.parentId)?.layoutMode || 'none') !== 'none') && <label className="col-span-2 text-[10px] text-zinc-500">Размещение внутри Auto Layout<select value={node.layoutPositioning || 'flow'} onChange={e => patchNode({ layoutPositioning: e.target.value as LayoutNode['layoutPositioning'] })} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"><option value="flow">Участвует в раскладке</option><option value="absolute">Абсолютное позиционирование / оверлей</option></select></label>}
        <label className="text-[10px] text-zinc-500">Заливка<input type="text" value={node.fill || 'transparent'} onChange={e => patchNode({ fill: e.target.value })} placeholder="#20242b" className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-cyan-600" /></label>
        <label className="text-[10px] text-zinc-500">Обводка<input type="text" value={node.stroke || 'transparent'} onChange={e => patchNode({ stroke: e.target.value })} placeholder="#ffffff" className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-cyan-600" /></label>
        <label className="col-span-2 text-[10px] text-zinc-500">Поведение элемента<select value={node.interaction || 'none'} onChange={e => patchNode({ interaction: e.target.value as LayoutNode['interaction'] })} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"><option value="none">Только отображение</option><option value="button">Кнопка — отправляет событие в UE</option><option value="toggle">Переключатель — меняет активное состояние</option><option value="tab">Вкладка — переключает активное состояние</option></select><span className="mt-1 block text-[9px] text-zinc-600">Игра должна обработать событие layout_ui_action на стороне VaCuus/UE. Автоматически определить игровые действия по внешнему виду нельзя.</span></label>
        {node.interaction && node.interaction !== 'none' && <label className="col-span-2 text-[10px] text-zinc-500">Название действия<input type="text" value={node.actionName || node.name} onChange={e => patchNode({ actionName: e.target.value })} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100" /></label>}
        {node.kind === 'container' && <div className="col-span-2 rounded border border-zinc-800 p-2"><label className="block text-[10px] text-zinc-500">Режим контейнера<select value={node.layoutMode || 'none'} onChange={e => patchNode({ layoutMode: e.target.value as LayoutNode['layoutMode'] })} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"><option value="none">Абсолютное позиционирование</option><option value="horizontal">Flex — горизонтально</option><option value="vertical">Flex — вертикально</option></select></label>{(node.layoutMode || 'none') !== 'none' && <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[10px] text-zinc-500">Промежуток<input type="number" min={0} max={512} value={node.layoutItemSpacing || 0} onChange={e => patchNode({ layoutItemSpacing: clamp(Number(e.target.value), 0, 512) })} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100" /></label><label className="text-[10px] text-zinc-500">Выравнивание по главной оси<select value={node.layoutJustifyContent || 'flex-start'} onChange={e => patchNode({ layoutJustifyContent: e.target.value as LayoutNode['layoutJustifyContent'] })} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"><option value="flex-start">Начало</option><option value="center">Центр</option><option value="flex-end">Конец</option><option value="space-between">Между</option></select></label>{(['layoutPaddingTop','layoutPaddingRight','layoutPaddingBottom','layoutPaddingLeft'] as const).map((key,i)=><label key={key} className="text-[10px] text-zinc-500">{['Отступ сверху','Справа','Снизу','Слева'][i]}<input type="number" min={0} max={512} value={node[key] || 0} onChange={e => patchNode({ [key]: clamp(Number(e.target.value), 0, 512) })} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100" /></label>)}</div>}</div>}
        {node.kind === 'text' && <><label className="text-[10px] text-zinc-500">Шрифт<select value={node.fontFamily || 'Onest'} onChange={e => patchNode({ fontFamily: e.target.value as LayoutNode['fontFamily'] })} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100">{!['Onest', 'Tektur', 'JetBrains Mono'].includes(node.fontFamily || 'Onest') && <option value={node.fontFamily}>{node.fontFamily} · требуется файл шрифта</option>}<option>Onest</option><option>Tektur</option><option>JetBrains Mono</option></select></label><label className="text-[10px] text-zinc-500">Размер шрифта<input type="number" min={1} max={256} value={node.fontSize || 16} onChange={e => patchNode({ fontSize: clamp(Number(e.target.value), 1, 256) })} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100" /></label></>}
        <div className="col-span-2 flex justify-end"><button type="button" onClick={deleteSelectedNode} className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-950/40"><Trash2 className="h-3 w-3" /> Удалить элемент</button></div>
      </div>}
    </div>
  );

  const selectedPreviewUrl = previewLayerMode === 'ir'
    ? layoutIrPreviewUrl
    : (pipelinePngUrl || svgPreviewUrlForPipeline || layoutIrPreviewUrl);
  const uploadedSourceCount = Number(Boolean(pipelineJsonSource)) + Number(Boolean(pipelineSvgSource)) + Number(Boolean(pipelinePngDataUrl));
  const shortStageLabels: Record<PipelineStage['id'], string> = { json: 'JSON', svg: 'SVG', consistency: 'Сверка', png: 'PNG-анализ', ir: 'Layout IR', output: 'RML/RCSS' };
  const stageTone = (stage: PipelineStage) => stage.status === 'done' ? 'border-emerald-800 bg-emerald-950/30 text-emerald-200' : stage.status === 'warning' ? 'border-amber-800 bg-amber-950/25 text-amber-100' : stage.status === 'error' ? 'border-rose-800 bg-rose-950/30 text-rose-200' : stage.status === 'running' ? 'border-cyan-700 bg-cyan-950/30 text-cyan-100' : stage.status === 'skipped' ? 'border-zinc-800 bg-zinc-950 text-zinc-600' : 'border-zinc-800 bg-zinc-900/70 text-zinc-400';
  const switchWorkspace = (tab: 'sources' | 'preview' | 'structure' | 'code' | 'checks') => {
    setMobileWorkspaceTab(tab);
    if (tab === 'structure' || tab === 'code' || tab === 'checks') setRightPaneTab(tab);
    if (tab === 'code' && outputView === 'preview') setOutputView('rml');
  };
  const sourceCard = (kind: 'json' | 'svg' | 'png') => {
    const config = {
      json: { title: 'Figma JSON', name: pipelineJsonName, description: 'Слои, текст и структура', ref: pipelineJsonInputRef, accept: '.json,application/json', pick: () => pipelineJsonInputRef.current?.click(), remove: () => { setPipelineJsonSource(''); setPipelineJsonName(''); setPipelineFigmaFrames([]); setPipelineSelectedFrameId(''); resetPipelineRun(); }, change: (file?: File) => void handlePipelineJsonFile(file) },
      svg: { title: 'SVG', name: pipelineSvgName, description: 'Геометрия и графика', ref: pipelineSvgInputRef, accept: '.svg,image/svg+xml', pick: () => pipelineSvgInputRef.current?.click(), remove: () => { setPipelineSvgSource(''); setPipelineSvgName(''); resetPipelineRun(); }, change: (file?: File) => void handlePipelineSvgFile(file) },
      png: { title: 'PNG / изображение', name: pipelinePngName, description: pipelinePngSize ? `${pipelinePngSize.width} × ${pipelinePngSize.height}` : 'Визуальный эталон · AI анализ последним', ref: pipelinePngInputRef, accept: 'image/png,image/jpeg,image/webp', pick: () => pipelinePngInputRef.current?.click(), remove: () => { if (pipelinePngUrl) URL.revokeObjectURL(pipelinePngUrl); setPipelinePngDataUrl(''); setPipelinePngUrl(''); setPipelinePngName(''); setPipelinePngSize(null); resetPipelineRun(); }, change: (file?: File) => void handlePipelinePngFile(file) },
    } as const;
    const item = config[kind];
    const loaded = Boolean(item.name);
    const icon = kind === 'json' ? <FileCode2 className="h-4 w-4" /> : kind === 'svg' ? <Layers3 className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />;
    return <div key={kind} className={`rounded-xl border p-3 transition-colors ${loaded ? 'border-cyan-800/80 bg-cyan-950/15' : 'border-zinc-800 bg-zinc-900/45 hover:border-zinc-700'}`}>
      <input ref={item.ref} type="file" accept={item.accept} className="hidden" onChange={e => { item.change(e.target.files?.[0]); e.currentTarget.value = ''; }} />
      <div className="flex min-w-0 items-center gap-3">
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${loaded ? 'bg-cyan-900/50 text-cyan-200' : 'bg-zinc-800 text-zinc-400'}`}>{icon}</div>
        <div className="min-w-0 flex-1"><div className="text-xs font-semibold text-zinc-100">{item.title}<span className="ml-1.5 text-[10px] font-normal text-zinc-500">необязательно</span></div><div className={`mt-0.5 truncate text-[10px] ${loaded ? 'text-cyan-200' : 'text-zinc-500'}`} title={loaded ? item.name : item.description}>{loaded ? item.name : item.description}</div></div>
        {loaded ? <button type="button" onClick={item.remove} title="Убрать источник" className="shrink-0 rounded-md px-2 py-1.5 text-[10px] text-zinc-500 hover:bg-rose-950/40 hover:text-rose-200">Убрать</button> : <button type="button" onClick={item.pick} className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-[11px] font-medium text-zinc-200 hover:border-cyan-600 hover:text-white">Выбрать</button>}
      </div>
      {kind === 'json' && loaded && pipelineFigmaFrames.length > 1 && <label className="mt-3 block text-[10px] text-zinc-400">Выберите Frame<select value={pipelineSelectedFrameId} onChange={async e => {
        const nextFrameId = e.target.value;
        setPipelineSelectedFrameId(nextFrameId); resetPipelineRun();
        const embeddedReference = parseFigmaJsonReferenceImage(pipelineJsonSource, nextFrameId || undefined);
        if (embeddedReference) {
          try {
            const dataUrl = `data:${embeddedReference.mimeType};base64,${embeddedReference.contentBase64}`;
            const [size, response] = await Promise.all([decodeImage(dataUrl), fetch(dataUrl)]);
            if (!response.ok) throw new Error('Не удалось прочитать PNG-эталон выбранного Frame.');
            const blob = await response.blob();
            if (pipelinePngUrl) URL.revokeObjectURL(pipelinePngUrl);
            setPipelinePngDataUrl(dataUrl); setPipelinePngName(embeddedReference.name); setPipelinePngSize(size); setPipelinePngUrl(URL.createObjectURL(blob));
          } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось прочитать PNG-эталон выбранного Frame.'); }
        }
      }} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-xs text-zinc-100">{pipelineFigmaFrames.map(frame => <option key={frame.id} value={frame.id}>{frame.name} · {Math.round(frame.width)}×{Math.round(frame.height)}</option>)}</select></label>}
    </div>;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/80 backdrop-blur-sm sm:p-3 lg:p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Создание интерфейса по макету" className="ui-modal-panel flex h-[100dvh] max-h-[100dvh] w-full max-w-[1720px] min-w-0 flex-col overflow-hidden border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl sm:rounded-2xl sm:h-[min(960px,96dvh)] sm:max-h-[96dvh]">
        <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-900/95 px-3 py-3 sm:px-5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-cyan-800/60 bg-cyan-950/50 text-cyan-300"><WandSparkles className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold sm:text-base">Создание UI по макету</h2><p className="mt-0.5 hidden text-[11px] text-zinc-500 sm:block">Источники → проверка → Layout IR → RML / RCSS</p></div>
          <label className="flex shrink-0 items-center gap-1.5 text-[10px] text-zinc-500"><span className="hidden sm:inline">Экран</span><input aria-label="Имя экрана" value={screenName} onChange={e => setScreenName(e.target.value)} className="w-[88px] rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-[11px] text-zinc-100 outline-none focus:border-cyan-600 sm:w-36 sm:px-2.5 sm:text-xs" /></label>
          <button type="button" onClick={resetAnalysis} title="Очистить всё" className="rounded-lg border border-zinc-800 p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"><RotateCcw className="h-4 w-4" /></button>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white" aria-label="Закрыть"><X className="h-4 w-4" /></button>
        </header>

        <div className="shrink-0 border-b border-zinc-800 bg-zinc-950/90 px-3 py-2.5 sm:px-5">
          <div className="relative flex items-center justify-between gap-2"><div className="min-w-0 text-[11px] font-medium text-zinc-300"><span className="text-cyan-300">{uploadedSourceCount}/3</span> источника добавлено <span className="hidden text-zinc-600 sm:inline">· каждый файл необязателен</span></div><div className="text-[10px] text-zinc-500">{document ? `${document.nodes.length} элементов` : 'Layout IR ещё не создан'}</div></div>
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {pipelineStages.map((stage, index) => <React.Fragment key={stage.id}><div title={`${stage.label}: ${stage.detail}`} className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 ${stageTone(stage)}`}><span className={`grid h-4 w-4 place-items-center rounded-full text-[9px] ${stage.status === 'done' ? 'bg-emerald-400/20' : stage.status === 'running' ? 'bg-cyan-400/20' : stage.status === 'error' ? 'bg-rose-400/20' : 'bg-black/20'}`}>{stage.status === 'done' ? '✓' : stage.status === 'running' ? '…' : stage.status === 'error' ? '!' : index + 1}</span><span className="text-[10px] font-medium">{shortStageLabels[stage.id]}</span></div>{index < pipelineStages.length - 1 && <span className="h-px min-w-2 flex-1 bg-zinc-800" />}</React.Fragment>)}
            <details className="ml-auto shrink-0"><summary className="cursor-pointer list-none rounded-lg border border-zinc-800 px-2.5 py-1.5 text-[10px] text-zinc-400 hover:text-white">Этапы и ошибки</summary><div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-[45vh] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-3 shadow-2xl sm:left-auto sm:right-6 sm:w-[min(560px,90vw)]"><div className="space-y-3">{pipelineStages.map(stage => <div key={stage.id} className="border-b border-zinc-800 pb-2 last:border-0"><div className="text-[11px] font-semibold text-zinc-200">{stage.label}</div><p className="mt-1 text-[10px] leading-relaxed text-zinc-400">{stage.detail}</p></div>)}{pipelineValidationErrors.map((item, index) => <p key={`e-${index}`} className="text-[11px] text-rose-300">Ошибка: {item}</p>)}{pipelineValidationWarnings.map((item, index) => <p key={`w-${index}`} className="text-[11px] text-amber-200">Предупреждение: {item}</p>)}{document?.diagnostics.map((item, index) => <p key={`d-${index}`} className="text-[10px] text-zinc-400">{item}</p>)}</div></div></details>
          </div>
          <details className="group mt-2 rounded-lg border border-zinc-800 bg-zinc-900/45">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[11px] text-zinc-300"><Cpu className="h-3.5 w-3.5 text-fuchsia-300" /><span className="flex-1">Локальный AI для PNG</span><span className={`rounded-md px-2 py-1 text-[9px] ${analysisModelChoice === 'none' ? 'bg-zinc-800 text-zinc-500' : 'bg-fuchsia-950 text-fuchsia-200'}`}>{analysisModelChoice === 'none' ? 'выключен' : analysisModelChoice === 'qwen3vl' ? 'Qwen3-VL' : 'своя модель'}</span><span className="text-zinc-500 transition-transform group-open:rotate-180">⌄</span></summary>
            <div className="grid grid-cols-1 gap-3 border-t border-zinc-800 p-3 lg:grid-cols-2">
              <div className="min-w-0 space-y-3">
                <p className="text-[10px] leading-relaxed text-zinc-500">Используется только на финальном этапе PNG. SVG и JSON разбираются локально без модели. Для удалённого preview используйте локальный мост.</p>
                <label className="block text-[10px] text-zinc-400">Модель<select value={analysisModelChoice} onChange={e => { setAnalysisModelChoice(e.target.value as AiModelChoice); setLocalAiStatus(null); setError(''); }} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-fuchsia-500"><option value="none">Без ИИ — ручная проверка</option><option value="qwen3vl">Qwen3-VL 2B</option><option value="custom">Другая локальная vision-модель</option></select></label>
                <label className="block text-[10px] text-zinc-400">Адрес модели<input value={localModelBaseUrl} onChange={e => { setLocalModelBaseUrl(e.target.value); setLocalAiStatus(null); }} placeholder="http://192.168.1.22:1234/v1" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100" /></label>
                <label className="block text-[10px] text-zinc-400">Тайм-аут запроса, секунд<input type="number" min={60} max={900} step={30} value={localAiTimeoutSeconds} onChange={e => setLocalAiTimeoutSeconds(String(Math.max(60, Math.min(900, Number(e.target.value) || 600))))} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100" /><span className="mt-1 block text-[9px] leading-relaxed text-zinc-500">Для Qwen3.8 используется быстрый профиль: Native API LM Studio (если доступен), reasoning выключен, контекст 8K, PNG до 768 px и короткий JSON. Тайм-аут задаёт верхнюю границу ожидания, но не ускоряет модель.</span></label>
                {analysisModelChoice === 'custom' && <label className="block text-[10px] text-zinc-400">ID / alias модели<input value={localModelAlias} onChange={e => { setLocalModelAlias(e.target.value); setLocalAiStatus(null); }} placeholder="ID из /v1/models" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100" /></label>}
                {analysisModelChoice === 'custom' && localAiStatus?.available && localAiStatus.models.length > 0 && <label className="block text-[10px] text-zinc-400">Доступные модели<select value={localAiStatus.models.includes(localModelAlias) ? localModelAlias : ''} onChange={e => setLocalModelAlias(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"><option value="">Выберите ID…</option>{localAiStatus.models.map(model => <option key={model} value={model}>{model}</option>)}</select></label>}
              </div>
              <div className="min-w-0 space-y-3">
                <label className="block text-[10px] text-zinc-400">Способ подключения<select value={localConnectionMode} onChange={e => { setLocalConnectionMode(e.target.value as LocalConnectionMode); setLocalAiStatus(null); }} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"><option value="app-server">Локальный сервер приложения</option><option value="bridge">Локальный мост Windows</option></select></label>
                {localConnectionMode === 'bridge' && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2"><label className="block text-[10px] text-zinc-400">Адрес моста<input value={localBridgeUrl} onChange={e => setLocalBridgeUrl(e.target.value)} placeholder="http://127.0.0.1:17891" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100" /></label><label className="block text-[10px] text-zinc-400">Токен моста<input value={localBridgeToken} onChange={e => setLocalBridgeToken(e.target.value)} type="password" autoComplete="off" placeholder="Токен из консоли" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100" /></label><p className="text-[9px] leading-relaxed text-amber-200/80 sm:col-span-2 lg:col-span-1 2xl:col-span-2">На этом ПК запустите local-ai-bridge\Start-Local-Bridge.bat. Мост слушает только 127.0.0.1.</p></div>}
                <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => void handleCheckLocalAi()} disabled={analysisModelChoice === 'none' || checkingLocalAi || !localModelBaseUrl.trim() || (localConnectionMode === 'bridge' && !localBridgeToken.trim())} className="rounded-lg border border-zinc-700 px-3 py-2 text-[11px] text-zinc-200 hover:border-fuchsia-500 disabled:opacity-40"><Server className="mr-1.5 inline h-3.5 w-3.5" />{checkingLocalAi ? 'Проверка…' : 'Проверить подключение'}</button><span className="text-[10px] text-zinc-500">{analysisModelChoice === 'none' ? 'Можно продолжить без AI.' : 'Запросы идут только на выбранный локальный endpoint.'}</span></div>
                {localAiStatus && <div role="status" className={`rounded-lg border px-3 py-2 text-[10px] ${localAiStatus.available ? 'border-emerald-900 bg-emerald-950/25 text-emerald-200' : 'border-amber-900 bg-amber-950/25 text-amber-200'}`}><div className="font-semibold">{localAiStatus.available ? 'Движок доступен' : 'Нет соединения'}</div><p className="mt-1 leading-relaxed">{localAiStatus.message}</p></div>}
              </div>
            </div>
          </details>
        </div>

        <nav aria-label="Разделы рабочего процесса" className="grid shrink-0 grid-cols-5 gap-1 border-b border-zinc-800 bg-zinc-900/70 p-2 lg:hidden">
          {([['sources','Файлы'],['preview','Просмотр'],['structure','Слои'],['code','Код'],['checks','Проверки']] as const).map(([tab,label]) => <button type="button" key={tab} onClick={() => switchWorkspace(tab)} className={`min-w-0 truncate rounded-lg px-1.5 py-2 text-[10px] font-medium ${mobileWorkspaceTab === tab ? 'bg-cyan-700/80 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>{label}{tab === 'sources' && uploadedSourceCount ? <span className="ml-1 text-cyan-200">{uploadedSourceCount}</span> : null}{tab === 'structure' && document ? <span className="ml-1 text-cyan-200">{document.nodes.length}</span> : null}</button>)}
        </nav>

        <main className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(245px,285px)_minmax(0,1fr)_minmax(310px,370px)]">
          <section className={`${mobileWorkspaceTab === 'sources' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-col border-b border-zinc-800 lg:flex lg:border-b-0 lg:border-r`}>
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3"><div><h3 className="text-xs font-semibold">1. Источники макета</h3><p className="mt-1 text-[10px] text-zinc-500">Добавьте любые файлы</p></div><span className="rounded-md bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300">{uploadedSourceCount}/3</span></div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {sourceCard('json')}{sourceCard('svg')}{sourceCard('png')}
              {!uploadedSourceCount && <div className="rounded-xl border border-dashed border-zinc-700 p-4 text-center"><Upload className="mx-auto h-5 w-5 text-zinc-500" /><p className="mt-2 text-[11px] font-medium text-zinc-300">Начните с любого файла</p><p className="mt-1 text-[10px] leading-relaxed text-zinc-500">Рекомендуется PNG как визуальный эталон. JSON добавляет текст и слои, SVG — точную геометрию и графику.</p></div>}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/45 px-3 py-2.5"><div className="text-[10px] font-medium text-zinc-300">Порядок обработки</div><p className="mt-1 text-[10px] leading-relaxed text-zinc-500">JSON → SVG → сверка → PNG-анализ последним → Layout IR. Отсутствующие источники пропускаются.</p></div>
              {error && <div role="alert" className="rounded-lg border border-rose-900 bg-rose-950/30 p-3 text-[11px] text-rose-200">{error}</div>}
            </div>
            <div className="shrink-0 border-t border-zinc-800 p-3"><button type="button" onClick={() => void handleRunFullPipeline()} disabled={isAnalyzing || isGenerating || !uploadedSourceCount} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-700 px-3 py-3 text-xs font-semibold text-white hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-40"><ScanLine className={`h-4 w-4 ${isAnalyzing ? 'animate-pulse' : ''}`} />{isAnalyzing ? 'Проверяю источники…' : 'Запустить анализ'}</button><p className="mt-2 text-center text-[9px] text-zinc-600">Сначала будет собран и проверен Layout IR</p></div>
          </section>

          <section className={`${mobileWorkspaceTab === 'preview' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-col border-b border-zinc-800 lg:flex lg:border-b-0 lg:border-r`}>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-3 sm:px-4"><div><h3 className="text-xs font-semibold">2. Предпросмотр</h3><p className="mt-1 text-[10px] text-zinc-500">{document ? `${Math.round(document.width)} × ${Math.round(document.height)} · ${document.nodes.length} элементов` : 'Исходный макет появится здесь'}</p></div><div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5"><button type="button" onClick={() => setPreviewLayerMode('source')} className={`rounded-md px-2 py-1.5 text-[10px] ${previewLayerMode === 'source' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-white'}`}>Исходник</button><button type="button" onClick={() => setPreviewLayerMode('ir')} disabled={!layoutIrPreviewUrl} className={`rounded-md px-2 py-1.5 text-[10px] ${previewLayerMode === 'ir' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-white disabled:opacity-30'}`}>Layout IR</button></div></div>
            <div className="relative flex min-h-[280px] flex-1 items-center justify-center overflow-auto bg-[radial-gradient(#303039_1px,transparent_1px)] [background-size:18px_18px] p-3 sm:p-5">
              {selectedPreviewUrl ? <div className="relative max-h-full max-w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl" style={{ aspectRatio: `${document?.width || 16}/${document?.height || 9}`, width: '100%' }}><img src={selectedPreviewUrl} alt={previewLayerMode === 'ir' ? 'Предпросмотр Layout IR' : 'Исходный макет'} className="block h-full w-full object-contain" />{previewLayerMode === 'source' && document?.nodes.map(node => <button type="button" key={node.id} onClick={() => { setSelectedNodeId(node.id); setRightPaneTab('structure'); setMobileWorkspaceTab('structure'); }} title={node.name} style={{ position: 'absolute', left: `${(absolutePositions.get(node.id)?.x ?? node.x) / (document.width || 1) * 100}%`, top: `${(absolutePositions.get(node.id)?.y ?? node.y) / (document.height || 1) * 100}%`, width: `${node.width / (document.width || 1) * 100}%`, height: `${node.height / (document.height || 1) * 100}%`, border: `1px solid ${node.id === selectedNodeId ? '#22d3ee' : 'rgba(232,121,249,.7)'}`, background: node.id === selectedNodeId ? 'rgba(34,211,238,.12)' : 'rgba(232,121,249,.025)' }} className="cursor-pointer" />)}</div> : <div className="max-w-xs px-5 text-center"><ImageIcon className="mx-auto h-10 w-10 text-zinc-700" /><p className="mt-3 text-xs font-medium text-zinc-300">Загрузите макет</p><p className="mt-1 text-[10px] leading-relaxed text-zinc-500">Предпросмотр появится сразу после загрузки SVG или PNG. После анализа можно переключиться на схему Layout IR.</p><button type="button" onClick={() => switchWorkspace('sources')} className="mt-3 rounded-lg border border-zinc-700 px-3 py-2 text-[10px] text-zinc-300 hover:bg-zinc-800">Добавить источник</button></div>}
            </div>
          </section>

          <section className={`${['structure','code','checks'].includes(mobileWorkspaceTab) ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-col lg:flex`}>
            <div className="grid shrink-0 grid-cols-3 gap-1 border-b border-zinc-800 bg-zinc-950/70 p-2">{([['structure','Слои'],['code','Код'],['checks','Проверки']] as const).map(([tab,label]) => <button type="button" key={tab} onClick={() => switchWorkspace(tab)} className={`rounded-lg px-2 py-2 text-[10px] font-medium ${rightPaneTab === tab ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200'}`}>{label}{tab === 'structure' && document ? <span className="ml-1 text-cyan-300">{document.nodes.length}</span> : tab === 'checks' && (pipelineValidationErrors.length + pipelineValidationWarnings.length) > 0 ? <span className="ml-1 text-amber-300">{pipelineValidationErrors.length + pipelineValidationWarnings.length}</span> : null}</button>)}</div>
            {rightPaneTab === 'structure' && <>
              <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-2.5"><div><h3 className="text-xs font-semibold">3. Структура Layout IR</h3><p className="mt-0.5 text-[10px] text-zinc-500">Выберите слой, чтобы отредактировать</p></div><span className="text-[10px] text-zinc-500">{document?.nodes.length || 0}</span></div>
              <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-zinc-800 p-2.5">{([['container','Панель'],['text','Текст'],['shape','Фигура'],['line','Линия']] as const).map(([kind,label]) => <button type="button" key={kind} onClick={() => handleAddNode(kind)} disabled={!document} className="flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1.5 text-[10px] text-zinc-300 hover:border-cyan-600 hover:text-white disabled:opacity-30"><Plus className="h-3 w-3" />{label}</button>)}</div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{document?.nodes.length ? document.nodes.map(renderNodeEditor) : <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-center"><MousePointer2 className="mx-auto h-6 w-6 text-zinc-700" /><p className="mt-2 text-xs text-zinc-300">Слои появятся после анализа</p><p className="mt-1 text-[10px] text-zinc-500">Либо загрузите PNG и выберите локальную vision-модель, либо добавьте элементы вручную.</p></div>}</div>
            </>}
            {rightPaneTab === 'code' && <>
              <div className="shrink-0 border-b border-zinc-800 px-3 py-3"><h3 className="text-xs font-semibold">4. Выходной код</h3><div className="mt-2 grid grid-cols-3 gap-1">{([['rml','RML'],['rcss','RCSS'],['report','Отчёт']] as const).map(([value,label]) => <button type="button" key={value} onClick={() => setOutputView(value)} className={`rounded-lg px-2 py-2 text-[10px] ${outputView === value ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200'}`}>{label}</button>)}</div></div>
              <div className="min-h-0 flex-1 overflow-auto p-3">{outputView === 'rml' ? <pre className="h-full min-h-48 whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-black/35 p-3 font-mono text-[10px] leading-relaxed text-emerald-200">{sources?.rml || 'RML появится после успешной валидации Layout IR.'}</pre> : outputView === 'rcss' ? <pre className="h-full min-h-48 whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-black/35 p-3 font-mono text-[10px] leading-relaxed text-cyan-200">{sources?.rcss || 'RCSS появится после анализа макета.'}</pre> : <pre className="min-h-48 whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-black/35 p-3 font-mono text-[10px] leading-relaxed text-amber-100">{sources?.report || 'Отчёт появится после анализа макета.'}</pre>}</div>
              <div className="shrink-0 border-t border-zinc-800 px-3 py-2 text-[9px] text-zinc-500">Шрифты: Onest · Tektur · JetBrains Mono</div>
            </>}
            {rightPaneTab === 'checks' && <>
              <div className="shrink-0 border-b border-zinc-800 px-3 py-3"><h3 className="text-xs font-semibold">Проверки и диагностика</h3><p className="mt-1 text-[10px] text-zinc-500">Ошибки блокируют генерацию; предупреждения можно проверить перед экспортом.</p></div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                {error && <div role="alert" className="rounded-lg border border-rose-900 bg-rose-950/35 p-3 text-[11px] text-rose-200">{error}</div>}
                {pipelineValidationErrors.map((item, index) => <div key={`err-${index}`} className="flex gap-2 rounded-lg border border-rose-900/70 bg-rose-950/20 p-3 text-[10px] text-rose-200"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{item}</div>)}
                {pipelineValidationWarnings.map((item, index) => <div key={`warn-${index}`} className="flex gap-2 rounded-lg border border-amber-900/70 bg-amber-950/20 p-3 text-[10px] text-amber-100"><Info className="h-3.5 w-3.5 shrink-0" />{item}</div>)}
                {document?.diagnostics.map((item, index) => <p key={`diag-${index}`} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5 text-[10px] leading-relaxed text-zinc-400">{item}</p>)}
                <div className="rounded-xl border border-zinc-800 p-3"><div className="mb-3 text-[11px] font-semibold text-zinc-200">Этапы конвейера</div><div className="space-y-3">{pipelineStages.map(stage => <div key={stage.id} className="flex gap-2.5"><span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${stage.status === 'done' ? 'bg-emerald-400' : stage.status === 'warning' ? 'bg-amber-400' : stage.status === 'error' ? 'bg-rose-400' : stage.status === 'running' ? 'animate-pulse bg-cyan-400' : 'bg-zinc-700'}`} /><div className="min-w-0"><div className="text-[10px] font-medium text-zinc-200">{stage.label}</div><p className="mt-0.5 text-[9px] leading-relaxed text-zinc-500">{stage.detail}</p></div></div>)}</div></div>
                {!error && pipelineValidationErrors.length === 0 && pipelineValidationWarnings.length === 0 && !(document?.diagnostics.length) && <div className="rounded-xl border border-dashed border-zinc-800 p-5 text-center text-[10px] text-zinc-500">Здесь появятся предупреждения по источникам, Layout IR и совместимости RML/RCSS.</div>}
              </div>
            </>}
          </section>
        </main>

        <footer className="modal-footer-actions flex shrink-0 flex-wrap items-center gap-3 border-t border-zinc-800 bg-zinc-900/95 px-3 py-3 sm:px-5">
          <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-medium text-zinc-200">{status}</p><p className="mt-1 text-[10px] text-zinc-500">{uploadedSourceCount ? `${uploadedSourceCount} источника · ` : ''}{document ? `${document.nodes.length} элементов` : 'Ожидается макет'}{document?.diagnostics.length ? ` · ${document.diagnostics.length} диагностик` : ''}{pipelineValidated ? ' · Layout IR проверен' : ''}</p>{error && <p role="alert" className="mt-1 line-clamp-2 text-[10px] text-rose-300">{error}</p>}</div>
          <button type="button" onClick={onClose} className="rounded-lg border border-zinc-700 px-3 py-2.5 text-[11px] text-zinc-300 hover:bg-zinc-800">Закрыть</button>
          <button type="button" onClick={() => pipelineValidated ? void handleGenerate() : void handleRunFullPipeline()} disabled={isAnalyzing || isGenerating || (!pipelineValidated && !uploadedSourceCount) || (pipelineValidated && !document?.nodes.length)} className="flex min-w-[180px] items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-[11px] font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[230px]">{isAnalyzing ? <><ScanLine className="h-4 w-4 animate-pulse" />Анализирую…</> : isGenerating ? <><WandSparkles className="h-4 w-4 animate-pulse" />Создаю RML/RCSS…</> : pipelineValidated ? <><CheckCircle2 className="h-4 w-4" />Создать RML/RCSS</> : <><ScanLine className="h-4 w-4" />Проанализировать макет</>}</button>
        </footer>
      </div>
    </div>
  );
};
