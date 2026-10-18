import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { ViewStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import enIN from './catalogs/mobile-runtime/en-IN.json';
import hiIN from './catalogs/mobile-runtime/hi-IN.json';
import { formatRideXCurrency, formatRideXDate, formatRideXDateTime, formatRideXNumber, interpolateRideXText, translateRideXPlural } from './dynamicFormatting.mjs';
import { createRideXMissingKeyReporter } from './localizationDiagnostics.mjs';
import { createRideXLocalePreferenceStore, RIDEX_LOCALE_PREFERENCE_STORAGE_KEY } from './localePreferenceStore.mjs';
import { normalizeExplicitRideXLocale, resolveRideXLocale } from './localeResolver.mjs';
import type { RideXCurrencyFormatOptions, RideXDateFormatOptions, RideXNumberFormatOptions } from './dynamicFormatting.mjs';

export type RideXMobileLocale = 'en-IN' | 'hi-IN';
export type RideXMobileLegacyPreference = {
  storageKey: string;
  valueMap: Readonly<Record<string, RideXMobileLocale>>;
};
type TextMap = Record<string, unknown>;
type TextValues = Record<string, string | number | boolean | null | undefined>;
type RideXMobileLocaleContextValue = {
  locale: RideXMobileLocale;
  hydrated: boolean;
  setLocale: (locale: RideXMobileLocale) => void;
  toggleLocale: () => void;
  t: (key: string, fallback?: string, values?: TextValues) => string;
  plural: (key: string, count: number, fallback?: string, values?: TextValues) => string;
  formatNumber: (value: number, options?: Omit<RideXNumberFormatOptions, 'locale'>) => string;
  formatCurrency: (value: number, options: Omit<RideXCurrencyFormatOptions, 'locale'> & { currency: string }) => string;
  formatDate: (value: Date | string | number, options?: Omit<RideXDateFormatOptions, 'locale'>) => string;
  formatDateTime: (value: Date | string | number, options?: Omit<RideXDateFormatOptions, 'locale'>) => string;
};

const STORAGE_KEY = RIDEX_LOCALE_PREFERENCE_STORAGE_KEY;
const LEGACY_STORAGE_KEY = 'ridex.language.preference.v1';
const CATALOGS: Record<RideXMobileLocale, TextMap> = { 'en-IN': enIN as TextMap, 'hi-IN': hiIN as TextMap };
const LocaleContext = createContext<RideXMobileLocaleContextValue | null>(null);
const mobileMissingKeyReporter = createRideXMissingKeyReporter({
  environment: process.env.EXPO_PUBLIC_RIDEX_TEST_MODE === 'true' ? 'TEST' : 'LIVE',
  debugEnabled: process.env.EXPO_PUBLIC_RIDEX_I18N_DIAGNOSTICS === 'true',
  build: String(process.env.EXPO_PUBLIC_APP_VERSION ?? 'unknown'),
  logger: { warn: (message, metadata) => console.warn(message, metadata) },
});
const OWN = Object.prototype.hasOwnProperty;
const BLOCKED_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function supportedLocale(value: unknown): value is RideXMobileLocale {
  return value === 'en-IN' || value === 'hi-IN';
}
function lookup(dictionary: TextMap, key: string): string | undefined {
  if (!key || key.split('.').some(segment => !segment || BLOCKED_SEGMENTS.has(segment))) return undefined;
  if (OWN.call(dictionary, key) && typeof dictionary[key] === 'string' && String(dictionary[key]).trim()) return String(dictionary[key]);
  let current: unknown = dictionary;
  for (const segment of key.split('.')) {
    if (!current || typeof current !== 'object' || !OWN.call(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' && current.trim() ? current : undefined;
}
function interpolate(text: string, values?: TextValues): string | undefined {
  const names = [...text.matchAll(/\{\{?([A-Za-z][A-Za-z0-9_]*)\}\}?/g)].map(match => match[1]);
  if (!names.length) return text;
  if (!values || names.some(name => !OWN.call(values, name) || values[name] === null || values[name] === undefined || !['string', 'number', 'boolean'].includes(typeof values[name]) || (typeof values[name] === 'number' && !Number.isFinite(values[name] as number)))) return undefined;
  return interpolateRideXText(text, values);
}

export function RideXMobileLocaleProvider({
  children,
  legacyPreference,
}: {
  children: React.ReactNode;
  legacyPreference?: RideXMobileLegacyPreference;
}) {
  const [locale, setLocaleState] = useState<RideXMobileLocale>('en-IN');
  const [hydrated, setHydrated] = useState(false);
  const generation = useRef(0);
  const persistenceQueue = useRef<Promise<void>>(Promise.resolve());
  const legacyPreferenceRead = useRef<{ key: string } | null>(null);
  const preferenceStore = useMemo(() => createRideXLocalePreferenceStore({
    async getItem(key: string) {
      const readGeneration = generation.current;
      const current = await AsyncStorage.getItem(key);
      if (current !== null || key !== STORAGE_KEY) return current;
      if (generation.current !== readGeneration) return null;

      // One-time compatibility read for installations using the earlier key.
      // The canonical preference is written before the legacy value is removed.
      const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
      if (generation.current !== readGeneration) return null;
      if (legacy !== null) {
        const normalized = normalizeExplicitRideXLocale(legacy);
        if (normalized) {
          legacyPreferenceRead.current = { key: LEGACY_STORAGE_KEY };
          return normalized;
        }
      }

      if (!legacyPreference) return null;
      const appLegacy = await AsyncStorage.getItem(legacyPreference.storageKey);
      if (
        generation.current !== readGeneration ||
        appLegacy === null ||
        !OWN.call(legacyPreference.valueMap, appLegacy)
      ) return null;

      legacyPreferenceRead.current = { key: legacyPreference.storageKey };
      return legacyPreference.valueMap[appLegacy];
    },
    setItem(key: string, value: string) {
      return AsyncStorage.setItem(key, value);
    },
    async removeItem(key: string) {
      await AsyncStorage.removeItem(key);
      if (key === STORAGE_KEY) await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
    },
  }), [legacyPreference]);

  const queuePreferenceSave = useCallback((next: RideXMobileLocale, selectionGeneration: number) => {
    persistenceQueue.current = persistenceQueue.current
      .catch(() => undefined)
      .then(async () => {
        if (selectionGeneration !== generation.current) return;
        const saved = await preferenceStore.save(next);
        if (
          selectionGeneration !== generation.current ||
          saved.status !== 'SAVED' ||
          saved.locale !== next
        ) return;

        const legacy = legacyPreferenceRead.current;
        if (legacy) {
          try {
            if (selectionGeneration !== generation.current) return;
            await AsyncStorage.removeItem(legacy.key);
            if (legacyPreferenceRead.current === legacy) {
              legacyPreferenceRead.current = null;
            }
          } catch {
            // Canonical preference is already durable; leaving a stale legacy key is harmless.
          }
        }
      })
      .catch(() => undefined);
  }, [preferenceStore]);

  useEffect(() => {
    let active = true;
    const startGeneration = generation.current;
    const deviceLocale = (() => {
      try { return Intl.DateTimeFormat().resolvedOptions().locale || undefined; }
      catch { return undefined; }
    })();

    void preferenceStore.load().then(stored => {
      if (!active || generation.current !== startGeneration) return;
      const resolution = resolveRideXLocale({
        localPreference: stored.status === 'LOADED' ? stored.locale : undefined,
        deviceLocales: deviceLocale ? [deviceLocale] : [],
      });
      if (!active || generation.current !== startGeneration) return;
      setLocaleState(resolution.locale);
      setHydrated(true);

      // Persist the first-launch device/fallback choice and migrate legacy keys.
      // A newer explicit selection always wins over this queued startup write.
      if (resolution.shouldPersistLocalPreference || legacyPreferenceRead.current) {
        queuePreferenceSave(resolution.locale, startGeneration);
      }
    }).catch(() => {
      if (active && generation.current === startGeneration) {
        setHydrated(true);
      }
    });
    return () => { active = false; };
  }, [preferenceStore, queuePreferenceSave]);

  const setLocale = useCallback((next: RideXMobileLocale) => {
    if (!supportedLocale(next)) return;
    const selectionGeneration = ++generation.current;
    setLocaleState(next); // Explicit selection applies synchronously to the UI.
    setHydrated(true);
    queuePreferenceSave(next, selectionGeneration);
  }, [queuePreferenceSave]);
  const toggleLocale = useCallback(() => setLocale(locale === 'en-IN' ? 'hi-IN' : 'en-IN'), [locale, setLocale]);
  const t = useCallback((key: string, fallback = 'Text unavailable', values?: TextValues) => {
    if (typeof key !== 'string' || !key.trim()) return fallback;
    const selected = lookup(CATALOGS[locale], key);
    const english = locale === 'en-IN' ? selected : lookup(CATALOGS['en-IN'], key);
    const candidate = selected ?? english;
    if (candidate) {
      const formatted = interpolate(candidate, values);
      if (formatted !== undefined) return formatted;
    } else {
      // Explicit TEST + debug opt-in only; never log copy, interpolation values, or payloads.
      mobileMissingKeyReporter.reportMissing({ key, locale });
    }
    // Never show raw internal keys or unresolved {{placeholders}} in visible UI.
    const safeFallback = typeof fallback === 'string' && fallback.trim() && fallback !== key ? fallback : 'Text unavailable';
    const fallbackFormatted = interpolate(safeFallback, values);
    return fallbackFormatted ?? 'Text unavailable';
  }, [locale]);
  const plural = useCallback((key: string, count: number, fallback?: string, values?: TextValues) => translateRideXPlural({ locale, key, count, dictionaries: CATALOGS, fallbackText: fallback, values }), [locale]);
  const formatNumber = useCallback((value: number, options: Omit<RideXNumberFormatOptions, 'locale'> = {}) => formatRideXNumber(value, { ...options, locale }), [locale]);
  const formatCurrency = useCallback((value: number, options: Omit<RideXCurrencyFormatOptions, 'locale'> & { currency: string }) => formatRideXCurrency(value, { ...options, locale }), [locale]);
  const formatDate = useCallback((value: Date | string | number, options: Omit<RideXDateFormatOptions, 'locale'> = {}) => formatRideXDate(value, { ...options, locale }), [locale]);
  const formatDateTime = useCallback((value: Date | string | number, options: Omit<RideXDateFormatOptions, 'locale'> = {}) => formatRideXDateTime(value, { ...options, locale }), [locale]);
  const value = useMemo(() => ({ locale, hydrated, setLocale, toggleLocale, t, plural, formatNumber, formatCurrency, formatDate, formatDateTime }), [locale, hydrated, setLocale, toggleLocale, t, plural, formatNumber, formatCurrency, formatDate, formatDateTime]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useRideXLocale(): RideXMobileLocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useRideXLocale must be used inside RideXMobileLocaleProvider');
  return value;
}

export function RideXLanguageToggle({ style }: { style?: ViewStyle }) {
  const { locale, toggleLocale } = useRideXLocale();
  const targetLabel = locale === 'en-IN' ? 'हिन्दी' : 'English';
  const accessibilityLabel = locale === 'en-IN' ? 'Switch language to Hindi' : 'भाषा English में बदलें';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={8} onPress={toggleLocale} style={[styles.toggle, style]}>
      <Text style={styles.toggleText}>{targetLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: { minWidth: 44, minHeight: 44, borderWidth: 1, borderColor: '#D0D5DD', backgroundColor: '#FFFFFF', borderRadius: 22, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  toggleText: { color: '#344054', fontSize: 12, fontWeight: '800' }
});
