import type { Screen } from "../types";

const TOKEN_KEY = "ridex-admin-token";
const SCREEN_KEY = "ridex-admin-screen";
const DEVICE_KEY = "ridex-admin-device";

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ridex-web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function browserStorage(kind: "local" | "session"): Storage | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return undefined;
  }
}
function getSafe(store: Storage | undefined, key: string): string | null {
  try { return store?.getItem(key) ?? null; } catch { return null; }
}
function setSafe(store: Storage | undefined, key: string, value: string): void {
  try {
    if (!store) return;
    if (value) store.setItem(key, value); else store.removeItem(key);
  } catch {
    // Private browsing or storage quotas must not crash the Admin UI.
  }
}

export const storage = {
  get token() { return getSafe(browserStorage("session"), TOKEN_KEY) ?? ""; },
  set token(value: string) { setSafe(browserStorage("session"), TOKEN_KEY, value); },
  get screen(): Screen {
    const value = getSafe(browserStorage("session"), SCREEN_KEY);
    // Never restore a free-form value into typed navigation state; App filters it against authorization.
    return (value as Screen | null) ?? "dashboard";
  },
  set screen(value: Screen) { setSafe(browserStorage("session"), SCREEN_KEY, value); },
  get deviceId() {
    const store = browserStorage("local");
    let value = getSafe(store, DEVICE_KEY);
    if (!value) {
      value = newId();
      setSafe(store, DEVICE_KEY, value);
    }
    return value ?? "";
  },
};
