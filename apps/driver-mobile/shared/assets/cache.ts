import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { RideXRemoteAsset } from './remote';
import { makeRideXRemoteImageSource, normalizeRideXRemoteAssetManifest, isRemoteAssetImage } from './remote';

export type RideXAssetCacheRole = 'CUSTOMER' | 'DRIVER' | 'ADMIN';
export type RideXAssetTarget = 'CUSTOMER' | 'DRIVER' | 'SHARED';

const CACHE_SCHEMA = 2;
const MEMORY = new Map<string, RideXRemoteAsset[]>();

function envKey(): string {
  return String(process.env.EXPO_PUBLIC_RIDEX_TEST_MODE ?? 'false').toLowerCase() === 'true' ? 'TEST' : 'LIVE';
}

function safe(value: string): string {
  return String(value || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'unknown';
}

function cacheKey(role: RideXAssetCacheRole, target: RideXAssetTarget, actorId: string): string {
  return `ridex_asset_manifest_v${CACHE_SCHEMA}:${envKey()}:${role}:${target}:${safe(actorId)}`;
}

function directoryFor(target: RideXAssetTarget): string | null {
  const root = FileSystem.cacheDirectory;
  if (!root) return null;
  return `${root}ridex-assets-v2/${envKey()}/${target}/`;
}

function extension(asset: RideXRemoteAsset): string {
  const mime = String(asset.mimeType || '').toLowerCase();
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/jpeg') return 'jpg';
  const file = String(asset.name || '').split(/[?#]/)[0];
  const match = file.match(/\.([a-z0-9]{2,5})$/i);
  return match?.[1]?.toLowerCase() || 'bin';
}

function fileUri(asset: RideXRemoteAsset, target: RideXAssetTarget): string | null {
  const dir = directoryFor(target);
  if (!dir) return null;
  const fingerprint = safe(asset.checksum || `v${asset.version}`);
  return `${dir}${safe(asset.id)}-${asset.version}-${fingerprint}.${extension(asset)}`;
}

async function exists(uri: string | null): Promise<boolean> {
  if (!uri) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return Boolean(info.exists);
  } catch {
    return false;
  }
}

async function ensureDirectory(target: RideXAssetTarget): Promise<void> {
  const dir = directoryFor(target);
  if (!dir) return;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // Directory may already exist.
  }
}

async function downloadAsset(asset: RideXRemoteAsset, target: RideXAssetTarget, authToken?: string): Promise<string | null> {
  if (!asset.url || !isRemoteAssetImage(asset)) return null;
  const destination = fileUri(asset, target);
  if (!destination) return null;
  if (await exists(destination)) return destination;

  try {
    await ensureDirectory(target);
    const source = makeRideXRemoteImageSource(asset, authToken);
    const headers = asset.urlRequiresAuth && authToken
      ? { Authorization: `Bearer ${authToken}` }
      : (source?.headers || {});
    const result = await FileSystem.downloadAsync(asset.url, destination, { headers });
    const finalUri = String(result?.uri || destination);
    return (await exists(finalUri)) ? finalUri : null;
  } catch {
    return null;
  }
}

function withCachedUri(asset: RideXRemoteAsset, uri: string | null): RideXRemoteAsset {
  return uri ? { ...asset, cachedUri: uri } : { ...asset, cachedUri: undefined } as RideXRemoteAsset;
}

export async function getCachedRideXAssetManifest(
  role: RideXAssetCacheRole,
  target: RideXAssetTarget,
  actorId: string,
): Promise<RideXRemoteAsset[]> {
  const key = cacheKey(role, target, actorId);
  const memory = MEMORY.get(key);
  if (memory) return memory;

  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed?.schema !== CACHE_SCHEMA || !Array.isArray(parsed?.assets)) return [];
    const assets = normalizeRideXRemoteAssetManifest({ data: parsed.assets }).map((asset) => {
      const localUri = parsed.assets.find((row: any) => String(row?.id) === asset.id && Number(row?.version) === asset.version)?.cachedUri;
      return withCachedUri(asset, localUri || null);
    });
    MEMORY.set(key, assets);
    return assets;
  } catch {
    return [];
  }
}

export async function syncRideXAssetCache(
  role: RideXAssetCacheRole,
  target: RideXAssetTarget,
  actorId: string,
  fetcher: (input: string, init?: RequestInit) => Promise<Response>,
  authToken?: string,
): Promise<RideXRemoteAsset[]> {
  const key = cacheKey(role, target, actorId);
  const response = await fetcher(`/assets?appTarget=${encodeURIComponent(target)}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) {
    throw new Error(String(body?.message || `Unable to load ${target} assets`));
  }

  const assets = normalizeRideXRemoteAssetManifest(body);
  const hydrated = await Promise.all(assets.map(async (asset) => {
    const uri = await downloadAsset(asset, target, authToken);
    return withCachedUri(asset, uri);
  }));

  const payload = {
    schema: CACHE_SCHEMA,
    role,
    target,
    environment: envKey(),
    actorId,
    updatedAt: new Date().toISOString(),
    assets: hydrated.map((asset) => ({ ...asset })),
  };
  await AsyncStorage.setItem(key, JSON.stringify(payload));
  MEMORY.set(key, hydrated);
  return hydrated;
}

export async function invalidateRideXAssetCache(
  role: RideXAssetCacheRole,
  target: RideXAssetTarget,
  actorId: string,
): Promise<void> {
  const key = cacheKey(role, target, actorId);
  MEMORY.delete(key);
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Best-effort invalidation only.
  }
}
