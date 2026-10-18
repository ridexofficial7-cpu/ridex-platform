/**
 * Authoritative mobile API configuration for Customer, Driver and Admin apps.
 *
 * The environment variable may point either to the backend origin
 * (https://host) or directly to the mounted RideX API v1 root
 * (https://host/api/v1). Internally all mobile roles use the same normalized
 * API v1 root so endpoint paths never need role-specific base URL logic.
 */

export type RideXMobileRole = 'CUSTOMER' | 'DRIVER' | 'ADMIN';

export const RIDEX_API_V1_PREFIX = '/api/v1';

export type RideXMobileApiConfig = {
  apiV1BaseUrl: string;
  backendOrigin: string;
  realtimeBaseUrl: string;
};

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeBackendOrigin(value: string): string {
  const parsed = new URL(value);
  return parsed.toString().replace(/\/+$/, '');
}

function normalizeApiV1BaseUrl(value: string): string {
  const clean = trimTrailingSlashes(value);
  const lower = clean.toLowerCase();
  const suffix = RIDEX_API_V1_PREFIX.toLowerCase();

  if (lower.endsWith(suffix)) {
    return clean;
  }

  return `${clean}${RIDEX_API_V1_PREFIX}`;
}

export function getRideXMobileApiConfig(apiUrl?: string): RideXMobileApiConfig {
  const configured = String(
    apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? '',
  ).trim();

  if (!configured) {
    const mode = String(process.env.EXPO_PUBLIC_RIDEX_TEST_MODE ?? '')
      .trim()
      .toLowerCase();

    throw new Error(
      mode === 'true'
        ? 'EXPO_PUBLIC_API_URL must be configured for TEST RideX builds'
        : 'EXPO_PUBLIC_API_URL must be configured for LIVE RideX builds',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('EXPO_PUBLIC_API_URL must be an absolute HTTP(S) URL');
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error('EXPO_PUBLIC_API_URL must use http:// or https://');
  }

  const testMode = String(process.env.EXPO_PUBLIC_RIDEX_TEST_MODE ?? '')
    .trim()
    .toLowerCase() === 'true';
  const host = parsed.hostname.toLowerCase();
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  if (parsed.protocol === 'http:' && !testMode && !isLoopback) {
    throw new Error('LIVE RideX API URLs must use HTTPS; HTTP is allowed only in TEST mode or for loopback development');
  }

  // Credentials and query/fragment data do not belong in a backend base URL.
  // Reject them rather than silently dropping them during origin normalization;
  // otherwise operators can believe a secret or routing parameter is active
  // when the actual API client no longer uses it.
  if (parsed.username || parsed.password) {
    throw new Error('EXPO_PUBLIC_API_URL must not contain embedded credentials');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('EXPO_PUBLIC_API_URL must not contain a query string or fragment');
  }

  const path = parsed.pathname.replace(/\/+$/, '');
  const configuredRoot = `${parsed.protocol}//${parsed.host}`;
  const fullConfigured = `${configuredRoot}${path}`;
  const apiV1BaseUrl = normalizeApiV1BaseUrl(fullConfigured);
  const backendOrigin = normalizeBackendOrigin(configuredRoot);

  return {
    apiV1BaseUrl,
    backendOrigin,
    realtimeBaseUrl: apiV1BaseUrl,
  };
}

export function getRideXApiV1Url(apiUrl?: string): string {
  return getRideXMobileApiConfig(apiUrl).apiV1BaseUrl;
}

export function buildRideXApiPath(
  path: string,
  apiUrl?: string,
): string {
  const base = getRideXApiV1Url(apiUrl);
  return `${base}/${path.replace(/^\/+/, '')}`;
}
