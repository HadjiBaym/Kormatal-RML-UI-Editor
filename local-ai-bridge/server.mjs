import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { inspectLocalVisionServer } from '../src/server/local-model-client.ts';
import { analyzeLayoutImage } from '../src/server/layout-analysis.ts';
import { reviewVisualConversion } from '../src/server/visual-review.ts';

const HOST = '127.0.0.1';
const PORT = Number(process.env.LOCAL_AI_BRIDGE_PORT || 17891);
const MAX_BODY_BYTES = 11 * 1024 * 1024;

export function isPrivateLanIPv4(hostname) {
  const parts = String(hostname).split('.');
  if (parts.length !== 4 || parts.some(part => !/^(0|[1-9]\d{0,2})$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some(part => part < 0 || part > 255)) return false;
  const [a, b] = octets;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function validateTargetBaseUrl(raw) {
  let url;
  try { url = new URL(String(raw || '').trim()); }
  catch { throw new Error('Некорректный адрес локальной модели.'); }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(hostname);
  const allowedPath = ['', '/', '/v1', '/v1/'].includes(url.pathname);
  if (url.protocol !== 'http:' || (!loopback && !isPrivateLanIPv4(hostname)) || url.username || url.password || url.search || url.hash || !allowedPath) {
    throw new Error('Мост разрешает только HTTP к localhost или частным адресам IPv4 в LAN и пути / или /v1. Публичные адреса и HTTPS запрещены.');
  }
  return url.origin;
}

function addCors(req, res) {
  // Requests are authenticated by a random local token; no cookies or credentials are used.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Local-Bridge-Token');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Vary', 'Origin, Access-Control-Request-Private-Network');
  res.setHeader('Cache-Control', 'no-store');
}

function safeTokenEqual(given, expected) {
  if (typeof given !== 'string' || !given || given.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(given), Buffer.from(expected)); } catch { return false; }
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Запрос превышает 11 МиБ. Уменьшите размер изображения до 8 МиБ или меньше.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Тело запроса должно содержать корректный JSON.'), { statusCode: 400 }); }
}

export function createLocalBridgeServer({ token, fetcher = fetch, analyzer = analyzeLayoutImage, reviewer = reviewVisualConversion } = {}) {
  if (!token || token.length < 24) throw new Error('Токен моста должен содержать не менее 24 символов.');
  const server = createServer(async (req, res) => {
    addCors(req, res);
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
    const sourceAddress = req.socket.remoteAddress || '';
    if (!(sourceAddress === '127.0.0.1' || sourceAddress === '::1' || sourceAddress === '::ffff:127.0.0.1')) {
      sendJson(res, 403, { error: 'Локальный мост принимает соединения только с этого компьютера.' }); return;
    }
    const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
    if (url.pathname === '/health' && req.method === 'GET') {
      sendJson(res, 200, { service: 'kormatal-local-ai-bridge', status: 'ready', bind: HOST, port: PORT, tokenRequired: true }); return;
    }
    if (!safeTokenEqual(req.headers['x-local-bridge-token'], token)) {
      sendJson(res, 401, { error: 'Токен локального моста отсутствует или неверен. Скопируйте токен из консоли Start-Local-Bridge.bat.' }); return;
    }
    try {
      if (url.pathname === '/status' && req.method === 'GET') {
        const target = validateTargetBaseUrl(url.searchParams.get('baseUrl'));
        const status = await inspectLocalVisionServer(target, fetcher);
        sendJson(res, 200, { ...status, via: 'local-bridge', bridge: HOST }); return;
      }
      if (url.pathname === '/analyze' && req.method === 'POST') {
        const payload = await readJson(req);
        const target = validateTargetBaseUrl(payload?.baseUrl);
        const result = await analyzer({ ...payload, baseUrl: target });
        sendJson(res, 200, { ...result, via: 'local-bridge' }); return;
      }
      if (url.pathname === '/visual-review' && req.method === 'POST') {
        const payload = await readJson(req);
        const target = validateTargetBaseUrl(payload?.baseUrl);
        const result = await reviewer({ ...payload, baseUrl: target });
        sendJson(res, 200, { ...result, via: 'local-bridge' }); return;
      }
      sendJson(res, 404, { error: 'Неизвестный путь локального моста. Используйте /health, /status, /analyze или /visual-review.' });
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Неизвестная ошибка локального моста.');
      sendJson(res, err.statusCode || 400, { error: err.message });
    }
  });
  return server;
}

export function startLocalBridge() {
  const token = process.env.LOCAL_AI_BRIDGE_TOKEN || randomBytes(24).toString('hex');
  const server = createLocalBridgeServer({ token });
  server.listen(PORT, HOST, () => {
    console.log('Kormatal Local AI Bridge запущен.');
    console.log(`Адрес: http://${HOST}:${PORT}`);
    console.log(`Токен для вставки в VaCuus UI Converter: ${token}`);
    console.log('Мост слушает только localhost и не принимает запросы из LAN.');
    console.log('Целевая модель должна быть доступна по частному LAN IP/localhost, например http://192.168.1.22:1234/v1.');
    console.log('Не закрывайте это окно, пока используете локальный анализ.');
  });
  server.on('error', error => { console.error(`Не удалось запустить мост: ${error.message}`); process.exitCode = 1; });
  return server;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  startLocalBridge();
}
