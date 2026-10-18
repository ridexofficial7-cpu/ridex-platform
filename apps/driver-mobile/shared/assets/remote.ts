
export type RideXRemoteAsset = {
  id: string;
  appTarget: 'CUSTOMER' | 'DRIVER' | 'SHARED' | string;
  screenKey: string;
  sectionKey: string | null;
  placementKey: string | null;
  assetKey: string;
  name: string;
  scopeType: string;
  stateId: string | null;
  cityId: string | null;
  version: number;
  active: boolean;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  cacheKey: string;
  versionUpdatedAt: string | null;
  downloadUrlExpiresAt: string | null;
  urlRequiresAuth: boolean;
  cachedUri?: string;
};

export type RideXRemoteAssetImageSource = {
  uri: string;
  headers?: Record<string, string>;
};

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeAsset(value: unknown): RideXRemoteAsset | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const appTarget = asString(row.appTarget);
  const screenKey = asString(row.screenKey);
  const assetKey = asString(row.assetKey);
  const url = asString(row.url);
  if (!id || !appTarget || !screenKey || !assetKey || !url) return null;

  return {
    id,
    appTarget,
    screenKey,
    sectionKey: asString(row.sectionKey),
    placementKey: asString(row.placementKey),
    assetKey,
    name: asString(row.name) || assetKey,
    scopeType: asString(row.scopeType) || 'GLOBAL',
    stateId: asString(row.stateId),
    cityId: asString(row.cityId),
    version: Math.max(1, Math.trunc(Number(row.version) || 1)),
    active: row.active !== false,
    url,
    mimeType: asString(row.mimeType),
    sizeBytes: asNullableNumber(row.sizeBytes),
    checksum: asString(row.checksum),
    cacheKey: asString(row.cacheKey) || `${appTarget}:${assetKey}:${Number(row.version) || 1}`,
    versionUpdatedAt: asString(row.versionUpdatedAt),
    downloadUrlExpiresAt: asString(row.downloadUrlExpiresAt),
    urlRequiresAuth: row.urlRequiresAuth === true,
    cachedUri: asString(row.cachedUri) ?? undefined,
  };
}

export function normalizeRideXRemoteAssetManifest(body: unknown): RideXRemoteAsset[] {
  if (!body || typeof body !== 'object') return [];
  const root = body as Record<string, unknown>;
  const payload = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : null;
  const rows = payload && Array.isArray(payload.assets) ? payload.assets : Array.isArray(root.data) ? root.data : [];
  return rows.map(normalizeAsset).filter((asset): asset is RideXRemoteAsset => Boolean(asset));
}

export async function fetchRideXRemoteAssets(
  fetcher: (input: string, init?: RequestInit) => Promise<Response>,
  target: 'CUSTOMER' | 'DRIVER' | 'SHARED',
  options: { screenKey?: string; placementKey?: string } = {},
): Promise<RideXRemoteAsset[]> {
  const params = new URLSearchParams({ appTarget: target });
  if (options.screenKey) params.set('screenKey', options.screenKey);
  if (options.placementKey) params.set('placementKey', options.placementKey);

  const response = await fetcher(`/assets?${params.toString()}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) {
    throw new Error(String(body?.message || `Unable to load ${target} assets`));
  }
  return normalizeRideXRemoteAssetManifest(body);
}

export function isRemoteAssetImage(asset: RideXRemoteAsset | null | undefined): boolean {
  if (!asset?.url) return false;
  if (String(asset.mimeType || '').toLowerCase().startsWith('image/')) return true;
  return /\.(?:png|jpe?g|webp|gif|avif)(?:\?|#|$)/i.test(asset.url);
}

export function makeRideXRemoteImageSource(
  asset: RideXRemoteAsset | null | undefined,
  authToken?: string | null,
  apiUrl?: string | null,
): RideXRemoteAssetImageSource | null {
  const cached = asString(asset?.cachedUri);
  if (cached) return { uri: cached };
  if (!asset?.url || !isRemoteAssetImage(asset)) return null;

  const token = String(authToken || '').trim();
  const apiBase = String(apiUrl || '').trim().replace(/\/+$/, '');
  const isRideXBackendDownload = asset.urlRequiresAuth || Boolean(apiBase && asset.url.startsWith(`${apiBase}/`));
  if (token && (asset.url.startsWith('/') || isRideXBackendDownload)) {
    return { uri: asset.url, headers: { Authorization: `Bearer ${token}` } };
  }

  return { uri: asset.url };
}

function normalizedKey(value: string | null | undefined): string {
  return String(value || '').trim().toUpperCase();
}


export function chooseCustomerDisplayAsset(
  assets: RideXRemoteAsset[],
): RideXRemoteAsset | null {
  const candidates = assets.filter((asset) => {
    if (!isRemoteAssetImage(asset)) return false;
    const target = normalizedKey(asset.appTarget);
    if (target !== 'CUSTOMER' && target !== 'SHARED') return false;
    const screen = normalizedKey(asset.screenKey);
    const placement = normalizedKey(asset.placementKey);
    const section = normalizedKey(asset.sectionKey);
    const key = normalizedKey(asset.assetKey);
    const haystack = `${screen} ${placement} ${section} ${key}`;
    return haystack.includes('DISPLAY') || haystack.includes('UNTOUCHABLE') || haystack.includes('AD');
  });
  if (!candidates.length) return null;

  return (
    candidates.find((asset) => normalizedKey(asset.appTarget) === 'CUSTOMER') ||
    candidates.find((asset) => normalizedKey(asset.appTarget) === 'SHARED') ||
    candidates[0]
  );
}

export function chooseDriverDisplayAsset(
  assets: RideXRemoteAsset[],
): RideXRemoteAsset | null {
  const candidates = assets.filter((asset) => {
    if (!isRemoteAssetImage(asset)) return false;
    const target = normalizedKey(asset.appTarget);
    if (target !== 'DRIVER' && target !== 'SHARED') return false;
    const screen = normalizedKey(asset.screenKey);
    const placement = normalizedKey(asset.placementKey);
    const section = normalizedKey(asset.sectionKey);
    const key = normalizedKey(asset.assetKey);
    const haystack = `${screen} ${placement} ${section} ${key}`;
    return haystack.includes('DISPLAY') || haystack.includes('UNTOUCHABLE') || haystack.includes('AD');
  });
  if (!candidates.length) return null;

  return (
    candidates.find((asset) => normalizedKey(asset.appTarget) === 'DRIVER') ||
    candidates.find((asset) => normalizedKey(asset.appTarget) === 'SHARED') ||
    candidates[0]
  );
}

export function chooseCustomerHomeAsset(
  assets: RideXRemoteAsset[],
): RideXRemoteAsset | null {
  const home = assets.filter((asset) => normalizedKey(asset.screenKey) === 'HOME' && isRemoteAssetImage(asset));
  if (!home.length) return null;

  const preferred = home.find((asset) => {
    const placement = normalizedKey(asset.placementKey);
    const section = normalizedKey(asset.sectionKey);
    const key = normalizedKey(asset.assetKey);
    return [placement, section, key].some((value) =>
      value.includes('PROMO') || value.includes('HERO') || value.includes('BANNER') || value.includes('DISPLAY'),
    );
  });

  return preferred || home[0];
}
export function chooseDriverHomeAsset(
  assets: RideXRemoteAsset[],
): RideXRemoteAsset | null {
  const eligible = assets.filter((asset) => {
    if (!isRemoteAssetImage(asset)) return false;
    const target = normalizedKey(asset.appTarget);
    return target === 'DRIVER' || target === 'SHARED';
  });
  if (!eligible.length) return null;

  const home = eligible.filter((asset) => normalizedKey(asset.screenKey) === 'HOME');
  const preferred = home.find((asset) => {
    const placement = normalizedKey(asset.placementKey);
    const section = normalizedKey(asset.sectionKey);
    const key = normalizedKey(asset.assetKey);
    return [placement, section, key].some((value) =>
      value.includes('PROMO') || value.includes('HERO') || value.includes('BANNER') || value.includes('DISPLAY'),
    );
  });

  return (
    preferred ||
    home.find((asset) => normalizedKey(asset.appTarget) === 'DRIVER') ||
    home.find((asset) => normalizedKey(asset.appTarget) === 'SHARED') ||
    eligible.find((asset) => normalizedKey(asset.appTarget) === 'DRIVER') ||
    eligible[0]
  );
}

