import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('layout generator AI binding is optional and defaults to manual mode', async () => {
  const ui = await readFile(path.join(root, 'src/components/LayoutGeneratorModal.tsx'), 'utf8');
  assert.match(ui, /readPreference\('kormatal\.layout-ai-model', \['none', 'qwen3vl', 'custom'\] as const, 'none'\)/);
  assert.match(ui, /Без ИИ — ручная проверка/);
  assert.match(ui, /Qwen3-VL 2B/);
  assert.match(ui, /Другая локальная vision-модель/);
  assert.match(ui, /Локальный AI для PNG/);
  assert.match(ui, /disabled=\{isAnalyzing \|\| isGenerating \|\| !uploadedSourceCount\}/);
});

test('selected model alias and local endpoint are sent to the local analysis route', async () => {
  const ui = await readFile(path.join(root, 'src/components/LayoutGeneratorModal.tsx'), 'utf8');
  assert.match(ui, /model: selectedAiModelId, baseUrl: localModelBaseUrl\.trim\(\)/);
  assert.match(ui, /local-ai\/status/);
  assert.match(ui, /Проверить подключение/);
});

test('source-specific pipeline is visible in the generator and output explanation', async () => {
  const ui = await readFile(path.join(root, 'src/components/LayoutGeneratorModal.tsx'), 'utf8');
  const generator = await readFile(path.join(root, 'src/core/layout-generator.ts'), 'utf8');
  assert.match(ui, /Создание UI по макету/);
  assert.match(ui, /Источники → проверка → Layout IR → RML \/ RCSS/);
  assert.match(generator, /getLayoutSourcePipeline/);
  assert.match(generator, /Как источник преобразован/);
  assert.match(generator, /Как генерируется код/);
});

test('layout generator is wired into the main application and can be opened from the header', async () => {
  const app = await readFile(path.join(root, 'src/App.tsx'), 'utf8');
  const header = await readFile(path.join(root, 'src/components/Header.tsx'), 'utf8');
  assert.match(app, /import \{ LayoutGeneratorModal \} from '\.\/components\/LayoutGeneratorModal\.tsx'/);
  assert.match(app, /<LayoutGeneratorModal[\s\S]*?isOpen=\{isLayoutGeneratorOpen\}[\s\S]*?onApply=\{handleApplyGeneratedLayout\}/);
  assert.match(app, /onOpenLayoutGenerator=\{\(\) => setIsLayoutGeneratorOpen\(true\)\}/);
  assert.match(header, /onClick=\{onOpenLayoutGenerator\}[\s\S]*?>[\s\S]*?По макету/);
});

test('SVG, Figma JSON and screenshots route through the dedicated layout import router', async () => {
  const app = await readFile(path.join(root, 'src/App.tsx'), 'utf8');
  const router = await readFile(path.join(root, 'src/core/layout-import-router.ts'), 'utf8');
  const modal = await readFile(path.join(root, 'src/components/LayoutGeneratorModal.tsx'), 'utf8');
  assert.match(app, /import \{ planLayoutImport \} from '\.\/core\/layout-import-router\.ts'/);
  assert.match(app, /const layoutPlan = planLayoutImport\(newFiles\)/);
  assert.match(app, /kind: layoutPlan\.kind/);
  assert.match(app, /companionPng: layoutPlan\.companionPng/);
  assert.match(router, /if \(files\.length === 1\)/);
  assert.match(router, /kind: 'image'/);
  assert.match(router, /kind: 'svg'/);
  assert.match(router, /kind: 'figma'/);
  assert.match(modal, /if \(!isOpen \|\| !initialImport \|\| lastInitialImportTokenRef\.current === initialImport\.token\) return/);
  assert.match(modal, /attachReferenceImage\(\{ name: initialImport\.name, dataUrl: initialImport\.content \}\)/);
  assert.match(modal, /setPipelineSvgSource\(initialImport\.content\); setPipelineSvgName\(initialImport\.name\)/);
  assert.match(modal, /setPipelineJsonSource\(initialImport\.content\); setPipelineJsonName\(initialImport\.name\)/);
  assert.match(modal, /parseSvgLayout\(initialImport\.companionSvg\.content/);
});

test('generated layout output is inserted into the project and selects editable RML for preview', async () => {
  const app = await readFile(path.join(root, 'src/App.tsx'), 'utf8');
  assert.match(app, /const handleApplyGeneratedLayout = useCallback/);
  assert.match(app, /generatedFiles\.find\(file => \/main-editable\\\.rml\$\/i\.test\(file\.path\)\)/);
  assert.match(app, /generatedFiles\.find\(file => \/\\\.rml\$\/i\.test\(file\.path\)\)/);
  assert.match(app, /setActiveFileId\(entry\?\.id \|\| ''\)/);
  assert.match(app, /setViewMode\('split'\)/);
  assert.match(app, /const nextFiles = \[\.\.\.existing, \.\.\.generatedFiles\]/);
  assert.match(app, /Открыт редактируемый main-editable\.rml/);
});

test('multi-file layout import preserves companion sources through the router', async () => {
  const router = await readFile(path.join(root, 'src/core/layout-import-router.ts'), 'utf8');
  const app = await readFile(path.join(root, 'src/App.tsx'), 'utf8');
  assert.match(router, /const primaryJson = jsonFiles\[0\]/);
  assert.match(router, /const companionSvg = primaryJson/);
  assert.match(router, /const companionPng = imageFiles\[0\]/);
  assert.match(router, /supplementalFiles: files\.filter/);
  assert.match(app, /const supplementalFiles = layoutPlan\.supplementalFiles/);
  assert.match(app, /Дополнительных источников: \$\{supplementalFiles\.length\}/);
});

test('unrecognized JSON is routed to the generator and reports a schema error there', async () => {
  const app = await readFile(path.join(root, 'src/App.tsx'), 'utf8');
  const modal = await readFile(path.join(root, 'src/components/LayoutGeneratorModal.tsx'), 'utf8');
  const router = await readFile(path.join(root, 'src/core/layout-import-router.ts'), 'utf8');
  assert.match(router, /function jsonContent\(file: ProjectFile\)/);
  assert.match(router, /kind: 'figma'/);
  assert.match(app, /setIsLayoutGeneratorOpen\(true\)/);
  assert.match(modal, /setError\(err instanceof Error \? err\.message/);
  assert.match(modal, /setStatus\(`Не удалось разобрать файл/);
});

test('remote previews can use a token-authenticated localhost bridge and discover model IDs before entering an alias', async () => {
  const ui = await readFile(path.join(root, 'src/components/LayoutGeneratorModal.tsx'), 'utf8');
  assert.match(ui, /type LocalConnectionMode = 'app-server' \| 'bridge'/);
  assert.match(ui, /Локальный мост Windows/);
  assert.match(ui, /X-Local-Bridge-Token/);
  assert.match(ui, /local-ai-bridge\\Start-Local-Bridge\.bat/);
  assert.doesNotMatch(ui, /disabled=\{analysisModelChoice === 'none' \|\| checkingLocalAi \|\| !localModelBaseUrl\.trim\(\) \|\| \(analysisModelChoice === 'custom' \&\& !localModelAlias\.trim\(\)\)\}/);
});


test('combined layout pipeline exposes optional SVG, PNG and JSON inputs in fixed order with PNG analysis last', async () => {
  const ui = await readFile(path.join(root, 'src/components/LayoutGeneratorModal.tsx'), 'utf8');
  const core = await readFile(path.join(root, 'src/core/layout-generator.ts'), 'utf8');
  assert.match(ui, /Figma JSON/);
  assert.match(ui, /SVG/);
  assert.match(ui, /PNG \/ изображение/);
  assert.match(ui, /function sourceCard|const sourceCard/);
  assert.match(ui, /JSON → SVG → сверка → PNG-анализ последним → Layout IR/);
  assert.match(ui, /handleRunFullPipeline/);
  assert.match(ui, /pipelineValidated/);
  assert.match(ui, /Разделы рабочего процесса/);
  assert.match(ui, /Этапы и ошибки/);
  assert.match(ui, /rightPaneTab === 'structure'/);
  assert.match(ui, /rightPaneTab === 'code'/);
  assert.match(ui, /rightPaneTab === 'checks'/);
  assert.match(ui, /lg:flex/);
  assert.doesNotMatch(ui, /Все источники \/ полный цикл.*SVG \/ вектор/s);
  assert.match(ui, /Создать RML\/RCSS/);
  assert.match(ui, /Пропорции PNG/);
  assert.match(ui, /координаты PNG-анализатора будут преобразованы в систему координат Layout IR/i);
  assert.match(core, /combineLayoutPipelineDocuments/);
  assert.match(core, /validateLayoutPipelineDocument/);
  assert.match(core, /scaleLayoutDocumentTo/);
});


test('layout generator uses one responsive workspace instead of separate source-mode screens', async () => {
  const ui = await readFile(path.join(root, 'src/components/LayoutGeneratorModal.tsx'), 'utf8');
  assert.match(ui, /Разделы рабочего процесса/);
  assert.match(ui, /grid-cols-5[\s\S]*?lg:hidden/);
  assert.match(ui, /lg:grid-cols-\[minmax\(245px,285px\)_minmax\(0,1fr\)_minmax\(310px,370px\)\]/);
  assert.match(ui, /mobileWorkspaceTab === 'sources'/);
  assert.match(ui, /mobileWorkspaceTab === 'preview'/);
  assert.match(ui, /if \(tab === 'structure' \|\| tab === 'code' \|\| tab === 'checks'\)/);
  assert.match(ui, /Локальный AI для PNG/);
  assert.doesNotMatch(ui, /Все источники \/ полный цикл/);
  assert.doesNotMatch(ui, /SVG \/ вектор/);
  assert.doesNotMatch(ui, /PNG \/ анализ/);
  assert.doesNotMatch(ui, /handleInputModeChange|handleSvgFile|handleFigmaFile|handlePngFile|handleAnalyzePng/);
  assert.doesNotMatch(ui, /sourceImageDataUrl|sourceImageUrl|svgSource|figmaJsonSource/);
});
