import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import enIN from "../locales/en-IN.json";
import hiIN from "../locales/hi-IN.json";
import { getSavedLanguage, LANGUAGE_STORAGE_KEY, saveSharedLanguagePreference } from "./languagePreference";
import { APP_ENVIRONMENT, APP_VERSION, DEBUG_ENABLED } from "./runtimeConfig";
import { getSelectedEnvironment } from "./environmentSelection";
import { resolveRideXTranslation } from "../../../../packages/localization/src/translationRuntime.mjs";
import { createRideXMissingKeyReporter } from "../../../../packages/localization/src/localizationDiagnostics.mjs";
import { formatRideXCurrency, formatRideXDate, formatRideXDateTime, formatRideXNumber, interpolateRideXText, translateRideXPlural } from "../../../../packages/localization/src/dynamicFormatting.mjs";
import type { RideXCurrencyFormatOptions, RideXDateFormatOptions, RideXNumberFormatOptions } from "../../../../packages/localization/src/dynamicFormatting.mjs";

export type Language = "en-IN" | "hi-IN";
const DICTIONARIES: Record<Language, Record<string, string>> = {
  "en-IN": enIN as Record<string, string>,
  "hi-IN": hiIN as Record<string, string>,
};

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, fallback?: string, values?: Record<string, string | number | boolean | null | undefined>) => string;
  plural: (key: string, count: number, fallback?: string, values?: Record<string, string | number | boolean | null | undefined>) => string;
  formatNumber: (value: number, options?: Omit<RideXNumberFormatOptions, 'locale'>) => string;
  formatCurrency: (value: number, options: Omit<RideXCurrencyFormatOptions, 'locale'> & { currency: string }) => string;
  formatDate: (value: Date | string | number, options?: Omit<RideXDateFormatOptions, 'locale'>) => string;
  formatDateTime: (value: Date | string | number, options?: Omit<RideXDateFormatOptions, 'locale'>) => string;
};
const LanguageContext = createContext<LanguageContextValue | null>(null);
const missingKeyReporter = createRideXMissingKeyReporter({
  environment: APP_ENVIRONMENT,
  debugEnabled: DEBUG_ENABLED,
  build: APP_VERSION,
  logger: { warn: (message, metadata) => console.warn(message, metadata) },
});

function humanizeMissingKey(key: string): string {
  const parts = key.split(/[.:/]/).filter(Boolean);
  const tail = parts[parts.length - 1] || "Label";
  return tail
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Label";
}

function safeMissingKeyText(key: string): string {
  return humanizeMissingKey(key);
}

function readSavedLanguage(): Language {
  return getSavedLanguage();
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readSavedLanguage);
  const setLanguage = (next: Language) => {
    if (next !== "en-IN" && next !== "hi-IN") return;
    // Persist synchronously so requests dispatched immediately after a selection
    // use the newly selected Accept-Language value, while local UI remains usable
    // if browser storage is blocked.
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // Keep the UI selection usable if scoped browser storage is blocked.
    }
    saveSharedLanguagePreference(next);
    setLanguageState(next);
  };

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
      // en-IN and hi-IN are the only selectable locales; both use LTR layout.
      document.documentElement.dir = "ltr";
    }
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    t: (key, fallback, values) => {
      const safeFallback = fallback || safeMissingKeyText(key);
      const resolved = resolveRideXTranslation({
        locale: language,
        key,
        dictionaries: DICTIONARIES,
        fallbackText: safeFallback,
      });
      let text = resolved.translationFound ? resolved.text : (fallback ? resolved.text : safeMissingKeyText(key));
      if (!resolved.translationFound && !fallback && getSelectedEnvironment() === "TEST" && DEBUG_ENABLED) {
        // The shared reporter is opt-in, deduplicated, bounded, and TEST-only.
        // It logs only a validated key identifier, locale and build ID—not copy or values.
        missingKeyReporter.reportMissing({ key, locale: language });
      }
      if (values) text = interpolateRideXText(text, values);
      return text;
    },
    plural: (key, count, fallback, values) => translateRideXPlural({ locale: language, key, count, dictionaries: DICTIONARIES, fallbackText: fallback || humanizeMissingKey(key), values }),
    formatNumber: (value, options: Omit<RideXNumberFormatOptions, 'locale'> = {}) => formatRideXNumber(value, { ...options, locale: language }),
    formatCurrency: (value, options: Omit<RideXCurrencyFormatOptions, 'locale'> & { currency: string }) => formatRideXCurrency(value, { ...options, locale: language }),
    formatDate: (value, options: Omit<RideXDateFormatOptions, 'locale'> = {}) => formatRideXDate(value, { ...options, locale: language }),
    formatDateTime: (value, options: Omit<RideXDateFormatOptions, 'locale'> = {}) => formatRideXDateTime(value, { ...options, locale: language }),
  }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider.");
  return value;
}

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, t } = useLanguage();
  return <label className={`rx-language-control${compact ? " compact" : ""}`}>
    <span className="rx-sr-only">{t("common.language", "Language")}</span>
    <select
      className="rx-language-select"
      aria-label={t("common.language", "Language")}
      value={language}
      onChange={(event) => setLanguage(event.target.value as Language)}
    >
      <option value="en-IN">English</option>
      <option value="hi-IN">हिन्दी</option>
    </select>
  </label>;
}
