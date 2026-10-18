import type { RideXSupportedLocale } from './localeResolver.mjs';
export type LocalePreferenceStorageStatus = 'SAVED' | 'LOADED' | 'NOT_SET' | 'CLEARED' | 'REJECTED' | 'INVALID_STORED_VALUE' | 'STORAGE_UNAVAILABLE';
export type LocalePreferenceStorageDiagnostic =
 | 'LOCALE_STORAGE_ADAPTER_INVALID'
 | 'LOCALE_STORAGE_READ_FAILED'
 | 'LOCALE_STORAGE_VALUE_UNSUPPORTED'
 | 'LOCALE_SELECTION_UNSUPPORTED'
 | 'LOCALE_STORAGE_WRITE_FAILED'
 | 'LOCALE_STORAGE_CLEAR_FAILED';
export interface LocalePreferenceStorageAdapter {
  getItem(key: string): string | null | undefined | Promise<string | null | undefined>;
  setItem(key: string, value: string): unknown | Promise<unknown>;
  removeItem(key: string): unknown | Promise<unknown>;
}
export interface LocalePreferenceStorageResult {
  readonly status: LocalePreferenceStorageStatus;
  readonly locale?: RideXSupportedLocale;
  /** Fixed diagnostic code only; never includes raw stored values or user/account data. */
  readonly diagnosticCode?: LocalePreferenceStorageDiagnostic;
}
export interface RideXLocalePreferenceStore {
  readonly storageKey: string;
  load(): Promise<LocalePreferenceStorageResult>;
  save(candidate: unknown): Promise<LocalePreferenceStorageResult>;
  clear(): Promise<LocalePreferenceStorageResult>;
}
export declare const RIDEX_LOCALE_PREFERENCE_STORAGE_KEY: 'ridex.locale.preference.v1';
export declare function createRideXLocalePreferenceStore(adapter: LocalePreferenceStorageAdapter | unknown): RideXLocalePreferenceStore;
