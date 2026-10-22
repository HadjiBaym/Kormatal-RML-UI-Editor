## Local vision analysis reliability (v21)

The local PNG analyzer uses a compact, three-stage strategy for small vision models: up to 24, then 12, then 6 major UI regions; requests use portable text output mode and a configurable token budget. Qwen requests include a `/no_think` hint. The browser downscales AI input images to 1280 px on the long edge, then scales detected coordinates back to the original canvas. If the model truncates JSON, the parser recovers complete element objects where possible and labels the result as partial. The original reference image is never changed by a failed analysis.

# VaCuus UI Converter

## Original HTML preview fidelity audit (v32)

The left/source browser preview now preserves the imported HTML document instead of rebuilding a stripped body. It keeps the original head and viewport/title metadata, inline style/script blocks, the actual CSS cascade order, and only imports project CSS/JavaScript files that are referenced by the active HTML document. Local assets, fonts, `srcset`, CSS `url()` and simple local `@import` references are resolved against the imported project paths; external absolute URLs are left external. CSS used by this source preview is not passed through VaCuus RCSS emulation transforms, so browser-only visual properties such as `box-shadow`, native font declarations and the source background are not silently rewritten.

The source preview exposes static and runtime diagnostics for missing dependencies, malformed HTML, CSS parse errors, JavaScript syntax errors, failed resource loads, unhandled promise rejections, CSP constraints, local `<base href>`, dynamic `fetch`/XHR and script APIs that rely on the original file URL or persistent browser storage. The iframe remains sandboxed without `allow-same-origin`; `localStorage`/`sessionStorage` are isolated in-memory shims. Classic `defer` scripts are queued in document order and run after parsing, before `DOMContentLoaded` handlers.

Known fidelity limits are surfaced rather than silently hidden: local ES-module import graphs are not bundled, `async` script network races are not exactly reproducible after project-file inlining, relative `fetch`/XHR endpoints are not hosted as virtual files, a local `<base>` cannot provide multipage navigation, and a source CSP may block injected preview instrumentation. External resources still require a working network connection. The source HTML is not auto-fixed: warnings do not rewrite malformed markup.

Validation for v32: 105 targeted regression tests pass across the original-preview builder and its related converter/parser/resource/editor suites; 78 TypeScript/TSX/MTS files pass syntax transpilation; the 103-property RCSS matrix is synchronized. A real imported LAMGUARD `index.html` smoke test preserved its head, inline CSS and JavaScript and reported one source markup warning for an unmatched `</div>` inside a profile button. Full Vite build and a live Chromium/UE5/VaCuus render could not be verified in the build environment because Vite dependencies are not installed and headless Chromium did not complete; those runtime checks remain required on the user's machine. See `docs/original-preview-fidelity-audit.md` and `VALIDATION-v32.md`.

## Layout Generator workspace (v25)

v25 исправляет основной сценарий ввода и делает результат удобнее для дальнейшей работы:

- Одиночные PNG/JPEG/WebP при импорте автоматически открывают генератор макета, вместо попадания в дерево проекта как обычного бинарного ресурса.
- Можно выбрать набор из SVG, Figma JSON и изображения. Конвертер определяет основной структурный источник и подключает картинку как визуальный эталон.
- Скриншот-only без включённой локальной vision-модели больше не падает на этапе Layout IR: открывается пустая редактируемая сцена с размерами исходника. Пользователь может добавить элементы вручную; экспорт остаётся заблокированным, пока не добавлен минимум один слой.
- HTML/CSS/JS-проекты по-прежнему идут в штатный конвертер. Маршрутизатор не путает веб-проект с пакетом макета.
- После генерации редактор открывает `main-editable.rml`. Файл `main.rml` остаётся отдельным эталоном исходных пикселей, а не поверхностью по умолчанию для редактирования.

Проверки v25: `layout-generator.test.ts` и `layout-import-router.test.ts` — 34 passed, 0 failed. Полная Vite-сборка и runtime UE/VaCuus требуют установленных зависимостей и целевого окружения; здесь они не заявляются как выполненные.

## Layout Generator workspace (v23)

Интерфейс создания UI по макету переведён в единый адаптивный рабочий экран. Вместо независимых режимов SVG/PNG/JSON используются три независимых необязательных источника и один фиксированный конвейер: JSON → SVG → сверка → финальный PNG-анализ → Layout IR → проверка → генерация RML/RCSS. На широком экране постоянно видны источники, предпросмотр и инспектор; на планшете и телефоне те же области открываются через вкладки, без длинной вертикальной прокрутки всех панелей.

- Настройки локальной модели свёрнуты по умолчанию и раскрываются отдельно.
- Компактная шкала этапов всегда видна; подробные статусы, предупреждения и ошибки открываются отдельно.
- Инспектор объединяет слои, код RML/RCSS и диагностику в три вкладки.
- Основная кнопка меняет действие в зависимости от состояния: сначала анализ, затем генерация. Изменение любого источника сбрасывает валидацию.
- Предпросмотр позволяет переключаться между исходником с границами слоёв и визуальной схемой Layout IR.

Подробности: `docs/rml-design-editor-v23.md`.

## Multi-source Layout Pipeline

В режиме **«Все источники / полный цикл»** можно добавить любой набор из SVG, PNG/JPEG/WebP и Figma JSON. Ни один формат не обязателен сам по себе; нужен хотя бы один источник. Порядок фиксирован: JSON → SVG → сверка источников → финальный PNG-анализ → объединение Layout IR → валидация → RML/RCSS.

- Если PNG присутствует, именно он становится изображением финального vision-анализа. Если PNG отсутствует, приложение создаёт проверочную PNG-копию SVG; при отсутствии SVG растрирует JSON-derived Layout IR preview.
- Локальная AI-модель опциональна. Если она отключена, SVG/JSON можно собрать детерминированно, а визуальный AI-анализ отображается как пропущенный. PNG-only без рабочей vision-модели создаёт пустую редактируемую сцену поверх изображения-эталона; пользователь добавляет слои вручную, а экспорт пустой сцены заблокирован.
- Координатно-полный JSON может быть основой структуры, а SVG — добавлять векторную графику. Если JSON без абсолютных координат, SVG имеет приоритет по геометрии, а JSON используется для семантического текста там, где сопоставление надёжно. Различия размеров показываются в отчёте, дополнительная SVG-геометрия масштабируется к авторитетному холсту.
- Генерация RML/RCSS доступна после успешной структурной проверки Layout IR. Отсутствующий необязательный источник пропускается; предоставленный, но невалидный JSON/SVG блокирует экспорт, пока его не исправить или убрать.
- AI-анализ — эвристический: он дополняет и проверяет структуру, но не восстанавливает абсолютно точно исходный DOM или все интерактивные состояния. Без оригинального PNG анализ созданного JSON-preview не доказывает совпадение с исходным дизайном.

Подробный контракт: `docs/layout-pipeline-v22.md`.

Инструмент для анализа и конвертации HTML/CSS/JavaScript в RML/RCSS/JS для VaCuus/RmlUi в Unreal Engine 5.

## Запуск

Требования: Node.js, npm или Bun.

```bash
npm install
npm run dev
```

Для локальной проверки ядра конвертера:

```bash
npm test
npm run lint
npm run build
```

`npm test` запускает unit/regression tests через `node:test` и `tsx`. `npm run lint` проверяет TypeScript по конфигурации проекта. `npm run build` собирает веб-приложение Vite.


## Возможности RML Design Editor v14

- Для анализа PNG выбор AI-модели необязателен и по умолчанию выключен. Доступны ручная разметка, Qwen3-VL 2B и другая vision-модель на локальном OpenAI-compatible сервере. Интерфейс позволяет задать адрес loopback или частного IP локальной сети/alias и проверить `/health` плюс список моделей; публичные адреса запрещены; частные адреса локальной сети разрешены для подключения к другой машине с LM Studio.
- Для SVG, Figma JSON и PNG виден отдельный пошаговый pipeline: что извлекается, как создаются узлы Layout IR, каким образом формируются RML/RCSS и что требует ручной проверки. То же описание, включая подсчёт типов элементов, попадает в `layout-report.md`.
- Импорт нативных `.rml` и `.rcss` файлов, ZIP-архивов или папки проекта. При выборе RML-экрана предпросмотр автоматически переключается в режим эмуляции VaCuus. Эмуляция работает в браузерном iframe и не заменяет запуск в Unreal Engine.
- Панель «Диагностика совместимости» свёрнута при старте. Меню стиля холста закрывается только после выбора варианта или щелчка за пределами меню. Селектор разрешения использует тёмную цветовую схему.
- В браузерной эмуляции значения RmlUi `dp` отображаются как CSS `px` того же численного размера; исходные `px` не меняются. Это визуальная аппроксимация без моделирования фактического Slate/UMG DPI scale.
- «Открыть папку» поддерживается в настольных Chrome/Edge на `localhost` или HTTPS. Изменения текста/ресурсов в редакторе записываются в открытую папку; внешние добавления, изменения и удаления отслеживаются опросом примерно раз в 1,2 секунды.
- Поддерживаются только три семейства шрифтов: Onest (по умолчанию Onest Regular), Tektur и JetBrains Mono; остальные семейства нормализуются в разрешённые варианты.
- При конвертации CSS-псевдоэлементы `::before` и `::after` с одинаковым текстом используют один скрытый helper span для правил `:hover`/`:active`/`:focus`; span становится видимым только при совпадении исходного селектора, чтобы состояния не дублировали содержимое и не показывали hover-элемент постоянно. Если текст псевдоэлемента меняется между состояниями, конвертер показывает предупреждение вместо добавления второй копии.
- Внутренний водяной знак эмуляции убран из DOM предпросмотра, чтобы он не выглядел как часть пользовательского UI. Смешанные текстовые узлы остаются в `span.vacuus-text-run`, но теперь используют `display: inline` вместо `display: block`, что сохраняет обычный текстовый поток.

### Проверка v11 (историческая)

- 118/118 тестов пройдены через встроенный Node test runner с type stripping.
- Синтаксическая транспиляция TypeScript/TSX и проверка матрицы RCSS выполнены отдельно.
- Vite и нативный рендеринг UE5/VaCuus не выполнялись.

## Важные принципы конвертации

- RML — XML-подобная разметка; исходный DOM нужно нормализовать, а void-элементы закрывать.
- RCSS — не полный браузерный CSS. Конвертация ориентируется на матрицу совместимости VaCuus/RmlUi в `src/core/rcss-matrix.ts` и документацию в `docs/`.
- Неподдерживаемые эффекты не должны молча выглядеть как успешно преобразованные: добавляются диагностические сообщения, а где безопасно — декларация отключается с пояснением.
- CSS проходит через PostCSS AST; JavaScript анализируется через Acorn AST, а автоматические JS-правки применяются только к реальным узлам кода. Не сканируйте весь CSS регулярными выражениями для преобразования значений: комментарии, строки, вложенные функции и at-rules требуют структурного разбора.
- Порядок CSS-ресурсов следует исходному HTML: локальные `<link rel="stylesheet">` и inline `<style>` объединяются в этом порядке. Файлы CSS, не связанные из HTML, добавляются в конец с диагностикой.
- При разделении HTML каждый непустой inline `<style>` выдаётся отдельным CSS-файлом в исходной позиции. Пути ресурсов внутри `url(...)` и `@import` остаются отдельным пунктом проверки.
- Проверяйте `LogVaCuus` и результат в UE5. Статические тесты не заменяют проверку реального renderer.

- JavaScript анализируется через Acorn AST. Если исходник содержит нераспарсенный синтаксис, например JSX, конвертер выдаёт `manual-fix` и не применяет автоматические JS-правки.

## Документация

- `docs/converter-audit.md` — выполненный аудит и оставшиеся ограничения.
- `docs/html-parser.md` — поведение и ограничения общего HTML tokenizer/tree builder.
- `docs/compatibility-model.md` — архитектурная модель.
- `docs/conversion-rules.md` — правила преобразования.
- `docs/rcss-compatibility.md` и `src/core/rcss-matrix.ts` — матрица совместимости.
- `docs/javascript-runtime.md` — ограничения JavaScript runtime и правила AST-анализа.
- `src/core/tests/js-analyzer-ast.test.ts` — регрессионные тесты JavaScript анализатора.
- `docs/validation-strategy.md` — стратегия тестирования.
- `docs/visual-editor.md` — Figma-like viewport editor, direct manipulation and CSS sync.
- `docs/layout-generator.md` — источники SVG/PNG/Figma JSON, два экспортных режима, quality gate, JS-события и критерии пиксельной/функциональной приёмки.
- `docs/rml-design-editor-v3.md` — Active UI-safe pan/zoom gestures, iframe bridge and validation notes.
- `docs/rml-design-editor-v4.md` — simplified workspace without generated-file tabs; generated files are inspected through Export ZIP.
- `docs/rml-design-editor-v6.md` — conservative source auto-fixes, safe Fix All behavior and regression coverage.
- `docs/rml-design-editor-v11.md` — findings and fixes for duplicate pseudo-elements and non-source preview overlays.
- `src/core/canvas-navigation.ts` — cursor-anchored zoom and pointer/wheel pan geometry, with regression tests.

## DPI и CSS-пиксели

В screen-space VaCuus views `px` остаётся физическим пикселем, а `dp` умножается на Slate geometry/DPI scale при включённом `vacuus.DpFollowsDpiScale`. Для конвертера приоритет по умолчанию — pixel fidelity относительно браузерного CSS: размерные `px` и `@media` breakpoints сохраняются как `px`. Включи `ConversionOptions.cssPixelsAsDp: true`, если проект целенаправленно должен масштабировать их по DPI. Проверяй выбор режима по фактическому scale виджета в целевой игре.

## Состояние проверки (RML Design Editor v3)

- 73/73 core/regression tests passed via Node 22 built-in test runner with TypeScript type stripping, including four new canvas-navigation tests. The project's `npm test` script includes the new file.
- TypeScript/TSX syntax transpilation passed for `PreviewPanel.tsx`, `canvas-navigation.ts` and its tests. The injected iframe navigation bridge also passes `node --check`.
- A full `tsc --noEmit` check is currently blocked because dependencies are not fully installed (`vite/client` type definitions are missing). Full Vite build and browser-level interaction checks were therefore not completed.
- Native Unreal Engine / VaCuus runtime validation has not been performed.


## Recent fix: blank/shifted converted UI

The LAMGUARD Play regression exposed three separate causes in the first exported test package: malformed source nesting had detached the rank/main area from the `.app` container; the runtime could not resolve a usable registered font family; and inline SVGs were placeholders rather than visible assets. The parser's mismatched-close recovery keeps the surrounding tree intact, and inline SVGs are rasterized into `Content/DevUI/Assets/`. Typography is restricted to the three bundled families supplied for this project: **Onest** (default, Regular 400), **Tektur**, and **JetBrains Mono**. Static weights 400–800 and OFL license files are included in Export ZIP; imported font files and all other families are excluded. The editor preview uses the same fonts. Remote CSS images must also be packaged locally; the converter attempts this in the browser exporter and fails visibly if fetch/CORS prevents it rather than silently emitting a blank image.

The source uses a remote Unsplash background. In the separate local test archive, the exact URL was unavailable, so a fallback crop from the user's D17 reference screenshot was included and documented as a fallback, not an exact source asset. Runtime layout still needs a screenshot from UE5/VaCuus to confirm.


## Recent compatibility fixes (Oct 17, 2026)
- CSS is parsed/rewritten through PostCSS AST.
- `font: inherit` is removed rather than expanded to explicit inherited font longhands; normal font inheritance should be used by the target runtime.
- CSS linear-gradient backgrounds are mapped to RmlUi `decorator: linear-gradient(...)`, including supported layered image/gradient backgrounds.
- Current RML Design Editor v3 validation is recorded in the section above; the Vite build and native UE5/VaCuus rendering still require an environment with installed dependencies and the target plugin.


### Font fallback policy

Generic browser stacks such as `Arial, Helvetica, sans-serif` are normalized to bundled **Onest** (default); generic monospace stacks map to **JetBrains Mono**. Only Onest, Tektur, and JetBrains Mono are supported, and their static faces are registered by the generated `vacuus-base.rcss`. Imported or arbitrary `@font-face` families are removed so they cannot leak into the exported UI. Each family's OFL license is included in Export ZIP.

## Current UI workspace status (RML Design Editor v4)

- Removed generated-file tabs and the separate read-only target-code panes from the workspace. The source editor and Active UI preview remain; generated output is available in the Export ZIP modal.
- Replaced the `Target Output` tabs with a compact Active UI preview indicator.
- 73/73 existing core/regression tests passed after the UI change. See `docs/rml-design-editor-v4.md` and the accompanying validation files for test/build limitations.

## Visual Design Editor (Figma-like)

The local vision workflows share a server-side **AI Knowledge Engine** (`src/server/ai-knowledge-engine.ts`). It retrieves relevant rules from the RML, RCSS, JavaScript, conversion, performance and localization registries plus heading-level sections of `docs/*.md`; the exact source list and context size are reported for each request. Both PNG-to-layout analysis and AI visual review receive this context, including retry prompts. See [`docs/ai-knowledge-engine.md`](docs/ai-knowledge-engine.md) for sources, retrieval limits and runtime behavior. This is inference-time retrieval, not fine-tuning.

The Preview toolbar also provides an optional **AI-проверка** visual QA pass. Supply a side-by-side screenshot (original left, VaCuus render right) or two separate images; the modal first checks the local server and discovers exact model IDs from `/v1/models`, preferring the loaded Qwen3.8/Qwen3.5 or an explicit vision model. The reviewer receives bounded HTML/CSS, RML/RCSS and deterministic diagnostics, then reports likely visual mismatches without modifying files. It uses the configured local vision-model endpoint. See `docs/visual-review.md`, the example findings in `docs/conversion-review-lamguard-index.md`, and the dataset plan in `docs/visual-qa-data-plan.md`. This is inference-time review, not model fine-tuning; native UE/PIE captures are required to verify actual VaCuus rendering.

The Active UI preview has a **Design Edit** mode. Click an element in the browser viewport, drag it to move it, drag the cyan corner handle to resize it, or use the Design Properties panel to edit dimensions, font size, fill/background, text/border colors and opacity. Edits are written into `visual-editor-overrides.css`, included in conversion to RML/RCSS, and can be reverted with Undo.

See [`docs/visual-editor.md`](docs/visual-editor.md) for instructions, architecture and current limitations.


## UE5 asset parity and screen scale (v5)

- Import the source HTML together with local images/icons and any licensed TTF/OTF/WOFF/WOFF2 files. ZIP import preserves binary bytes; Export ZIP includes image assets in `Content/DevUI/Assets/` and fonts in `Content/DevUI/Fonts/`.
- Local image references are normalized to paths relative to the generated screen document, e.g. RML `../Assets/map.png` and RCSS `image(../Assets/map.png)`. Missing references and missing `<script src>` files appear in Diagnostics before export. Source external scripts are folded into the generated screen JS when imported as project files; non-existent references are not emitted into the RML body.
- VaCuus `@font-face src` is rooted at the DevUI VFS root and must be a bare path without `url()` or a leading slash, e.g. `Fonts/Onest-Regular.ttf`. The editor bundles only Onest, Tektur and JetBrains Mono; Onest Regular is the default. The matching static weights and OFL licenses are included in each export.
- The RML preview uses browser-compatible translations of VaCuus `decorator`/`image()` and font paths; generated RCSS stays in VaCuus syntax. A `px→dp` switch lets you opt into Slate/UMG DPI-curve scaling. Off is the pixel-fidelity default: `px` stays physical pixels; `dp` is the DPI-aware unit on screen-space views.
- Preview canvas zoom changes how large the target frame appears in the editor; it does not rewrite UI dimensions. Set the preview resolution to your intended design target before comparing apparent font size.


## Safe Auto-Fix behavior (v6)

The **Fix All** button only counts source edits that are explicitly safe. CSS and JavaScript compatibility changes stay in the generated RML/RCSS/JS pipeline; the editor no longer rewrites source CSS/JS with global regular expressions. In particular, it does not mass-convert Grid layouts, replace shadows with borders, rewrite valid browser transition keywords in the source, alter font URLs without resource context, or replace storage reads with `null`. The currently supported source-level fix renames VaCuus' reserved `data-for="t : ..."` loop alias together with its `{{t.Property}}` bindings in that exact loop scope. Ambiguous cases are skipped and require review. Source fixes can be undone with the editor's Undo control.


## Converter safety and maintenance checks

The converter now preserves the HTML source order of classic external and inline scripts when producing its single VaCuus JS bundle. `async`, `defer`, ES modules and `nomodule` are diagnosed because their browser scheduling/module semantics cannot be represented exactly by simple concatenation. In split mode, each inline script is emitted as a separate local JS file referenced at its original position.

Local CSS `@import` references are resolved relative to the stylesheet where they occur. Ordinary imports are expanded in source order; `layer()` and `supports()` conditional imports are embedded as self-contained data stylesheets so Blink can retain their conditions. Missing imports, import cycles and CSS syntax errors are reported.

The property compatibility table in `docs/rcss-compatibility.md` is generated from `src/core/rcss-matrix.ts`. Regenerate or validate it without invoking Vite:

```bash
node --experimental-strip-types scripts/sync-rcss-matrix.mts
node --experimental-strip-types scripts/sync-rcss-matrix.mts --check
```

The dependency-free HTML parser is designed for common UI markup, not complete HTML5 recovery. It diagnoses unsupported named entities but does not yet replace a full HTML5 parser. Automated converter tests validate source/output structure; they do not replace a Chromium screenshot comparison or a live Unreal Engine/VaCuus rendering test.

For the non-Vite regression suite, use `npm test` after installing the project dependencies. The current maintenance pass also ran the Node test runner and a TypeScript no-emit check for the changed core modules directly, without launching Vite; see [`docs/rml-design-editor-v7.md`](docs/rml-design-editor-v7.md) for the exact scope and limitations.

## Генератор интерфейсов по макету

Режим **«Создать интерфейс по макету»** поддерживает SVG, PNG/JPEG/WebP и Figma JSON. Преобразование работает через промежуточную модель **Layout IR**, которую можно исправить до генерации. В интерфейсе есть пошаговое объяснение каждого источника и перечень его ограничений; тот же workflow записывается в `layout-report.md` вместе со счётчиками контейнеров, текста, фигур, линий и растровых слоёв.

- **SVG** разбирается локально: геометрия/текст/стили → узлы Layout IR → RML + RCSS. Сложные path/маски/фильтры могут быть вынесены в PNG и отражены в диагностике.
- **Figma JSON** разбирается без ИИ: выбранный Frame, дерево слоёв, текстовые стили и Auto Layout → вложенная модель Layout IR → RML + RCSS. Grid и неподдерживаемые эффекты получают предупреждения.
- **PNG/JPEG/WebP** — только визуальная подложка. ИИ **необязателен и выключен по умолчанию**. Можно выбрать Qwen3-VL 2B или другую vision-модель, уже загруженную в локальный OpenAI-compatible сервер на localhost или частном IP локальной сети, либо разметить слои вручную. Модель возвращает предположение об элементах и координатах, а не исходную структуру DOM/Figma.

Выбор модели, адрес loopback-сервера и проверка доступности находятся прямо в окне генератора. Внешние адреса запрещены; картинки не отправляются во внешнюю сеть. Qwen и `llama.cpp` нужны только для выбранного режима AI-анализа. При использовании Qwen веса (около 1,56 ГБ) устанавливаются один раз через `local-ai/Install-Local-Model.ps1`; детали и SHA-256 — в [docs/layout-generator.md](docs/layout-generator.md). Vite build и UE5 runtime автоматически не запускаются.

## v15 — подключение генератора макетов к главному интерфейсу

Если импортировать один `.svg` или Figma `.json` через верхний импорт файлов, приложение теперь открывает генератор макета вместо того, чтобы просто показывать исходный текст. Генератор также доступен по кнопке **«По макету»** в шапке. После генерации `.rml`, `.rcss`, базовый RCSS, отчёт и графические ресурсы добавляются в проект, RML открывается активным файлом и предпросмотр переключается на режим «Код + предпросмотр». Подробности: `docs/layout-import-v15-fix.md`.


## v16 — исправления импорта макета и SVG-ресурсов

- SVG с экспортированными Figma `foreignObject` placeholders теперь безопасно обрабатывается: исполняемый код всё ещё отклоняется, а неподдерживаемые blur placeholders удаляются с предупреждением.
- Растеризация `path`/`use`/сложных обрезаемых групп извлекает только нужные определения и сохраняет связанные градиенты, geometry referenced by `<use>` и clip-path целой группы.
- JSON из `Figma to JSON Exporter` поддерживается отдельным адаптером. Если JSON не содержит координат, приложение явно предупреждает об эвристической раскладке. При совместном импорте с таким JSON сопутствующий SVG используется как источник точной визуальной геометрии; без общих ID не заявляется автоматическое сопоставление каждого слоя.
- Проверены реальные пользовательские файлы «Главный экран Play.svg» и «--------------play-structure(1).json». Результат и ограничения описаны в [`docs/layout-import-v16-fix.md`](docs/layout-import-v16-fix.md).
- Целевые автотесты: 35/35; матрица RCSS синхронизирована (103 свойства). Vite и нативный UE5/VaCuus runtime не запускались.


## v17 — исправление подключения к LM Studio в локальной сети

- Настройка локального vision API принимает `http://192.168.x.x:1234` и `http://192.168.x.x:1234/v1`, а также частные RFC1918 IPv4-сети и loopback. Публичные IP, сторонние домены, HTTPS и нестандартные API path по-прежнему запрещены.
- Проверка статуса работает через `GET /v1/models` и не требует отдельного `/health`, как это нужно для LM Studio OpenAI-compatible API.
- Для подключения к другому компьютеру в LM Studio нужно включить **Serve on Local Network**, загрузить vision-модель и разрешить порт 1234 в firewall только для локальной сети.
- Анализ отправляется на выбранный частный LAN endpoint с backend процесса редактора; браузеру не требуется CORS к LM Studio.
- Проверки подключения добавлены для нескольких частных IP-диапазонов, API base URL и запрета публичных хостов.


## v18 — исправление подключения из удалённого preview

- Причина: API-проверка предыдущей версии выполнялась из процесса Vite. Если тот процесс был в удалённом preview, он не мог видеть `192.168.x.x` из сети пользователя.
- Добавлен `local-ai-bridge/Start-Local-Bridge.bat`: локальный Node.js мост работает только на `127.0.0.1`, выдаёт случайный токен и проксирует проверку модели/PNG-анализ на выбранный localhost или private LAN адрес.
- В интерфейсе добавлен режим «Локальный мост», поле адреса и токена. На удалённом hostname он выбирается по умолчанию; локальный запуск на localhost сохраняет прежний режим backend.
- Для custom модели можно проверить подключение до ввода ID и выбрать точный ID из списка `/v1/models`.
- Ошибки соединения показывают endpoint и сетевой код (например, `ECONNREFUSED`, timeout), а не только общий статус.
- Мост блокирует публичные адреса, не слушает на LAN, требует токен и не обращается к облачным AI API.

## v19 — исправление JSON-ответа для локальных vision-моделей

Для `POST /v1/chat/completions` используется `response_format.type = "json_schema"` вместо несовместимого `json_object`. Передаётся схема `layout_analysis`. Если локальный OpenAI-совместимый сервер отклоняет схему с HTTP 400 из-за `response_format`/`json_schema`, клиент автоматически повторяет запрос в режиме `response_format.type = "text"` и просит модель вернуть чистый JSON; ответ всё равно проходит JSON-парсинг и валидацию Layout IR.

Vite не требуется для целевых тестов клиента: `node --experimental-strip-types --test src/server/tests/local-model-client.test.ts` проверяет JSON Schema режим и fallback на text.

## v28 — тайм-аут для медленных локальных Vision-моделей (Qwen 27B)

В v27 PNG-анализ отменялся через 180 секунд. В v28 тайм-аут по умолчанию увеличен до 600 секунд, а в настройках «Создание UI по макету» можно задать **Тайм-аут запроса, секунд**. Для Qwen 27B Q4_K_M при частичном GPU offload начните с 600 секунд; допустимый диапазон — 60–900 секунд. Значение передаётся серверу/локальному мосту и применяется к каждому запросу модели, включая компактные повторные попытки.

Исторический пример настроек v28 больше не следует копировать: его бюджеты 4096/4096/2048 токенов могли сделать PNG-анализ чрезмерно долгим. Для актуального профиля смотрите `.env.example` и раздел v34 ниже. После изменения `.env.local` перезапустите `npm run dev`. Тайм-аут сам по себе не ускоряет инференс.


## v29 — Qwen3.8 PNG analysis responsiveness

The local image analysis client now explicitly sends Qwen3.8 `chat_template_kwargs` with thinking disabled and `reasoning_effort=low`, instead of relying on the `/no_think` suffix. The layout prompt and token budgets were compacted to 16/8/4 elements across attempts. If LM Studio rejects the template fields, update LM Studio/runtime or disable Thinking and set Reasoning Effort to Low in the model settings. Regression tests check the actual API payload and the actionable error shown when the runtime rejects those parameters.

## Build stall troubleshooting (v31)

- Run `npm run diagnose:build` first. It checks the Node runtime, local Vite installation, entrypoint and package-manager lockfile mismatch.
- Run `npm run build:debug` to keep Vite debug output visible instead of clearing the terminal. Capture the last printed phase if it stalls.
- If the ZIP export in the UI stays on “Упаковка…”, v31 shows per-stage progress and fails a stalled external image fetch after 15 seconds or a bundled font/license fetch after 10 seconds. Download blocked third-party images to `Content/DevUI/Assets/` and retry.
- The local-AI Vite middleware is now imported only for `vite dev`; production builds do not initialize vision-analysis routes and model clients.
- The source archive contains `bun.lock` but not a generated `package-lock.json`. When using npm, run `npm install` once on a connected machine and keep the resulting `package-lock.json` with the project to make dependency versions reproducible.


## v31 smart build refactor

- `vite.config.ts` only loads the local AI/vision middleware during `vite dev`; the production bundle path no longer initializes those server modules.
- `npm run build` retains build output in the terminal. `npm run build:debug` adds Vite diagnostic logging.
- `npm run diagnose:build` checks Node.js version, `node_modules`, the local Vite binary, entrypoint files and lockfile state before you start debugging.
- `npm run clean` now uses Node's `fs.rm`, so it works on Windows as well as macOS/Linux.
- ZIP export has progress by stage and finite waits for remote images (15 s), response bodies (15 s), font/license downloads (10 s), and image decoding (15 s). A blocked external image becomes a specific error instead of an endless spinner.
- Important: `npm run dev` is a long-running development server by design. Production build is `npm run build`; it should finish and exit.


## Source-grounded VaCuus profile (v33)

The target compatibility knowledge is pinned to the supplied `VaCuus-1.1.0-UE5.8.zip` (`VersionName: 1.1.0`, `EngineVersion: 5.8.0`), not to the mutable `master` archive. `src/core/vacuus-1.1.0-ue5.8-profile.ts` is derived from the release's official RCSS matrix and audited source facts. The official target matrix has 99 properties, 20 shorthand rules, 16 decorators, 10 filter types and 4 font effects. The separate 103-entry `src/core/rcss-matrix.ts` catalog describes source CSS import and conversion behavior; the counts and support claims must not be conflated.

- `display: table`, `inline-table`, `table-row`, `table-row-group`, `table-column`, `table-column-group` and `table-cell` are listed by the target matrix; CSS Grid is not supported. These keywords do not alone prove every semantic HTML table tag is supported.
- In VaCuus 1.1.0, `box-shadow` and `mask-image` layer capture is refused with a warning; ordinary element background/border remain for `box-shadow`, and mask artwork is not applied. `backdrop-filter: blur(...)` is the native scene-glass path and does not require `decorator: shader(glass-panel)` in the same selector.
- Imported custom `@font-face` declarations and packaged font assets are retained; the three-family dropdown describes bundled starter fonts, not the engine limit. The public `UVaCuusSubsystem::LoadFontFace(VfsPath, bFallbackFace)` API also exists for runtime font registration. One paragraph in the supplied release's `rcss-matrix.md` incorrectly says no public C++ font API exists; the public header and `gotchas.md` document this API.
- The profile includes path roots, RML XML constraints, QuickJS DOM limitations, UI-thread queueing, and data-binding order. It is attached to AI layout-analysis, visual-review and code-generation context through the Knowledge Engine.

Full audit and known documentation contradictions: [`docs/vacuus-source-audit-1.1.0-ue5.8.md`](docs/vacuus-source-audit-1.1.0-ue5.8.md). The release-to-master comparison and exact-source evidence are in the separate `docs/vacuus-release-vs-master-audit.md` report.


## v34 — Qwen3.8 native fast PNG analysis

- For Qwen3.8, prefer LM Studio native `POST /api/v1/chat` when `GET /api/v1/models` is available; this path explicitly sets `reasoning: off` and a request context of 8K. Older servers fall back to OpenAI-compatible chat completions.
- Screenshot input is downscaled to 768 px max edge for this specific model. PNG-only reconstruction detects up to 8 major regions; when supplied, Figma JSON/SVG remain the geometry authority.
- Qwen3.8 is hard-capped to 768 / 512 / 384 output tokens across the three analysis attempts, and knowledge context is capped to 1500 characters even when old `.env.local` settings contain larger values.
- Native LM Studio stats (time to first token and generation speed) are included in Layout IR diagnostics when returned.
- See [`docs/local-vlm-qwen38-native-api-v34.md`](docs/local-vlm-qwen38-native-api-v34.md).

## v35 — Fix false RCSS matrix rejection in layout export

- `validateGeneratedLayoutBundle` now validates CSS declarations against the exact VaCuus 1.1.0 / UE5.8 target profile first. The source CSS conversion catalog remains the fallback for conversion-only properties and browser CSS features.
- This fixes the export blocker for native `tab-index: auto` in `vacuus-base.rcss`, and prevents future false positives for other officially registered target properties missing from the separate 103-entry source-conversion catalog.
- Native target render statuses remain enforced: properties marked `not-rendered` still block strict export; `limited` properties produce warnings; truly unknown declarations fail with a clearer message.
- Added regression coverage to generated-layout package validation.

## v36 — UI/UX hardening

- Prevented button text and long resource paths from overflowing nested flex/grid containers.
- Added responsive workspace stacking, narrower sidebars and a diagnostics overlay for small viewports.
- Bounded modal panels, made action footers wrap and adapted the export file tree for narrow screens.
- Improved keyboard focus, touch target sizes, reduced-motion behavior, dialog semantics and state ARIA attributes.
- Added UI layout regression tests: `npm run test:ui-layout`.
- Full browser build/screenshot testing remains pending until npm dependencies finish installing. See `UI_UX_AUDIT_v36.md`.



## Import crash protection (v0.37.0)

- Project conversion now runs in a dedicated Vite Web Worker with debounce/cancellation; import and editing stay responsive while HTML/CSS/JS are analyzed.
- The main UI no longer imports the full PostCSS/Acorn conversion module just to split inline HTML assets or initialize an empty workspace.
- ZIP imports skip `node_modules`, `.git`, `dist`, `build`, `.next`, `.cache`, `coverage`, `.turbo`, macOS metadata, unsupported extensions, and unsafe traversal paths.
- Import limits: 500 supported files, 60 MiB direct selection, per-file limits (HTML 10 MiB, CSS/RCSS 8 MiB, JS 5 MiB, other text 4 MiB, images/fonts 20 MiB), and 80 MiB supported ZIP expansion.
- Imported directory sync checks `size`/`lastModified` before re-reading content, instead of re-encoding every project asset every 1.2 seconds. Polling is now 2.5 seconds.
- If the worker fails, the app shows a recoverable error and blocks stale export rather than silently packaging the previous result.
- Run focused import regression tests with `npm run test:imports`.
