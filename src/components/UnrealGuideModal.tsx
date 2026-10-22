import React, { useState } from 'react';
import {
  BookOpen,
  X,
  Code,
  AlertTriangle,
  FolderTree,
  Terminal,
  Copy,
  Check,
  Layers,
  Cpu,
} from 'lucide-react';

interface UnrealGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  screenName: string;
}

export const UnrealGuideModal: React.FC<UnrealGuideModalProps> = ({
  isOpen,
  onClose,
  screenName,
}) => {
  const [copiedCpp, setСкопированоCpp] = useState(false);
  const [activeTab, setActiveTab] = useState<'quickstart' | 'cpp' | 'blueprint' | 'gotchas' | 'matrix'>('quickstart');

  if (!isOpen) return null;

  const cppSnippet = `// Fill out your PlayerController or HUD Manager:
#include "VaCuusView.h"
#include "MyPlayerController.h"

void AMyPlayerController::BeginPlay()
{
    Super::BeginPlay();

    // 1. Instantiate the VaCuus View
    UVaCuusView* HUDView = NewObject<UVaCuusView>(this, TEXT("MainHUDView"));

    // 2. КРИТИЧЕСКИ ВАЖНО: Bind Data Model BEFORE calling LoadDocument!
    // If bound after LoadDocument, data-model / data-for / data-value bindings will not hook.
    FMyPlayerModel PlayerState;
    PlayerState.Health = 100.0f;
    PlayerState.Ammo = 30;
    HUDView->BindDataModel(TEXT("PlayerState"), &PlayerState);

    // 3. Load RML document from Content/DevUI/
    // Path resolution begins inside Content/DevUI/
    HUDView->LoadDocument(TEXT("${screenName}/${screenName.toLowerCase()}.rml"));

    // 4. Add to game viewport
    HUDView->AddToViewport(0);
}`;

  const handleCopyCpp = async () => {
    try {
      await navigator.clipboard.writeText(cppSnippet);
      setСкопированоCpp(true);
      setTimeout(() => setСкопированоCpp(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="unreal-guide-title" className="ui-modal-panel flex w-full max-w-4xl min-w-0 max-h-[90dvh] flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-3 py-3 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <BookOpen className="w-5 h-5 text-cyan-400" />
            <h2 id="unreal-guide-title" className="safe-wrap text-sm font-bold text-zinc-100">Инструкция по интеграции Unreal Engine 5 и VaCuus</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть инструкцию"
            className="shrink-0 rounded p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 overflow-x-auto border-b border-zinc-800 bg-zinc-900/60 px-3 text-xs sm:px-5">
          {[
            { id: 'quickstart', label: '1. Быстрый старт и структура папок' },
            { id: 'cpp', label: '2. Настройка UVaCuusView в C++' },
            { id: 'blueprint', label: '3. Работа с Blueprint' },
            { id: 'gotchas', label: '4. Важные особенности' },
            { id: 'matrix', label: '5. Справочник RCSS' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2 px-3 border-b-2 font-medium transition-colors ${
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
        <div className="ui-modal-body min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-xs leading-relaxed text-zinc-300 sm:p-6">
          {activeTab === 'quickstart' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-cyan-400" />
                Структура папок в UE5
              </h3>
              <p>
                Поместите экспортированные файлы в каталог Content вашего проекта Unreal Engine, в папку <code className="text-cyan-300 bg-zinc-900 px-1 py-0.5 rounded">Content/DevUI/</code>:
              </p>
              <pre className="p-3 bg-zinc-900 border border-zinc-800 rounded font-mono text-zinc-300">
{`<YourProject>/
└── Content/
    └── DevUI/
        ├── vacuus-base.rcss         <-- базовая таблица стилей (обязательно)
        ├── ${screenName}/
        │   ├── ${screenName.toLowerCase()}.rml   <-- разметка документа
        │   ├── ${screenName.toLowerCase()}.rcss  <-- Стили
        │   └── ${screenName.toLowerCase()}.js    <-- Скрипт экрана
        └── Assets/
            ├── Fonts/                 <-- Шрифты TrueType/OpenType
            └── Images/                <-- Спрайты и иконки интерфейса`}
              </pre>

              <div className="p-3 bg-amber-950/40 border border-amber-900/60 rounded flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-amber-200 block mb-1">Правило приоритета путей:</strong>
                  Сначала проверяется каталог плагина VaCuus, затем каталог проекта. Файл проекта не может переопределить файл плагина с таким же именем. Всегда используйте уникальные имена файлов.
                </div>
              </div>
            </div>
          )}

          {activeTab === 'cpp' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  Пример реализации на C++
                </h3>
                <button
                  onClick={handleCopyCpp}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs transition-colors"
                >
                  {copiedCpp ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCpp ? 'Скопировано' : 'Копировать код'}</span>
                </button>
              </div>

              <div className="p-3 bg-rose-950/30 border border-rose-900/60 rounded text-rose-200">
                ⚠️ <strong>КРИТИЧЕСКИ ВАЖНО:</strong> Всегда привязывайте модели данных через <code className="font-mono bg-zinc-900 px-1 py-0.5 text-rose-300">BindDataModel()</code> <em>до вызова</em> <code className="font-mono bg-zinc-900 px-1 py-0.5 text-rose-300">LoadDocument()</code>. Если вызвать привязку позже, привязки данных RML перестанут работать без явной ошибки.
              </div>

              <pre className="p-4 bg-zinc-900 border border-zinc-800 rounded font-mono text-zinc-200 overflow-x-auto leading-5">
                <code>{cppSnippet}</code>
              </pre>
            </div>
          )}

          {activeTab === 'blueprint' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                Настройка Blueprint
              </h3>
              <ol className="list-decimal pl-5 space-y-2">
                <li>Откройте Blueprint Player Controller, GameMode или UI Actor.</li>
                <li>Добавьте <strong>VaCuus View Component</strong> на панели компонентов.</li>
                <li>В графе <strong>Event BeginPlay</strong> выполните следующие действия:</li>
                <ul className="list-disc pl-5 mt-1 space-y-1 text-zinc-400">
                  <li>Вызовите <strong>Bind Data Model</strong> (привязать модель данных, если нужна синхронизация).</li>
                  <li>Вызовите <strong>Load Document</strong> (загрузить документ) и укажите <code className="text-cyan-300 font-mono">&quot;{screenName}/{screenName.toLowerCase()}.rml&quot;</code>.</li>
                  <li>Вызовите <strong>Add To Viewport</strong> (добавить во viewport) с Z-Order 0 или нужным уровнем HUD.</li>
                </ul>
                <li>Скомпилируйте и сохраните Blueprint.</li>
              </ol>
            </div>
          )}

          {activeTab === 'gotchas' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Подтверждённые особенности VaCuus и RmlUi
              </h3>

              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded space-y-1">
                <strong className="text-zinc-100 block">1. CSS Grid не поддерживается:</strong>
                <p className="text-zinc-400">
                  В RmlUi нет движка CSS Grid. Все макеты нужно строить с помощью Flexbox (<code className="text-cyan-300 font-mono">display: flex</code>) или абсолютного позиционирования.
                </p>
              </div>

              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded space-y-1">
                <strong className="text-zinc-100 block">2. box-shadow разбирается, но не отображается:</strong>
                <p className="text-zinc-400">
                  Парсер RCSS принимает свойство <code className="text-cyan-300 font-mono">box-shadow</code> без синтаксической ошибки, но средство отрисовки ничего не рисует. Используйте акценты границами или декораторы изображений.
                </p>
              </div>

              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded space-y-1">
                <strong className="text-zinc-100 block">3. Регистр функции времени в transition:</strong>
                <p className="text-zinc-400">
                  Названия функций времени должны быть в нижнем регистре: <code className="text-cyan-300 font-mono">cubic-in</code>, <code className="text-cyan-300 font-mono">cubic-out</code>, <code className="text-cyan-300 font-mono">cubic-in-out</code>, <code className="text-cyan-300 font-mono">linear</code>. Названия с заглавными буквами, например <code className="text-rose-300 font-mono">Cubic-Out</code> приведут к игнорированию всего перехода!
                </p>
              </div>

              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded space-y-1">
                <strong className="text-zinc-100 block">4. Пути шрифтов относительно корня:</strong>
                <p className="text-zinc-400">
                  <code className="text-cyan-300 font-mono">@font-face src</code> требует путей от корня DevUI, например <code className="text-cyan-300 font-mono">Fonts/MyFont.ttf</code> (без начального слеша и обёртки url()). Это отличается от относительных путей в тегах &lt;link&gt; и &lt;script&gt;.
                </p>
              </div>

              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded space-y-1">
                <strong className="text-zinc-100 block">5. vacuus-base.rcss обязателен:</strong>
                <p className="text-zinc-400">
                  В RmlUi нет встроенной таблицы стилей браузера. Без vacuus-base.rcss элементы вроде &lt;div&gt; по умолчанию отображаются как inline.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'matrix' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan-400" />
                Матрица поддерживаемых свойств RCSS
              </h3>
              <table className="w-full text-left border-collapse border border-zinc-800 text-[11px]">
                <thead>
                  <tr className="bg-zinc-900 text-zinc-300">
                    <th className="p-2 border border-zinc-800">Свойство</th>
                    <th className="p-2 border border-zinc-800">Статус</th>
                    <th className="p-2 border border-zinc-800">Примечания и значения</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80 font-mono">
                  <tr>
                    <td className="p-2 text-cyan-300">display</td>
                    <td className="p-2 text-emerald-400">Поддерживается частично</td>
                    <td className="p-2 font-sans text-zinc-400">none, block, inline, inline-block, flex, inline-flex. (grid отсутствует)</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-cyan-300">flexbox</td>
                    <td className="p-2 text-emerald-400">Поддерживается</td>
                    <td className="p-2 font-sans text-zinc-400">flex-direction, flex-wrap, justify-content, align-items, flex-grow, flex-shrink, gap</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-cyan-300">transition</td>
                    <td className="p-2 text-amber-400">Можно преобразовать</td>
                    <td className="p-2 font-sans text-zinc-400">Требуется нижний регистр: cubic-in, cubic-out, cubic-in-out, linear.</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-cyan-300">box-shadow</td>
                    <td className="p-2 text-rose-400">Разбирается, не отображается</td>
                    <td className="p-2 font-sans text-zinc-400">Разбирается без ошибки, но RmlUi не отображает тени.</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-cyan-300">decorator</td>
                    <td className="p-2 text-emerald-400">Особенность RmlUi</td>
                    <td className="p-2 font-sans text-zinc-400">image(), tiled-horizontal(), tiled-box(), gradient().</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-zinc-900 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs transition-colors"
          >
            Понятно, вернуться к конвертеру
          </button>
        </div>
      </div>
    </div>
  );
};
