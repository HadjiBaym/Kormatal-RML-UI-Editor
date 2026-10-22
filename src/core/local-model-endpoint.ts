/**
 * Validates a local model API base URL.
 * Allows loopback and RFC1918 IPv4 LAN addresses only; public Internet hosts are rejected.
 * Accepts both `http://host:port` and OpenAI-style `http://host:port/v1`.
 */
export function isPrivateLanIPv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some(part => !/^(0|[1-9]\d{0,2})$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some(part => part < 0 || part > 255)) return false;
  const [a, b] = octets;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function parseLocalModelBaseUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw.trim()); }
  catch { throw new Error('Некорректный адрес локального движка модели.'); }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const privateLan = isPrivateLanIPv4(hostname);
  const validPath = url.pathname === '/' || url.pathname === '' || url.pathname === '/v1' || url.pathname === '/v1/';
  if (url.protocol !== 'http:' || (!loopback && !privateLan) || url.username || url.password || url.search || url.hash || !validPath) {
    throw new Error('Разрешены HTTP-адреса localhost и частные IPv4-адреса локальной сети (10.x.x.x, 172.16–31.x.x, 192.168.x.x) с путём / или /v1. Публичные адреса, HTTPS и другие пути запрещены.');
  }

  // Requests are assembled from origin + an explicit API route, so normalize away /v1.
  return new URL(url.origin);
}
