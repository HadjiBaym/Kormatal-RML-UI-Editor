import React, { useState } from 'react';
import {
  BookOpen,
  X,
  Search,
  Code,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Filter,
  ExternalLink,
  Layers,
  Sparkles,
  Terminal,
  Cpu,
} from 'lucide-react';
import {
  RML_ELEMENTS_REGISTRY,
  RCSS_PROPERTIES_REGISTRY,
  JS_API_REGISTRY,
  CONVERSION_RULES_REGISTRY,
  PERFORMANCE_GUIDELINES,
  LOCALIZATION_GUIDELINES,
  AI_GUIDE_RULES,
  KnowledgeElement,
  KnowledgeRcssProperty,
  KnowledgeJsApi,
  KnowledgeConversionRule,
} from '../core/knowledge-base.ts';

interface KnowledgeBaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KnowledgeBaseModal: React.FC<KnowledgeBaseModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<
    'elements' | 'rcss' | 'js' | 'rules' | 'gotchas' | 'perf' | 'localization' | 'ai' | 'sources'
  >('rcss');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const q = searchQuery.toLowerCase();

  const filteredElements = RML_ELEMENTS_REGISTRY.filter(el =>
    !q || el.tag.toLowerCase().includes(q) || el.notes.toLowerCase().includes(q)
  );

  const filteredProperties = RCSS_PROPERTIES_REGISTRY.filter(prop =>
    !q || prop.property.toLowerCase().includes(q) || prop.notes.toLowerCase().includes(q)
  );

  const filteredApis = JS_API_REGISTRY.filter(api =>
    !q || api.name.toLowerCase().includes(q) || api.description.toLowerCase().includes(q)
  );

  const filteredRules = CONVERSION_RULES_REGISTRY.filter(rule =>
    !q || rule.title.toLowerCase().includes(q) || rule.precondition.toLowerCase().includes(q) || rule.action.toLowerCase().includes(q)
  );

  const filteredPerf = PERFORMANCE_GUIDELINES.filter(item =>
    !q || item.title.toLowerCase().includes(q) || item.summary.toLowerCase().includes(q) || item.rules.some(r => r.toLowerCase().includes(q))
  );

  const filteredLoc = LOCALIZATION_GUIDELINES.filter(item =>
    !q || item.title.toLowerCase().includes(q) || item.summary.toLowerCase().includes(q) || item.rules.some(r => r.toLowerCase().includes(q))
  );

  const filteredAi = AI_GUIDE_RULES.filter(item =>
    !q || item.title.toLowerCase().includes(q) || item.summary.toLowerCase().includes(q) || item.rules.some(r => r.toLowerCase().includes(q))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="knowledge-modal-title" className="ui-modal-panel flex w-full max-w-5xl min-w-0 max-h-[90dvh] flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-xs text-zinc-200 shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-3 py-3 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-bold text-zinc-100">
                <span id="knowledge-modal-title">База знаний о совместимости</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                  VaCuus / RmlUi v5.x
                </span>
              </h2>
              <p className="safe-wrap text-[11px] leading-relaxed text-zinc-400">
                Проверенные правила движка, каталог свойств и архитектурные ограничения
              </p>
            </div>
          </div>

          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">
            {/* Search */}
            <div className="flex min-w-0 max-w-full items-center rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1 w-56">
              <Search className="w-3.5 h-3.5 text-zinc-500 mr-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по базе знаний…"
                className="bg-transparent text-xs text-zinc-200 focus:outline-none w-full font-mono"
              />
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
              aria-label="Закрыть базу знаний"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="horizontal-scroll-tabs border-b border-zinc-800 bg-zinc-900/60 px-3 text-xs sm:px-5">
          {[
            { id: 'rcss', label: `Свойства RCSS (${filteredProperties.length})` },
            { id: 'elements', label: `Элементы RML (${filteredElements.length})` },
            { id: 'js', label: `API JavaScript (${filteredApis.length})` },
            { id: 'rules', label: `Правила преобразования (${filteredRules.length})` },
            { id: 'gotchas', label: 'Особенности движка' },
            { id: 'perf', label: 'Руководство по производительности' },
            { id: 'localization', label: 'Руководство по локализации' },
            { id: 'ai', label: 'Архитектура ИИ и UE5' },
            { id: 'sources', label: 'Sources & Provenance' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2 px-3 border-b-2 font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-cyan-500 text-cyan-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="ui-modal-body min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {/* TAB 1: RCSS PROPERTIES */}
          {activeTab === 'rcss' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredProperties.map((p) => (
                  <div
                    key={p.property}
                    className={`p-3 rounded border ${
                      p.status === 'unsupported' || p.status === 'parses-not-rendered'
                        ? 'bg-rose-950/20 border-rose-900/60'
                        : p.status === 'convertible'
                        ? 'bg-amber-950/20 border-amber-900/60'
                        : 'bg-zinc-900/60 border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-bold text-cyan-300 font-mono">{p.property}</code>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                          {p.category}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          p.status === 'supported'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : p.status === 'convertible'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : p.status === 'parses-not-rendered'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>

                    <p className="text-zinc-300 text-xs leading-relaxed mb-2">{p.notes}</p>

                    {p.allowedValues && (
                      <div className="text-[11px] font-mono text-zinc-400 mb-1.5">
                        <span className="text-zinc-500 font-sans">Значения: </span>
                        {p.allowedValues.join(', ')}
                      </div>
                    )}

                    {p.conversionRule && (
                      <div className="text-[11px] text-cyan-300 bg-cyan-950/40 border border-cyan-900/60 rounded p-1.5 mb-1.5">
                        <span className="font-semibold text-cyan-400">Правило автоисправления: </span>
                        {p.conversionRule}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono pt-1 border-t border-zinc-800/80">
                      <span>Источник: {p.sourceDoc}</span>
                      {p.autoFixAvailable && <span className="text-cyan-400">✨ Исправить одним нажатием</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: RML ELEMENTS */}
          {activeTab === 'elements' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredElements.map((el) => (
                  <div
                    key={el.tag}
                    className={`p-3 rounded border ${
                      el.status === 'unsupported'
                        ? 'bg-rose-950/20 border-rose-900/60'
                        : 'bg-zinc-900/60 border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-bold text-cyan-300 font-mono">&lt;{el.tag}&gt;</code>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                          {el.category}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          el.status === 'supported'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : el.status === 'unsupported'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {el.status}
                      </span>
                    </div>

                    <p className="text-zinc-300 text-xs leading-relaxed mb-2">{el.notes}</p>

                    {el.replacement && (
                      <div className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-900/60 rounded p-1.5 mb-1.5">
                        <span className="font-semibold text-amber-400">Замена в UE5: </span>
                        {el.replacement}
                      </div>
                    )}

                    {el.supportedAttributes.length > 0 && (
                      <div className="text-[11px] font-mono text-zinc-400 mb-1.5">
                        <span className="text-zinc-500 font-sans">Атрибуты: </span>
                        {el.supportedAttributes.join(', ')}
                      </div>
                    )}

                    <div className="text-[10px] text-zinc-500 font-mono pt-1 border-t border-zinc-800/80">
                      Источник: {el.sourceDoc}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: JAVASCRIPT API */}
          {activeTab === 'js' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredApis.map((api) => (
                  <div
                    key={api.name}
                    className={`p-3 rounded border ${
                      api.status === 'forbidden'
                        ? 'bg-rose-950/20 border-rose-900/60'
                        : 'bg-zinc-900/60 border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <code className="text-sm font-bold text-yellow-300 font-mono">{api.name}</code>
                      <span
                        className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          api.status === 'supported'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}
                      >
                        {api.status}
                      </span>
                    </div>
                    <p className="text-zinc-300 text-xs mb-2">{api.description}</p>
                    {api.alternative && (
                      <div className="text-[11px] text-cyan-300 bg-cyan-950/40 border border-cyan-900/60 rounded p-1.5 mb-1.5">
                        <span className="font-semibold text-cyan-400">Альтернатива в UE5: </span>
                        {api.alternative}
                      </div>
                    )}
                    <div className="text-[10px] text-zinc-500 font-mono pt-1 border-t border-zinc-800/80">
                      Источник: {api.sourceDoc}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: CONVERSION RULES */}
          {activeTab === 'rules' && (
            <div className="space-y-3">
              {filteredRules.map((rule) => (
                <div key={rule.id} className="p-3 bg-zinc-900/60 border border-zinc-800 rounded space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-cyan-400 font-bold">[{rule.id}]</span>
                      <strong className="text-zinc-200 text-xs">{rule.title}</strong>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                        {rule.category}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        rule.severity === 'error'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : rule.severity === 'warning'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-blue-950 text-blue-300 border border-blue-800'
                      }`}
                    >
                      {rule.severity}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-300">
                    <div>
                      <span className="text-zinc-500 font-semibold block">Предусловие:</span>
                      <code>{rule.precondition}</code>
                    </div>
                    <div>
                      <span className="text-zinc-500 font-semibold block">Действие:</span>
                      <span className="text-cyan-300">{rule.action}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 5: VERIFIED ENGINE GOTCHAS */}
          {activeTab === 'gotchas' && (
            <div className="space-y-3">
              <div className="p-4 bg-zinc-900 border border-zinc-800 rounded space-y-2">
                <h4 className="font-bold text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Особенность №1: обязательная базовая таблица стилей (vacuus-base.rcss)
                </h4>
                <p className="text-zinc-300 leading-relaxed">
                  В RmlUi нет стандартной таблицы стилей браузера. Без явного объявления block элементы по умолчанию ведут себя как inline. <code>vacuus-base.rcss</code> должен всегда подключаться первым <code>&lt;link type=&quot;text/rcss&quot;&gt;</code>.
                </p>
              </div>

              <div className="p-4 bg-zinc-900 border border-zinc-800 rounded space-y-2">
                <h4 className="font-bold text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Особенность №3b: регистр функций времени transition
                </h4>
                <p className="text-zinc-300 leading-relaxed">
                  Названия функций времени должны быть в нижнем регистре: <code>cubic-in</code>, <code>cubic-out</code>, <code>cubic-in-out</code>, <code>linear</code>. Значения с заглавными буквами, например <code>Cubic-Out</code> и <code>ease-in-out</code> приводят к тихому игнорированию всего перехода!
                </p>
              </div>

              <div className="p-4 bg-zinc-900 border border-zinc-800 rounded space-y-2">
                <h4 className="font-bold text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Особенность №8b: opacity не создаёт отдельную группу композитинга
                </h4>
                <p className="text-zinc-300 leading-relaxed">
                  В RmlUi свойство <code>opacity</code>  наследуется, но не является отдельным буфером композитинга. Если дочерний элемент задаёт собственное значение <code>opacity</code> оно перекрывает унаследованную непрозрачность родителя. Для затухания изображений используйте <code>image-color</code>. Для текста и заливки используйте альфа-канал свойств <code>color</code> и <code>background-color</code>.
                </p>
              </div>

              <div className="p-4 bg-zinc-900 border border-zinc-800 rounded space-y-2">
                <h4 className="font-bold text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Особенность №9: привязывайте модели данных до вызова LoadDocument
                </h4>
                <p className="text-zinc-300 leading-relaxed">
                  В Unreal Engine C++ / Blueprint модели данных нужно привязывать через <code>UVaCuusView-&gt;BindDataModel()</code>  до вызова <code>LoadDocument()</code>. Если привязать позже, привязки <code>data-model</code> и <code>data-for</code> перестанут работать.
                </p>
              </div>

              <div className="p-4 bg-zinc-900 border border-zinc-800 rounded space-y-2">
                <h4 className="font-bold text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Отсутствие парсера calc()
                </h4>
                <p className="text-zinc-300 leading-relaxed">
                  В ядре RmlUi отсутствует парсер <code>calc()</code> . Выражения вроде <code>calc(100% - 20px)</code> не могут быть вычислены и отбрасываются. Используйте Flexbox или пользовательские свойства.
                </p>
              </div>
            </div>
          )}

          {/* TAB: PERFORMANCE GUIDE */}
          {activeTab === 'perf' && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-950/20 border border-amber-900/60 rounded text-amber-300 text-[11px] leading-relaxed">
                <strong>Цель производительности VaCuus:</strong> Обновления HUD должны быть отделены от проходов расчёта макета игрового тика. RmlUi может работать быстрее 120 FPS в Unreal Engine 5, если контролировать количество DOM-элементов и избегать постоянных перерасчётов макета.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredPerf.map((guide) => (
                  <div key={guide.id} className="p-3.5 bg-zinc-900/70 border border-zinc-800 rounded space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-cyan-400 font-bold">[{guide.id}]</span>
                        <strong className="text-zinc-100 text-xs">{guide.title}</strong>
                      </div>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                        {guide.category}
                      </span>
                    </div>

                    <p className="text-zinc-300 text-xs">{guide.summary}</p>

                    <ul className="space-y-1 text-[11px] text-zinc-400 list-disc list-inside">
                      {guide.rules.map((rule, idx) => (
                        <li key={idx} className="leading-snug">{rule}</li>
                      ))}
                    </ul>

                    <div className="pt-1 border-t border-zinc-800/80 flex justify-end">
                      <a
                        href={guide.docUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1"
                      >
                        <span>Официальное руководство по производительности</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: LOCALIZATION GUIDE */}
          {activeTab === 'localization' && (
            <div className="space-y-4">
              <div className="p-3 bg-cyan-950/20 border border-cyan-900/60 rounded text-cyan-300 text-[11px] leading-relaxed">
                <strong>Правила локализации VaCuus:</strong> Для отображения текста в Unreal Engine 5 через RmlUi нужны зарегистрированные шрифты с подходящими диапазонами Unicode. Макеты контейнеров должны учитывать увеличение длины строк на 30–50% в немецком и русском языках.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredLoc.map((guide) => (
                  <div key={guide.id} className="p-3.5 bg-zinc-900/70 border border-zinc-800 rounded space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-cyan-400 font-bold">[{guide.id}]</span>
                        <strong className="text-zinc-100 text-xs">{guide.title}</strong>
                      </div>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                        {guide.category}
                      </span>
                    </div>

                    <p className="text-zinc-300 text-xs">{guide.summary}</p>

                    <ul className="space-y-1 text-[11px] text-zinc-400 list-disc list-inside">
                      {guide.rules.map((rule, idx) => (
                        <li key={idx} className="leading-snug">{rule}</li>
                      ))}
                    </ul>

                    <div className="pt-1 border-t border-zinc-800/80 flex justify-end">
                      <a
                        href={guide.docUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1"
                      >
                        <span>Официальная документация по локализации</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: AI & UE5 ARCHITECTURE */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-950/20 border border-emerald-900/60 rounded text-emerald-300 text-[11px] leading-relaxed">
                <strong>Правила VaCuus по ИИ и архитектуре:</strong> Определяет структуру ресурсов, создаваемых генераторами интерфейса для Unreal Engine: корректный XML, отдельные файлы .rcss и .js и правильную маршрутизацию ввода через Player Controller и viewport.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredAi.map((guide) => (
                  <div key={guide.id} className="p-3.5 bg-zinc-900/70 border border-zinc-800 rounded space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-cyan-400 font-bold">[{guide.id}]</span>
                        <strong className="text-zinc-100 text-xs">{guide.title}</strong>
                      </div>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                        {guide.category}
                      </span>
                    </div>

                    <p className="text-zinc-300 text-xs">{guide.summary}</p>

                    <ul className="space-y-1 text-[11px] text-zinc-400 list-disc list-inside">
                      {guide.rules.map((rule, idx) => (
                        <li key={idx} className="leading-snug">{rule}</li>
                      ))}
                    </ul>

                    <div className="pt-1 border-t border-zinc-800/80 flex justify-end">
                      <a
                        href={guide.docUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1"
                      >
                        <span>Официальное руководство для ИИ</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: SOURCES & PROVENANCE */}
          {activeTab === 'sources' && (
            <div className="space-y-3">
              <p className="text-zinc-400">
                Официальные технические источники, использованные при разработке конвертера:
              </p>
              <div className="space-y-2">
                {[
                  { name: 'VaCuus AI Guide', url: 'https://vacuus.ufna.dev/docs/ai-guide', desc: 'Core verification loops, threading rules, and offscreen render flags.' },
                  { name: 'VaCuus Setup Guide', url: 'https://vacuus.ufna.dev/docs/setup', desc: 'Viewport input capture defaults, FInputModeGameAndUI, and project directory layout.' },
                  { name: 'VaCuus Gotchas', url: 'https://vacuus.ufna.dev/docs/gotchas', desc: '30+ recorded engine pitfalls, timing function casing, opacity behavior, font paths.' },
                  { name: 'VaCuus RCSS Matrix', url: 'https://vacuus.ufna.dev/docs/rcss-matrix', desc: 'Exact supported RCSS properties generated from vendored engine build.' },
                  { name: 'VaCuus Руководство по производительности', url: 'https://vacuus.ufna.dev/docs/perf-guide', desc: 'DOM element budget guidelines and 60fps/120fps HUD optimization.' },
                  { name: 'VaCuus Localization', url: 'https://vacuus.ufna.dev/docs/localization', desc: 'Font glyph ranges (Cyrillic/Latin) and translation lifecycle.' },
                  { name: 'RmlUi Core Documentation', url: 'https://mikke89.github.io/RmlUiDoc/', desc: 'Official upstream RmlUi documentation for markup, styling, and data-bindings.' },
                ].map((s) => (
                  <div key={s.name} className="p-3 bg-zinc-900 border border-zinc-800 rounded flex items-center justify-between">
                    <div>
                      <strong className="text-zinc-100 text-xs block">{s.name}</strong>
                      <span className="text-[11px] text-zinc-400">{s.desc}</span>
                    </div>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-mono"
                    >
                      <span>Открыть</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-zinc-900 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs transition-colors"
          >
            Закрыть базу знаний
          </button>
        </div>
      </div>
    </div>
  );
};
