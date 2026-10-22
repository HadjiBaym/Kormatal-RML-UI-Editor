import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const lockFiles = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock']
  .filter(name => existsSync(path.join(root, name)));
const issues = [];
const nodeMajor = Number(process.versions.node.split('.')[0]);
const nodeParts = process.versions.node.split('.').map(Number);
const nodeOk = nodeMajor > 22 || (nodeMajor === 22 && nodeParts[1] >= 12) || (nodeMajor === 20 && nodeParts[1] >= 19);

console.log('VaCuus UI Converter — build preflight');
console.log(`Node.js: ${process.versions.node}`);
console.log(`Package: ${pkg.name} v${pkg.version}`);
console.log(`Working directory: ${root}`);
console.log(`Lock files: ${lockFiles.length ? lockFiles.join(', ') : 'none'}`);

if (!nodeOk) issues.push('Node.js ниже рекомендуемой версии Vite 8. Используйте Node 22.12+ или 20.19+.');
if (!existsSync(path.join(root, 'node_modules'))) {
  issues.push('Папка node_modules отсутствует. Сначала выполните npm install и дождитесь завершения без ошибок.');
} else if (!existsSync(viteBin)) {
  issues.push('Vite не найден в node_modules. Проверьте npm install, сеть/registry и npm-логи; команда build не сможет стартовать.');
}
if (lockFiles.includes('bun.lock') && !lockFiles.includes('package-lock.json')) {
  issues.push('В архиве есть bun.lock, но нет package-lock.json. Для npm установка не закреплена lock-файлом; после успешного npm install сохраните package-lock.json.');
}
if (!existsSync(path.join(root, 'index.html'))) issues.push('Не найден index.html — Vite entrypoint отсутствует.');
if (!existsSync(path.join(root, 'vite.config.ts'))) issues.push('Не найден vite.config.ts.');

const largeFiles = [];
for (const relative of ['src/App.tsx', 'src/components/LayoutGeneratorModal.tsx', 'src/components/PreviewPanel.tsx', 'src/core/layout-generator.ts']) {
  const file = path.join(root, relative);
  if (existsSync(file)) largeFiles.push(`${relative}: ${(statSync(file).size / 1024).toFixed(1)} KiB`);
}
if (largeFiles.length) console.log('Large source modules:\n' + largeFiles.map(file => `  - ${file}`).join('\n'));
if (issues.length) {
  console.log('\nPreflight findings:');
  for (const [index, issue] of issues.entries()) console.log(`${index + 1}. ${issue}`);
  if (!existsSync(viteBin)) process.exitCode = 2;
} else {
  console.log('\nPreflight passed: entrypoint, Node and local Vite installation look ready.');
  console.log('If build still stalls, run npm run build:debug and preserve the last emitted Vite phase.');
}
