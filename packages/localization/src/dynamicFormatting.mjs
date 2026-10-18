/**
 * Shared locale-aware formatting for RideX user-visible dynamic text.
 *
 * Presentation-only helpers: this module does not set fares, currency, rounding policy,
 * transaction timezone, or financial business rules. Currency is explicit at each call.
 */
import { normalizeExplicitRideXLocale } from './localeResolver.mjs';
import { resolveRideXTranslation } from './translationRuntime.mjs';

export const RIDEX_FORMAT_UNAVAILABLE = '—';
const FALLBACK_LOCALE = 'en-IN';
const SAFE_CURRENCY_DISPLAY = new Set(['code', 'name', 'narrowSymbol', 'symbol']);
const SAFE_CURRENCY_SIGN = new Set(['accounting', 'standard']);
const SAFE_STYLES = new Set(['full', 'long', 'medium', 'short']);
const SAFE_NUMBER_NOTATION = new Set(['compact', 'engineering', 'scientific', 'standard']);
const SAFE_COMPACT_DISPLAY = new Set(['long', 'short']);
const SAFE_DATE_PARTS = Object.freeze({
  weekday: ['long', 'short', 'narrow'], era: ['long', 'short', 'narrow'],
  year: ['numeric', '2-digit'], month: ['numeric', '2-digit', 'long', 'short', 'narrow'],
  day: ['numeric', '2-digit'], dayPeriod: ['narrow', 'short', 'long'], hour: ['numeric', '2-digit'],
  minute: ['numeric', '2-digit'], second: ['numeric', '2-digit'],
  timeZoneName: ['long', 'short', 'shortOffset', 'longOffset', 'shortGeneric', 'longGeneric']
});

function localeOf(value) {
  return normalizeExplicitRideXLocale(value) ?? FALLBACK_LOCALE;
}
function finiteNumber(value) { return typeof value === 'number' && Number.isFinite(value); }
function copyIntegerOption(target, source, key, min = 0, max = 20) {
  if (source[key] === undefined) return;
  if (!Number.isInteger(source[key]) || source[key] < min || source[key] > max) throw new RangeError(`Invalid ${key}`);
  target[key] = source[key];
}
function numberOptions(options = {}, style) {
  const source = options && typeof options === 'object' ? options : {};
  const result = { useGrouping: source.useGrouping !== false };
  if (style) result.style = style;
  if (source.notation !== undefined) {
    if (!SAFE_NUMBER_NOTATION.has(source.notation)) throw new RangeError('Invalid notation');
    result.notation = source.notation;
  }
  if (source.compactDisplay !== undefined) {
    if (!SAFE_COMPACT_DISPLAY.has(source.compactDisplay)) throw new RangeError('Invalid compactDisplay');
    result.compactDisplay = source.compactDisplay;
  }
  copyIntegerOption(result, source, 'minimumIntegerDigits', 1, 21);
  copyIntegerOption(result, source, 'minimumFractionDigits', 0, 20);
  copyIntegerOption(result, source, 'maximumFractionDigits', 0, 20);
  copyIntegerOption(result, source, 'minimumSignificantDigits', 1, 21);
  copyIntegerOption(result, source, 'maximumSignificantDigits', 1, 21);
  if (source.signDisplay !== undefined) {
    if (!['auto', 'always', 'exceptZero', 'negative', 'never'].includes(source.signDisplay)) throw new RangeError('Invalid signDisplay');
    result.signDisplay = source.signDisplay;
  }
  return result;
}

/** Format a finite number using the selected RideX locale (en-IN/hi-IN). */
export function formatRideXNumber(value, options = {}) {
  if (!finiteNumber(value)) return RIDEX_FORMAT_UNAVAILABLE;
  try { return new Intl.NumberFormat(localeOf(options?.locale), numberOptions(options)).format(value); }
  catch { return RIDEX_FORMAT_UNAVAILABLE; }
}

/** Format a monetary amount only when the caller supplies an explicit currency code. */
export function formatRideXCurrency(value, options = {}) {
  if (!finiteNumber(value)) return RIDEX_FORMAT_UNAVAILABLE;
  const source = options && typeof options === 'object' ? options : {};
  const currency = typeof source.currency === 'string' ? source.currency.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(currency)) return RIDEX_FORMAT_UNAVAILABLE;
  try {
    const output = numberOptions(source, 'currency');
    output.currency = currency;
    const display = source.currencyDisplay ?? 'symbol';
    const sign = source.currencySign ?? 'standard';
    if (!SAFE_CURRENCY_DISPLAY.has(display) || !SAFE_CURRENCY_SIGN.has(sign)) return RIDEX_FORMAT_UNAVAILABLE;
    output.currencyDisplay = display;
    output.currencySign = sign;
    return new Intl.NumberFormat(localeOf(source.locale), output).format(value);
  } catch { return RIDEX_FORMAT_UNAVAILABLE; }
}

function toValidDate(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : undefined;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}
function dateOptions(options = {}, includeTime = false) {
  const source = options && typeof options === 'object' ? options : {};
  const result = {};
  const suppliedParts = Object.keys(SAFE_DATE_PARTS).some(key => source[key] !== undefined);
  if (source.dateStyle !== undefined) {
    if (!SAFE_STYLES.has(source.dateStyle)) throw new RangeError('Invalid dateStyle');
    result.dateStyle = source.dateStyle;
  } else if (!suppliedParts) result.dateStyle = 'medium';
  if (source.timeStyle !== undefined) {
    if (!SAFE_STYLES.has(source.timeStyle)) throw new RangeError('Invalid timeStyle');
    result.timeStyle = source.timeStyle;
  } else if (includeTime && !suppliedParts) result.timeStyle = 'short';
  for (const [key, allowed] of Object.entries(SAFE_DATE_PARTS)) {
    if (source[key] !== undefined) {
      if (!allowed.includes(source[key])) throw new RangeError(`Invalid ${key}`);
      result[key] = source[key];
    }
  }
  if (source.hour12 !== undefined) {
    if (typeof source.hour12 !== 'boolean') throw new RangeError('Invalid hour12');
    result.hour12 = source.hour12;
  }
  if (source.timeZone !== undefined) {
    if (typeof source.timeZone !== 'string' || !source.timeZone.trim()) throw new RangeError('Invalid timeZone');
    result.timeZone = source.timeZone;
  }
  return result;
}

/** Format a date; timezone is platform-local unless the caller explicitly supplies one. */
export function formatRideXDate(value, options = {}) {
  const date = toValidDate(value);
  if (!date) return RIDEX_FORMAT_UNAVAILABLE;
  try { return new Intl.DateTimeFormat(localeOf(options?.locale), dateOptions(options, false)).format(date); }
  catch { return RIDEX_FORMAT_UNAVAILABLE; }
}
/** Format date and time; timezone remains explicit/caller-controlled. */
export function formatRideXDateTime(value, options = {}) {
  const date = toValidDate(value);
  if (!date) return RIDEX_FORMAT_UNAVAILABLE;
  try { return new Intl.DateTimeFormat(localeOf(options?.locale), dateOptions(options, true)).format(date); }
  catch { return RIDEX_FORMAT_UNAVAILABLE; }
}

/** Return the runtime ICU plural category rather than hard-coding category tables. */
export function getRideXPluralCategory(count, options = {}) {
  if (!finiteNumber(count)) return undefined;
  const source = options && typeof options === 'object' ? options : {};
  const type = source.type ?? 'cardinal';
  if (type !== 'cardinal' && type !== 'ordinal') return undefined;
  try { return new Intl.PluralRules(localeOf(source.locale), { type }).select(count); }
  catch { return undefined; }
}

function safeInterpolationValue(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return RIDEX_FORMAT_UNAVAILABLE;
}
/** Replace {name} or {{name}} with primitives; do not serialize objects or secrets. */
export function interpolateRideXText(template, values = {}, options = {}) {
  if (typeof template !== 'string' || !template.trim()) return RIDEX_FORMAT_UNAVAILABLE;
  const source = values && typeof values === 'object' && !Array.isArray(values) ? values : {};
  const missing = typeof options?.missingValue === 'string' && options.missingValue.trim() ? options.missingValue : RIDEX_FORMAT_UNAVAILABLE;
  return template.replace(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}|\{([A-Za-z][A-Za-z0-9_]*)\}/g, (match, doubleName, singleName) => {
    const name = doubleName ?? singleName;
    if (!Object.prototype.hasOwnProperty.call(source, name)) return missing;
    const value = source[name];
    return value === null || value === undefined ? missing : safeInterpolationValue(value);
  });
}
/** Resolve a translation then apply named interpolation. */
export function formatRideXMessage(options = {}) {
  const resolution = resolveRideXTranslation(options);
  const text = interpolateRideXText(resolution.text, options.values, { missingValue: options.missingValue });
  return Object.freeze({ ...resolution, text });
}

/** Resolve key.category in the requested locale, then key.other, then English equivalents. */
export function resolveRideXPluralTranslation(options = {}) {
  const source = options && typeof options === 'object' ? options : {};
  const locale = localeOf(source.locale);
  const key = typeof source.key === 'string' ? source.key.trim() : '';
  const category = getRideXPluralCategory(source.count, { locale, type: source.type ?? 'cardinal' });
  const dictionaries = source.dictionaries && typeof source.dictionaries === 'object' ? source.dictionaries : {};
  const candidates = category && key ? [...new Set([`${key}.${category}`, `${key}.other`])] : (key ? [`${key}.other`] : []);
  const locales = locale === FALLBACK_LOCALE ? [FALLBACK_LOCALE] : [locale, FALLBACK_LOCALE];
  let found; let resolvedLocale = null; let resolvedKey = null;
  for (const candidateLocale of locales) {
    for (const candidateKey of candidates) {
      const resolution = resolveRideXTranslation({ locale: candidateLocale, key: candidateKey, dictionaries: { [candidateLocale]: dictionaries[candidateLocale] } });
      if (resolution.translationFound) {
        found = resolution.text; resolvedLocale = candidateLocale; resolvedKey = candidateKey; break;
      }
    }
    if (found !== undefined) break;
  }
  let baseResolution;
  if (found === undefined) {
    baseResolution = resolveRideXTranslation({ locale, key: '', dictionaries: {}, fallbackText: source.fallbackText, genericFallback: source.genericFallback ?? RIDEX_FORMAT_UNAVAILABLE });
    found = baseResolution.text;
  }
  const values = { ...(source.values && typeof source.values === 'object' && !Array.isArray(source.values) ? source.values : {}) };
  if (finiteNumber(source.count)) values.count = formatRideXNumber(source.count, { locale });
  const text = interpolateRideXText(found, values, { missingValue: source.missingValue });
  const translationFound = resolvedKey !== null;
  return Object.freeze({
    text, requestedLocale: locale, resolvedLocale,
    source: translationFound ? (resolvedLocale === locale ? 'REQUESTED_LOCALE' : 'ENGLISH_FALLBACK') : (baseResolution?.source ?? 'GENERIC_FALLBACK'),
    translationFound, pluralCategory: category ?? null, resolvedKey
  });
}
export function translateRideXPlural(options = {}) { return resolveRideXPluralTranslation(options).text; }
