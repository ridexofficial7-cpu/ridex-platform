import { getSelectedEnvironment } from "./environmentSelection";
import { APP_ENVIRONMENT } from "./runtimeConfig";
import { RIDEX_LOCALE_PREFERENCE_STORAGE_KEY } from "../../../../packages/localization/src/localePreferenceStore.mjs";

export type SupportedLanguage = "en-IN" | "hi-IN";
const selectedEnvironment = getSelectedEnvironment();
const BUILD_ENVIRONMENT_LANGUAGE_STORAGE_KEY = `ridex-admin-language:${APP_ENVIRONMENT.toLowerCase()}`;
const SELECTED_LANGUAGE_STORAGE_KEY = `ridex-admin-language:${getSelectedEnvironment().toLowerCase()}`;
export const LANGUAGE_STORAGE_KEY = selectedEnvironment === APP_ENVIRONMENT
  ? BUILD_ENVIRONMENT_LANGUAGE_STORAGE_KEY
  : SELECTED_LANGUAGE_STORAGE_KEY;
const SHARED_LANGUAGE_STORAGE_KEY = RIDEX_LOCALE_PREFERENCE_STORAGE_KEY;

function isSupportedLanguage(value: string | null): value is SupportedLanguage {
  return value === "en-IN" || value === "hi-IN";
}

export function saveSharedLanguagePreference(language: SupportedLanguage): void {
  if (!isSupportedLanguage(language)) return;
  try { localStorage.setItem(SHARED_LANGUAGE_STORAGE_KEY, language); } catch { /* shared preference is optional */ }
}

export function saveLanguagePreference(language: SupportedLanguage): void {
  if (!isSupportedLanguage(language)) return;
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch {
    // Continue to shared preference storage if the scoped key is unavailable.
  }
  saveSharedLanguagePreference(language);
}

export function getSavedLanguage(): SupportedLanguage {
  // The environment-specific preference takes precedence, so TEST and LIVE
  // can retain different selections.
  try {
    const scoped = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(scoped)) return scoped;
  } catch {
    // Try the shared preference if scoped storage is unavailable.
  }

  try {
    const shared = localStorage.getItem(SHARED_LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(shared)) {
      saveLanguagePreference(shared);
      return shared;
    }
  } catch {
    // Fall through to the browser language.
  }

  try {
    return navigator.language.toLowerCase().startsWith("hi") ? "hi-IN" : "en-IN";
  } catch {
    return "en-IN";
  }
}

export function getAcceptLanguageHeader(): string {
  return getSavedLanguage() === "hi-IN"
    ? "hi-IN,hi;q=0.9,en-IN;q=0.8,en;q=0.7"
    : "en-IN,en;q=0.9";
}
