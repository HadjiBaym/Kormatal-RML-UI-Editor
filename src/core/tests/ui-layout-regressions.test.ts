import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('global UI safeguards prevent intrinsic flex overflow and expose keyboard focus', async () => {
  const css = await read('index.css');
  assert.match(css, /\.app-shell button\s*\{[^}]*white-space:\s*normal/s);
  assert.match(css, /\.app-shell \.flex > :not\(svg\)[\s\S]*?min-width:\s*0/);
  assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*2px solid/s);
  assert.match(css, /prefers-reduced-motion/);
});

test('workspace has responsive column and stacked split-view hooks', async () => {
  const app = await read('App.tsx');
  const css = await read('index.css');
  assert.match(app, /className="app-shell/);
  assert.match(app, /className="app-workspace/);
  assert.match(app, /className="workspace-main-panels/);
  assert.match(app, /className="workspace-editor-pane/);
  assert.match(app, /className="workspace-preview-pane/);
  assert.match(css, /@media \(max-width:\s*1120px\)[\s\S]*?\.workspace-main-panels\s*\{\s*flex-direction:\s*column/s);
});

test('long project paths and modal panels have safe overflow behavior', async () => {
  const tree = await read('components/ProjectTree.tsx');
  const layout = await read('components/LayoutGeneratorModal.tsx');
  const review = await read('components/VisualReviewModal.tsx');
  const css = await read('index.css');
  assert.match(tree, /className="project-file-name truncate" title=\{file\.path\}/);
  assert.match(layout, /className="ui-modal-panel/);
  assert.match(review, /className="ui-modal-panel/);
  assert.match(css, /\.app-shell \.ui-modal-panel\s*\{[^}]*max-width:\s*calc\(100vw - 1rem\)/s);
  assert.match(css, /\.app-shell \.ui-modal-body\s*\{[^}]*overscroll-behavior:\s*contain/s);
});

test('header and preview action groups can wrap without fixed intrinsic width', async () => {
  const header = await read('components/Header.tsx');
  const preview = await read('components/PreviewPanel.tsx');
  const css = await read('index.css');
  assert.match(header, /app-header-actions flex min-w-0 max-w-full flex-wrap/);
  assert.match(preview, /preview-toolbar flex shrink-0 flex-wrap/);
  assert.match(css, /\.app-shell \.app-header button,[\s\S]*?min-height:\s*2rem/);
});
