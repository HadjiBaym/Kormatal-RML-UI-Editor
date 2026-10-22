import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUNDLED_UI_FONT_FILES,
  DEFAULT_UI_FONT_FAMILY,
  UI_FONT_FAMILIES,
  getBundledFontFaceRcss,
  isAllowedUiFontFamily,
  normalizeInlineFontStyle,
  normalizeNativeRcssFontFamilies,
  resolveUiFontFamily,
} from '../ui-fonts.ts';
import { normalizeCssFontFamilies } from '../preview-assets.ts';

test('UI typography allow-list contains only the three approved families and defaults to Onest', () => {
  assert.deepEqual(UI_FONT_FAMILIES.map(item => item.family), ['Onest', 'Tektur', 'JetBrains Mono']);
  assert.equal(DEFAULT_UI_FONT_FAMILY, 'Onest');
  assert.equal(resolveUiFontFamily('Onest Regular'), undefined, 'font-face variants are weights, not separate family names');
  assert.equal(resolveUiFontFamily('"Onest"'), 'Onest');
  assert.equal(resolveUiFontFamily('Tektur'), 'Tektur');
  assert.equal(resolveUiFontFamily('JetBrains Mono'), 'JetBrains Mono');
  assert.equal(resolveUiFontFamily('JetBrainsMono'), 'JetBrains Mono');
  assert.equal(resolveUiFontFamily('Arial'), undefined);
  assert.equal(isAllowedUiFontFamily('JetBrains Mono'), true);
  assert.equal(isAllowedUiFontFamily('Comic Sans MS'), false);
});

test('bundled typefaces contain exactly five normal static weights for every allowed family', () => {
  assert.equal(BUNDLED_UI_FONT_FILES.length, 15);
  for (const family of ['Onest', 'Tektur', 'JetBrains Mono']) {
    const faces = BUNDLED_UI_FONT_FILES.filter(face => face.family === family);
    assert.deepEqual(faces.map(face => face.weight), [400, 500, 600, 700, 800]);
  }
  const registration = getBundledFontFaceRcss();
  assert.match(registration, /font-family: "Onest";\s*src: Fonts\/Onest-Regular\.ttf;\s*font-weight: 400;/);
  assert.match(registration, /font-family: "Tektur"/);
  assert.match(registration, /font-family: "JetBrains Mono"/);
  assert.doesNotMatch(registration, /LatoLatin|Noto Sans|Arial|Inter/);
});

test('inline styles fall back for unregistered fonts but preserve families declared by @font-face', () => {
  const style = normalizeInlineFontStyle('color: #fff; font-family: "Comic Sans MS", cursive; font-size: 14px;');
  assert.match(style, /font-family: Onest/);
  assert.match(style, /font-size: 14px/);
  assert.match(style, /color: #fff/);
  assert.doesNotMatch(style, /Comic Sans|cursive/);
  const monospace = normalizeInlineFontStyle('font-family: monospace; color: #ddd;');
  assert.match(monospace, /font-family: "JetBrains Mono"/);
  const custom = normalizeInlineFontStyle('font-family: \"Game Sans\"; color: #ddd;', new Set(['game sans', 'onest', 'tektur', 'jetbrains mono']));
  assert.match(custom, /font-family:\s*\"Game Sans\"/);
});

test('browser preview normalizes arbitrary font families and removes source font-face registrations', () => {
  const normalized = normalizeCssFontFamilies(`@font-face { font-family: "Arial Custom"; src: url(x.ttf); } body { font-family: Arial, Helvetica, sans-serif; } code { font-family: monospace; } .title { font-family: Tektur; }`);
  assert.doesNotMatch(normalized, /@font-face|Arial Custom|Helvetica|sans-serif/);
  assert.match(normalized, /body\s*\{\s*font-family:\s*Onest/s);
  assert.match(normalized, /code\s*\{\s*font-family:\s*"JetBrains Mono"/s);
  assert.match(normalized, /font-family:\s*Tektur/);
});

test('the font files and OFL licenses required by the editor are present in public assets', async () => {
  const fs = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  for (const face of BUNDLED_UI_FONT_FILES) {
    const path = fileURLToPath(new URL(`../../../public/fonts/${face.filename}`, import.meta.url));
    const data = await fs.readFile(path);
    assert.ok(data.byteLength > 10000, `${face.filename} should be a real bundled TTF, not a placeholder`);
  }
  for (const license of ['LICENSE-Onest-OFL.txt', 'LICENSE-Tektur-OFL.txt', 'LICENSE-JetBrains-Mono-OFL.txt']) {
    const path = fileURLToPath(new URL(`../../../public/fonts/${license}`, import.meta.url));
    const contents = await fs.readFile(path, 'utf8');
    assert.match(contents, /SIL OPEN FONT LICENSE/i);
  }
});

test('native RCSS normalizes bundled faces and preserves valid custom font registrations', () => {
  const normalized = normalizeNativeRcssFontFamilies(`
    @font-face { font-family: "Onest"; src: url(../custom/Onest.ttf); font-weight: 600; }
    @font-face { font-family: "Random Display"; src: Fonts/random.ttf; font-weight: 400; }
    body { font-family: Arial, sans-serif; }
    code { font-family: monospace; }
  `);
  assert.match(normalized, /font-family: "Onest"/);
  assert.match(normalized, /src: Fonts\/Onest-SemiBold\.ttf/);
  assert.match(normalized, /font-family:\s*\"Random Display\"/);
  assert.match(normalized, /src:\s*Fonts\/random\.ttf/);
  assert.doesNotMatch(normalized, /Arial|sans-serif|custom\/Onest\.ttf/);
  assert.match(normalized, /font-family: "JetBrains Mono"/);
});
