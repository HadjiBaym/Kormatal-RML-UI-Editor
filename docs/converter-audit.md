> **Historical converter audit (pre-v33)**: this file records earlier implementation state, including a font-import restriction and an undocumented same-selector shader requirement for backdrop blur. Those statements have been superseded by the source-grounded profile in `vacuus-source-audit-1.1.0-ue5.8.md`; do not treat this historical report as current engine capability.

# Аудит конвертера HTML/CSS → RML/RCSS

Дата: 2026-10-17

## Цель

Снизить количество неверных преобразований и сделать несовместимости с VaCuus/RmlUi видимыми. Этот этап не заявляет 100% совместимость с браузерным HTML/CSS: часть платформенных эффектов и layout-моделей не имеет прямого эквивалента в целевом renderer.

## Исправлено в этой итерации

### 1. CSS преобразуется через PostCSS AST

`src/core/css-to-rcss.ts` больше не сканирует весь CSS как плоский текст для основных изменений. Правила и декларации обрабатываются узлами PostCSS.

Польза:
- комментарии и строковые значения не должны случайно переписываться при замене timing keywords;
- некорректный CSS выдаёт parse diagnostic с координатами и возвращается без частичных автоматических преобразований;
- логика анализирует отдельные свойства, а не совпадения вроде `border-top-width` при обработке `border-radius`;
- известные неподдерживаемые случаи (например, `box-shadow`, `mask-image`, `calc()` и grid placement) получают диагностику; там, где значение точно не будет работать, декларация отключается как комментарий с пояснением.

CSS Grid → Flex не является эквивалентной конвертацией: конвертер меняет `display` на flex и добавляет `flex-wrap` только как стартовую адаптацию, а grid tracks/placement диагностируются для ручной переработки.

### 2. HTML преобразуется через общий tokenizer/tree builder

`src/core/html-parser.ts` формирует узлы документа до извлечения данных и сериализации. `src/core/html-to-rml.ts` больше не находит элементы глобальными регулярными выражениями. `src/core/html-embedded-extractor.ts` использует то же дерево для извлечения реальных inline `<style>` и `<script>` блоков, сохраняя внешние скрипты и JSON/template scripts.

Проверяются комментарии, атрибуты с символами угловых скобок, содержимое raw-text блоков, булевы атрибуты, self-closing void-элементы, распространённые необязательные закрывающие теги, source location, bindings и ложные срабатывания при извлечении ресурсов.

### 2.1. Сохранение порядка CSS-ресурсов

`extractEmbeddedAssetsFromHtml()` теперь формирует `cssResources` в порядке исходного HTML: локальные stylesheet-ссылки и inline `<style>` учитываются в общей последовательности. `convertProject()` разрешает href относительно пути HTML, включает содержимое найденных локальных CSS-файлов в исходном порядке, сохраняет повторные подключения на их позиции и сообщает о неразрешённых, media-зависимых и не связанных с HTML CSS-файлах. Alternate stylesheets не попадают в активный CSS по умолчанию.

`splitMonolithicHtmlProject()` создаёт отдельный CSS-файл для каждого непустого inline `<style>` и заменяет блок ссылкой на том же месте. Это сохраняет порядок по отношению к существующим `<link>` и сохраняет media-атрибут. Для HTML внутри вложенной папки файл генерируется рядом с HTML, а в `href` используется относительное имя, чтобы не добавлять путь каталога дважды.

**Ограничение:** относительные `url(...)`, `@import` и связанные с ними пути ресурсов ещё требуют отдельного решения с учётом фактических правил VFS VaCuus. Порядок файлов сам по себе не гарантирует корректность путей картинок и шрифтов.

**Ограничение:** это dependency-free tokenizer/tree builder для распространённого UI HTML, а не полный HTML5 parser. Он не реализует все алгоритмы восстановления браузерной разметки, весь набор named entities и все контекстные правила таблиц/SVG/MathML. Для произвольного пользовательского HTML следующим отдельным шагом следует перейти на полноценный HTML5 parser (например, parse5), после подтверждения политики установки зависимостей.

### 3. JavaScript анализируется через Acorn AST

`src/core/js-analyzer.ts` использует Acorn вместо глобальных регулярных выражений для поиска браузерных API и подсчёта функций. Диагностики строятся по AST-узлам с координатами строки/колонки; базовое разрешение имён учитывает локальные параметры и объявления. Автоправка `.innerHTML` → `.innerRML` выполняется только для `MemberExpression` и вычисляемых строковых свойств, с изменениями source ranges в обратном порядке. Комментарии, строки и произвольный текст не переписываются.

Если Acorn не может разобрать файл как standard ECMAScript, добавляется `manual-fix` диагностика и автоправки не выполняются. JSX/TypeScript должны быть предварительно транспилированы; поддержка этих синтаксисов самим анализатором пока не заявляется. Предупреждения о росте DOM и fixed pool остаются эвристиками по всему файлу, а не доказательством утечки.

### 4. Добавлены тесты и команды проверки

- `postcss` и `acorn` указаны как прямые зависимости; lockfile обновлён для Acorn 8.15.0.
- В `package.json` команда `npm test` включает отдельный набор JS AST regression-тестов.
- Тесты покрывают комментарии/строки JS, реальное обнаружение browser APIs, локально затенённые имена, безопасную правку `innerHTML`, синтаксический отказ на JSX, а также эвристики ограниченного списка.

## Проверено

- Regression tests: **59 passed, 0 failed** при последовательном запуске четырёх наборов тестов через Node test runner и TS loader.
- Отдельная TypeScript-проверка изменённого JS analyzer и его типов: без ошибок.
- На двух реальных примерах (`hud_bundle.js`, около 194 КБ, и `refhud_logic.js`) Acorn не выдал parse-failed diagnostic; обнаружение runtime API и визуальное поведение всё ещё требуют отдельной проверки.
- Полный `npm install` истёк по тайм-ауту в текущем окружении, поэтому полный `vite build` не подтверждён.
- Не выполнялась визуальная проверка в Chromium и реальном UE5/VaCuus runtime; нельзя утверждать, что результат любой конвертации визуально совпадает с браузером.

## Текущие ограничения после v7 — 18.10.2026

### P0 — parser остаётся подмножеством HTML5

`src/core/html-parser.ts` сохраняет общий tokenizer/tree builder для UI-разметки, но не реализует все правила восстановления HTML5, полный набор named entities или все контекстные правила table/SVG/MathML. Для отсутствующих named entities теперь выдаётся диагностика. Полный HTML5 parser не добавлен: в этом окружении отсутствует `parse5`, а установка из npm registry завершилась ошибкой DNS. Не следует называть текущую реализацию HTML5-совместимой.

### P1 — анализ JavaScript ограничен стандартным ECMAScript

`src/core/js-analyzer.ts` использует Acorn AST и безопасно отказывается от автоправок, если файл не удаётся разобрать как поддерживаемый ECMAScript. Исходный JSX/TSX и TypeScript должны быть предварительно преобразованы. Scope resolution не является полноценным семантическим анализом; спорные browser API требуют ручной проверки.

### P1 — asset path semantics требуют проверки в целевом runtime

`project-assets.ts` переписывает локальные CSS `url(...)` относительно пути исходного CSS-файла и выдаёт диагностику при отсутствующем либо неоднозначном ресурсе. `project-converter.ts` рекурсивно раскрывает локальные `@import` по исходному каскаду, сохраняет простые media-условия и диагностирует циклы, отсутствующие и внешние импорты. Остаётся подтвердить фактические правила VaCuus VFS/упакованного ZIP на реальном проекте UE5, особенно для нестандартных ресурсов и шрифтов.

### P1 — каталог совместимости и преобразователь не полностью сведены к одному исполняемому источнику

`docs/rcss-compatibility.md` генерируется из `src/core/rcss-matrix.ts`; тест проверяет каталог и генерируемый документ. Но ряд преобразований по-прежнему реализован специальными ветками в `css-to-rcss.ts`. Для новых свойств изменения должны включать и каталог, и целевые regression tests; сама таблица не гарантирует поддержку каждой функции конкретной сборкой VaCuus.

### P2 — есть структурная golden-проверка, но нет pixel-level visual regression

`src/core/tests/conversion-golden.test.ts` фиксирует ожидаемую RML/RCSS выдачу для репрезентативного HTML/CSS-примера. Общий набор тестов проверяет структуру, порядок скриптов, CSS imports, диагностики и безопасные правки. Это не заменяет сравнение Chromium vs VaCuus screenshots с одинаковыми размерами viewport, шрифтами и ресурсами. В этом окружении нет подтверждённого браузерного прогона или реального Unreal Engine/VaCuus runtime.

### Исторические пункты, закрытые в v7

- Порядок внешних и inline classic scripts сохраняется по порядку исходных `<script>`-тегов. Для `async`, `defer`, `module` и `nomodule` выводятся предупреждения о несовпадении семантики при объединении в один bundle.
- Локальные CSS `@import` раскрываются рекурсивно с сохранением порядка и media-условий в поддерживаемом подмножестве.
- Документация матрицы RCSS генерируется и имеет отдельную команду drift-check.
- `cleanVoidTags` не является текущей опцией API; void-элементы всегда сериализуются в self-closing форме для XML-подобного RML.

## Рекомендуемый следующий этап

1. Проверить экспортированный ZIP в реальном UE5/VaCuus: загрузка ресурсов, локальные шрифты, каскад imported CSS, `decorator: linear-gradient(...)` и условный `backdrop-filter: blur(...)`.
2. Когда появится доступ к зависимости и lockfile можно будет корректно обновить, заменить ограниченный HTML parser на закреплённый HTML5 parser и добавить malformed HTML/entity/table/SVG fixtures.
3. Если продукт должен принимать исходники React/TSX, определить отдельный frontend для JSX/TypeScript до JS-анализатора; для обычного bundled JS текущий путь через Acorn сохраняется.

## Regression from LAMGUARD Play runtime screenshot

Observed symptom: a nearly empty screen with the mode card at the top-left, no text/icons and an empty card image. The generated output was not visually faithful. Inspection separated packaging/tree issues from RCSS issues:

1. The source had an extra `</div>` inside the profile button. The earlier HTML tree builder popped the outer `.app` container. Mismatched-close recovery now ignores a stray close inside a control boundary and emits a line-specific warning, preserving the surrounding screen tree.
2. The initial hand-built conversion ZIP used an unregistered `Noto Sans` family without a valid `@font-face`, so text disappeared. The editor now bundles exactly three families supplied for this project: Onest (default, Regular 400), Tektur, and JetBrains Mono. Static weights 400–800 and their OFL license files ship with every export. At the time of this historical audit, imported font binaries and arbitrary `@font-face` registrations were excluded. In v33, valid source `@font-face` registrations and local font assets are preserved. Generic unregistered browser stacks still use a safe fallback.
3. Inline SVGs were previously emitted as empty placeholder elements. They now become `../Assets/inline-svg-*.png` references and the ZIP export rasterizes the SVGs.
4. Remote background URLs cannot be assumed to resolve through the Unreal VFS. The browser exporter fetches and rasterizes them when allowed; a failed fetch is reported.

The updated local test package includes the fonts and SVG PNGs. Because the external Unsplash URL could not be fetched from the build environment, it includes a clearly documented local crop from the provided D17 reference image as a temporary fallback. Exact visual parity still requires testing the exported package in the user's target VaCuus runtime.


## Follow-up fix: browser CSS units and VaCuus DPI

The LAMGUARD runtime screenshot showed that the previous opt-in experiment had been left enabled for the sample: converting the source card from `width:398px` to `width:398dp` produced a rendered width around 252px in that user's view. Therefore `ConversionOptions.cssPixelsAsDp` defaults to `false`; numeric CSS `px` tokens and `@media` breakpoints are preserved for browser pixel-fidelity. The option can be explicitly enabled after measuring the target widget's geometry scale and deciding that Slate-DPI-aware sizing is desired. The base stylesheet uses physical `px` for default typography and controls. Regression tests cover both default preservation and opt-in conversion. Runtime visual verification remains required.


## Follow-up after the 2026-10-17 UE screenshot

The user-provided runtime screenshot showed a uniform scale factor of about 0.63 after the previous default `px` → `dp` conversion: a source `width:398px` appeared around 252 physical pixels wide. This is direct evidence for that target setup that the default mapping should preserve CSS `px`; DPI-aware mapping remains opt-in. The generated `.vacuus-text-run` base rule was switched from `display:inline-block` to `display:block`, and pseudo-element helper selectors now use descendant combinators rather than child combinators to be more robust in the target selector implementation. These changes are covered by regression tests, but need another UE5 screenshot for visual confirmation.


## Дополнение после v6 — 18.10.2026

### Исправлено в редакторе/конвертере

- Исправления Fix All по-прежнему ограничены явными безопасными исходными исправлениями; CSS/JS глобально не переписываются.
- `splitMonolithicHtmlProject()` теперь создаёт отдельный JS-файл для каждого inline script и ставит ссылку на этот файл в исходное место тега. Это сохраняет позицию относительно внешних скриптов.
- `convertProject()` собирает внешние и inline classic scripts по порядку тегов в HTML. Неизвестные или удалённые ссылки диагностируются; для `async`, `defer`, `module` и `nomodule` выдаются предупреждения о семантических различиях при сборке в единый bundle.
- CSS `@import` обрабатывается рекурсивно относительно каталога каждого исходного CSS-файла. Порядок правил сохраняется; media-условие оборачивается в `@media`; циклы, внешние и отсутствующие импорты отключаются с диагностикой.
- RCSS-таблица документации генерируется из `src/core/rcss-matrix.ts`; команды синхронизации и проверки не используют Vite.
- `backdrop-filter: blur(...)` сохраняется только в правиле, которое явно включает `decorator: shader(glass-panel)`. В остальных случаях декларация отключается с диагностикой.
- Добавлено предупреждение для неподдерживаемых named HTML entities и для `<script type="application/json">`, import maps и других payload-тегов, которые не попадают в RML/JS output.
- Текущего `cleanVoidTags` option в API уже нет; обязательная XML-нормализация void-тегов остаётся всегда включённой.

### Проверки

- Node test runner: **95 passed, 0 failed** в проверке без сборки Vite; добавлены output golden-тест и проверка условия `backdrop-filter` в визуальном редакторе.
- Проверка выбранных core-модулей через TypeScript `tsc --noEmit`: прошла без ошибок. Проверка сгенерированной матрицы: `node --experimental-strip-types scripts/sync-rcss-matrix.mts --check` (103 свойства). `package.json` проверен на валидный JSON.
- Vite build не запускался по требованию проекта.
- Полная HTML5-совместимость всё ещё не заявляется: зависимости `parse5` нет, а доступ к npm registry в текущем окружении недоступен. Самописный parser остаётся ограниченным подмножеством; ограничения документированы в `docs/html-parser.md`.
- Браузерное сравнение скриншотов и фактический запуск UE5/VaCuus в этом окружении не выполнялись. Автотесты подтверждают структуру и порядок выходных файлов, а не гарантируют пиксельное совпадение runtime.


## v31 build/export hardening

- Local vision middleware was moved out of the root Vite config and is dynamically imported only for the dev command.
- ZIP export now bounds remote resource and bundled-font fetches, bounds SVG/image decoding, reports progress by phase, and displays actionable timeout errors.
- Added `npm run diagnose:build` and `npm run build:debug` for reproducible preflight/debug reports.
