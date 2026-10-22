/** Russian labels for compatibility diagnostics shown in the application UI. Technical identifiers and source snippets remain unchanged. */
const exact: Record<string, string> = {
  'The stylesheet could not be parsed reliably. No automatic CSS-to-RCSS transformations were applied.': 'Не удалось надёжно разобрать таблицу стилей. Автоматические преобразования CSS → RCSS не выполнялись.',
  'Fix the reported CSS syntax error, then run conversion again.': 'Исправьте указанную синтаксическую ошибку CSS и запустите преобразование повторно.',
  'Rewrote :root to body so theme custom properties inherit through the RML document.': 'Селектор :root заменён на body, чтобы пользовательские свойства темы наследовались в документе RML.',
  'No action needed; verify color variables on the target VaCuus runtime.': 'Действия не требуются. Проверьте цветовые переменные в целевой среде VaCuus.',
  'Inline SVG icon detected and converted to a generated PNG asset reference.': 'Обнаружена встроенная SVG-иконка; создана ссылка на PNG-ресурс.',
  'Export the full ZIP so SVG assets are rasterized and included. Verify the generated PNGs are present under Content/DevUI/Assets.': 'Экспортируйте полный ZIP, чтобы SVG-ресурсы были преобразованы в растровый формат и включены в архив. Убедитесь, что PNG-файлы находятся в Content/DevUI/Assets.',
  'HTML5 DOCTYPE is stripped because RML uses an <rml> document envelope.': 'DOCTYPE HTML5 удаляется, поскольку документ RML использует корневой элемент <rml>.',
  'The output document uses <rml> as its root element instead of an HTML document declaration.': 'В результирующем документе используется корневой элемент <rml> вместо объявления HTML-документа.',
  'No action needed; the RML envelope is generated automatically.': 'Действия не требуются: оболочка RML генерируется автоматически.',
  'Dedicated #mount container detected.': 'Обнаружен специальный контейнер #mount.',
  'A compiled UI bundle can mount into this node if its runtime expects this convention.': 'Скомпилированный UI-бандл может монтироваться в этот узел, если этого требует его среда выполнения.',
  'Keep the mount node empty if the JS bundle owns its children.': 'Оставляйте узел mount пустым, если его содержимым управляет JS-бандл.',
  'Localized text detected. Verify that the loaded font contains all required Unicode glyphs.': 'Обнаружен локализованный текст. Убедитесь, что загруженный шрифт содержит все необходимые символы Unicode.',
  'Missing font glyphs may render as boxes or blank spaces in the UE5 viewport.': 'Отсутствующие глифы шрифта могут отображаться квадратами или пустыми местами в окне UE5.',
  'Emoji glyph detected in visible text. Bundled VaCuus fonts may not contain color-emoji glyphs, which can render as empty boxes.': 'В видимом тексте обнаружен эмодзи. Встроенные шрифты VaCuus могут не содержать цветных эмодзи, поэтому вместо них могут появиться пустые квадраты.',
  'Browser "localStorage" API is not available in VaCuus / RmlUi embedded runtime.': 'API браузера localStorage недоступен во встроенной среде VaCuus / RmlUi.',
  'Persist state via Unreal Engine SaveGame or bind it to a UE5 data model.': 'Сохраняйте состояние через SaveGame в Unreal Engine или привязывайте его к модели данных UE5.',
  'Browser "sessionStorage" is not available in VaCuus.': 'Браузерный sessionStorage недоступен в VaCuus.',
  'Browser "fetch()" is not part of the VaCuus/RmlUi UI contract documented for this project.': 'Браузерный fetch() не входит в описанный контракт интерфейса VaCuus/RmlUi для этого проекта.',
  'Perform HTTP requests in Unreal Engine and publish results through the project’s bridge/data model.': 'Выполняйте HTTP-запросы в Unreal Engine и передавайте результаты через мост проекта или модель данных.',
  'Browser cookies are not part of the RmlUi document API.': 'Cookies браузера не входят в API документа RmlUi.',
  'React/ReactDOM usage detected. A browser ReactDOM runtime cannot be assumed compatible with the RmlUi document tree.': 'Обнаружено использование React/ReactDOM. Нельзя считать браузерную среду ReactDOM совместимой с деревом документа RmlUi.',
  'jQuery usage detected. jQuery assumes browser DOM semantics that may not match RmlUi.': 'Обнаружено использование jQuery. Он предполагает семантику браузерного DOM, которая может отличаться от RmlUi.',
  'JavaScript could not be parsed as standard ECMAScript. AST-based diagnostics and edits were skipped to avoid modifying source incorrectly.': 'JavaScript не удалось разобрать как стандартный ECMAScript. Анализ и правки на основе AST пропущены, чтобы не повредить исходник.',
  'Browser innerHTML property detected. VaCuus/RmlUi exposes innerRML for parsing dynamic markup.': 'Обнаружено свойство innerHTML. В VaCuus/RmlUi для разбора динамической разметки используется innerRML.',
  'Dynamic node insertion detected without a recognized cleanup operation. Review whether the list can grow without a bound.': 'Обнаружено динамическое добавление узлов без распознанной операции очистки. Проверьте, не может ли список расти бесконечно.',
  'Element creation and continuous update timers coexist. Review whether a fixed node pool would reduce churn.': 'Создание элементов используется одновременно с таймерами постоянного обновления. Проверьте, снизит ли нагрузку повторное использование фиксированного пула узлов.',
  'Cyrillic text is present, but no referenced custom @font-face resolves to an imported font asset.': 'В тексте есть кириллица, но ни одно указанное правило @font-face не ссылается на импортированный файл шрифта.',
  'No source HTML entry was imported; the converter generated a minimal fallback screen.': 'Исходный HTML-файл не импортирован; конвертер создал минимальный экран-заглушку.',
  'CSS Grid display value is unsupported by RmlUi/VaCuus.': 'Значение display: grid не поддерживается RmlUi/VaCuus.',
  'CRITICAL GOTCHA: box-shadow may parse successfully, but it does NOT render in this VaCuus/RmlUi renderer.': 'ВАЖНО: box-shadow может успешно разбираться, но этот renderer VaCuus/RmlUi его не отображает.',
  'Mask-image syntax may parse, but alpha masking is not applied by this renderer.': 'Синтаксис mask-image может разбираться, но альфа-маска в этом renderer не применяется.',
  'backdrop-filter is preserved only for blur(...) in a rule that also enables decorator: shader(glass-panel).': 'В VaCuus 1.1.0 поддерживается backdrop-filter: blur(...) без обязательного decorator: shader(glass-panel) в том же селекторе; проверьте результат в целевом рендерере.',
  'The browser visual effect will not be reproduced by this declaration.': 'Это объявление не воспроизводит визуальный эффект браузера.',
  'It may be rejected by the target RCSS parser or parse without visible effect.': 'Целевой парсер RCSS может отклонить свойство или разобрать его без видимого эффекта.',
  'It may not be supported by the exact VaCuus build.': 'Свойство может не поддерживаться конкретной сборкой VaCuus.',
};

export function translateDiagnosticText(input: string): string {
  const text = String(input ?? '');
  if (exact[text]) return exact[text];

  let match = text.match(/^CSS parser error: (.*)$/i);
  if (match) return `Ошибка разбора CSS: ${match[1]}`;
  match = text.match(/^CSS Grid display value "([^"]+)" is unsupported by RmlUi\/VaCuus\.?$/i);
  if (match) return `Значение display: ${match[1]} не поддерживается RmlUi/VaCuus.`;
  match = text.match(/^CSS property "([^"]+)" is not supported by the target RmlUi renderer\.?$/i);
  if (match) return `CSS-свойство «${match[1]}» не поддерживается целевым renderer RmlUi.`;
  match = text.match(/^Property "([^"]+)" is not in the current RCSS compatibility catalog\.?$/i);
  if (match) return `Свойство «${match[1]}» отсутствует в текущем каталоге совместимости RCSS.`;
  match = text.match(/^The compatibility catalog marks "([^"]+)" as unsupported\.?$/i);
  if (match) return `Согласно каталогу совместимости, свойство «${match[1]}» не поддерживается.`;
  match = text.match(/^Converted (\d+) CSS px units? to dp units?\.?$/i);
  if (match) return `Преобразовано CSS-значений px в dp: ${match[1]}.`;
  match = text.match(/^High HTML element count detected \((\d+)\)\. Review the VaCuus element budget for this screen type\.?$/i);
  if (match) return `Обнаружено много HTML-элементов (${match[1]}). Проверьте бюджет элементов VaCuus для этого экрана.`;
  match = text.match(/^HTML5 <([^>]+)> is not supported by RmlUi(?: core)?\.?$/i);
  if (match) return `Элемент HTML5 <${match[1]}> не поддерживается ядром RmlUi.`;
  match = text.match(/^Inline <(style|script)> block detected and extracted into a separate (stylesheet|JavaScript file)\.?$/i);
  if (match) return `Встроенный блок <${match[1]}> обнаружен и вынесен в отдельный файл (${match[2] === 'stylesheet' ? 'таблица стилей' : 'JavaScript'}).`;
  match = text.match(/^Inline event handler "([^"]+)" detected\.?$/i);
  if (match) return `Обнаружен встроенный обработчик события «${match[1]}».`;
  match = text.match(/^JavaScript file "([^"]+)" is not referenced by the HTML and was appended after referenced scripts\.?$/i);
  if (match) return `JavaScript-файл «${match[1]}» не подключён в HTML и был добавлен после подключённых скриптов.`;
  match = text.match(/^Removed (.+): inherit; natural CSS inheritance supplies this font property\.?$/i);
  if (match) return `Удалено «${match[1]}: inherit»: свойство шрифта наследуется автоматически.`;
  match = text.match(/^Converted legacy (.+) to (.+)\.?$/i);
  if (match) return `Старое свойство ${match[1]} преобразовано в ${match[2]}.`;
  return text;
}
