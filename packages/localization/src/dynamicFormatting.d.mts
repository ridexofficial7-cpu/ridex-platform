import type { RideXSupportedLocale } from './localeResolver.mjs';
import type { RideXDictionarySet, RideXTranslationResolution } from './translationRuntime.mjs';
export declare const RIDEX_FORMAT_UNAVAILABLE: '—';
export interface RideXNumberFormatOptions {
  locale?: RideXSupportedLocale | string; useGrouping?: boolean;
  minimumIntegerDigits?: number; minimumFractionDigits?: number; maximumFractionDigits?: number;
  minimumSignificantDigits?: number; maximumSignificantDigits?: number;
  notation?: 'standard' | 'scientific' | 'engineering' | 'compact'; compactDisplay?: 'short' | 'long';
  signDisplay?: 'auto' | 'always' | 'exceptZero' | 'negative' | 'never';
}
export interface RideXCurrencyFormatOptions extends RideXNumberFormatOptions {
  /** Required; the formatter never chooses currency/business rules for the caller. */
  currency?: string; currencyDisplay?: 'symbol' | 'narrowSymbol' | 'code' | 'name'; currencySign?: 'standard' | 'accounting';
}
export interface RideXDateFormatOptions {
  locale?: RideXSupportedLocale | string; dateStyle?: 'full' | 'long' | 'medium' | 'short'; timeStyle?: 'full' | 'long' | 'medium' | 'short';
  weekday?: 'long' | 'short' | 'narrow'; era?: 'long' | 'short' | 'narrow'; year?: 'numeric' | '2-digit';
  month?: 'numeric' | '2-digit' | 'long' | 'short' | 'narrow'; day?: 'numeric' | '2-digit'; dayPeriod?: 'narrow' | 'short' | 'long';
  hour?: 'numeric' | '2-digit'; minute?: 'numeric' | '2-digit'; second?: 'numeric' | '2-digit';
  timeZoneName?: 'long' | 'short' | 'shortOffset' | 'longOffset' | 'shortGeneric' | 'longGeneric'; hour12?: boolean;
  /** Explicit only; if omitted, platform-local timezone is used. */ timeZone?: string;
}
export interface RideXDynamicTranslationOptions {
  locale?: RideXSupportedLocale | string; key?: string; dictionaries?: RideXDictionarySet; fallbackText?: string; genericFallback?: string;
  values?: Readonly<Record<string, string | number | boolean | null | undefined>>; missingValue?: string;
}
export declare function formatRideXNumber(value: number, options?: RideXNumberFormatOptions): string;
export declare function formatRideXCurrency(value: number, options?: RideXCurrencyFormatOptions): string;
export declare function formatRideXDate(value: Date | string | number, options?: RideXDateFormatOptions): string;
export declare function formatRideXDateTime(value: Date | string | number, options?: RideXDateFormatOptions): string;
export declare function getRideXPluralCategory(count: number, options?: { locale?: RideXSupportedLocale | string; type?: 'cardinal' | 'ordinal' }): string | undefined;
export declare function interpolateRideXText(template: string, values?: Readonly<Record<string, string | number | boolean | null | undefined>>, options?: { missingValue?: string }): string;
export declare function formatRideXMessage(options?: RideXDynamicTranslationOptions): RideXTranslationResolution & { readonly text: string };
export declare function resolveRideXPluralTranslation(options?: RideXDynamicTranslationOptions & { count?: number; type?: 'cardinal' | 'ordinal' }): Readonly<{
  text: string; requestedLocale: RideXSupportedLocale; resolvedLocale: RideXSupportedLocale | null;
  source: 'REQUESTED_LOCALE' | 'ENGLISH_FALLBACK' | 'CALLER_FALLBACK' | 'GENERIC_FALLBACK';
  translationFound: boolean; pluralCategory: string | null; resolvedKey: string | null;
}>;
export declare function translateRideXPlural(options?: RideXDynamicTranslationOptions & { count?: number; type?: 'cardinal' | 'ordinal' }): string;
