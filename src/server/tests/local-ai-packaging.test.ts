import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('local model manifest pins both official GGUF weights and SHA-256 digests', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'local-ai/model-manifest.json'), 'utf8')) as {
    files: Array<{ path: string; sha256: string; url: string }>;
    runtimeRelease: string;
    offlineRuntime: string;
  };
  assert.equal(manifest.files.length, 2);
  for (const file of manifest.files) {
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.match(file.url, /^https:\/\/huggingface\.co\/Qwen\/Qwen3-VL-2B-Instruct-GGUF\/resolve\/main\//);
    assert.match(file.path, /^models\/.*\.gguf$/);
  }
  assert.equal(manifest.runtimeRelease, 'b11711');
  assert.match(manifest.offlineRuntime, /127\.0\.0\.1:8081/);
});

test('local installer uses pinned direct release URLs rather than an external metadata API', async () => {
  const script = await readFile(path.join(root, 'local-ai/Install-Local-Model.ps1'), 'utf8');
  assert.match(script, /\$releaseTag\s*=\s*'b11711'/);
  assert.match(script, /github\.com\/ggml-org\/llama\.cpp\/releases\/download/);
  assert.doesNotMatch(script, /api\.github\.com|Invoke-RestMethod\s+-Uri\s+\$releaseUri/);
  assert.match(script, /089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae/);
  assert.match(script, /f9a68fabba69c3b81e153367b2c7521030b0fa8bb0de400c9599c8e6725f9c82/);
});

test('local inference server binds only to loopback and requires both model components', async () => {
  const script = await readFile(path.join(root, 'local-ai/Start-Local-AI.ps1'), 'utf8');
  assert.match(script, /--host\s+127\.0\.0\.1/);
  assert.match(script, /--mmproj\s+\$ProjectorPath/);
  assert.match(script, /Qwen3VL-2B-Instruct-Q4_K_M\.gguf/);
  assert.doesNotMatch(script, /--host\s+0\.0\.0\.0/);
});
