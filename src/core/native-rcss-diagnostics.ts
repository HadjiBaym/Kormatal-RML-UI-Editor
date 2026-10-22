import postcss from 'postcss';
import type { DiagnosticIssue, ProjectFile } from './types.ts';
import { getVaCuusRcssProperty, VACUUS_TARGET_BASELINE } from './vacuus-1.1.0-ue5.8-profile.ts';

const VALUE_CHECK_PROPERTIES = new Set([
  'display', 'position', 'float', 'clear', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items',
  'visibility', 'overflow', 'overflow-x', 'overflow-y', 'pointer-events', 'text-decoration',
  'text-transform', 'white-space', 'word-break',
]);

/** Inspect native RCSS without running browser-HTML conversion over an RML project. */
export function analyzeNativeRcssFiles(files: ProjectFile[]): DiagnosticIssue[] {
  const diagnostics: DiagnosticIssue[] = [];
  for (const file of files.filter(item => /\.rcss$/i.test(item.path))) {
    let root: postcss.Root;
    try {
      root = postcss.parse(file.content, { from: file.path });
    } catch (error) {
      const parseError = error as { line?: number; column?: number; reason?: string };
      const line = parseError.line || 1;
      const column = parseError.column || 1;
      const message = parseError.reason || (error instanceof Error ? error.message : String(error));
      diagnostics.push({
        id: `native-rcss-parse-${file.id.replace(/[^a-zA-Z0-9_-]+/g, '-')}-${line}-${column}`,
        severity: 'error', category: 'css', file: file.path, line, column,
        originalSnippet: file.content.split(/\r?\n/)[line - 1]?.trim().slice(0, 140) || '',
        message: `Не удалось разобрать RCSS: ${message}`,
        impact: 'Файл может быть полностью или частично проигнорирован при загрузке VaCuus.',
        autoFixAvailable: false, fixed: false,
        recommendedAction: 'Исправьте синтаксис вручную и повторно проверьте файл в эмуляции VaCuus.',
        docRef: 'docs/rcss-compatibility.md',
      });
      continue;
    }

    root.walkDecls(declaration => {
      const property = declaration.prop.toLowerCase();
      if (property.startsWith('--')) return;
      const definition = getVaCuusRcssProperty(property);
      const value = declaration.value.trim();
      const normalizedValue = value.toLowerCase();
      const line = declaration.source?.start?.line || 1;
      const column = declaration.source?.start?.column || 1;
      let severity: DiagnosticIssue['severity'] | undefined;
      let message = '';
      let impact = '';
      let recommendedAction = '';

      if (!definition) {
        severity = 'unverified';
        message = `Свойство «${declaration.prop}» отсутствует в официальном профиле RCSS VaCuus ${VACUUS_TARGET_BASELINE.pluginVersion} / UE ${VACUUS_TARGET_BASELINE.engineVersion}.`;
        impact = 'Это может быть неподдерживаемое веб-свойство или конструкция, которую плагин обрабатывает вне матрицы свойств. Отсутствие в списке требует проверки, но само по себе не доказывает поведение парсера.';
        recommendedAction = 'Проверьте официальную матрицу целевой версии и источник реализации перед использованием; не переносите браузерное свойство автоматически.';
      } else if (definition.renderStatus === 'not-rendered') {
        severity = 'warning';
        message = `Свойство «${property}» зарегистрировано, но визуальный эффект не отрисовывается в VaCuus ${VACUUS_TARGET_BASELINE.pluginVersion}.`;
        impact = definition.notes;
        recommendedAction = property === 'box-shadow'
          ? 'Используйте подготовленную текстуру тени или подтверждённый decorator ninepatch; исходные фон и рамка сохраняются, тень будет отброшена.'
          : property === 'mask-image'
            ? 'Запеките альфа-маску в текстуру; иначе элемент будет отображён без маски.'
            : 'Замените эффект способом, подтверждённым для целевой версии, и проверьте рендер в UE5.';
      } else if (property === 'backdrop-filter') {
        if (/^blur\s*\([^)]*\)$/.test(normalizedValue)) {
          // This is the verified native VaCuus glass path; no same-rule shader prerequisite is listed in the release matrix.
          return;
        }
        severity = 'warning';
        message = 'В целевой версии VaCuus подтверждён только backdrop-filter: blur(...); другие backdrop-фильтры отклоняются.';
        impact = definition.notes;
        recommendedAction = 'Замените значение на один blur(...), запеките эффект в текстуру или используйте однотонную полупрозрачную панель.';
      } else if (property === 'filter') {
        severity = 'warning';
        message = normalizedValue.startsWith('blur(')
          ? 'filter: blur(...) разбирается как ограниченная возможность, но не является подтверждённым целевым эффектом для элементов; штатный blur используется через backdrop-filter.'
          : 'Этот тип filter не поддерживается целевым VaCuus runtime и будет отброшен.';
        impact = definition.notes;
        recommendedAction = 'Для размытия сцены используйте backdrop-filter: blur(...); для других эффектов подготовьте текстуру или используйте UE rendering.';
      } else if (property === 'box-shadow' || property === 'mask-image') {
        // Normally covered by renderStatus=not-rendered, retained as a guard if a future profile changes the status.
        severity = 'warning';
        message = `«${property}» не воспроизводит визуальный эффект в текущем профиле.`;
        impact = definition.notes;
        recommendedAction = 'Замените эффект подтверждённым декоратором или подготовленным ресурсом.';
      } else if (VALUE_CHECK_PROPERTIES.has(property) && definition.keywords.length > 0 && !definition.keywords.includes(normalizedValue)) {
        severity = 'warning';
        message = `Значение «${value}» не входит в список подтверждённых keywords для «${property}» в VaCuus ${VACUUS_TARGET_BASELINE.pluginVersion}.`;
        impact = `Разрешённые значения: ${definition.keywords.join(', ')}. ${definition.notes}`;
        recommendedAction = property === 'display' && /^(?:inline-)?grid$/.test(normalizedValue)
          ? 'CSS Grid отсутствует. Перестройте контейнер на flex или задайте явную геометрию; при этом display: table и родственные значения входят в матрицу VaCuus.'
          : 'Используйте keyword из профиля целевой версии и проверьте итоговый рендер.';
      } else if (property === 'border-radius' || /^border-(?:top-left|top-right|bottom-left|bottom-right)-radius$/.test(property)) {
        if (/%/.test(value)) {
          severity = 'warning';
          message = 'VaCuus RCSS target profile uses length-only radius parsers; percentage radius is not supported.';
          impact = definition.notes;
          recommendedAction = 'Укажите радиус в px/dp, рассчитав нужный размер относительно целевого элемента.';
        }
      } else if (property === 'transition') {
        if (/\bease(?:-in|-out|-in-out)?\b|(?:^|[\s,])Cubic-(?:In|Out|In-Out)(?:[\s,]|$)/.test(value)) {
          severity = 'warning';
          message = 'В transition обнаружено неподдерживаемое или неверно написанное timing-значение.';
          impact = definition.notes;
          recommendedAction = 'Используйте поддерживаемый tween, например cubic-in-out; значения должны быть в нижнем регистре. Неверный token может привести к сбросу всей декларации.';
        }
      } else if (property === 'opacity' && definition.renderStatus === 'limited') {
        severity = 'info';
        message = 'Opacity зарегистрирован, но compositing родителя и потомков отличается от браузера.';
        impact = definition.notes || 'Родительская opacity не обязательно перемножается с opacity потомков как browser compositing group.';
        recommendedAction = 'Для независимой прозрачности предпочтительнее альфа-канал конкретного цвета/изображения; подтвердите итог на целевом рендере.';
      } else if (definition.renderStatus === 'limited') {
        severity = 'info';
        message = `Свойство «${property}» имеет ограничения в VaCuus ${VACUUS_TARGET_BASELINE.pluginVersion}.`;
        impact = definition.notes;
        recommendedAction = 'Сверьте grammar из профиля и проверьте конкретное значение в UE5.';
      }

      if (!severity) return;
      diagnostics.push({
        id: `native-rcss-${file.id.replace(/[^a-zA-Z0-9_-]+/g, '-')}-${line}-${column}-${diagnostics.length + 1}`,
        severity, category: 'css', file: file.path, line, column,
        originalSnippet: declaration.toString().slice(0, 160),
        message, impact, autoFixAvailable: false, fixed: false,
        recommendedAction, docRef: 'docs/vacuus-source-audit-1.1.0-ue5.8.md',
      });
    });
  }
  return diagnostics;
}
