/** Shared trust boundary for push registration requests. */
const MAX_PUSH_TOKEN_LENGTH = 4096;

export function normalizeTrustedPushApi(api: unknown): string | null {
  if (typeof api !== 'string') return null;
  const raw = api.trim();
  if (!raw || raw.length > 2048 || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return null; }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
  const testMode = String(process.env.EXPO_PUBLIC_RIDEX_TEST_MODE ?? '').trim().toLowerCase() === 'true';
  if (parsed.protocol !== 'https:' && !testMode) return null;
  if (parsed.pathname.includes('\\') || /%2f|%5c/i.test(parsed.pathname)) return null;
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

export function isValidPushProviderToken(token: unknown): token is string {
  return typeof token === 'string' && token.length > 0 && token.length <= MAX_PUSH_TOKEN_LENGTH &&
    token.trim() === token && !/[\u0000-\u001f\u007f]/.test(token);
}

export function buildTrustedPushEndpoint(api: unknown, action: 'register' | 'touch' | 'deactivate'): string | null {
  const base = normalizeTrustedPushApi(api);
  if (!base) return null;
  try {
    const url = new URL(`${base.replace(/\/+$/, '')}/devices/${action}`);
    const parsedBase = new URL(base);
    if (url.origin !== parsedBase.origin || url.username || url.password || url.search || url.hash) return null;
    return url.toString();
  } catch { return null; }
}
