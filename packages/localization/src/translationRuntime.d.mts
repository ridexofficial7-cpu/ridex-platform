import type { RideXSupportedLocale } from './localeResolver.mjs';
export type RideXTranslationSource = 'REQUESTED_LOCALE' | 'ENGLISH_FALLBACK' | 'CALLER_FALLBACK' | 'GENERIC_FALLBACK';
export interface RideXTranslationResolution {
  readonly text: string;
  readonly requestedLocale: RideXSupportedLocale;
  readonly resolvedLocale: RideXSupportedLocale | null;
  readonly source: RideXTranslationSource;
  readonly translationFound: boolean;
}
export type RideXDictionary = Readonly<Record<string, unknown>>;
export type RideXDictionarySet = Readonly<Partial<Record<RideXSupportedLocale, RideXDictionary>>>;
export interface RideXTranslationOptions {
  locale?: unknown;
  key?: unknown;
  dictionaries?: RideXDictionarySet;
  fallbackText?: string;
  genericFallback?: string;
}
export declare const RIDEX_GENERIC_MISSING_TRANSLATION: 'Text unavailable';
export declare const RIDEX_TRANSLATION_FALLBACK_LOCALE: 'en-IN';
export declare function resolveRideXTranslation(options?: RideXTranslationOptions): RideXTranslationResolution;
export declare function translateRideXText(options?: RideXTranslationOptions): string;
export interface RideXTranslationAdapter {
  resolve(key: unknown, fallbackText?: string): RideXTranslationResolution;
  t(key: unknown, fallbackText?: string): string;
  has(key: unknown): boolean;
}
export declare function createRideXTranslationAdapter(options?: { getLocale?: () => unknown; dictionaries?: RideXDictionarySet; genericFallback?: string }): RideXTranslationAdapter;
