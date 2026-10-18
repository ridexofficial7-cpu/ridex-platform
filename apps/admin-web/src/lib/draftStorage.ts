import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * Keeps non-secret, in-progress Admin form drafts through a browser refresh.
 * Drafts are scoped to the current tab/session and should never be used for
 * passwords, OTPs, tokens, provider secrets, or high-risk confirmation text.
 */
export function useSessionDraft<T>(key: string, initialValue: T, enabled = true): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (!enabled) return initialValue;
    try {
      const saved = sessionStorage.getItem(key);
      if (saved !== null) return JSON.parse(saved) as T;
    } catch {
      // Storage can be disabled or contain an older incompatible draft.
    }
    return initialValue;
  });

  useEffect(() => {
    if (!enabled) {
      try { sessionStorage.removeItem(key); } catch { /* Ignore unavailable storage. */ }
      return;
    }
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The form remains usable when storage quota/privacy settings block saves.
    }
  }, [key, value, enabled]);

  return [value, setValue];
}
