import React from 'react';
import {
  Download,
  BookOpen,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Save,
  FilePlus2,
  WandSparkles,
} from 'lucide-react';
import type { SavedProject } from '../core/saved-projects.ts';
import { ConversionMetrics } from '../core/types.ts';

interface HeaderProps {
  screenName: string;
  setScreenName: (name: string) => void;
  savedProjects: SavedProject[];
  currentSavedProjectId: string | null;
  onSelectSavedProject: (project: SavedProject) => void;
  onOpenSaveProject: () => void;
  onConvert: () => void;
  onApplyAllFixes?: () => void;
  safeFixesAvailable: number;
  onOpenExport: () => void;
  onOpenGuide: () => void;
  onOpenKnowledge: () => void;
  onOpenLayoutGenerator: () => void;
  onNewProject: () => void;
  isConverting: boolean;
  metrics: ConversionMetrics;
  hasFiles: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  screenName, setScreenName, savedProjects, currentSavedProjectId, onSelectSavedProject,
  onOpenSaveProject, onConvert, onApplyAllFixes, safeFixesAvailable, onOpenExport,
  onOpenGuide, onOpenKnowledge, onOpenLayoutGenerator, onNewProject, isConverting, metrics, hasFiles,
}) => (
  <header className="app-header flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950 px-3 py-3 text-zinc-100 shadow-md sm:px-4">
    <div className="app-header-brand flex min-w-0 max-w-full flex-1 items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-gradient-to-br from-amber-500 via-orange-600 to-rose-600 text-white font-black text-sm tracking-tighter shadow-sm">KR</div>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="safe-wrap text-sm font-bold tracking-wide text-zinc-100">Kormatal — редактор RML UI</h1>
          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-zinc-800 text-amber-400 border border-zinc-700">UE 5.x / RmlUi</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Модуль готов</span>
        </div>
        <p className="safe-wrap text-[11px] leading-relaxed text-zinc-400">Преобразование HTML/CSS/JS → RML/RCSS/JS и анализ совместимости</p>
      </div>
    </div>

    <div className="app-header-project flex min-w-0 max-w-full flex-wrap items-center gap-2">
      <label className="flex min-w-0 max-w-full items-center rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs">
        <span className="mr-2 shrink-0 text-zinc-500">Экран:</span>
        <input type="text" value={screenName} onChange={e => setScreenName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} className="min-w-0 w-28 bg-transparent font-mono font-medium text-zinc-200 focus:outline-none" placeholder="MainMenu" title="Имя папки в Content/DevUI/ (латиница, цифры и _)" aria-label="Имя экрана" />
      </label>

      <select
        value={currentSavedProjectId ?? ''}
        onChange={e => { const project = savedProjects.find(item => item.id === e.target.value); if (project) onSelectSavedProject(project); }}
        className="max-w-56 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs border border-zinc-800 rounded px-2.5 py-1.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
        aria-label="Открыть сохранённый проект"
        title="Сохранённые проекты"
      >
        <option value="" disabled>{savedProjects.length ? 'Открыть сохранённый проект…' : 'Сохранённых проектов нет'}</option>
        {savedProjects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>

      <div className="hidden min-w-0 items-center gap-2 rounded border border-zinc-800/80 bg-zinc-900/80 px-2.5 py-1 text-xs xl:flex">
        {metrics.errorsCount > 0 ? <span className="flex items-center gap-1 text-rose-400" title={`${metrics.errorsCount} критических ошибок`}><XCircle className="w-3.5 h-3.5" />{metrics.errorsCount}</span> : <span className="flex items-center gap-1 text-emerald-400" title="Ошибок нет"><CheckCircle2 className="w-3.5 h-3.5" />0</span>}
        <span className="text-zinc-600">|</span><span className="flex items-center gap-1 text-amber-400" title={`${metrics.warningsCount} предупреждений`}><AlertTriangle className="w-3.5 h-3.5" />{metrics.warningsCount}</span>
        <span className="text-zinc-600">|</span>
        {onApplyAllFixes && safeFixesAvailable > 0 ? <button onClick={onApplyAllFixes} className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 hover:underline cursor-pointer font-medium" title="Применить только безопасные исправления исходника">✨ Исправить ({safeFixesAvailable})</button> : <span className="text-cyan-400" title="Преобразования применены к выходным файлам">✨ Правок: {metrics.autoFixesApplied}</span>}
      </div>
    </div>

    <div className="app-header-actions flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
      <button onClick={onNewProject} className="flex min-h-8 max-w-full items-center gap-1.5 rounded px-2.5 py-1.5 text-xs leading-tight bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800" title="Начать пустой проект"><FilePlus2 className="w-3.5 h-3.5" /><span>Новый</span></button>
      <button onClick={onOpenSaveProject} disabled={!hasFiles} className="flex min-h-8 max-w-full items-center gap-1.5 rounded px-2.5 py-1.5 text-xs leading-tight bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed" title="Сохранить текущий проект в этом браузере"><Save className="w-3.5 h-3.5" /><span>Сохранить</span></button>
      <button onClick={onOpenLayoutGenerator} className="flex min-h-8 max-w-full items-center gap-1.5 rounded px-2.5 py-1.5 text-xs leading-tight bg-fuchsia-700/90 hover:bg-fuchsia-600 text-white border border-fuchsia-600/70" title="Создать интерфейс по макету SVG, PNG или Figma JSON"><WandSparkles className="w-3.5 h-3.5" /><span>По макету</span></button>
      <button onClick={onOpenKnowledge} className="flex min-h-8 max-w-full items-center gap-1.5 rounded px-2.5 py-1.5 text-xs leading-tight bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800" title="База знаний о совместимости VaCuus и RmlUi"><Sparkles className="w-3.5 h-3.5 text-yellow-400" /><span>База знаний</span></button>
      <button onClick={onOpenGuide} className="flex min-h-8 max-w-full items-center gap-1.5 rounded px-2.5 py-1.5 text-xs leading-tight bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800" title="Инструкция по интеграции с Unreal Engine 5"><BookOpen className="w-3.5 h-3.5 text-cyan-400" /><span>Инструкция UE5</span></button>
      <button onClick={onConvert} disabled={isConverting || !hasFiles} className="flex min-h-8 max-w-full items-center gap-1.5 rounded px-3 py-1.5 text-xs leading-tight bg-cyan-600 hover:bg-cyan-500 text-white font-medium shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed" title="Повторить преобразование и анализ совместимости"><RefreshCw className={`w-3.5 h-3.5 ${isConverting ? 'animate-spin' : ''}`} /><span>Пересчитать</span></button>
      <button onClick={onOpenExport} disabled={!hasFiles} className="flex min-h-8 max-w-full items-center gap-1.5 rounded px-3 py-1.5 text-xs leading-tight bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed" title="Экспортировать пакет для Unreal Engine в ZIP"><Download className="w-3.5 h-3.5" /><span>Экспорт ZIP</span></button>
    </div>
  </header>
);
