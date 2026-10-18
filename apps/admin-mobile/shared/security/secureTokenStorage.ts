import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Stores native authentication bearer tokens in OS-backed secure storage.
 * Browser tokens are memory-only: persisting bearer tokens in browser storage
 * would expose them to any script running in the origin. A browser refresh
 * therefore requires a fresh authenticated session.
 * Legacy native AsyncStorage tokens are migrated on first read and removed only
 * after the secure write succeeds. SecureStore failures fail closed.
 */
const webTokens = new Map<string, string>();
const revokedWebTokens = new Set<string>();

// A durable tombstone prevents a failed/partial logout from allowing an old
// SecureStore value to be restored on the next app launch. The tombstone is
// cleared only after a new token has been stored successfully.
// A single-flight lock prevents parallel session restoration from racing the
// legacy-token migration (one caller could delete AsyncStorage before another
// caller has read the token from SecureStore).
const keyLocks = new Map<string, Promise<void>>();

async function withKeyLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = keyLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  keyLocks.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (keyLocks.get(key) === tail) keyLocks.delete(key);
  }
}

export async function getSecureToken(key: string): Promise<string | null> {
  if (!key.trim()) throw new Error("Secure token storage key is required");
  return withKeyLock(key, async () => {
    if (Platform.OS === "web") {
      // Remove tokens left by older builds that persisted bearer tokens in
      // AsyncStorage/localStorage. Do not read them back into active sessions.
      await AsyncStorage.removeItem(key);
      if (revokedWebTokens.has(key)) return null;
      return webTokens.get(key) ?? null;
    }

    const revoked = await SecureStore.getItemAsync(`${key}.logout-tombstone`);
    if (revoked === "1") return null;

    const secured = await SecureStore.getItemAsync(key);
    if (secured) {
      // If a prior release left a duplicate legacy copy behind, remove it once
      // the authoritative secure copy has been read successfully.
      await AsyncStorage.removeItem(key);
      return secured;
    }

    const legacy = await AsyncStorage.getItem(key);
    if (!legacy) return null;
    await SecureStore.setItemAsync(key, legacy, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    // Do not remove the legacy copy unless secure persistence succeeded.
    await AsyncStorage.removeItem(key);
    return legacy;
  });
}

export async function setSecureToken(key: string, token: string): Promise<void> {
  if (!key.trim()) throw new Error("Secure token storage key is required");
  if (!token.trim()) throw new Error("Refusing to store an empty authentication token");
  return withKeyLock(key, async () => {
    if (Platform.OS === "web") {
      // Remove any legacy persistent bearer token before exposing the new token
      // to the in-memory session. If cleanup fails, fail closed without storing it.
      await AsyncStorage.removeItem(key);
      webTokens.set(key, token);
      revokedWebTokens.delete(key);
      return;
    }
    await SecureStore.setItemAsync(key, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    await AsyncStorage.removeItem(key);
    // Clear logout protection last; if this fails, the token remains blocked.
    await SecureStore.deleteItemAsync(`${key}.logout-tombstone`);
  });
}

export async function removeSecureToken(key: string): Promise<void> {
  if (!key.trim()) throw new Error("Secure token storage key is required");
  return withKeyLock(key, async () => {
    webTokens.delete(key);
    if (Platform.OS === "web") {
      revokedWebTokens.add(key);
      await AsyncStorage.removeItem(key);
      return;
    }
    // Write a durable logout tombstone first. Even if deleting the token or
    // legacy copy fails afterward, reads fail closed instead of restoring it.
    await SecureStore.setItemAsync(`${key}.logout-tombstone`, "1", {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  });
}
