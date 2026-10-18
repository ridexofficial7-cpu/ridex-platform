/**
 * Dependency-injected local locale preference storage.
 *
 * Compatible with browser Storage-like objects and React Native AsyncStorage-like APIs.
 * The caller supplies the adapter; this module never reaches into global localStorage,
 * AsyncStorage, cookies, account APIs, or other application state directly.
 */
import { normalizeExplicitRideXLocale } from './localeResolver.mjs';

export const RIDEX_LOCALE_PREFERENCE_STORAGE_KEY = 'ridex.locale.preference.v1';

const isMethod = (value, name) => value && typeof value[name] === 'function';

function result(status, locale, diagnosticCode) {
  const output = { status };
  if (locale) output.locale = locale;
  if (diagnosticCode) output.diagnosticCode = diagnosticCode;
  return Object.freeze(output);
}

function validateAdapter(adapter) {
  return isMethod(adapter, 'getItem') && isMethod(adapter, 'setItem') && isMethod(adapter, 'removeItem');
}

/**
 * Create a local-preference store over a caller-supplied sync or async key/value adapter.
 * Methods are deliberately non-throwing: a denied/unavailable storage backend must not
 * prevent the UI from selecting and rendering the currently resolved locale.
 */
export function createRideXLocalePreferenceStore(adapter) {
  const adapterValid = validateAdapter(adapter);
  return Object.freeze({
    storageKey: RIDEX_LOCALE_PREFERENCE_STORAGE_KEY,

    async load() {
      if (!adapterValid) return result('STORAGE_UNAVAILABLE', undefined, 'LOCALE_STORAGE_ADAPTER_INVALID');
      let value;
      try {
        value = await adapter.getItem(RIDEX_LOCALE_PREFERENCE_STORAGE_KEY);
      } catch {
        return result('STORAGE_UNAVAILABLE', undefined, 'LOCALE_STORAGE_READ_FAILED');
      }
      if (value === null || value === undefined || value === '') return result('NOT_SET');
      const locale = normalizeExplicitRideXLocale(value);
      if (!locale) return result('INVALID_STORED_VALUE', undefined, 'LOCALE_STORAGE_VALUE_UNSUPPORTED');
      return result('LOADED', locale);
    },

    async save(candidate) {
      const locale = normalizeExplicitRideXLocale(candidate);
      if (!locale) return result('REJECTED', undefined, 'LOCALE_SELECTION_UNSUPPORTED');
      if (!adapterValid) return result('STORAGE_UNAVAILABLE', undefined, 'LOCALE_STORAGE_ADAPTER_INVALID');
      try {
        await adapter.setItem(RIDEX_LOCALE_PREFERENCE_STORAGE_KEY, locale);
        return result('SAVED', locale);
      } catch {
        return result('STORAGE_UNAVAILABLE', undefined, 'LOCALE_STORAGE_WRITE_FAILED');
      }
    },

    async clear() {
      if (!adapterValid) return result('STORAGE_UNAVAILABLE', undefined, 'LOCALE_STORAGE_ADAPTER_INVALID');
      try {
        await adapter.removeItem(RIDEX_LOCALE_PREFERENCE_STORAGE_KEY);
        return result('CLEARED');
      } catch {
        return result('STORAGE_UNAVAILABLE', undefined, 'LOCALE_STORAGE_CLEAR_FAILED');
      }
    }
  });
}
