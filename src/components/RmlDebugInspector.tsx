import React, { useState } from 'react';
import {
  Bug,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  Minimize2,
  Maximize2,
  Search,
  Layers,
  Sparkles,
  Info,
  Type,
  Box,
  MousePointer,
  HelpCircle,
} from 'lucide-react';

export interface MappedRcssProperty {
  property: string;
  value: string;
  status: 'supported' | 'supported-with-limits' | 'parses-not-rendered' | 'unsupported';
  notes?: string;
}

export interface EngineWarning {
  type: 'zero-dimension' | 'unsupported-prop' | 'unrendered-prop' | 'missing-font' | 'non-compositing' | 'display-collapse';
  title: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
}

export interface InspectedRmlElement {
  tagName: string;
  id: string;
  className: string;
  rect: { width: number; height: number; top: number; left: number };
  computedОтображение: string;
  computedPosition: string;
  computedColor: string;
  computedBg: string;
  computedFontFamily: string;
  computedFontSize: string;
  mappedProperties: MappedRcssProperty[];
  warnings: EngineWarning[];
  textSnippet?: string;
  isPinned?: boolean;
}

interface RmlDebugInspectorProps {
  element: InspectedRmlElement | null;
  allElements?: InspectedRmlElement[];
  onSelectElement?: (el: InspectedRmlElement) => void;
  onClose: () => void;
  onClear: () => void;
}

export const RmlDebugInspector: React.FC<RmlDebugInspectorProps> = ({
  element,
  allElements,
  onSelectElement,
  onClose,
  onClear,
}) => {
  const [filter, setFilter] = useState<'all' | 'mapped' | 'issues'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  const filteredProperties = (element?.mappedProperties || []).filter((prop) => {
    if (filter === 'mapped' && (prop.status === 'parses-not-rendered' || prop.status === 'unsupported')) {
      return false;
    }
    if (filter === 'issues' && prop.status === 'supported') {
      return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return prop.property.toLowerCase().includes(q) || prop.value.toLowerCase().includes(q);
    }
    return true;
  });

  const supportedCount = (element?.mappedProperties || []).filter(
    (p) => p.status === 'supported' || p.status === 'supported-with-limits'
  ).length;
  const issuesCount = (element?.mappedProperties || []).filter(
    (p) => p.status === 'parses-not-rendered' || p.status === 'unsupported'
  ).length;

  return (
    <div
      className={`absolute bottom-4 left-4 z-40 bg-zinc-950/95 backdrop-blur-md border border-amber-500/50 rounded-xl shadow-2xl transition-all flex flex-col overflow-hidden text-xs text-zinc-200 ${
        isMinimized ? 'w-80 max-h-12' : 'w-96 max-h-[520px]'
      }`}
      style={{ boxShadow: '0 12px 36px -4px rgba(0, 0, 0, 0.8), 0 0 20px -2px rgba(245, 158, 11, 0.2)' }}
    >
      {/* 1. Header with Status & Controls */}
      <div className="px-3.5 py-2.5 bg-gradient-to-r from-amber-950/70 via-zinc-900 to-zinc-900 border-b border-zinc-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Bug className="w-3.5 h-3.5 animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-bold text-amber-200">
              <span>Инспектор отладки RML</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-normal">
                Активный UI
              </span>
            </div>
            {element && (
              <div className="text-[10px] text-zinc-400 font-mono truncate">
                &lt;{element.tagName}
                {element.id ? `#${element.id}` : ''}
                {element.className ? `.${element.className.trim().split(/\s+/).join('.')}` : ''}
                &gt;
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 text-zinc-400">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-zinc-800 hover:text-zinc-200 rounded transition-colors"
            title={isMinimized ? 'Развернуть инспектор' : 'Свернуть инспектор'}
          >
            {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-800 hover:text-zinc-200 rounded transition-colors"
            title="Закрыть режим отладки"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Fast Element Selector Dropdown (Crucial for 0×0px zero-dimension elements) */}
      {!isMinimized && allElements && allElements.length > 0 && (
        <div className="px-3.5 py-1.5 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 shrink-0">
            <Layers className="w-3 h-3 text-amber-400" />
            <span>Выбрать элемент:</span>
          </div>
          <select
            value={element ? `${element.tagName}-${element.id}-${element.className}-${element.rect.top}-${element.rect.left}` : ''}
            onChange={(e) => {
              const selectedKey = e.target.value;
              const found = allElements.find(
                (el) => `${el.tagName}-${el.id}-${el.className}-${el.rect.top}-${el.rect.left}` === selectedKey
              );
              if (found && onSelectElement) {
                onSelectElement({ ...found, isPinned: true });
              }
            }}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-[10px] text-zinc-200 focus:outline-none focus:border-amber-500 font-mono truncate cursor-pointer"
          >
            <option value="">-- Все элементы RML ({allElements.length}) --</option>
            {allElements.map((el, idx) => {
              const isZero = el.rect.width === 0 || el.rect.height === 0;
              const hasWarns = el.warnings.length > 0;
              return (
                <option
                  key={idx}
                  value={`${el.tagName}-${el.id}-${el.className}-${el.rect.top}-${el.rect.left}`}
                >
                  &lt;{el.tagName}{el.id ? `#${el.id}` : ''}{el.className ? `.${el.className.split(' ')[0]}` : ''}&gt;{' '}
                  {isZero ? '⚠️ [0×0px ZERO DIM]' : hasWarns ? `⚠️ (${el.rect.width}×${el.rect.height})` : `(${el.rect.width}×${el.rect.height})`}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {/* When Minimized */}
      {isMinimized && (
        <div className="px-3 py-1.5 text-[11px] text-zinc-400 flex items-center justify-between">
          <span>
            {element ? `${element.tagName} (${element.rect.width}×${element.rect.height}px)` : 'Кликните по RML элементу'}
          </span>
          <button
            onClick={() => setIsMinimized(false)}
            className="text-amber-400 hover:underline text-[10px]"
          >
            Развернуть
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {!isMinimized && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {!element ? (
            /* Empty State: Guide for user */
            <div className="p-4 flex flex-col items-center justify-center text-center space-y-3 my-auto">
              <div className="w-10 h-10 rounded-full bg-amber-950/60 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <MousePointer className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <h4 className="font-semibold text-zinc-200 text-xs">Инспекция элементов RML</h4>
                <p className="text-[11px] text-zinc-400 mt-1 max-w-xs leading-relaxed">
                  Наведите курсор или кликните по любому элементу интерфейса на холсте, чтобы увидеть, какие CSS-стили успешно сопоставлены с RmlUi и выявить причины скрытых элементов.
                </p>
              </div>

              {/* Legend of outlines */}
              <div className="w-full bg-zinc-900/90 border border-zinc-800/80 rounded-lg p-2.5 text-left text-[10px] space-y-1.5 font-mono">
                <div className="text-zinc-400 font-sans font-medium text-[11px] mb-1">
                  Цветовая индикация границ RML:
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-xs border border-dashed border-cyan-400 bg-cyan-950/50"></span>
                  <span className="text-cyan-300">Блочные контейнеры (div, section, header, nav)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-xs border border-emerald-400 bg-emerald-950/50"></span>
                  <span className="text-emerald-300">Интерактивные элементы (button, input, a)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-xs border border-dotted border-amber-400 bg-amber-950/50"></span>
                  <span className="text-amber-300">Текст и заголовки (p, span, h1-h6, label)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-xs border border-purple-400 bg-purple-950/50"></span>
                  <span className="text-purple-300">Медиа и графика (img, progress)</span>
                </div>
              </div>
            </div>
          ) : (
            /* Inspected Element Details */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Box Model Quick Metrics */}
              <div className="px-3.5 py-2 bg-zinc-900/70 border-b border-zinc-800/80 grid grid-cols-3 gap-2 text-[10px] font-mono shrink-0">
                <div className="bg-zinc-950/80 p-1.5 rounded border border-zinc-800">
                  <div className="text-zinc-500 text-[9px] uppercase">Размер</div>
                  <div className={`font-semibold ${element.rect.width === 0 || element.rect.height === 0 ? 'text-red-400' : 'text-zinc-200'}`}>
                    {element.rect.width} × {element.rect.height}px
                  </div>
                </div>

                <div className="bg-zinc-950/80 p-1.5 rounded border border-zinc-800">
                  <div className="text-zinc-500 text-[9px] uppercase">Отображение</div>
                  <div className="font-semibold text-cyan-300 truncate">
                    {element.computedОтображение}
                  </div>
                </div>

                <div className="bg-zinc-950/80 p-1.5 rounded border border-zinc-800">
                  <div className="text-zinc-500 text-[9px] uppercase">Шрифт</div>
                  <div className="font-semibold text-amber-300 truncate" title={element.computedFontFamily}>
                    {element.computedFontFamily.split(',')[0].replace(/['"]/g, '') || 'Default'}
                  </div>
                </div>
              </div>

              {/* Troubleshooting & Engine Gotchas Section */}
              {element.warnings.length > 0 ? (
                <div className="p-3 bg-red-950/30 border-b border-red-900/40 space-y-1.5 shrink-0">
                  <div className="flex items-center gap-1.5 text-red-400 font-semibold text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Предупреждения отображения в UE5 ({element.warnings.length}):</span>
                  </div>
                  <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                    {element.warnings.map((w, idx) => (
                      <div
                        key={idx}
                        className="p-1.5 rounded bg-zinc-900/90 border border-red-800/50 text-[10px] space-y-0.5"
                      >
                        <div className="font-bold text-red-300">{w.title}</div>
                        <div className="text-zinc-400 leading-snug">{w.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="px-3.5 py-1.5 bg-emerald-950/30 border-b border-emerald-900/40 flex items-center gap-1.5 text-emerald-400 text-[10px] shrink-0 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Все стили элемента корректно сопоставлены с RmlUi / RCSS</span>
                </div>
              )}

              {/* Property Filter & Search Bar */}
              <div className="px-3 py-1.5 bg-zinc-900/50 border-b border-zinc-800/80 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1 text-[10px]">
                  <button
                    onClick={() => setFilter('all')}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      filter === 'all' ? 'bg-zinc-800 text-zinc-100 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Все ({element.mappedProperties.length})
                  </button>
                  <button
                    onClick={() => setFilter('mapped')}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      filter === 'mapped' ? 'bg-emerald-950 text-emerald-300 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Поддерживаются ({supportedCount})
                  </button>
                  {issuesCount > 0 && (
                    <button
                      onClick={() => setFilter('issues')}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        filter === 'issues' ? 'bg-amber-950 text-amber-300 font-semibold' : 'text-amber-400/80 hover:text-amber-300'
                      }`}
                    >
                      Исключения ({issuesCount})
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Search className="w-3 h-3 text-zinc-500 absolute left-1.5 top-1.5 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Поиск..."
                    className="w-24 pl-5 pr-1.5 py-0.5 bg-zinc-950 border border-zinc-800 rounded text-[10px] text-zinc-200 focus:outline-none focus:border-amber-500/60"
                  />
                </div>
              </div>

              {/* Mapped RCSS Styles List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[11px] divide-y divide-zinc-900">
                {filteredProperties.length === 0 ? (
                  <div className="p-3 text-center text-zinc-500 text-[10px] font-sans">
                    Свойства не найдены по заданному фильтру.
                  </div>
                ) : (
                  filteredProperties.map((p, idx) => (
                    <div
                      key={idx}
                      className="pt-1.5 pb-1 flex items-start justify-between gap-2 hover:bg-zinc-900/60 px-1.5 rounded transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-zinc-300">{p.property}</span>
                          <span className="text-zinc-500">:</span>
                          <span className="text-cyan-300 truncate" title={p.value}>
                            {p.value}
                          </span>
                        </div>
                        {p.notes && (
                          <div className="text-[9px] text-zinc-500 font-sans mt-0.5 leading-tight">
                            {p.notes}
                          </div>
                        )}
                      </div>

                      {/* Status Tag */}
                      <div className="shrink-0">
                        {p.status === 'supported' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-800/80 font-sans font-medium">
                            ✓ RmlUi
                          </span>
                        )}
                        {p.status === 'supported-with-limits' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-950 text-blue-300 border border-blue-800/80 font-sans font-medium">
                            ⚡ Нативное
                          </span>
                        )}
                        {p.status === 'parses-not-rendered' && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] bg-amber-950 text-amber-300 border border-amber-800/80 font-sans font-medium"
                            title="Свойство разбирается парсером RCSS, но НЕ отображается рендерером RmlUi в UE5"
                          >
                            ⚠️ Не отображается
                          </span>
                        )}
                        {p.status === 'unsupported' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-950 text-rose-300 border border-rose-800/80 font-sans font-medium">
                            ✕ Не подд.
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Bottom Quick Action */}
              <div className="px-3 py-1.5 bg-zinc-900/80 border-t border-zinc-800 flex items-center justify-between text-[10px] text-zinc-400 shrink-0 font-sans">
                <span className="text-[10px] text-zinc-500">
                  {element.isPinned ? '📌 Элемент зафиксирован кликом' : '💡 Кликните по элементу для фиксации'}
                </span>
                <button
                  onClick={onClear}
                  className="text-amber-400 hover:text-amber-300 font-medium"
                >
                  Сбросить выбор
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
