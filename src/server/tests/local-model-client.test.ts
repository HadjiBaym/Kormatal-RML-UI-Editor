import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectLocalVisionServer, requestLocalVisionCompletion } from '../local-model-client.ts';
import { isLoopbackAddress } from '../local-network.ts';

test('local vision client refuses public hosts and HTTPS before sending an image', async () => {
  let fetchCalled = false;
  const fetcher: typeof fetch = async () => { fetchCalled = true; return new Response('{}'); };
  await assert.rejects(
    requestLocalVisionCompletion({ prompt: 'test', imageBase64: 'AAAA', mimeType: 'image/png' }, { baseUrl: 'http://8.8.8.8:8081', fetcher }),
    /Публичные адреса/,
  );
  await assert.rejects(
    requestLocalVisionCompletion({ prompt: 'test', imageBase64: 'AAAA', mimeType: 'image/png' }, { baseUrl: 'https://127.0.0.1:8081', fetcher }),
    /Разрешены HTTP-адреса/,
  );
  assert.equal(fetchCalled, false);
});

test('local vision client sends image to private LAN OpenAI-compatible server and parses the response', async () => {
  let calledUrl = '';
  let body: any;
  const fetcher: typeof fetch = async (input, init) => {
    calledUrl = String(input);
    body = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  const result = await requestLocalVisionCompletion(
    { prompt: 'Return JSON', imageBase64: 'QUJDRA==', mimeType: 'image/png' },
    { baseUrl: 'http://192.168.1.22:1234/v1', model: 'Qwen3-VL-LM-Studio', fetcher },
  );
  assert.equal(calledUrl, 'http://192.168.1.22:1234/v1/chat/completions');
  assert.equal(body.model, 'Qwen3-VL-LM-Studio');
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.name, 'layout_analysis');
  assert.equal(body.response_format.json_schema.schema.properties.elements.type, 'array');
  assert.equal(body.messages[0].content[1].image_url.url, 'data:image/png;base64,QUJDRA==');
  assert.equal(result.text, '{"ok":true}');
});

test('local AI route network guard allows loopback only', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true);
  assert.equal(isLoopbackAddress('::1'), true);
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackAddress('192.168.0.10'), false);
  assert.equal(isLoopbackAddress('::ffff:192.168.0.10'), false);
  assert.equal(isLoopbackAddress(''), false);
});


test('local model selector confirms LM Studio from /v1/models without requiring /health', async () => {
  const called: string[] = [];
  const fetcher: typeof fetch = async input => {
    const url = String(input); called.push(url);
    assert.equal(url, 'http://192.168.1.22:1234/v1/models');
    return new Response('{"data":[{"id":"qwen3-vl-8b-instruct"},{"id":"local-vlm"}]}', { status: 200 });
  };
  const status = await inspectLocalVisionServer('http://192.168.1.22:1234/', fetcher);
  assert.equal(status.available, true);
  assert.deepEqual(status.models, ['qwen3-vl-8b-instruct', 'local-vlm']);
  assert.deepEqual(called, ['http://192.168.1.22:1234/v1/models']);
  await assert.rejects(inspectLocalVisionServer('http://example.com:8081', fetcher), /Публичные адреса/);
});

test('only RFC1918 LAN ranges are accepted for non-loopback model hosts', async () => {
  const fetcher: typeof fetch = async () => new Response('{"data":[]}', { status: 200 });
  for (const ip of ['10.0.0.9', '172.16.1.2', '172.31.255.254', '192.168.1.22']) {
    const status = await inspectLocalVisionServer(`http://${ip}:1234/v1`, fetcher);
    assert.equal(status.available, true, `${ip} should be accepted as a private LAN address`);
  }
  for (const ip of ['172.15.1.2', '172.32.1.2', '192.169.1.22', '169.254.1.2', '100.64.0.1']) {
    await assert.rejects(inspectLocalVisionServer(`http://${ip}:1234`, fetcher), /Публичные адреса/);
  }
});


test('local model status exposes socket error details instead of a generic not-confirmed message', async () => {
  const fetcher: typeof fetch = async () => { throw new TypeError('fetch failed', { cause: Object.assign(new Error('connect ECONNREFUSED 192.168.1.22:1234'), { code: 'ECONNREFUSED' }) }); };
  const status = await inspectLocalVisionServer('http://192.168.1.22:1234/v1', fetcher);
  assert.equal(status.available, false);
  assert.match(status.message, /http:\/\/192\.168\.1\.22:1234\/v1\/models/);
  assert.match(status.message, /ECONNREFUSED/);
  assert.match(status.message, /TCP-соединение отклонено/);
});


test('local vision client retries in text response mode when a server rejects JSON Schema details', async () => {
  const formats: string[] = [];
  const fetcher: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body || '{}'));
    formats.push(body.response_format?.type);
    if (formats.length === 1) {
      return new Response(JSON.stringify({ error: { message: 'response_format json_schema is not supported by this backend' } }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"width":100,"height":100,"notes":[],"elements":[]}' } }] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  const result = await requestLocalVisionCompletion(
    { prompt: 'Return JSON', imageBase64: 'QUJDRA==', mimeType: 'image/png' },
    { baseUrl: 'http://192.168.1.22:1234/v1', model: 'Qwen3-VL-LM-Studio', fetcher },
  );
  assert.deepEqual(formats, ['json_schema', 'text']);
  assert.match(result.text, /"elements":\[\]/);
});


test('local vision client can force portable text format for a compact JSON retry', async () => {
  let body: any;
  const fetcher: typeof fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"width":10,"height":10,"notes":[],"elements":[]}' } }] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  const result = await requestLocalVisionCompletion(
    { prompt: 'compact JSON only', imageBase64: 'QUJDRA==', mimeType: 'image/png' },
    { baseUrl: 'http://192.168.1.22:1234/v1', model: 'Qwen3-VL-LM-Studio', responseFormat: 'text', maxTokens: 4096, fetcher },
  );
  assert.equal(body.response_format.type, 'text');
  assert.equal(body.max_tokens, 4096);
  assert.equal(result.finishReason, 'stop');
});


test('Qwen local model receives a no-think hint and JSON can be read from reasoning_content', async () => {
  let body: any;
  const fetcher: typeof fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: {
      content: '<think>very long model reasoning</think>', reasoning_content: '{"width":320,"height":200,"notes":[],"elements":[{"name":"Panel","kind":"panel","x":0,"y":0,"width":320,"height":200}]}'
    } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const result = await requestLocalVisionCompletion(
    { prompt: 'Return compact JSON', imageBase64: 'QUJDRA==', mimeType: 'image/png' },
    { baseUrl: 'http://192.168.1.22:1234/v1', model: 'Qwen3-VL-2B-Instruct', fetcher },
  );
  assert.ok(body.messages[0].content[0].text.trimEnd().endsWith('/no_think'));
  assert.match(result.text, /"elements"/);
});


test('local vision client reports a timeout separately from an unreachable LM Studio server', async () => {
  const fetcher: typeof fetch = async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); };
  await assert.rejects(
    requestLocalVisionCompletion(
      { prompt: 'Return JSON', imageBase64: 'QUJDRA==', mimeType: 'image/png' },
      { baseUrl: 'http://127.0.0.1:1234/v1', model: 'Qwen3.8-27B-Q4_K_M', timeoutMs: 90_000, fetcher },
    ),
    /Тайм-аут локальной модели: ответ не поступил за 90 с.*Не увеличивайте тайм-аут первым делом/s,
  );
});


test('Qwen3.8 uses LM Studio Native API with reasoning off and hard-capped output tokens', async () => {
  const calls: Array<{ url: string; body?: any }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/api/v1/models')) {
      calls.push({ url });
      return new Response('{"models":[{"key":"qwen/qwen3.8-27b"}]}', { status: 200 });
    }
    const body = JSON.parse(String(init?.body || '{}'));
    calls.push({ url, body });
    return new Response(JSON.stringify({
      output: [{ type: 'message', content: '{"width":320,"height":200,"notes":[],"elements":[{"name":"Panel","kind":"panel","x":0,"y":0,"width":320,"height":200}]}' }],
      stats: { time_to_first_token_seconds: 2.1, tokens_per_second: 5.5, total_output_tokens: 71, reasoning_output_tokens: 0, model_load_time_seconds: 3.0 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const result = await requestLocalVisionCompletion(
    { prompt: 'Return compact JSON', imageBase64: 'QUJDRA==', mimeType: 'image/png' },
    { baseUrl: 'http://127.0.0.1:1234/v1', model: 'qwen/qwen3.8-27b', maxTokens: 4096, fetcher },
  );
  assert.equal(calls[0].url, 'http://127.0.0.1:1234/api/v1/models');
  assert.equal(calls[1].url, 'http://127.0.0.1:1234/api/v1/chat');
  assert.equal(calls[1].body.reasoning, 'off');
  assert.equal(calls[1].body.context_length, 8192);
  assert.equal(calls[1].body.max_output_tokens, 768);
  assert.equal(calls[1].body.store, false);
  assert.equal(calls[1].body.input[1].data_url, 'data:image/png;base64,QUJDRA==');
  assert.equal(result.text.includes('"elements"'), true);
  assert.ok(result.diagnostics?.some(note => /первый токен через 2.1 с/.test(note)));
  assert.ok(result.diagnostics?.some(note => /Скорость генерации 5.50 токен\/с/.test(note)));
});

test('Qwen3.8 reports unsupported thinking-control parameters as a setup issue instead of a generic timeout', async () => {
  const fetcher: typeof fetch = async (input) => {
    if (String(input).endsWith('/api/v1/models')) return new Response('Not Found', { status: 404 });
    return new Response(JSON.stringify({ error: { message: 'unknown field chat_template_kwargs' } }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  };
  await assert.rejects(
    requestLocalVisionCompletion(
      { prompt: 'Return compact JSON', imageBase64: 'QUJDRA==', mimeType: 'image/png' },
      { baseUrl: 'http://127.0.0.1:1234/v1', model: 'qwen/qwen3.8-27b', responseFormat: 'text', fetcher },
    ),
    /LM Studio отклонил параметры управления reasoning Qwen3.8.*Enable Thinking = Off.*Reasoning Effort = Low/s,
  );
});
