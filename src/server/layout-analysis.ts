import type { AiLayoutElement } from '../core/layout-generator.ts';
import { validateLayoutAnalysisRequest, type LayoutAnalysisResponse } from '../core/layout-analysis.ts';
import { requestLocalVisionCompletion } from './local-model-client.ts';
import { buildAiKnowledgeContext } from './ai-knowledge-engine.ts';

const MAX_ELEMENTS = 100;

function sanitizeHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const raw = value.trim();
  if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(raw)) return raw;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.exec(raw);
  if (rgb) return `#${[rgb[1], rgb[2], rgb[3]].map(n => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')}`;
  return undefined;
}

export function extractJsonObject(raw: string): Record<string, unknown> {
  // Qwen and other local reasoning VLMs may add a thinking block, Markdown fence,
  // short preamble, or a trailing comma even when the API requested JSON output.
  const source = raw
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
    .replace(/```(?:json|javascript|js)?/gi, '')
    .replace(/```/g, '')
    .trim();

  const isLayout = (value: unknown): value is Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const obj = value as Record<string, unknown>;
    return Array.isArray(obj.elements) && Number.isFinite(Number(obj.width)) && Number.isFinite(Number(obj.height));
  };
  const removeTrailingCommas = (value: string): string => {
    let output = '';
    let inString = false, escaped = false;
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      if (inString) {
        output += ch;
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; output += ch; continue; }
      if (ch === ',') {
        let next = i + 1;
        while (next < value.length && /\s/.test(value[next])) next++;
        if (value[next] === '}' || value[next] === ']') continue;
      }
      output += ch;
    }
    return output;
  };

  let foundStart = false;
  for (let start = source.indexOf('{'); start >= 0; start = source.indexOf('{', start + 1)) {
    foundStart = true;
    let depth = 0, inString = false, escaped = false;
    for (let i = start; i < source.length; i++) {
      const ch = source[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const candidate = source.slice(start, i + 1);
          for (const trial of [candidate, removeTrailingCommas(candidate)]) {
            try {
              const value: unknown = JSON.parse(trial);
              if (isLayout(value)) return value;
            } catch { /* try a less strict serialization or the next object */ }
          }
          break;
        }
      }
    }
  }
  if (!foundStart) throw new Error('Ответ локальной модели не содержит JSON-объекта. Повторите анализ; исходное изображение не изменено.');
  throw new Error('Ответ локальной модели не содержит полного объекта Layout JSON (нужны width, height и массив elements). Ответ мог быть обрезан лимитом токенов или модель вернула схему другого формата. Повторите анализ; исходное изображение не изменено.');
}


/** Recover complete element objects from a token-truncated model response.
 * The screenshot dimensions come from the upload request, so the model does not
 * need to finish the root object for a useful partial layout to be safe to use.
 */
export function extractPartialLayout(raw: string, fallbackWidth: number, fallbackHeight: number): Record<string, unknown> | null {
  const source = raw
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
    .replace(/```(?:json|javascript|js)?/gi, '')
    .replace(/```/g, '')
    .trim();
  const elementMatch = /"elements"\s*:\s*\[/.exec(source);
  if (!elementMatch) return null;

  const removeTrailingCommas = (value: string): string => {
    let output = '';
    let inString = false, escaped = false;
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      if (inString) {
        output += ch;
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; output += ch; continue; }
      if (ch === ',') {
        let next = i + 1;
        while (next < value.length && /\s/.test(value[next])) next++;
        if (value[next] === '}' || value[next] === ']') continue;
      }
      output += ch;
    }
    return output;
  };

  const elements: Record<string, unknown>[] = [];
  const startIndex = elementMatch.index + elementMatch[0].length;
  let objectStart = -1, depth = 0, inString = false, escaped = false;
  for (let i = startIndex; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objectStart >= 0) {
        const candidate = source.slice(objectStart, i + 1);
        try {
          const value = JSON.parse(candidate) as Record<string, unknown>;
          const numberKeys = ['x', 'y', 'width', 'height'];
          if (value && typeof value === 'object' && !Array.isArray(value) &&
              numberKeys.every(key => Number.isFinite(Number(value[key]))) &&
              Number(value.width) > 0 && Number(value.height) > 0) {
            elements.push(value);
          }
        } catch {
          try {
            const value = JSON.parse(removeTrailingCommas(candidate)) as Record<string, unknown>;
            const numberKeys = ['x', 'y', 'width', 'height'];
            if (value && typeof value === 'object' && !Array.isArray(value) &&
                numberKeys.every(key => Number.isFinite(Number(value[key]))) &&
                Number(value.width) > 0 && Number(value.height) > 0) {
              elements.push(value);
            }
          } catch { /* ignore an incomplete or malformed element and continue */ }
        }
        objectStart = -1;
      }
    } else if (ch === ']' && depth === 0) {
      break;
    }
  }

  if (!elements.length) return null;
  const widthMatch = /"width"\s*:\s*(\d+(?:\.\d+)?)/.exec(source.slice(0, elementMatch.index));
  const heightMatch = /"height"\s*:\s*(\d+(?:\.\d+)?)/.exec(source.slice(0, elementMatch.index));
  const width = Number(widthMatch?.[1]);
  const height = Number(heightMatch?.[1]);
  return {
    width: Number.isFinite(width) && width > 0 ? width : fallbackWidth,
    height: Number.isFinite(height) && height > 0 ? height : fallbackHeight,
    elements,
    notes: [`Частичный результат: модель завершила генерацию по лимиту токенов. Восстановлено ${elements.length} полностью сформированных элементов; проверьте и при необходимости повторите анализ для оставшихся элементов.`],
  };
}

type CompletionFn = typeof requestLocalVisionCompletion;

export async function analyzeLayoutImage(
  input: unknown,
  dependencies: { complete?: CompletionFn } = {},
): Promise<LayoutAnalysisResponse> {
  const request = validateLayoutAnalysisRequest(input);
  const isQwen38 = /qwen[\s._-]*3[\s._-]*8/i.test(request.model || process.env.LOCAL_VLM_MODEL || '');
  // Existing .env.local files may still contain the old 4K-token/4.2K-character
  // values from .env.example. For Qwen3.8's screenshot geometry task, enforce a
  // compact profile in code so stale environment overrides cannot re-enable a
  // long reasoning/generation path.
  const envKnowledgeChars = Number(process.env.LOCAL_VLM_KNOWLEDGE_CHARS || (isQwen38 ? 700 : 2400));
  const knowledgeCharLimit = isQwen38
    ? Math.max(1100, Math.min(1500, Number.isFinite(envKnowledgeChars) ? envKnowledgeChars : 1500))
    : Math.max(500, Math.min(4200, Number.isFinite(envKnowledgeChars) ? envKnowledgeChars : 2400));
  const knowledge = await buildAiKnowledgeContext({
    task: 'layout-analysis',
    query: `Raster UI reconstruction; Canvas ${request.width}x${request.height}; source name ${request.name || ''}; infer visible panels, buttons, text, assets, geometry and layout only.`,
    maxChars: knowledgeCharLimit,
  });
  const layoutPrompt = `You are a visual UI layout detector. Analyze the screenshot and output only compact final JSON. Do not explain your reasoning or emit a <think> block.\n` +
    `Canvas: ${request.width} x ${request.height} pixels. Use absolute x/y coordinates from the top-left.\n` +
    `Detect only ${isQwen38 ? 'up to 8' : '8-16'} important visible UI regions: major panels/cards, buttons, readable labels and image areas. Do not list tiny decorative pixels, repeated icon strokes, or every child inside a large illustration. Do not invent hidden elements. Order elements back-to-front. Preserve intentionally empty space.\n` +
    `Return one minified JSON object: {"width":${request.width},"height":${request.height},"notes":[],"elements":[...]}. Each element requires name, kind, x, y, width, height. Optional keys only: text, fill, stroke, fontSize, confidence. Include optional fields only when they clearly help. Colors are #RRGGBB or transparent. Maximum ${isQwen38 ? 8 : 16} elements. Do not repeat the canvas background as children. Do not use Markdown. This is a proposed layout, not source DOM recovery.`;
  const withKnowledge = (instruction: string) => `${instruction}\n\n${knowledge.text}`;
  const prompt = withKnowledge(layoutPrompt);

  const complete = dependencies.complete || requestLocalVisionCompletion;
  const completionRequest = { prompt, imageBase64: request.imageBase64, mimeType: request.mimeType };
  const configuredBudget = (key: string, fallback: number, cap: number) => {
    const value = Number(process.env[key] || fallback);
    return Math.max(128, Math.min(cap, Number.isFinite(value) ? value : fallback));
  };
  const attempts = [
    { prompt, maxTokens: isQwen38 ? configuredBudget('LOCAL_VLM_MAX_TOKENS', 768, 768) : Number(process.env.LOCAL_VLM_MAX_TOKENS || 1536), responseFormat: 'text' as const },
    {
      prompt: withKnowledge(`Analyze this screenshot and return only a compact minified JSON object. No explanation, no Markdown, no <think> block.\n` +
        `Canvas ${request.width}x${request.height}. Exact shape: {"width":${request.width},"height":${request.height},"notes":[],"elements":[{"name":"Panel","kind":"panel","x":0,"y":0,"width":100,"height":50}]}.\n` +
        `Return at most ${isQwen38 ? 4 : 8} important visible regions only (main panels, buttons, major labels and image areas). Each element contains only name, kind, x, y, width, height, optionally text. Do not include the full-screen background unless it is visibly distinct from the canvas. Do not list small decorative details. Pixel coordinates. JSON only.`),
      maxTokens: isQwen38 ? configuredBudget('LOCAL_VLM_RETRY_MAX_TOKENS', 512, 512) : Number(process.env.LOCAL_VLM_RETRY_MAX_TOKENS || 1024), responseFormat: 'text' as const,
    },
    {
      prompt: withKnowledge(`Return only a compact JSON layout for this screenshot. No thinking, Markdown or explanation.\n` +
        `Canvas ${request.width}x${request.height}. Return width, height, notes and elements. At most ${isQwen38 ? 2 : 4} elements: the largest visible panels/buttons/text areas. Each element must have only name, kind, x, y, width, height. Example: {"width":${request.width},"height":${request.height},"notes":[],"elements":[{"name":"Main panel","kind":"panel","x":0,"y":0,"width":${request.width},"height":${request.height}}]}.`),
      maxTokens: isQwen38 ? configuredBudget('LOCAL_VLM_FINAL_MAX_TOKENS', 384, 384) : Number(process.env.LOCAL_VLM_FINAL_MAX_TOKENS || 512), responseFormat: 'text' as const,
    },
  ];

  let parsed: Record<string, unknown> | undefined;
  let selectedResult: Awaited<ReturnType<CompletionFn>> | undefined;
  const partialCandidates: Array<{ parsed: Record<string, unknown>; result: Awaited<ReturnType<CompletionFn>> }> = [];
  const errors: string[] = [];

  for (const [attemptIndex, attempt] of attempts.entries()) {
    const result = await complete({ ...completionRequest, prompt: attempt.prompt }, {
      model: request.model, baseUrl: request.baseUrl, timeoutMs: request.timeoutMs, maxTokens: attempt.maxTokens,
      ...(attempt.responseFormat ? { responseFormat: attempt.responseFormat } : {}),
    });
    try {
      const candidate = extractJsonObject(result.text);
      if (!Array.isArray(candidate.elements) || candidate.elements.length === 0) {
        throw new Error('Ответ содержит пустой массив elements.');
      }
      parsed = candidate;
      selectedResult = result;
      break;
    } catch (error) {
      errors.push(`Попытка ${attemptIndex + 1}: ${error instanceof Error ? error.message : 'некорректный JSON'}${result.finishReason ? ` (finish_reason=${result.finishReason})` : ''}`);
      const partial = extractPartialLayout(result.text, request.width, request.height);
      if (partial) partialCandidates.push({ parsed: partial, result });
    }
  }

  // If the model was truncated after completing several elements, keep those elements
  // instead of discarding the entire analysis. Their geometry is validated below.
  if (!parsed && partialCandidates.length) {
    partialCandidates.sort((a, b) => (Array.isArray(b.parsed.elements) ? b.parsed.elements.length : 0) - (Array.isArray(a.parsed.elements) ? a.parsed.elements.length : 0));
    parsed = partialCandidates[0].parsed;
    selectedResult = partialCandidates[0].result;
  }
  if (!parsed || !selectedResult) {
    const lastReason = partialCandidates.length ? '' : ' Модель исчерпала лимит токенов или завершилась до первого полного элемента.';
    const finishReasons = errors.map(text => text.match(/finish_reason=([^\)]+)/)?.[1]).filter(Boolean);
    const reason = finishReasons.length ? ` Статус генерации: ${[...new Set(finishReasons)].join(', ')}.` : '';
    const advice = finishReasons.includes('length')
      ? ' Для Qwen отключите thinking mode в настройках шаблона чата, если движок поддерживает эту опцию, и увеличьте context length в LM Studio. Анализ автоматически повторялся с 16, 8 и затем 4 элементами.'
      : ' Проверьте, что выбрана vision-модель, способная принимать изображения, а не текстовая Qwen.';
    throw new Error(`Не удалось получить пригодный Layout JSON после трёх попыток.${reason}${lastReason}${advice} ${errors.join(' | ')} Исходное изображение не изменено.`);
  }
  const result = selectedResult;
  const rawElements = Array.isArray(parsed.elements) ? parsed.elements.slice(0, MAX_ELEMENTS) : [];
  const numberOr = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const elements: AiLayoutElement[] = rawElements.map((item: any, index: number) => {
    const parentIndex = Number.isInteger(item?.parentIndex) && Number(item.parentIndex) >= 0 && Number(item.parentIndex) < index
      ? Number(item.parentIndex) : undefined;
    return {
      name: String(item?.name || `Элемент ${index + 1}`).slice(0, 100),
      kind: ['container', 'panel', 'button', 'text', 'shape', 'line', 'icon', 'image'].includes(String(item?.kind)) ? item.kind : 'shape',
      x: numberOr(item?.x, 0), y: numberOr(item?.y, 0),
      width: Math.max(0, numberOr(item?.width, 0)), height: Math.max(0, numberOr(item?.height, 0)),
      text: typeof item?.text === 'string' ? item.text.slice(0, 500) : undefined,
      fill: sanitizeHexColor(item?.fill) || (item?.fill === 'transparent' ? 'transparent' : undefined),
      stroke: sanitizeHexColor(item?.stroke) || (item?.stroke === 'transparent' ? 'transparent' : undefined),
      radius: Math.max(0, numberOr(item?.radius, 0)), fontSize: Math.max(1, numberOr(item?.fontSize, 16)),
      fontWeight: numberOr(item?.fontWeight, 400),
      textAlign: ['left', 'center', 'right'].includes(String(item?.textAlign)) ? item.textAlign : 'left',
      confidence: Math.max(0, Math.min(1, numberOr(item?.confidence, 0.6))),
      parentIndex,
      layoutMode: ['none', 'horizontal', 'vertical'].includes(String(item?.layoutMode)) ? item.layoutMode : 'none',
      layoutItemSpacing: Math.max(0, numberOr(item?.layoutItemSpacing, 0)),
      layoutPaddingTop: Math.max(0, numberOr(item?.layoutPaddingTop, 0)), layoutPaddingRight: Math.max(0, numberOr(item?.layoutPaddingRight, 0)),
      layoutPaddingBottom: Math.max(0, numberOr(item?.layoutPaddingBottom, 0)), layoutPaddingLeft: Math.max(0, numberOr(item?.layoutPaddingLeft, 0)),
      layoutJustifyContent: ['flex-start', 'center', 'flex-end', 'space-between'].includes(String(item?.layoutJustifyContent)) ? item.layoutJustifyContent : 'flex-start',
      layoutAlignItems: ['flex-start', 'center', 'flex-end', 'stretch', 'baseline'].includes(String(item?.layoutAlignItems)) ? item.layoutAlignItems : 'flex-start',
      layoutWrap: item?.layoutWrap === true, layoutPositioning: item?.layoutPositioning === 'absolute' ? 'absolute' : 'flow',
    };
  });
  const width = Number.isFinite(Number(parsed.width)) ? Number(parsed.width) : request.width;
  const height = Number.isFinite(Number(parsed.height)) ? Number(parsed.height) : request.height;
  return {
    width: Math.max(1, Math.min(16384, width)), height: Math.max(1, Math.min(16384, height)), elements,
    notes: [
      ...(Array.isArray(parsed.notes) ? parsed.notes.filter((n: unknown) => typeof n === 'string').slice(0, 28).map((n: string) => n.slice(0, 500)) : []),
      ...(result.diagnostics || []),
      `Knowledge Engine: использовано ${knowledge.entries.length} записей; ${knowledge.documentSections} разделов документации; ${knowledge.chars} символов контекста.`,
      ...(knowledge.documentSections === 0 ? ['Markdown-документы базы знаний не найдены в runtime-каталоге docs; применены структурированные реестры.'] : []),
    ],
    model: result.model,
    knowledgeContext: {
      entriesUsed: knowledge.entries.length,
      documentSections: knowledge.documentSections,
      contextChars: knowledge.chars,
      sources: knowledge.sources.slice(0, 12),
    },
  };
}
