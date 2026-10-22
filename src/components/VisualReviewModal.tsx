import React, { useEffect, useMemo, useState } from 'react';
import { X, Upload, ScanLine, ShieldCheck, AlertTriangle, CheckCircle2, CircleHelp, Image as ImageIcon, LoaderCircle, RefreshCw, Server } from 'lucide-react';
import { choosePreferredVisionModel, isModelListed } from '../core/visual-review-model-selection.ts';

interface VisualReviewIssue {
  severity: 'critical' | 'major' | 'minor' | 'info';
  category: string;
  element: string;
  expected: string;
  observed: string;
  suggestedFix: string;
  confidence: number;
}
interface VisualReviewResult {
  score: number;
  verdict: 'pass' | 'needs-fixes' | 'fail';
  summary: string;
  matches: string[];
  issues: VisualReviewIssue[];
  limitations: string[];
  model: string;
  knowledgeContext?: { entriesUsed: number; documentSections: number; contextChars: number; sources: string[] };
}
interface Props {
  isOpen: boolean;
  onClose: () => void;
  sourceHtml: string;
  sourceCss: string;
  targetRml: string;
  targetRcss: string;
  deterministicDiagnostics?: string;
}
type ConnectionMode = 'app-server' | 'bridge';
type ModelChoice = 'auto' | 'custom';
type ConnectionStatus = 'idle' | 'checking' | 'available' | 'failed';
interface LocalModelStatus { available?: boolean; models?: string[]; message?: string; error?: string; }

function readText(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function readModel(): ModelChoice {
  try { return localStorage.getItem('kormatal.visual-review-model') === 'custom' ? 'custom' : 'auto'; } catch { return 'auto'; }
}
function readConnectionMode(): ConnectionMode {
  try {
    const value = localStorage.getItem('kormatal.layout-ai-connection-mode');
    if (value === 'bridge') return 'bridge';
    if (value === 'app-server') return 'app-server';
    return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname.toLowerCase()) ? 'app-server' : 'bridge';
  } catch { return 'app-server'; }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Не удалось открыть изображение «${file.name}».`)); };
    image.src = url;
  });
}

async function encodeCanvas(canvas: HTMLCanvasElement): Promise<{ imageBase64: string; mimeType: string; width: number; height: number }> {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) throw new Error('Не удалось подготовить изображение для модели.');
  if (blob.size > 8 * 1024 * 1024) throw new Error('Подготовленный скриншот превышает 8 МБ. Уменьшите разрешение исходных снимков.');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Не удалось прочитать подготовленный скриншот.'));
    reader.onerror = () => reject(new Error('Не удалось прочитать подготовленный скриншот.'));
    reader.readAsDataURL(blob);
  });
  const comma = dataUrl.indexOf(',');
  return { imageBase64: dataUrl.slice(comma + 1), mimeType: 'image/jpeg', width: canvas.width, height: canvas.height };
}

async function prepareSingleComparison(file: File) {
  const image = await loadImage(file);
  const scale = Math.min(1, 2200 / image.naturalWidth, 1800 / image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D недоступен в этом браузере.');
  ctx.fillStyle = '#101316'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return encodeCanvas(canvas);
}

async function composeScreenshots(reference: File, converted: File) {
  const [left, right] = await Promise.all([loadImage(reference), loadImage(converted)]);
  const panelWidth = 1080;
  const imageScale = (image: HTMLImageElement) => Math.min(1, panelWidth / image.naturalWidth, 1350 / image.naturalHeight);
  const leftScale = imageScale(left), rightScale = imageScale(right);
  const leftHeight = Math.max(1, Math.round(left.naturalHeight * leftScale));
  const rightHeight = Math.max(1, Math.round(right.naturalHeight * rightScale));
  const panelHeight = Math.max(leftHeight, rightHeight);
  const headerHeight = 54;
  const gutter = 14;
  const canvas = document.createElement('canvas');
  canvas.width = panelWidth * 2 + gutter;
  canvas.height = panelHeight + headerHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D недоступен в этом браузере.');
  ctx.fillStyle = '#111418'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const drawPanel = (image: HTMLImageElement, x: number, label: string, scale: number) => {
    ctx.fillStyle = '#202a30'; ctx.fillRect(x, 0, panelWidth, headerHeight);
    ctx.fillStyle = label === 'REFERENCE · ORIGINAL' ? '#67e8f9' : '#c4b5fd';
    ctx.font = '600 20px Arial, sans-serif'; ctx.fillText(label, x + 18, 34);
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    ctx.fillStyle = '#080a0c'; ctx.fillRect(x, headerHeight, panelWidth, panelHeight);
    ctx.drawImage(image, x + (panelWidth - w) / 2, headerHeight + (panelHeight - h) / 2, w, h);
  };
  drawPanel(left, 0, 'REFERENCE · ORIGINAL', leftScale);
  drawPanel(right, panelWidth + gutter, 'CONVERTED · VACUUS', rightScale);
  return encodeCanvas(canvas);
}

const severityLabels: Record<VisualReviewIssue['severity'], string> = {
  critical: 'Критично', major: 'Важно', minor: 'Незначительно', info: 'Информация',
};
const severityTone: Record<VisualReviewIssue['severity'], string> = {
  critical: 'border-red-800 bg-red-950/35 text-red-100',
  major: 'border-orange-800 bg-orange-950/30 text-orange-100',
  minor: 'border-amber-800 bg-amber-950/25 text-amber-100',
  info: 'border-zinc-700 bg-zinc-900 text-zinc-300',
};
const verdictLabels: Record<VisualReviewResult['verdict'], string> = { pass: 'Визуально близко', 'needs-fixes': 'Нужны исправления', fail: 'Существенные расхождения' };

export const VisualReviewModal: React.FC<Props> = ({ isOpen, onClose, sourceHtml, sourceCss, targetRml, targetRcss, deterministicDiagnostics = '' }) => {
  const [inputMode, setInputMode] = useState<'pair' | 'side-by-side'>('pair');
  const [comparisonFile, setComparisonFile] = useState<File | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [convertedFile, setConvertedFile] = useState<File | null>(null);
  const [modelChoice, setModelChoice] = useState<ModelChoice>(readModel);
  const [modelAlias, setModelAlias] = useState(() => readText('kormatal.visual-review-model-alias', ''));
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModelId, setSelectedModelId] = useState(() => readText('kormatal.visual-review-selected-model', ''));
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [connectionMessage, setConnectionMessage] = useState('Проверьте подключение, чтобы получить точный ID модели из /v1/models.');
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [baseUrl, setBaseUrl] = useState(() => readText('kormatal.layout-ai-base-url', 'http://127.0.0.1:1234/v1'));
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(readConnectionMode);
  const [bridgeUrl, setBridgeUrl] = useState(() => readText('kormatal.layout-ai-bridge-url', 'http://127.0.0.1:17891'));
  const [bridgeToken, setBridgeToken] = useState(() => readText('kormatal.layout-ai-bridge-token', ''));
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<VisualReviewResult | null>(null);
  const preferredDetectedModel = useMemo(() => choosePreferredVisionModel(availableModels, selectedModelId), [availableModels, selectedModelId]);
  const modelId = modelChoice === 'custom' ? modelAlias.trim() : preferredDetectedModel;

  useEffect(() => {
    if (!isOpen) return;
    setError('');
  }, [isOpen]);
  useEffect(() => {
    try {
      if (!isOpen) return;
      localStorage.setItem('kormatal.visual-review-model', modelChoice);
      localStorage.setItem('kormatal.visual-review-model-alias', modelAlias);
      localStorage.setItem('kormatal.visual-review-selected-model', selectedModelId);
      localStorage.setItem('kormatal.layout-ai-base-url', baseUrl);
      localStorage.setItem('kormatal.layout-ai-connection-mode', connectionMode);
      localStorage.setItem('kormatal.layout-ai-bridge-url', bridgeUrl);
      localStorage.setItem('kormatal.layout-ai-bridge-token', bridgeToken);
    } catch { /* Continue with the current-session settings if storage is disabled. */ }
  }, [isOpen, modelChoice, modelAlias, selectedModelId, baseUrl, connectionMode, bridgeUrl, bridgeToken]);

  useEffect(() => {
    if (!isOpen) return;
    setConnectionStatus('idle');
    setConnectionMessage('Проверьте подключение, чтобы получить точный ID модели из /v1/models.');
    setAvailableModels([]);
  }, [baseUrl, connectionMode, bridgeUrl, isOpen]);

  const canRun = !isRunning && !isCheckingConnection && (inputMode === 'pair' ? Boolean(referenceFile && convertedFile) : Boolean(comparisonFile)) && Boolean(modelId) && connectionStatus === 'available' && Boolean(baseUrl.trim()) && (connectionMode !== 'bridge' || Boolean(bridgeToken.trim())) && (modelChoice !== 'custom' || availableModels.length === 0 || isModelListed(modelAlias.trim(), availableModels));
  const previewFiles = useMemo(() => inputMode === 'pair' ? [referenceFile, convertedFile].filter(Boolean) as File[] : comparisonFile ? [comparisonFile] : [], [inputMode, referenceFile, convertedFile, comparisonFile]);
  if (!isOpen) return null;

  const validateBridgeOrigin = () => {
    let url: URL;
    try { url = new URL(bridgeUrl.trim()); } catch { throw new Error('Некорректный адрес локального моста.'); }
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname.toLowerCase()) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Мост должен иметь адрес вида http://127.0.0.1:17891.');
    }
    return url.origin;
  };

  const checkConnection = async () => {
    setIsCheckingConnection(true);
    setConnectionStatus('checking');
    setConnectionMessage('Проверяю локальный сервер и запрашиваю доступные модели…');
    setError('');
    try {
      if (!baseUrl.trim()) throw new Error('Укажите адрес API модели.');
      let statusEndpoint = `/local-ai/status?baseUrl=${encodeURIComponent(baseUrl.trim())}`;
      const headers: Record<string, string> = {};
      if (connectionMode === 'bridge') {
        if (!bridgeToken.trim()) throw new Error('Введите токен из окна Start-Local-Bridge.bat.');
        statusEndpoint = `${validateBridgeOrigin()}/status?baseUrl=${encodeURIComponent(baseUrl.trim())}`;
        headers['X-Local-Bridge-Token'] = bridgeToken.trim();
      }
      const response = await fetch(statusEndpoint, { method: 'GET', headers, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
      const status = await response.json().catch(() => ({})) as LocalModelStatus;
      if (!response.ok) throw new Error(status.error || `Проверка подключения завершилась с HTTP ${response.status}.`);
      if (!status.available) throw new Error(status.message || 'Локальный сервер недоступен.');
      const models = Array.isArray(status.models) ? status.models.filter(value => typeof value === 'string' && value.trim()) : [];
      setAvailableModels(models);
      const chosen = choosePreferredVisionModel(models, selectedModelId);
      if (chosen) setSelectedModelId(chosen);
      setConnectionStatus('available');
      if (models.length === 0) {
        setConnectionMessage(`${status.message || 'API доступен.'} Список моделей не получен. Переключитесь на ручной ввод ID модели.`);
      } else if (chosen) {
        setConnectionMessage(`Соединение установлено. Найдено моделей: ${models.length}. Выбрана: ${chosen}.`);
      } else {
        setConnectionMessage(`Соединение установлено, моделей: ${models.length}, но очевидная vision-модель не распознана. Выберите ID вручную и проверьте поддержку изображений.`);
      }
    } catch (e) {
      setConnectionStatus('failed');
      setAvailableModels([]);
      setConnectionMessage(e instanceof Error ? e.message : 'Не удалось проверить локальный сервер.');
    } finally { setIsCheckingConnection(false); }
  };

  const runReview = async () => {
    setIsRunning(true); setError(''); setResult(null);
    try {
      if (connectionStatus !== 'available') throw new Error('Сначала нажмите «Проверить подключение и найти модель».');
      if (!modelId) throw new Error('Не найден ID модели. Проверьте /v1/models или переключитесь на ручной ввод.');
      if (modelChoice === 'custom' && availableModels.length > 0 && !isModelListed(modelId, availableModels)) throw new Error(`Модель «${modelId}» отсутствует в /v1/models. Выберите точный ID из списка.`);
      let image: { imageBase64: string; mimeType: string; width: number; height: number };
      let sourceName = '';
      if (inputMode === 'side-by-side') {
        if (!comparisonFile) throw new Error('Загрузите скриншот, где исходник слева, а результат справа.');
        image = await prepareSingleComparison(comparisonFile);
        sourceName = comparisonFile.name;
      } else {
        if (!referenceFile || !convertedFile) throw new Error('Загрузите оба скриншота: исходник и результат VaCuus.');
        image = await composeScreenshots(referenceFile, convertedFile);
        sourceName = `${referenceFile.name} → ${convertedFile.name}`;
      }
      let endpoint = '/local-ai/visual-review';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (connectionMode === 'bridge') {
        endpoint = `${validateBridgeOrigin()}/visual-review`;
        headers['X-Local-Bridge-Token'] = bridgeToken.trim();
      }
      const response = await fetch(endpoint, {
        method: 'POST', headers,
        body: JSON.stringify({
          ...image, sourceName, model: modelId, baseUrl: baseUrl.trim(),
          sourceHtml: sourceHtml.slice(0, 8_000), sourceCss: sourceCss.slice(0, 9_000),
          targetRml: targetRml.slice(0, 8_000), targetRcss: targetRcss.slice(0, 9_000),
          deterministicDiagnostics: deterministicDiagnostics.slice(0, 4_000),
        }),
      });
      const payload = await response.json().catch(() => ({})) as VisualReviewResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || `AI-проверка завершилась с HTTP ${response.status}.`);
      setResult(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить AI-проверку.');
    } finally { setIsRunning(false); }
  };

  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/80 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="visual-review-title">
      <div className="ui-modal-panel flex max-h-full w-full max-w-5xl min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
        <header className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-900 px-4 py-3 sm:px-5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-cyan-800 bg-cyan-950/60 text-cyan-300"><ShieldCheck className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><h2 id="visual-review-title" className="text-sm font-semibold text-zinc-100">AI-проверка качества конвертации</h2><p className="mt-0.5 text-[10px] text-zinc-500">Сравнивает видимый результат и исходный макет. Ничего не исправляет автоматически.</p></div>
          <button type="button" onClick={onClose} aria-label="Закрыть AI-проверку" className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"><X className="h-4 w-4" /></button>
        </header>
        <div className="visual-review-grid ui-modal-body grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <section className="min-h-0 space-y-4 overflow-y-auto p-4 sm:p-5">
            <div><h3 className="text-xs font-semibold text-zinc-200">1. Что сравниваем</h3><p className="mt-1 text-[10px] leading-relaxed text-zinc-400">Эта кнопка не снимает экран автоматически. Загрузите эталонный скриншот и скриншот полученного интерфейса в одинаковом состоянии. Для проверки реального VaCuus используйте снимок из UE/PIE; браузерная эмуляция проверяет только приближённый результат.</p></div>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-1">
              <button type="button" onClick={() => setInputMode('pair')} className={`rounded-lg px-3 py-2 text-[11px] ${inputMode === 'pair' ? 'bg-cyan-700 text-white' : 'text-zinc-400 hover:bg-zinc-800'}`}>Два отдельных снимка</button>
              <button type="button" onClick={() => setInputMode('side-by-side')} className={`rounded-lg px-3 py-2 text-[11px] ${inputMode === 'side-by-side' ? 'bg-cyan-700 text-white' : 'text-zinc-400 hover:bg-zinc-800'}`}>Уже сравнены рядом</button>
            </div>
            {inputMode === 'pair' ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {([{ title: 'Исходник / браузер', file: referenceFile, set: setReferenceFile, hint: 'Эталонный вид HTML' }, { title: 'Результат VaCuus', file: convertedFile, set: setConvertedFile, hint: 'RML/RCSS в UE или эмуляторе' }] as const).map(item => <label key={item.title} className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-3 text-center hover:border-cyan-700"><input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => item.set(e.target.files?.[0] || null)} /><ImageIcon className="mb-2 h-6 w-6 text-zinc-500" /><span className="text-[11px] font-semibold text-zinc-200">{item.title}</span><span className="mt-1 text-[9px] text-zinc-500">{item.file?.name || item.hint}</span><span className="mt-2 rounded-md border border-zinc-700 px-2 py-1 text-[9px] text-zinc-300">Выбрать файл</span></label>)}
            </div> : <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-4 text-center hover:border-cyan-700"><input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setComparisonFile(e.target.files?.[0] || null)} /><Upload className="mb-2 h-6 w-6 text-zinc-500" /><span className="text-[11px] font-semibold text-zinc-200">Скриншот сравнения</span><span className="mt-1 text-[9px] text-zinc-500">Левая область — исходник, правая — результат</span><span className="mt-2 rounded-md border border-zinc-700 px-2 py-1 text-[9px] text-zinc-300">{comparisonFile?.name || 'Выбрать файл'}</span></label>}
            {previewFiles.length > 0 && <div className="space-y-1">{previewFiles.map(file => <p key={file.name} className="truncate text-[9px] text-zinc-500">• {file.name} · {(file.size / 1024).toFixed(0)} КБ</p>)}</div>}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-3"><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-zinc-200"><ScanLine className="h-4 w-4 text-cyan-400" />База знаний VaCuus/RmlUi подключена</div><p className="text-[10px] leading-relaxed text-zinc-500">Перед запросом будут выбраны релевантные правила из реестров RML/RCSS/JavaScript и разделы Markdown-документации проекта. Источники и объём реально переданного контекста будут показаны в отчёте.</p></div>
            {error && <div role="alert" className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-[10px] leading-relaxed text-red-200"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{error}</div>}
            {result && <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/35 p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[10px] uppercase tracking-wider text-zinc-500">Оценка AI · не пиксельная метрика</div><div className="mt-1 text-2xl font-semibold text-zinc-100">{result.score}<span className="ml-1 text-sm text-zinc-500">/ 100</span></div></div><span className={`rounded-lg border px-2.5 py-1.5 text-[10px] ${result.verdict === 'pass' ? 'border-emerald-800 bg-emerald-950/30 text-emerald-200' : result.verdict === 'fail' ? 'border-red-800 bg-red-950/30 text-red-200' : 'border-amber-800 bg-amber-950/30 text-amber-200'}`}>{verdictLabels[result.verdict]}</span></div>
              <p className="text-[11px] leading-relaxed text-zinc-300">{result.summary}</p>
              {result.matches.length > 0 && <div><h4 className="mb-1 text-[10px] font-semibold text-emerald-300">Совпадает</h4><ul className="space-y-1">{result.matches.map((match, index) => <li key={index} className="text-[10px] leading-relaxed text-zinc-400">• {match}</li>)}</ul></div>}
              {result.issues.length > 0 && <div className="space-y-2"><h4 className="text-[10px] font-semibold text-zinc-200">Расхождения ({result.issues.length})</h4>{result.issues.map((issue, index) => <article key={`${issue.element}-${index}`} className={`rounded-lg border p-3 ${severityTone[issue.severity]}`}><div className="flex flex-wrap items-center gap-2"><span className="text-[9px] font-bold uppercase tracking-wide">{severityLabels[issue.severity]}</span><span className="rounded bg-black/20 px-1.5 py-0.5 text-[9px]">{issue.category}</span><span className="ml-auto text-[9px] opacity-70">уверенность {Math.round(issue.confidence * 100)}%</span></div><h5 className="mt-1.5 text-[11px] font-semibold">{issue.element}</h5><p className="mt-1 text-[10px] leading-relaxed"><b>Ожидалось:</b> {issue.expected || 'не определено'}</p><p className="mt-1 text-[10px] leading-relaxed"><b>Получено:</b> {issue.observed || 'не определено'}</p>{issue.suggestedFix && <p className="mt-1.5 border-t border-white/10 pt-1.5 text-[10px] leading-relaxed"><b>Что проверить:</b> {issue.suggestedFix}</p>}</article>)}</div>}
              {result.limitations.length > 0 && <div className="flex gap-2 rounded-lg border border-zinc-800 bg-black/20 p-2.5 text-[9px] leading-relaxed text-zinc-500"><CircleHelp className="h-3.5 w-3.5 shrink-0" /><ul className="space-y-1">{result.limitations.map((item, index) => <li key={index}>• {item}</li>)}</ul></div>}
              {result.knowledgeContext && <div className="rounded-lg border border-cyan-900/60 bg-cyan-950/20 p-3"><div className="text-[10px] font-semibold text-cyan-200">Knowledge Engine · контекст этого запроса</div><div className="mt-1 text-[9px] leading-relaxed text-zinc-400">Передано записей: {result.knowledgeContext.entriesUsed} · разделов документации: {result.knowledgeContext.documentSections} · {result.knowledgeContext.contextChars.toLocaleString()} символов.</div>{result.knowledgeContext.sources.length > 0 && <ul className="mt-2 space-y-1">{result.knowledgeContext.sources.map((source, index) => <li key={`${source}-${index}`} className="break-words text-[9px] text-zinc-500">• {source}</li>)}</ul>}</div>}
              <p className="text-[9px] text-zinc-600">Модель: {result.model}. Результат — подсказки для разработчика; код автоматически не менялся.</p>
            </div>}
          </section>
          <aside className="min-h-0 space-y-4 overflow-y-auto border-t border-zinc-800 bg-zinc-900/35 p-4 sm:p-5 lg:border-l lg:border-t-0">
            <div><h3 className="text-xs font-semibold text-zinc-200">2. Подключение модели</h3><p className="mt-1 text-[10px] leading-relaxed text-zinc-500">Перед проверкой нажмите кнопку ниже. Конвертер запросит /v1/models и подставит точный ID модели из LM Studio — имя по умолчанию не зашито.</p></div>
            <label className="block text-[10px] text-zinc-400">Выбор модели<select value={modelChoice} onChange={e => { const next = e.target.value as ModelChoice; if (next === 'custom' && !modelAlias.trim() && modelId) setModelAlias(modelId); setModelChoice(next); }} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"><option value="auto">Автоматически из /v1/models</option><option value="custom">Указать ID вручную</option></select></label>
            {modelChoice === 'auto' && availableModels.length > 0 && <label className="block text-[10px] text-zinc-400">Обнаруженные модели<select value={availableModels.includes(selectedModelId) ? selectedModelId : modelId} onChange={e => setSelectedModelId(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-[10px] text-zinc-100">{!modelId && <option value="" disabled>Vision-модель не определена автоматически</option>}{availableModels.map(id => <option key={id} value={id}>{id}</option>)}</select><span className="mt-1 block text-[9px] text-zinc-600">Для анализа изображения нужна vision/multimodal-модель. Qwen3.8-27B будет выбрана автоматически, если сервер вернул её ID.</span></label>}
            {modelChoice === 'custom' && <label className="block text-[10px] text-zinc-400">Точный ID / alias модели<input value={modelAlias} onChange={e => setModelAlias(e.target.value)} placeholder="Например, qwen/qwen3.8-27b" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100" /><span className="mt-1 block text-[9px] text-zinc-600">Скопируйте ID без изменений из ответа /v1/models.</span></label>}
            <label className="block text-[10px] text-zinc-400">Способ подключения<select value={connectionMode} onChange={e => setConnectionMode(e.target.value as ConnectionMode)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"><option value="app-server">Локальное приложение</option><option value="bridge">Через Local AI Bridge</option></select></label>
            {connectionMode === 'app-server' ? <label className="block text-[10px] text-zinc-400">Адрес API модели<input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="http://127.0.0.1:1234/v1" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-[10px] text-zinc-100" /><span className="mt-1 block leading-relaxed text-zinc-600">LM Studio часто использует порт 1234; пакет llama.cpp проекта — 8081. Укажите фактический адрес работающего сервера.</span></label> : <><label className="block text-[10px] text-zinc-400">Адрес моста<input value={bridgeUrl} onChange={e => setBridgeUrl(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-[10px] text-zinc-100" /></label><label className="block text-[10px] text-zinc-400">Токен моста<input type="password" autoComplete="off" value={bridgeToken} onChange={e => setBridgeToken(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-[10px] text-zinc-100" /></label><label className="block text-[10px] text-zinc-400">Адрес API модели на компьютере-мосте<input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-[10px] text-zinc-100" /></label></>}
            <button type="button" onClick={() => void checkConnection()} disabled={isCheckingConnection || isRunning || !baseUrl.trim() || (connectionMode === 'bridge' && !bridgeToken.trim())} className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-800 bg-cyan-950/45 px-3 py-2.5 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-900/50 disabled:cursor-not-allowed disabled:opacity-40">{isCheckingConnection ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{isCheckingConnection ? 'Проверяю сервер…' : 'Проверить подключение и найти модель'}</button>
            <div aria-live="polite" className={`rounded-lg border p-3 text-[10px] leading-relaxed ${connectionStatus === 'available' ? 'border-emerald-900 bg-emerald-950/30 text-emerald-200' : connectionStatus === 'failed' ? 'border-red-900 bg-red-950/30 text-red-200' : 'border-zinc-800 bg-black/20 text-zinc-500'}`}><div className="mb-1 flex items-center gap-2 font-semibold">{connectionStatus === 'available' ? <CheckCircle2 className="h-3.5 w-3.5" /> : connectionStatus === 'failed' ? <AlertTriangle className="h-3.5 w-3.5" /> : <Server className="h-3.5 w-3.5" />}{connectionStatus === 'available' ? 'Сервер доступен' : connectionStatus === 'failed' ? 'Подключение не подтверждено' : connectionStatus === 'checking' ? 'Проверка подключения' : 'Состояние сервера'}</div>{connectionMessage}</div>
            <div className="rounded-lg border border-zinc-800 bg-black/20 p-3 text-[10px] leading-relaxed text-zinc-500"><p className="font-semibold text-zinc-300">Что сделает проверка</p><p className="mt-1">Конвертер отправит два изображения (или один side-by-side) и текущие HTML/CSS/RML/RCSS в локальную vision-модель. Qwen сравнит геометрию, типографику, ресурсы и ограничения RCSS и вернёт отчёт. Файлы не меняются автоматически. Оценка модели — ориентировочная, не пиксельная метрика.</p></div>
          </aside>
        </div>
        <footer className="modal-footer-actions flex flex-wrap items-center gap-2 border-t border-zinc-800 bg-zinc-900 px-4 py-3 sm:px-5"><div className="min-w-0 flex-1 text-[9px] leading-relaxed text-zinc-500">Сначала проверьте соединение и найденную модель. Затем загрузите снимки и запустите аудит. Данные отправляются только выбранному локальному endpoint; файлы не перезаписываются.</div><button type="button" onClick={onClose} className="rounded-lg border border-zinc-700 px-3 py-2 text-[10px] text-zinc-300 hover:bg-zinc-800">Закрыть</button><button type="button" onClick={() => void runReview()} disabled={!canRun} className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-[10px] font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40">{isRunning ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}{isRunning ? 'Проверяю…' : result ? 'Проверить ещё раз' : 'Запустить AI-проверку'}</button></footer>
      </div>
    </div>
  );
};
