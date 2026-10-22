/** Local-network OpenAI-compatible client. Allows loopback and private LAN IPs only. */
import { parseLocalModelBaseUrl } from '../core/local-model-endpoint.ts';
export interface LocalVisionCompletionOptions {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxTokens?: number;
  responseFormat?: 'json_schema' | 'text';
  fetcher?: typeof fetch;
}

export interface LocalVisionCompletionRequest {
  prompt: string;
  imageBase64: string;
  mimeType: string;
}

/** A portable schema for OpenAI-compatible local servers such as LM Studio and llama.cpp. */
const LAYOUT_ANALYSIS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    width: { type: 'number' },
    height: { type: 'number' },
    notes: { type: 'array', items: { type: 'string' } },
    elements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          kind: { type: 'string', enum: ['container', 'panel', 'button', 'text', 'shape', 'line', 'icon', 'image'] },
          x: { type: 'number' }, y: { type: 'number' },
          width: { type: 'number' }, height: { type: 'number' },
          text: { type: ['string', 'null'] },
          fill: { type: ['string', 'null'] }, stroke: { type: ['string', 'null'] },
          radius: { type: 'number' }, fontSize: { type: 'number' }, fontWeight: { type: 'number' },
          textAlign: { type: 'string', enum: ['left', 'center', 'right'] },
          confidence: { type: 'number' }, parentIndex: { type: ['integer', 'null'] },
          layoutMode: { type: 'string', enum: ['none', 'horizontal', 'vertical'] },
          layoutItemSpacing: { type: 'number' },
          layoutPaddingTop: { type: 'number' }, layoutPaddingRight: { type: 'number' },
          layoutPaddingBottom: { type: 'number' }, layoutPaddingLeft: { type: 'number' },
          layoutJustifyContent: { type: 'string', enum: ['flex-start', 'center', 'flex-end', 'space-between'] },
          layoutAlignItems: { type: 'string', enum: ['flex-start', 'center', 'flex-end', 'stretch', 'baseline'] },
          layoutWrap: { type: 'boolean' }, layoutPositioning: { type: 'string', enum: ['absolute', 'flow'] },
        },
        additionalProperties: false,
      },
    },
  },
  required: ['width', 'height', 'notes', 'elements'],
  additionalProperties: false,
} as const;

function assertLocalModelUrl(raw: string): URL {
  return parseLocalModelBaseUrl(raw);
}

function describeNetworkError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth++) {
    if (typeof current === 'object') {
      const item = current as { message?: unknown; code?: unknown; cause?: unknown };
      if (typeof item.code === 'string' && !parts.includes(item.code)) parts.push(item.code);
      if (typeof item.message === 'string' && !parts.includes(item.message)) parts.push(item.message);
      current = item.cause;
    } else if (typeof current === 'string') {
      if (!parts.includes(current)) parts.push(current);
      break;
    } else break;
  }
  return parts.join(' → ').slice(0, 260) || 'нет подробностей сетевой ошибки';
}

function completionText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  // LM Studio's native v1 REST API returns output[] items instead of OpenAI choices[].
  const nativeOutput = (payload as { output?: unknown }).output;
  if (Array.isArray(nativeOutput)) {
    const messages = nativeOutput
      .filter((item): item is { type?: unknown; content?: unknown } => Boolean(item && typeof item === 'object'))
      .filter(item => item.type === 'message' && typeof item.content === 'string')
      .map(item => String(item.content));
    if (messages.some(value => value.trim())) return messages.join('\n').trim();
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const message = (choices[0] as { message?: { content?: unknown; reasoning_content?: unknown; analysis?: unknown } } | undefined)?.message;
  const content = message?.content;
  const afterThink = (value: string) => value.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (typeof content === 'string' && content.trim() && afterThink(content)) return content;
  if (Array.isArray(content)) {
    const joined = content.map(part => part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
      ? (part as { text: string }).text : '').join('\n');
    if (joined.trim() && afterThink(joined)) return joined;
  }
  // Some local runtimes expose Qwen's final/structured payload under reasoning_content.
  for (const alternate of [message?.reasoning_content, message?.analysis]) {
    if (typeof alternate === 'string' && alternate.trim()) return alternate;
    if (Array.isArray(alternate)) {
      const joined = alternate.map(part => part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
        ? (part as { text: string }).text : '').join('\n');
      if (joined.trim()) return joined;
    }
  }
  return typeof content === 'string' ? content : '';
}

type LocalVisionCompletionResult = { text: string; model: string; finishReason?: string; diagnostics?: string[] };

/** LM Studio 0.4+ exposes a native API with an explicit reasoning="off" switch.
 * This is more reliable for Qwen3.8 than hoping an OpenAI-compatible adapter forwards
 * template kwargs. Probe support quickly and fall back to /v1/chat/completions on older servers.
 */
async function supportsLmStudioNativeApi(origin: string, fetcher: typeof fetch): Promise<boolean> {
  try {
    const response = await fetcher(new URL('/api/v1/models', origin), {
      method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(2500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function nativeStatsDiagnostics(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const stats = (payload as { stats?: Record<string, unknown> }).stats;
  if (!stats || typeof stats !== 'object') return [];
  const notes: string[] = [];
  const ttft = Number(stats.time_to_first_token_seconds);
  const speed = Number(stats.tokens_per_second);
  const outputTokens = Number(stats.total_output_tokens);
  const reasoningTokens = Number(stats.reasoning_output_tokens);
  const loadTime = Number(stats.model_load_time_seconds);
  if (Number.isFinite(ttft) && ttft >= 0) notes.push(`LM Studio: первый токен через ${ttft.toFixed(1)} с.`);
  if (Number.isFinite(speed) && speed > 0) notes.push(`Скорость генерации ${speed.toFixed(2)} токен/с.`);
  if (Number.isFinite(outputTokens) && outputTokens >= 0) notes.push(`Сгенерировано ${Math.round(outputTokens)} токенов` + (Number.isFinite(reasoningTokens) && reasoningTokens > 0 ? `, из них reasoning ${Math.round(reasoningTokens)}.` : '.'));
  if (Number.isFinite(loadTime) && loadTime > 0) notes.push(`Модель загружалась ${loadTime.toFixed(1)} с.`);
  return notes;
}

export async function requestLocalVisionCompletion(
  request: LocalVisionCompletionRequest,
  options: LocalVisionCompletionOptions = {},
): Promise<LocalVisionCompletionResult> {
  const baseUrl = (options.baseUrl || process.env.LOCAL_VLM_BASE_URL || 'http://127.0.0.1:8081').replace(/\/+$/, '');
  const url = assertLocalModelUrl(baseUrl);
  const model = options.model || process.env.LOCAL_VLM_MODEL || 'Qwen3VL-2B-Instruct-Q4_K_M';
  // Qwen3.8 uses LM Studio Native API when available so reasoning="off" is explicit.
  // Template kwargs below are only the fallback for OpenAI-compatible servers.
  const isQwen38 = /qwen[\s._-]*3[\s._-]*8/i.test(model);
  const requestedTimeoutMs = options.timeoutMs ?? Number(process.env.LOCAL_VLM_TIMEOUT_MS || 600_000);
  const timeoutMs = Number.isFinite(requestedTimeoutMs) ? Math.max(30_000, Math.min(900_000, requestedTimeoutMs)) : 600_000;
  const fetcher = options.fetcher || fetch;
  // The model can be configured with stale .env.local overrides. Hard-cap Qwen3.8
  // layout JSON output to prevent multi-thousand-token generations on laptop hardware.
  const configuredMaxTokens = options.maxTokens ?? Number(process.env.LOCAL_VLM_MAX_TOKENS || 768);
  const maxTokens = isQwen38
    ? Math.max(128, Math.min(768, Number.isFinite(configuredMaxTokens) ? configuredMaxTokens : 768))
    : configuredMaxTokens;

  if (isQwen38 && await supportsLmStudioNativeApi(url.origin, fetcher)) {
    const endpoint = new URL('/api/v1/chat', url.origin).toString();
    const nativeBody = {
      model,
      input: [
        { type: 'text', content: `${request.prompt}\nReturn only a compact valid JSON object; do not use Markdown fences or reasoning.` },
        { type: 'image', data_url: `data:${request.mimeType};base64,${request.imageBase64}` },
      ],
      temperature: 0.2,
      top_p: 0.8,
      top_k: 20,
      max_output_tokens: maxTokens,
      reasoning: 'off',
      context_length: 8192,
      store: false,
      stream: false,
    };
    let response: Response;
    try {
      response = await fetcher(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs), body: JSON.stringify(nativeBody),
      });
    } catch (error) {
      const details = describeNetworkError(error);
      let current: unknown = error, isTimeout = false;
      for (let depth = 0; depth < 5 && current; depth++) {
        if (typeof current === 'object') {
          const item = current as { name?: unknown; message?: unknown; cause?: unknown };
          if (/timeout|timed out|aborted due to timeout|deadline exceeded/i.test(`${String(item.name || '')} ${String(item.message || '')}`)) isTimeout = true;
          current = item.cause;
        } else break;
      }
      if (isTimeout) {
        throw new Error(`Qwen3.8 не завершила PNG-анализ через LM Studio Native API за ${Math.round(timeoutMs / 1000)} с. В этом запросе thinking принудительно выключен (reasoning=off), контекст ограничен 8K, ответ — не более ${maxTokens} токенов. Если LM Studio Server Logs показывает низкую скорость или долгую обработку изображения, уменьшите масштаб PNG до 512–640 px и проверьте RAM/VRAM. Endpoint: ${endpoint}`);
      }
      throw new Error(`Не удалось выполнить Qwen3.8 через LM Studio Native API (${endpoint}): ${details}. Проверьте Server Logs и доступность модели.`);
    }
    if (response.status !== 404 && response.status !== 405) {
      if (!response.ok) {
        const details = (await response.text().catch(() => '')).slice(0, 600);
        throw new Error(`LM Studio Native API вернул HTTP ${response.status} при анализе Qwen3.8.${details ? ` ${details}` : ''}`);
      }
      const payload: unknown = await response.json().catch(() => null);
      const text = completionText(payload);
      if (!text.trim()) throw new Error('LM Studio Native API завершил запрос, но не вернул текстовый message. Проверьте поддержку image input и reasoning=off в логах LM Studio.');
      return { text, model, diagnostics: ['Использован LM Studio Native API (/api/v1/chat): reasoning=off, context_length=8192.', ...nativeStatsDiagnostics(payload)] };
    }
    // A 404/405 means the server likely only exposes the OpenAI-compatible API.
    await response.body?.cancel().catch(() => undefined);
  }

  const endpoint = new URL('/v1/chat/completions', url).toString();
  const makeBody = (responseFormat: Record<string, unknown>) => JSON.stringify({
    model,
    temperature: isQwen38 ? 0.2 : 0.1,
    top_p: 0.8,
    max_tokens: maxTokens,
    response_format: responseFormat,
    ...(isQwen38 ? {
      // Fallback for servers that do not expose LM Studio Native API.
      reasoning_effort: 'low',
      chat_template_kwargs: { enable_thinking: false, preserve_thinking: false },
      top_k: 20,
    } : {}),
    messages: [{ role: 'user', content: [
      { type: 'text', text: `${request.prompt}\nReturn only a valid JSON object; do not use Markdown fences.${isQwen38 ? '' : /qwen/i.test(model) ? '\n/no_think' : ''}` },
      { type: 'image_url', image_url: { url: `data:${request.mimeType};base64,${request.imageBase64}` } },
    ] }],
  });
  const call = (responseFormat: Record<string, unknown>) => fetcher(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: makeBody(responseFormat),
  });

  let response: Response;
  let usedTextMode = options.responseFormat === 'text';
  try {
    const schemaFormat = {
      type: 'json_schema',
      json_schema: {
        name: 'layout_analysis',
        schema: LAYOUT_ANALYSIS_RESPONSE_SCHEMA,
      },
    };
    response = await call(usedTextMode ? { type: 'text' } : schemaFormat);
    // Some OpenAI-compatible local servers implement JSON Schema differently.
    // Retry only a schema/response_format-related 400 using portable text mode.
    if (!response.ok && response.status === 400 && !usedTextMode) {
      const firstError = await response.text().catch(() => '');
      if (isQwen38 && /chat_template_kwargs|reasoning_effort|unknown field|unrecognized (?:field|parameter)|extra inputs are not permitted/i.test(firstError)) {
        throw new Error(`LM Studio отклонил параметры управления reasoning Qwen3.8 (HTTP ${response.status}). Обновите LM Studio и runtime llama.cpp. Временно задайте Enable Thinking = Off; Reasoning Effort = Low в настройках модели. Подробности: ${firstError.slice(0, 600)}`);
      } else if (/response_format|json_schema|json.object|schema/i.test(firstError)) {
        usedTextMode = true;
        response = await call({ type: 'text' });
      } else {
        throw new Error(`Локальный движок модели вернул HTTP ${response.status}.${firstError ? ` ${firstError.slice(0, 600)}` : ''}`);
      }
    }
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('Локальный движок модели вернул HTTP ') || error.message.startsWith('LM Studio отклонил параметры управления reasoning'))) throw error;
    const details = describeNetworkError(error);
    const looksLikeTimeout = (() => {
      let current: unknown = error;
      for (let depth = 0; depth < 5 && current; depth++) {
        if (typeof current === 'object') {
          const item = current as { name?: unknown; message?: unknown; cause?: unknown };
          const message = `${String(item.name || '')} ${String(item.message || '')}`;
          if (/timeout|timed out|aborted due to timeout|deadline exceeded/i.test(message)) return true;
          current = item.cause;
        } else if (typeof current === 'string') {
          return /timeout|timed out|aborted due to timeout|deadline exceeded/i.test(current);
        } else break;
      }
      return false;
    })();
    if (looksLikeTimeout) {
      throw new Error(`Тайм-аут локальной модели: ответ не поступил за ${Math.round(timeoutMs / 1000)} с (${endpoint}). Не увеличивайте тайм-аут первым делом. Нативный API LM Studio не был обнаружен, поэтому использовался OpenAI-compatible endpoint. В LM Studio 0.4+ проверьте GET /api/v1/models и доступность POST /api/v1/chat; иначе выключите Enable Thinking в настройках шаблона модели. Убедитесь, что в .env.local нет старых бюджетов 4096/4096/2048, затем проверьте Server Logs, скорость генерации и RAM/VRAM.`);
    }
    throw new Error(`Не удалось отправить запрос на ${endpoint}. Детали: ${details}. Сначала проверьте GET /v1/models, запуск сервера LM Studio и адрес/порт. Запрос выполняется процессом приложения или локального моста, а не облачным браузером.`);
  }

  if (!response.ok) {
    const details = (await response.text().catch(() => '')).slice(0, 600);
    if (isQwen38 && /chat_template_kwargs|reasoning_effort|unknown field|unrecognized (?:field|parameter)|extra inputs are not permitted/i.test(details)) {
      throw new Error(`LM Studio отклонил параметры управления reasoning Qwen3.8 (HTTP ${response.status}). Обновите LM Studio и runtime llama.cpp. Временно откройте настройки этой модели и задайте Enable Thinking = Off; Reasoning Effort = Low. Подробности: ${details}`);
    }
    throw new Error(`Локальный движок модели вернул HTTP ${response.status}${usedTextMode ? ' даже в текстовом режиме' : ''}.${details ? ` ${details}` : ''}`);
  }
  const payload: unknown = await response.json().catch(() => null);
  const text = completionText(payload);
  if (!text.trim()) throw new Error('Локальная модель не вернула текст результата. Проверьте вывод окна локального сервера LM Studio/llama.cpp.');
  const choices = payload && typeof payload === 'object' ? (payload as { choices?: unknown }).choices : undefined;
  const finishReason = Array.isArray(choices) && choices[0] && typeof choices[0] === 'object'
    ? String((choices[0] as { finish_reason?: unknown }).finish_reason || '') || undefined
    : undefined;
  return { text, model, finishReason, ...(isQwen38 ? { diagnostics: [`Использован OpenAI-compatible API (${endpoint}); max_tokens=${maxTokens}. Для LM Studio рекомендуется Native API с reasoning=off.`] } : {}) };
}


export interface LocalVisionServerStatus {
  available: boolean;
  baseUrl: string;
  models: string[];
  message: string;
}

/** Probes the OpenAI-compatible model list first. /health is optional because LM Studio does not need to expose it. */
export async function inspectLocalVisionServer(
  baseUrlRaw?: string,
  fetcher: typeof fetch = fetch,
): Promise<LocalVisionServerStatus> {
  const baseUrl = (baseUrlRaw || process.env.LOCAL_VLM_BASE_URL || 'http://127.0.0.1:8081').replace(/\/+$/, '');
  const url = assertLocalModelUrl(baseUrl);
  try {
    const response = await fetcher(new URL('/v1/models', url.origin), { signal: AbortSignal.timeout(4000), cache: 'no-store' });
    if (!response.ok) {
      const hint = response.status === 404
        ? ' Проверьте, что указан корневой адрес сервера или путь /v1.'
        : '';
      return { available: false, baseUrl: url.origin, models: [], message: `API совместимой модели ответил HTTP ${response.status}.${hint}` };
    }
    let models: string[] = [];
    try {
      const body: unknown = await response.json();
      const data = body && typeof body === 'object' ? (body as { data?: unknown }).data : undefined;
      if (Array.isArray(data)) models = data.map(item => item && typeof item === 'object' ? String((item as { id?: unknown }).id || '') : '').filter(Boolean).slice(0, 50);
    } catch { /* A compatible server may have an unusual payload; HTTP success still confirms reachability. */ }
    return {
      available: true,
      baseUrl: url.origin,
      models,
      message: models.length
        ? `OpenAI-совместимый сервер доступен. Модели: ${models.join(', ')}.`
        : 'OpenAI-совместимый API доступен, но список моделей не распознан. Укажите точный ID модели из LM Studio.',
    };
  } catch (error) {
    const details = describeNetworkError(error);
    const hint = details.includes('ECONNREFUSED')
      ? 'TCP-соединение отклонено: сервер не слушает этот IP/порт или порт блокирует firewall.'
      : details.includes('ETIMEDOUT') || details.includes('EHOSTUNREACH') || details.includes('ENETUNREACH')
        ? 'Сетевой тайм-аут/маршрут недоступен: проверьте IP компьютера с LM Studio, одну ли сеть используют устройства и правило firewall.'
        : 'Проверьте доступ к компьютеру модели и настройки сетевого доступа LM Studio.';
    return { available: false, baseUrl: url.origin, models: [], message: `Не удалось запросить ${new URL('/v1/models', url.origin).toString()}. ${hint} Детали: ${details}. Для LM Studio на другом компьютере включите Serve on Local Network.` };
  }
}
