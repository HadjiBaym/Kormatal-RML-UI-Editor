import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMPORT_LIMITS,
  formatBytes,
  isIgnoredArchivePath,
  isSupportedProjectPath,
  maximumBytesForPath,
  validateArchiveManifest,
  validateImportSelection,
} from '../import-safety.ts';

test('project archive filter ignores dependency/build folders and unsafe paths', () => {
  for (const path of [
    'node_modules/react/index.js', 'dist/assets/app.js', '.git/config', 'build/ui.css',
    '../outside.js', '/absolute/file.js', 'C:/absolute/file.js', 'src/._index.js',
  ]) assert.equal(isIgnoredArchivePath(path), true, path);
  assert.equal(isSupportedProjectPath('src/index.html'), true);
  assert.equal(isSupportedProjectPath('assets/cover.webp'), true);
  assert.equal(isSupportedProjectPath('node_modules/react/index.js'), false);
  assert.equal(isSupportedProjectPath('bin/plugin.dll'), false);
});

test('import selection rejects oversized files and limits total bytes without throwing', () => {
  const result = validateImportSelection([
    { name: 'index.html', size: 1024 },
    { name: 'main.css', size: IMPORT_LIMITS.maxCssBytes + 1 },
    { name: 'a.js', size: IMPORT_LIMITS.maxJsBytes + 1 },
  ]);
  assert.deepEqual(result.accepted.map(file => file.name), ['index.html']);
  assert.equal(result.rejected.length, 2);
  assert.equal(result.acceptedBytes, 1024);
});

test('import selection caps number of files', () => {
  const input = Array.from({ length: IMPORT_LIMITS.maxFiles + 1 }, (_, index) => ({ name: `file-${index}.css`, size: 1 }));
  const result = validateImportSelection(input);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, input.length);
  assert.ok(result.rejected.every(item => item.reason.includes('файлов')));
});

test('archive manifest enforces per-file and total expanded limits', () => {
  const result = validateArchiveManifest([
    { path: 'node_modules/pkg/index.js', size: 1, isDirectory: false },
    { path: 'src/index.html', size: 10, isDirectory: false },
    { path: 'src/huge.css', size: IMPORT_LIMITS.maxCssBytes + 1, isDirectory: false },
  ]);
  assert.deepEqual(result.accepted.map(item => item.path), ['src/index.html']);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.expandedBytes, 10);
});

test('file size format is readable for import feedback', () => {
  assert.equal(formatBytes(128), '128 Б');
  assert.match(formatBytes(1536), /1\.5 КБ/);
  assert.match(formatBytes(2 * 1024 * 1024), /2\.0 МБ/);
  assert.equal(maximumBytesForPath('index.html'), IMPORT_LIMITS.maxHtmlBytes);
  assert.equal(maximumBytesForPath('main.js'), IMPORT_LIMITS.maxJsBytes);
});
