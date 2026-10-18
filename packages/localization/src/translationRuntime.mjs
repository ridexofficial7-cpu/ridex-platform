/**
 * Shared, dependency-free RideX translation lookup interface.
 *
 * Catalogs remain surface-specific until the canonical key map is reconciled. This module
 * only defines stable lookup/fallback behavior; interpolation and formatting belong to the
 * later dynamic-text step. It never returns an internal key as user-visible copy.
 */
import { normalizeExplicitRideXLocale } from './localeResolver.mjs';

export const RIDEX_GENERIC_MISSING_TRANSLATION = 'Text unavailable';
export const RIDEX_TRANSLATION_FALLBACK_LOCALE = 'en-IN';
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function lookupString(dictionary, key) {
  if (!dictionary || typeof dictionary !== 'object' || typeof key !== 'string' || !key.trim()) return undefined;
  if (Object.prototype.hasOwnProperty.call(dictionary, key) && typeof dictionary[key] === 'string' && dictionary[key].trim()) {
    return dictionary[key];
  }
  const segments = key.split('.');
  if (segments.some(part => !part || FORBIDDEN_SEGMENTS.has(part))) return undefined;
  let current = dictionary;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = current[segment];
  }
  return typeof current === 'string' && current.trim() ? current : undefined;
}

function safeFallbackText(candidate, key, genericFallback) {
  if (typeof candidate === 'string' && candidate.trim() && candidate.trim() !== key) return candidate;
  if (typeof genericFallback === 'string' && genericFallback.trim() && genericFallback.trim() !== key) return genericFallback;
  return RIDEX_GENERIC_MISSING_TRANSLATION;
}

/** Resolve one key against the selected catalog, then en-IN, then safe display copy. */
export function resolveRideXTranslation({ locale, key, dictionaries, fallbackText, genericFallback } = {}) {
  const requestedLocale = normalizeExplicitRideXLocale(locale) ?? RIDEX_TRANSLATION_FALLBACK_LOCALE;
  const safeKey = typeof key === 'string' ? key : '';
  const catalogs = dictionaries && typeof dictionaries === 'object' ? dictionaries : {};
  const selected = lookupString(catalogs[requestedLocale], safeKey);
  if (selected !== undefined) {
    return Object.freeze({ text: selected, requestedLocale, resolvedLocale: requestedLocale, source: 'REQUESTED_LOCALE', translationFound: true });
  }
  if (requestedLocale !== RIDEX_TRANSLATION_FALLBACK_LOCALE) {
    const english = lookupString(catalogs[RIDEX_TRANSLATION_FALLBACK_LOCALE], safeKey);
    if (english !== undefined) {
      return Object.freeze({ text: english, requestedLocale, resolvedLocale: RIDEX_TRANSLATION_FALLBACK_LOCALE, source: 'ENGLISH_FALLBACK', translationFound: true });
    }
  }
  return Object.freeze({
    text: safeFallbackText(fallbackText, safeKey, genericFallback),
    requestedLocale,
    resolvedLocale: null,
    source: typeof fallbackText === 'string' && fallbackText.trim() && fallbackText.trim() !== safeKey ? 'CALLER_FALLBACK' : 'GENERIC_FALLBACK',
    translationFound: false
  });
}

export function translateRideXText(options = {}) {
  return resolveRideXTranslation(options).text;
}

export function createRideXTranslationAdapter({ getLocale, dictionaries, genericFallback } = {}) {
  const catalogs = dictionaries && typeof dictionaries === 'object' ? dictionaries : {};
  const getCurrentLocale = typeof getLocale === 'function' ? getLocale : () => RIDEX_TRANSLATION_FALLBACK_LOCALE;
  const resolve = (key, fallbackText) => {
    let locale;
    try { locale = getCurrentLocale(); } catch { locale = RIDEX_TRANSLATION_FALLBACK_LOCALE; }
    return resolveRideXTranslation({ locale, key, dictionaries: catalogs, fallbackText, genericFallback });
  };
  return Object.freeze({
    resolve,
    t: (key, fallbackText) => resolve(key, fallbackText).text,
    has: (key) => resolve(key).translationFound
  });
}
