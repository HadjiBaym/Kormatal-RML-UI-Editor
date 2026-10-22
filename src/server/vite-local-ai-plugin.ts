import type { ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { analyzeLayoutImage } from './layout-analysis.ts';
import { reviewVisualConversion } from './visual-review.ts';
import { inspectLocalVisionServer } from './local-model-client.ts';
import { isLoopbackAddress } from './local-network.ts';
import { bundleVaCuusModuleGraph, JsModuleBundleError } from './js-module-bundler.ts';

const MAX_BODY_BYTES = 11 * 1024 * 1024;
const MAX_BUNDLE_BODY_BYTES = 12 * 1024 * 1024;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

function jsonResponse(res: ServerResponse, status: number, payload: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export function layoutAnalysisApi(): Plugin {
  const requests = new Map<string, number[]>();
  return {
    name: 'kormatal-local-layout-analyzer',
    configureServer(server) {
      server.middlewares.use('/local-ai/status', (req, res) => {
        if (!isLoopbackAddress(req.socket.remoteAddress)) {
          jsonResponse(res, 403, { error: 'Проверка локальной модели доступна только на этом компьютере.' }); return;
        }
        const origin = req.headers.origin;
        const host = req.headers.host;
        if (origin) {
          let sameOrigin = false;
          try { sameOrigin = new URL(origin).host === host; } catch { sameOrigin = false; }
          if (!sameOrigin) { jsonResponse(res, 403, { error: 'Запрос отклонён: источник не совпадает с сервером приложения.' }); return; }
        }
        if (req.method !== 'GET') { jsonResponse(res, 405, { error: 'Используйте GET для проверки локальной модели.' }); return; }
        let baseUrl: string | undefined;
        try {
          const requestUrl = new URL(req.url || '/', `http://${host || 'localhost'}`);
          baseUrl = requestUrl.searchParams.get('baseUrl') || undefined;
        } catch { jsonResponse(res, 400, { error: 'Некорректный адрес локального движка.' }); return; }
        void inspectLocalVisionServer(baseUrl).then(status => {
          jsonResponse(res, 200, status as unknown as Record<string, unknown>);
        }).catch(error => {
          jsonResponse(res, 400, { error: error instanceof Error ? error.message : 'Не удалось проверить локальную модель.' });
        });
      });
      server.middlewares.use('/local-ai/bundle-js', (req, res) => {
        if (!isLoopbackAddress(req.socket.remoteAddress)) {
          jsonResponse(res, 403, { error: 'Сборка JS-модулей доступна только на этом компьютере.' }); return;
        }
        const origin = req.headers.origin;
        const host = req.headers.host;
        if (origin) {
          let sameOrigin = false;
          try { sameOrigin = new URL(origin).host === host; } catch { sameOrigin = false; }
          if (!sameOrigin) { jsonResponse(res, 403, { error: 'Запрос отклонён: источник не совпадает с сервером приложения.' }); return; }
        }
        if (req.method !== 'POST') { jsonResponse(res, 405, { error: 'Используйте POST для сборки JavaScript-модулей.' }); return; }
        const contentType = String(req.headers['content-type'] || '').toLowerCase();
        if (!contentType.startsWith('application/json')) { jsonResponse(res, 415, { error: 'Ожидается Content-Type: application/json.' }); return; }

        const chunks: Buffer[] = [];
        let byteLength = 0;
        let tooLarge = false;
        req.on('data', (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          byteLength += buffer.length;
          if (byteLength > MAX_BUNDLE_BODY_BYTES) { tooLarge = true; chunks.length = 0; return; }
          if (!tooLarge) chunks.push(buffer);
        });
        req.on('end', async () => {
          if (tooLarge) { jsonResponse(res, 413, { error: 'Граф модулей превышает лимит 12 МиБ.' }); return; }
          let payload: unknown;
          try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
          catch { jsonResponse(res, 400, { error: 'Тело запроса должно содержать корректный JSON.' }); return; }
          try {
            const result = await bundleVaCuusModuleGraph(payload as Parameters<typeof bundleVaCuusModuleGraph>[0]);
            jsonResponse(res, 200, result as unknown as Record<string, unknown>);
          } catch (error) {
            const status = error instanceof JsModuleBundleError ? error.statusCode : 500;
            jsonResponse(res, status, { error: error instanceof Error ? error.message : 'Не удалось собрать граф JavaScript-модулей.' });
          }
        });
        req.on('error', () => { if (!res.headersSent) jsonResponse(res, 400, { error: 'Не удалось прочитать запрос.' }); });
      });
      server.middlewares.use('/local-ai/visual-review', (req, res) => {
        if (!isLoopbackAddress(req.socket.remoteAddress)) {
          jsonResponse(res, 403, { error: 'AI-проверка интерфейса доступна только на этом компьютере.' }); return;
        }
        const origin = req.headers.origin;
        const host = req.headers.host;
        if (origin) {
          let sameOrigin = false;
          try { sameOrigin = new URL(origin).host === host; } catch { sameOrigin = false; }
          if (!sameOrigin) { jsonResponse(res, 403, { error: 'Запрос отклонён: источник не совпадает с сервером приложения.' }); return; }
        }
        if (req.method !== 'POST') { jsonResponse(res, 405, { error: 'Используйте POST для AI-проверки интерфейса.' }); return; }
        const contentType = String(req.headers['content-type'] || '').toLowerCase();
        if (!contentType.startsWith('application/json')) { jsonResponse(res, 415, { error: 'Ожидается Content-Type: application/json.' }); return; }
        const now = Date.now();
        const ip = req.socket.remoteAddress || 'unknown';
        const recent = (requests.get(ip) || []).filter(time => now - time < RATE_WINDOW_MS);
        if (recent.length >= RATE_LIMIT) { jsonResponse(res, 429, { error: 'Лимит запросов к локальной модели превышен. Подождите минуту и повторите.' }); return; }
        recent.push(now); requests.set(ip, recent);
        const chunks: Buffer[] = [];
        let byteLength = 0;
        let tooLarge = false;
        req.on('data', (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          byteLength += buffer.length;
          if (byteLength > MAX_BODY_BYTES) { tooLarge = true; chunks.length = 0; return; }
          if (!tooLarge) chunks.push(buffer);
        });
        req.on('end', async () => {
          if (tooLarge) { jsonResponse(res, 413, { error: 'Запрос превышает 11 МиБ. Уменьшите изображение до 8 МиБ или меньше.' }); return; }
          let payload: unknown;
          try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
          catch { jsonResponse(res, 400, { error: 'Тело запроса должно содержать корректный JSON.' }); return; }
          try {
            const result = await reviewVisualConversion(payload);
            jsonResponse(res, 200, result as unknown as Record<string, unknown>);
          } catch (error) {
            const err = error as Error & { statusCode?: number };
            const message = err.message || 'Не удалось выполнить AI-проверку интерфейса.';
            const invalid = /Некоррект|Загрузите скриншот|должен быть передан|не должен превышать|Поддерживаются|идентификатор локальной модели|Разрешён только HTTP-адрес локального движка|Разрешены HTTP-адреса|Публичные адреса/i.test(message);
            jsonResponse(res, err.statusCode || (invalid ? 400 : 502), { error: message });
          }
        });
        req.on('error', () => { if (!res.headersSent) jsonResponse(res, 400, { error: 'Не удалось прочитать запрос.' }); });
      });

      server.middlewares.use('/local-ai/analyze', (req, res, next) => {
        if (!isLoopbackAddress(req.socket.remoteAddress)) {
          jsonResponse(res, 403, { error: 'Локальный AI доступен только на этом компьютере.' }); return;
        }
        const origin = req.headers.origin;
        const host = req.headers.host;
        if (origin) {
          let sameOrigin = false;
          try { sameOrigin = new URL(origin).host === host; } catch { sameOrigin = false; }
          if (!sameOrigin) { jsonResponse(res, 403, { error: 'Запрос отклонён: источник не совпадает с сервером приложения.' }); return; }
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Vary', 'Origin');
        }
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.statusCode = 204; res.end(); return;
        }
        if (req.method !== 'POST') { jsonResponse(res, 405, { error: 'Используйте POST для анализа изображения.' }); return; }
        const contentType = String(req.headers['content-type'] || '').toLowerCase();
        if (!contentType.startsWith('application/json')) { jsonResponse(res, 415, { error: 'Ожидается Content-Type: application/json.' }); return; }

        const now = Date.now();
        const ip = req.socket.remoteAddress || 'unknown';
        const recent = (requests.get(ip) || []).filter(time => now - time < RATE_WINDOW_MS);
        if (recent.length >= RATE_LIMIT) { jsonResponse(res, 429, { error: 'Лимит запросов к локальной модели превышен. Подождите минуту и повторите.' }); return; }
        recent.push(now); requests.set(ip, recent);
        if (requests.size > 5000) {
          for (const [key, times] of requests) if (!times.some(time => now - time < RATE_WINDOW_MS)) requests.delete(key);
        }

        const chunks: Buffer[] = [];
        let byteLength = 0;
        let tooLarge = false;
        req.on('data', (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          byteLength += buffer.length;
          if (byteLength > MAX_BODY_BYTES) { tooLarge = true; chunks.length = 0; return; }
          if (!tooLarge) chunks.push(buffer);
        });
        req.on('end', async () => {
          if (tooLarge) { jsonResponse(res, 413, { error: 'Запрос слишком большой. Лимит — 11 МиБ; само изображение должно быть не больше 8 МиБ.' }); return; }
          let payload: unknown;
          try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
          catch { jsonResponse(res, 400, { error: 'Тело запроса должно содержать корректный JSON.' }); return; }
          try {
            const result = await analyzeLayoutImage(payload);
            jsonResponse(res, 200, result as unknown as Record<string, unknown>);
          } catch (error) {
            const err = error as Error & { statusCode?: number };
            const status = err.statusCode || (err.message?.includes('Некоррект') || err.message?.includes('отсутствуют данные') || err.message?.includes('поддерживаются') || err.message?.includes('base64') || err.message?.includes('Размер') || err.message?.includes('размеры') || err.message?.includes('идентификатор локальной модели') || err.message?.includes('Разрешён только HTTP-адрес локального движка') || err.message?.includes('Разрешены HTTP-адреса') || err.message?.includes('Публичные адреса') ? 400 : 502);
            jsonResponse(res, status, { error: err.message || 'Не удалось выполнить анализ изображения.' });
          }
        });
        req.on('error', () => { if (!res.headersSent) jsonResponse(res, 400, { error: 'Не удалось прочитать запрос.' }); });
      });
    },
  };
}
