import test from 'node:test';
import assert from 'node:assert/strict';
import { rewriteRcssForBrowser } from '../preview-assets.ts';

test('browser preview maps RmlUi dp units to same-scale CSS px units', () => {
  const output = rewriteRcssForBrowser('.panel { width: 320dp; min-height: 40dp; margin: -2.5dp 1dp; }', {});
  assert.match(output, /width:\s*320px/);
  assert.match(output, /min-height:\s*40px/);
  assert.match(output, /margin:\s*-2.5px 1px/);
});

test('browser preview leaves px values and numbers in non-length text unchanged', () => {
  const output = rewriteRcssForBrowser('.panel { width: 320px; opacity: .8; } /* 18dp is docs */', {});
  assert.match(output, /width:\s*320px/);
  assert.match(output, /opacity:\s*\.8/);
  assert.match(output, /18dp is docs/);
});


test('browser preview also maps dp units in media-query breakpoints', () => {
  const output = rewriteRcssForBrowser('@media (min-width: 640dp) { .panel { width: 100dp; } }', {});
  assert.match(output, /min-width:\s*640px/);
  assert.match(output, /width:\s*100px/);
});


test('VaCuus emulation iframe does not inject a visible watermark into the UI itself', async () => {
  const fs = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const path = fileURLToPath(new URL('../../components/PreviewPanel.tsx', import.meta.url));
  const source = await fs.readFile(path, 'utf8');
  assert.doesNotMatch(source, /vacuus-emulation-hud-overlay/);
  assert.doesNotMatch(source, /Visual watermark pill for RmlUi strict emulation/);
});
