import React, { useState } from 'react';
import { getSafeSourceAutoFixes, isSafeSourceAutoFix } from '../core/safe-auto-fix.ts';
import {
  AlertTriangle,
  XCircle,
  Wrench,
  Info,
  HelpCircle,
  CheckCircle2,
  Filter,
  Search,
  ExternalLink,
  Sparkles,
  ArrowRight,
  PanelRightClose,
} from 'lucide-react';
import { DiagnosticIssue, DiagnosticSeverity, DiagnosticCategory } from '../core/types.ts';
import { translateDiagnosticText } from '../core/localization-ru.ts';

interface DiagnosticsPanelProps {
  diagnostics: DiagnosticIssue[];
  onApplyFix: (issueId: string) => void;
  onApplyAllFixes?: () => void;
  onNavigateToLine: (file: string, line: number) => void;
  onCollapse: () => void;
}

export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  diagnostics,
  onApplyFix,
  onApplyAllFixes,
  onNavigateToLine,
  onCollapse,
}) => {
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const counts = {
    all: diagnostics.length,
    error: diagnostics.filter(d => d.severity === 'error').length,
    warning: diagnostics.filter(d => d.severity === 'warning').length,
    manualFix: diagnostics.filter(d => d.severity === 'manual-fix').length,
    info: diagnostics.filter(d => d.severity === 'info').length,
    unverified: diagnostics.filter(d => d.severity === 'unverified').length,
  };

  const filtered = diagnostics.filter(d => {
    if (severityFilter !== 'all' && d.severity !== severityFilter) return false;
    if (categoryFilter !== 'all' && d.category !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        translateDiagnosticText(d.message).toLowerCase().includes(q) ||
        d.originalSnippet.toLowerCase().includes(q) ||
        translateDiagnosticText(d.recommendedAction).toLowerCase().includes(q) ||
        d.file.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getSeverityBadge = (severity: DiagnosticSeverity) => {
    switch (severity) {
      case 'error':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800">
            <XCircle className="w-3 h-3 text-rose-400" />
            Ошибка
          </span>
        );
      case 'warning':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            Предупреждение
          </span>
        );
      case 'manual-fix':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800">
            <Wrench className="w-3 h-3 text-purple-400" />
            Нужна правка
          </span>
        );
      case 'info':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800">
            <Info className="w-3 h-3 text-blue-400" />
            Информация
          </span>
        );
      case 'unverified':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
            <HelpCircle className="w-3 h-3 text-zinc-400" />
            Не проверено
          </span>
        );
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded border border-zinc-800 bg-zinc-950">
      {/* Diagnostics Toolbar */}
      <div className="p-3 bg-zinc-900 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2">
        <div className="diagnostic-heading-actions flex items-center gap-2">
          <span className="safe-wrap font-semibold text-xs text-zinc-200">Диагностика совместимости</span>
          <button onClick={onCollapse} className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-cyan-300" title="Свернуть панель" aria-label="Свернуть панель диагностики"><PanelRightClose className="h-3.5 w-3.5" /></button>
          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono">
            {filtered.length} / {diagnostics.length}
          </span>
          {onApplyAllFixes && getSafeSourceAutoFixes(diagnostics).length > 0 && (
            <button
              onClick={onApplyAllFixes}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black shadow-sm transition-all cursor-pointer"
              title="Применить только безопасные исправления исходника; неоднозначные изменения будут пропущены"
            >
              <Sparkles className="w-3 h-3 text-black fill-current" />
              <span>Исправить всё ({getSafeSourceAutoFixes(diagnostics).length})</span>
            </button>
          )}
        </div>

        {/* Search */}
        <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs w-48">
          <Search className="w-3.5 h-3.5 text-zinc-500 mr-1.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по диагностике…"
            className="bg-transparent text-zinc-200 focus:outline-none w-full text-[11px]"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-3 py-2 bg-zinc-900/60 border-b border-zinc-800/80 flex flex-wrap items-center gap-1 text-xs">
        <button
          onClick={() => setSeverityFilter('all')}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            severityFilter === 'all'
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
          }`}
        >
          Все ({counts.all})
        </button>
        <button
          onClick={() => setSeverityFilter('error')}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            severityFilter === 'error'
              ? 'bg-rose-900 text-rose-100'
              : 'text-rose-400 hover:bg-rose-950/50'
          }`}
        >
          <XCircle className="w-3 h-3" />
          Ошибки ({counts.error})
        </button>
        <button
          onClick={() => setSeverityFilter('warning')}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            severityFilter === 'warning'
              ? 'bg-amber-900 text-amber-100'
              : 'text-amber-400 hover:bg-amber-950/50'
          }`}
        >
          <AlertTriangle className="w-3 h-3" />
          Предупреждения ({counts.warning})
        </button>
        <button
          onClick={() => setSeverityFilter('manual-fix')}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            severityFilter === 'manual-fix'
              ? 'bg-purple-900 text-purple-100'
              : 'text-purple-400 hover:bg-purple-950/50'
          }`}
        >
          <Wrench className="w-3 h-3" />
          Вручную ({counts.manualFix})
        </button>
        <button
          onClick={() => setSeverityFilter('info')}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            severityFilter === 'info'
              ? 'bg-blue-900 text-blue-100'
              : 'text-blue-400 hover:bg-blue-950/50'
          }`}
        >
          <Info className="w-3 h-3" />
          Информация ({counts.info})
        </button>

        <span className="text-zinc-700 mx-1">|</span>

        {/* Category selector */}
        {['all', 'html', 'css', 'js'].map((cat) => (
          <button
            key={cat === 'all' ? 'Все' : cat.toUpperCase()}
            onClick={() => setCategoryFilter(cat)}
            className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-mono transition-colors ${
              categoryFilter === cat
                ? 'bg-cyan-900 text-cyan-200 border border-cyan-700'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {cat === 'all' ? 'Все' : cat.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Diagnostics List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
            <p className="text-sm font-medium text-zinc-300">Проблем не найдено</p>
            <p className="text-xs text-zinc-500 mt-1">
              Исходный код проверен на совместимость с RmlUi / VaCuus.
            </p>
          </div>
        ) : (
          filtered.map((item, idx) => (
            <div
              key={`${item.id}-${idx}`}
              className={`p-3 rounded border text-xs transition-all ${
                item.fixed
                  ? 'bg-zinc-900/40 border-zinc-800 opacity-60'
                  : item.severity === 'error'
                  ? 'bg-rose-950/20 border-rose-900/60'
                  : item.severity === 'warning'
                  ? 'bg-amber-950/20 border-amber-900/60'
                  : item.severity === 'manual-fix'
                  ? 'bg-purple-950/20 border-purple-900/60'
                  : 'bg-zinc-900/60 border-zinc-800'
              }`}
            >
              {/* Header */}
              <div className="mb-1.5 flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {getSeverityBadge(item.severity)}
                  <span className="text-[10px] uppercase px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono">
                    {item.category}
                  </span>
                  <button
                    onClick={() => onNavigateToLine(item.file, item.line)}
                    className="font-mono text-[11px] text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1"
                    title="Перейти к строке в редакторе"
                  >
                    <span>{item.file}:{item.line}</span>
                  </button>
                </div>

                {isSafeSourceAutoFix(item) ? (
                  <button
                    onClick={() => onApplyFix(item.id)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-colors bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm"
                    title="Безопасно переименовать зарезервированный алиас и его привязки только внутри этого цикла"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Безопасно исправить</span>
                  </button>
                ) : item.autoFixAvailable ? (
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${item.fixed ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-amber-950/60 text-amber-300 border-amber-900'}`}
                    title={item.fixed ? 'Совместимое преобразование уже применено к сгенерированному выводу; исходник сохранён.' : 'Автоматическая правка исходника может изменить макет или логику, поэтому требуется проверка.'}
                  >
                    {item.fixed ? 'Исправлено в результате' : 'Проверьте вручную'}
                  </span>
                ) : null}
              </div>

              {/* Message */}
              <p className="font-medium text-zinc-200 text-xs mb-1.5 leading-relaxed">
                {translateDiagnosticText(item.message)}
              </p>

              {/* Snippet */}
              {item.originalSnippet && (
                <div className="bg-zinc-950 border border-zinc-800/80 rounded p-1.5 mb-2 font-mono text-[11px] text-zinc-300 overflow-x-auto">
                  <code>{item.originalSnippet}</code>
                </div>
              )}

              {/* Impact & Action */}
              <div className="space-y-1 text-[11px] text-zinc-400">
                <div className="flex items-start gap-1">
                  <span className="font-semibold text-zinc-500 uppercase text-[9px] w-14 shrink-0">Влияние:</span>
                  <span className="text-zinc-300">{translateDiagnosticText(item.impact)}</span>
                </div>
                <div className="flex items-start gap-1">
                  <span className="font-semibold text-cyan-500 uppercase text-[9px] w-14 shrink-0">Решение:</span>
                  <span className="text-cyan-300">{translateDiagnosticText(item.recommendedAction)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
