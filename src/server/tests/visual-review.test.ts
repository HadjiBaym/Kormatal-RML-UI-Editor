import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVisualReview, reviewVisualConversion, validateVisualReviewRequest } from '../visual-review.ts';

const IMAGE = Buffer.from('fake-png-data').toString('base64');
const validRequest = {
  imageBase64: IMAGE, mimeType: 'image/png', width: 1600, height: 900,
  sourceName: 'Lamguard comparison',
  sourceHtml: '<div class="play">PLAY</div>', sourceCss: '.play { background: #003b34; }',
  targetRml: '<button id="play">PLAY</button>', targetRcss: '#play { background-color: #003b34; }',
  deterministicDiagnostics: 'WARNING css: box-shadow is not rendered',
  model: 'Qwen3-VL-LM-Studio',
};

test('visual review validates image type, size and local-only endpoint', () => {
  assert.equal(validateVisualReviewRequest(validRequest).width, 1600);
  assert.throws(() => validateVisualReviewRequest({ ...validRequest, mimeType: 'image/gif' }), /Поддерживаются только PNG/);
  assert.throws(() => validateVisualReviewRequest({ ...validRequest, baseUrl: 'https://127.0.0.1:8081' }), /Разрешены HTTP-адреса/);
  assert.throws(() => validateVisualReviewRequest({ ...validRequest, baseUrl: 'http://8.8.8.8:8081' }), /Публичные адреса/);
  assert.throws(() => validateVisualReviewRequest({ ...validRequest, imageBase64: 'x'.repeat(12 * 1024 * 1024) }), /8 МБ/);
});

test('visual review prompts model to avoid inventing UI and returns normalized findings', async () => {
  let prompt = '';
  const review = await reviewVisualConversion(validRequest, {
    complete: async (request, options) => {
      prompt = request.prompt;
      assert.equal(request.mimeType, 'image/png');
      assert.equal(options?.responseFormat, 'text');
      assert.equal(options?.model, 'Qwen3-VL-LM-Studio');
      return {
        text: JSON.stringify({
          score: 72, verdict: 'needs-fixes', summary: 'Каркас похож; фон карточки отличается.',
          matches: ['Навигация на близком месте.'],
          issues: [{ severity: 'major', category: 'asset', element: 'Фон карточки', expected: 'Исходное изображение с неоновым окружением', observed: 'Другой фон', suggestedFix: 'Проверьте URL и упаковку внешнего CSS background.', confidence: 0.93 }],
          limitations: ['Проверьте финальный рендер в UE.'],
        }), model: 'test-vlm', finishReason: 'stop',
      };
    },
  });
  assert.match(prompt, /Do not redesign, beautify, invent features/);
  assert.match(prompt, /SOURCE HTML/);
  assert.match(prompt, /TARGET RCSS/);
  assert.match(prompt, /CSS Grid is unavailable/);
  assert.match(prompt, /box-shadow/);
  assert.match(prompt, /PROJECT KNOWLEDGE CONTEXT/);
  assert.match(prompt, /docs\/visual-review\.md|docs\/rcss-compatibility\.md|TARGET-FACT-box-shadow-refusal|TARGET-RCSS-box-shadow/);
  assert.ok(review.knowledgeContext && review.knowledgeContext.entriesUsed > 0);
  assert.equal(review.score, 72);
  assert.equal(review.verdict, 'needs-fixes');
  assert.equal(review.issues.length, 1);
  assert.equal(review.issues[0].category, 'asset');
  assert.equal(review.model, 'test-vlm');
});

test('visual review rejects incomplete model JSON and clamps untrusted values', () => {
  const normalized = normalizeVisualReview({
    score: 123, verdict: 'made-up', summary: 'ok', matches: ['yes'],
    issues: [{ severity: 'wild', category: 'evil', element: 'x', expected: 'a', observed: 'b', suggestedFix: 'fix', confidence: 900 }],
    limitations: [],
  }, 'model');
  assert.equal(normalized.score, 100);
  assert.equal(normalized.verdict, 'pass');
  assert.equal(normalized.issues[0].severity, 'minor');
  assert.equal(normalized.issues[0].category, 'uncertain');
  assert.equal(normalized.issues[0].confidence, 1);
});


test('visual review requires an explicitly detected model instead of silently using the bundled 2B default', async () => {
  const { model: _model, ...withoutModel } = validRequest;
  await assert.rejects(reviewVisualConversion(withoutModel, { complete: async () => ({ text: '{}', model: 'mock' }) }), /Не указан ID локальной vision-модели/);
});

test('visual review bounds source files to keep multimodal prompt context manageable', () => {
  const huge = 'x'.repeat(40_000);
  const bounded = validateVisualReviewRequest({ ...validRequest, sourceHtml: huge, sourceCss: huge, targetRml: huge, targetRcss: huge, deterministicDiagnostics: huge });
  assert.equal(bounded.sourceHtml?.length, 8_000);
  assert.equal(bounded.sourceCss?.length, 9_000);
  assert.equal(bounded.targetRml?.length, 8_000);
  assert.equal(bounded.targetRcss?.length, 9_000);
  assert.equal(bounded.deterministicDiagnostics?.length, 4_000);
});
