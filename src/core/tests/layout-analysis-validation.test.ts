import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLayoutAnalysisRequest } from '../layout-analysis.ts';

test('PNG analysis request accepts a valid base64 image and normalizes metadata', () => {
  const result = validateLayoutAnalysisRequest({
    imageBase64: 'data:image/png;base64,QUJDRA==', mimeType: 'IMAGE/PNG', width: 1920, height: 1080, name: 'A'.repeat(140),
  });
  assert.equal(result.imageBase64, 'QUJDRA==');
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.width, 1920);
  assert.equal(result.height, 1080);
  assert.equal(result.name?.length, 100);
});

test('PNG analysis request rejects unsupported MIME types, malformed base64, and missing payload', () => {
  assert.throws(() => validateLayoutAnalysisRequest({ imageBase64: '', mimeType: 'image/png', width: 10, height: 10 }), /отсутствуют данные/);
  assert.throws(() => validateLayoutAnalysisRequest({ imageBase64: 'hello-world', mimeType: 'image/png', width: 10, height: 10 }), /base64/);
  assert.throws(() => validateLayoutAnalysisRequest({ imageBase64: 'AAAA', mimeType: 'image/gif', width: 10, height: 10 }), /Поддерживаются/);
});

test('PNG analysis request enforces dimensions and an 8 MiB encoded-image limit', () => {
  assert.throws(() => validateLayoutAnalysisRequest({ imageBase64: 'AAAA', mimeType: 'image/png', width: 0, height: 10 }), /размеры/);
  assert.throws(() => validateLayoutAnalysisRequest({ imageBase64: 'AAAA', mimeType: 'image/png', width: 16385, height: 10 }), /размеры/);
  assert.throws(() => validateLayoutAnalysisRequest({ imageBase64: 'A'.repeat(11_184_820), mimeType: 'image/png', width: 10, height: 10 }), /8 МБ/);
});

test('layout analysis request can select a local model on loopback or private LAN with optional /v1 base path', () => {
  const result = validateLayoutAnalysisRequest({
    imageBase64: 'QUJDRA==', mimeType: 'image/png', width: 320, height: 180,
    model: 'Qwen3VL-2B-Instruct-Q4_K_M', baseUrl: 'http://127.0.0.1:8081',
  });
  assert.equal(result.model, 'Qwen3VL-2B-Instruct-Q4_K_M');
  assert.equal(result.baseUrl, 'http://127.0.0.1:8081');
  const lan = validateLayoutAnalysisRequest({
    imageBase64: 'QUJDRA==', mimeType: 'image/png', width: 320, height: 180,
    model: 'qwen3-vl-8b-instruct', baseUrl: 'http://192.168.1.22:1234/v1',
  });
  assert.equal(lan.baseUrl, 'http://192.168.1.22:1234');
});

test('layout analysis request rejects unsafe model names and remote/custom network endpoints', () => {
  const base = { imageBase64: 'QUJDRA==', mimeType: 'image/png', width: 320, height: 180 };
  assert.throws(() => validateLayoutAnalysisRequest({ ...base, model: 'model;fetch(remote)' }), /идентификатор локальной модели/);
  assert.throws(() => validateLayoutAnalysisRequest({ ...base, baseUrl: 'https://example.com' }), /Разрешены HTTP-адреса/);
  assert.throws(() => validateLayoutAnalysisRequest({ ...base, baseUrl: 'http://8.8.8.8:8081' }), /Публичные адреса/);
  assert.throws(() => validateLayoutAnalysisRequest({ ...base, baseUrl: 'http://192.168.1.22:1234/api/v1' }), /Публичные адреса/);
});


test('base URL accepts LM Studio API roots and rejects non-API paths', () => {
  const base = { imageBase64: 'QUJDRA==', mimeType: 'image/png', width: 10, height: 10 };
  for (const baseUrl of ['http://192.168.1.22:1234', 'http://192.168.1.22:1234/', 'http://192.168.1.22:1234/v1']) {
    assert.equal(validateLayoutAnalysisRequest({ ...base, baseUrl }).baseUrl, 'http://192.168.1.22:1234');
  }
  for (const baseUrl of ['http://192.168.1.22:1234/v1/chat/completions', 'http://192.168.1.22:1234/api/v1']) {
    assert.throws(() => validateLayoutAnalysisRequest({ ...base, baseUrl }), /Публичные адреса/);
  }
});


test('PNG analysis timeout accepts 60–900 seconds and rejects unsafe values', () => {
  const base = { imageBase64: 'QUJDRA==', mimeType: 'image/png', width: 320, height: 180 };
  assert.equal(validateLayoutAnalysisRequest({ ...base, timeoutMs: 600_000 }).timeoutMs, 600_000);
  assert.equal(validateLayoutAnalysisRequest(base).timeoutMs, undefined);
  assert.throws(() => validateLayoutAnalysisRequest({ ...base, timeoutMs: 10_000 }), /от 60 до 900 секунд/);
  assert.throws(() => validateLayoutAnalysisRequest({ ...base, timeoutMs: 1_000_000 }), /от 60 до 900 секунд/);
});
