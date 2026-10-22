import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLayoutImage, extractJsonObject, extractPartialLayout } from '../layout-analysis.ts';

const valid = JSON.stringify({
  width: 800,
  height: 600,
  notes: ['Detected one panel'],
  elements: [{ name: 'Main panel', kind: 'panel', x: 10, y: 20, width: 300, height: 200, fill: '#142024', confidence: 0.9 }],
});

test('layout JSON parser accepts Qwen think blocks, markdown fences and preambles', () => {
  const text = `I will inspect the UI.\n<think>reasoning with {not the layout}</think>\n\`\`\`json\n${valid}\n\`\`\``;
  const parsed = extractJsonObject(text);
  assert.equal(parsed.width, 800);
  assert.equal((parsed.elements as unknown[]).length, 1);
});

test('layout JSON parser fixes trailing commas without changing commas inside strings', () => {
  const parsed = extractJsonObject('{"width":800,"height":600,"notes":["comma, inside text"],"elements":[{"name":"panel",}],}');
  assert.equal(parsed.width, 800);
  assert.equal((parsed.notes as string[])[0], 'comma, inside text');
  assert.equal((parsed.elements as unknown[]).length, 1);
});

test('layout JSON parser skips unrelated objects and finds a real layout object later', () => {
  const parsed = extractJsonObject('Example schema: {"type":"object"}. Final result:\n' + valid);
  assert.equal(parsed.width, 800);
  assert.ok(Array.isArray(parsed.elements));
});

test('layout JSON parser reports a missing complete layout payload clearly', () => {
  assert.throws(() => extractJsonObject('The answer was cut off: {"width":800,"height":600,"elements":[{"name":"panel"'), /полного объекта Layout JSON/);
});

test('layout analysis retries once with compact instructions when the first VLM response is invalid', async () => {
  const prompts: string[] = [];
  const maxTokens: (number | undefined)[] = [];
  const timeouts: (number | undefined)[] = [];
  let calls = 0;
  const result = await analyzeLayoutImage({
    imageBase64: 'QUJDRA==', mimeType: 'image/png', width: 800, height: 600, model: 'qwen3-vl-local', timeoutMs: 600_000,
  }, {
    complete: async (request, options) => {
      calls++;
      prompts.push(request.prompt);
      maxTokens.push(options?.maxTokens);
      timeouts.push(options?.timeoutMs);
      return calls === 1
        ? { text: 'Here is the result: {"width": 800,"height": 600,"elements": [{"name":"panel" ', model: 'qwen3-vl-local', finishReason: 'length' }
        : { text: valid, model: 'qwen3-vl-local', finishReason: 'stop' };
    },
  });
  assert.equal(calls, 2);
  assert.match(prompts[1], /at most 8/);
  assert.match(prompts[0], /PROJECT KNOWLEDGE CONTEXT/);
  assert.match(prompts[1], /PROJECT KNOWLEDGE CONTEXT/, 'retry prompt must retain retrieved knowledge');
  assert.ok(result.knowledgeContext && result.knowledgeContext.entriesUsed > 0);
  assert.equal(maxTokens[1], 1024);
  assert.equal(timeouts[0], 600_000);
  assert.equal(timeouts[1], 600_000);
  assert.equal(result.model, 'qwen3-vl-local');
  assert.equal(result.elements.length, 1);
  assert.equal(result.elements[0].name, 'Main panel');
});

test('layout analysis returns a useful truncation hint if both responses are invalid', async () => {
  let calls = 0;
  await assert.rejects(analyzeLayoutImage({
    imageBase64: 'QUJDRA==', mimeType: 'image/png', width: 800, height: 600,
  }, {
    complete: async () => {
      calls++;
      return { text: '{"width":800,"height":600,"elements":[', model: 'qwen3-vl-local', finishReason: 'length' };
    },
  }), /исчерпала лимит токенов/);
  assert.equal(calls, 3);
});


test('layout analysis retries if the model returns syntactically valid JSON but no elements', async () => {
  let calls = 0;
  const result = await analyzeLayoutImage({
    imageBase64: 'QUJDRA==', mimeType: 'image/png', width: 800, height: 600,
  }, {
    complete: async () => {
      calls++;
      return calls === 1
        ? { text: '{"width":800,"height":600,"notes":[],"elements":[]}', model: 'qwen3-vl-local', finishReason: 'stop' }
        : { text: valid, model: 'qwen3-vl-local', finishReason: 'stop' };
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.elements.length, 1);
});


test('partial layout recovery keeps complete elements from a response truncated mid-object', () => {
  const raw = '{"width":1280,"height":720,"notes":[],"elements":[' +
    '{"name":"Background","kind":"panel","x":0,"y":0,"width":1280,"height":720,"fill":"#142024"},' +
    '{"name":"Play button","kind":"button","x":520,"y":540,"width":240,"height":64,"text":"PLAY"},' +
    '{"name":"unfinished","kind":"text","x":20,"y":20,"width":150,"height":30,"text":"cut';
  const partial = extractPartialLayout(raw, 1280, 720);
  assert.ok(partial);
  assert.equal(partial.width, 1280);
  assert.equal(partial.height, 720);
  assert.equal((partial.elements as unknown[]).length, 2);
  assert.match((partial.notes as string[])[0], /Частичный результат/);
});

test('layout analysis returns a useful partial layout if both Qwen responses are truncated', async () => {
  let calls = 0;
  const truncated = '{"width":800,"height":600,"notes":[],"elements":[' +
    '{"name":"Main panel","kind":"panel","x":0,"y":0,"width":800,"height":600},' +
    '{"name":"Button","kind":"button","x":20,"y":500,"width":200,"height":50,"text":"PLAY"},' +
    '{"name":"unfinished","kind":"text","x":';
  const result = await analyzeLayoutImage({
    imageBase64: 'QUJDRA==', mimeType: 'image/png', width: 800, height: 600, model: 'qwen3-vl-local',
  }, {
    complete: async (_request, options) => {
      calls++;
      assert.equal(options?.maxTokens, calls === 1 ? 1536 : calls === 2 ? 1024 : 512);
      return { text: truncated, model: 'qwen3-vl-local', finishReason: 'length' };
    },
  });
  assert.equal(calls, 3);
  assert.equal(result.elements.length, 2);
  assert.ok(result.notes.some(note => /Частичный результат/.test(note)));
});

test('layout analysis uses a smaller second-pass prompt and can recover with supplied canvas dimensions', async () => {
  const prompts: string[] = [];
  const limits: number[] = [];
  let calls = 0;
  const result = await analyzeLayoutImage({
    imageBase64: 'QUJDRA==', mimeType: 'image/png', width: 800, height: 600,
  }, {
    complete: async (request, options) => {
      calls++;
      prompts.push(request.prompt);
      limits.push(options?.maxTokens ?? 0);
      if (calls === 1) return { text: 'invalid response', model: 'qwen3-vl-local', finishReason: 'stop' };
      return {
        text: '{"elements":[{"name":"Panel","kind":"panel","x":0,"y":0,"width":800,"height":600}, {"name":"truncated","x":',
        model: 'qwen3-vl-local', finishReason: 'length',
      };
    },
  });
  assert.equal(result.elements.length, 1);
  assert.equal(result.width, 800);
  assert.equal(result.height, 600);
  assert.ok(prompts[1].includes('at most 8'));
  assert.equal(limits[0], 1536);
  assert.equal(limits[1], 1024);
  assert.equal(limits[2], 512);
});


test('layout analysis uses portable text response format on the first attempt for local Qwen', async () => {
  let firstFormat: string | undefined;
  const result = await analyzeLayoutImage({
    imageBase64: 'QUJDRA==', mimeType: 'image/png', width: 800, height: 600, model: 'Qwen3-VL-2B-Instruct',
  }, {
    complete: async (_request, options) => {
      firstFormat = options?.responseFormat;
      return { text: valid, model: 'Qwen3-VL-2B-Instruct', finishReason: 'stop' };
    },
  });
  assert.equal(firstFormat, 'text');
  assert.equal(result.elements.length, 1);
});

test('Qwen3.8 screenshot analysis hard-caps stale environment budgets and limits the first prompt', async () => {
  const saved = {
    max: process.env.LOCAL_VLM_MAX_TOKENS,
    retry: process.env.LOCAL_VLM_RETRY_MAX_TOKENS,
    final: process.env.LOCAL_VLM_FINAL_MAX_TOKENS,
    knowledge: process.env.LOCAL_VLM_KNOWLEDGE_CHARS,
  };
  process.env.LOCAL_VLM_MAX_TOKENS = '4096';
  process.env.LOCAL_VLM_RETRY_MAX_TOKENS = '4096';
  process.env.LOCAL_VLM_FINAL_MAX_TOKENS = '2048';
  process.env.LOCAL_VLM_KNOWLEDGE_CHARS = '4200';
  const seen: Array<{ prompt: string; maxTokens?: number }> = [];
  try {
    const result = await analyzeLayoutImage({
      imageBase64: 'QUJDRA==', mimeType: 'image/png', width: 1600, height: 900,
      model: 'qwen/qwen3.8-27b', timeoutMs: 600_000,
    }, {
      complete: async (request, options) => {
        seen.push({ prompt: request.prompt, maxTokens: options?.maxTokens });
        return {
          text: '{"width":1600,"height":900,"notes":[],"elements":[{"name":"Play button","kind":"button","x":20,"y":800,"width":200,"height":60}]}',
          model: 'qwen/qwen3.8-27b', finishReason: 'stop',
        };
      },
    });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].maxTokens, 768);
    assert.match(seen[0].prompt, /up to 8/);
    assert.ok(result.knowledgeContext && result.knowledgeContext.contextChars <= 1500);
  } finally {
    if (saved.max === undefined) delete process.env.LOCAL_VLM_MAX_TOKENS; else process.env.LOCAL_VLM_MAX_TOKENS = saved.max;
    if (saved.retry === undefined) delete process.env.LOCAL_VLM_RETRY_MAX_TOKENS; else process.env.LOCAL_VLM_RETRY_MAX_TOKENS = saved.retry;
    if (saved.final === undefined) delete process.env.LOCAL_VLM_FINAL_MAX_TOKENS; else process.env.LOCAL_VLM_FINAL_MAX_TOKENS = saved.final;
    if (saved.knowledge === undefined) delete process.env.LOCAL_VLM_KNOWLEDGE_CHARS; else process.env.LOCAL_VLM_KNOWLEDGE_CHARS = saved.knowledge;
  }
});
