import type { AiLayoutElement } from './layout-generator.ts';
import { parseLocalModelBaseUrl } from './local-model-endpoint.ts';

export interface LayoutAnalysisRequest {
  imageBase64: string;
  mimeType: string;
  width: number;
  height: number;
  name?: string;
  /** OpenAI-compatible model identifier served by the local vision runtime. */
  model?: string;
  /** Optional local-only endpoint; external hosts are never accepted. */
  baseUrl?: string;
  /** Request timeout in milliseconds (60 s to 15 min). */
  timeoutMs?: number;
}

export interface LayoutAnalysisResponse {
  width: number;
  height: number;
  elements: AiLayoutElement[];
  notes: string[];
  model: string;
  knowledgeContext?: { entriesUsed: number; documentSections: number; contextChars: number; sources: string[] };
}

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function validateLayoutAnalysisRequest(value: unknown): LayoutAnalysisRequest {
  if (!value || typeof value !== 'object') throw new Error('Некорректный запрос анализа изображения.');
  const request = value as Partial<LayoutAnalysisRequest>;
  if (typeof request.imageBase64 !== 'string' || !request.imageBase64.trim()) throw new Error('В запросе отсутствуют данные изображения.');
  const imageBase64 = request.imageBase64.replace(/^data:image\/(?:png|jpeg|webp);base64,/i, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) throw new Error('Изображение должно быть передано в base64.');
  const approximateBytes = Math.floor(imageBase64.length * 3 / 4);
  if (approximateBytes > MAX_IMAGE_BYTES) throw new Error('Размер изображения для AI-анализа не должен превышать 8 МБ.');
  const mimeType = String(request.mimeType || '').toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) throw new Error('Поддерживаются только PNG, JPEG и WebP.');
  const width = Number(request.width), height = Number(request.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 16384 || height > 16384) {
    throw new Error('Некорректные размеры изображения.');
  }
  const timeoutValue = request.timeoutMs === undefined ? undefined : Number(request.timeoutMs);
  if (timeoutValue !== undefined && (!Number.isFinite(timeoutValue) || timeoutValue < 60_000 || timeoutValue > 900_000)) {
    throw new Error('Тайм-аут AI должен быть от 60 до 900 секунд.');
  }
  const model = typeof request.model === 'string' ? request.model.trim() : undefined;
  if (model !== undefined && (!model || model.length > 120 || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(model))) {
    throw new Error('Некорректный идентификатор локальной модели. Используйте только буквы, цифры, точку, подчёркивание, двоеточие, слеш и дефис.');
  }
  let baseUrl: string | undefined;
  if (typeof request.baseUrl === 'string' && request.baseUrl.trim()) {
    const parsed = parseLocalModelBaseUrl(request.baseUrl.trim());
    baseUrl = parsed.origin;
  }
  return {
    imageBase64, mimeType, width, height,
    name: typeof request.name === 'string' ? request.name.slice(0, 100) : undefined,
    model, baseUrl, timeoutMs: timeoutValue,
  };
}
