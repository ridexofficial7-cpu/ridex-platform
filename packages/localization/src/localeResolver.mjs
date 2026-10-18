/**
 * Dependency-free RideX first-launch locale resolver.
 *
 * This module only resolves a locale and describes follow-up persistence/sync actions.
 * It intentionally performs no storage, networking, logging, or application-state mutation.
 */
const SUPPORTED_LOCALES = Object.freeze(['en-IN', 'hi-IN']);
const SUPPORTED_SET = new Set(SUPPORTED_LOCALES);
const DEVICE_LANGUAGE_MAP = Object.freeze({ en: 'en-IN', hi: 'hi-IN' });
const EXPECTED_SCRIPT = Object.freeze({ en: 'Latn', hi: 'Deva' });

function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

/** Canonicalize case/separator only; this does not enable a new locale. */
function canonicalTag(value) {
  if (typeof value !== 'string') return undefined;
  const raw = value.trim().replace(/_/g, '-');
  if (!raw || !/^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|\d{3}))?$/.test(raw)) return undefined;
  const parts = raw.split('-');
  parts[0] = parts[0].toLowerCase();
  for (let i = 1; i < parts.length; i += 1) {
    parts[i] = parts[i].length === 4
      ? parts[i][0].toUpperCase() + parts[i].slice(1).toLowerCase()
      : parts[i].toUpperCase();
  }
  return parts.join('-');
}

/** Account/local/current explicit choices must name one of the exact enabled locale tags. */
export function normalizeExplicitRideXLocale(candidate) {
  const tag = canonicalTag(candidate);
  return tag && SUPPORTED_SET.has(tag) ? tag : undefined;
}

export function isSupportedRideXLocale(candidate) {
  return normalizeExplicitRideXLocale(candidate) !== undefined;
}

/**
 * Device locale matching may map a different region of a supported language to the
 * configured India locale. An explicitly different script is never silently changed.
 */
export function normalizeDeviceRideXLocale(candidate) {
  let raw = candidate;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    raw = raw.languageTag ?? raw.localeTag ?? raw.languageCode ?? raw.language;
  }
  const tag = canonicalTag(raw);
  if (!tag) return undefined;
  if (SUPPORTED_SET.has(tag)) return tag;
  const parts = tag.split('-');
  const language = parts[0];
  const mapped = DEVICE_LANGUAGE_MAP[language];
  if (!mapped) return undefined;
  const script = parts.find((part, index) => index > 0 && part.length === 4);
  if (script && script !== EXPECTED_SCRIPT[language]) return undefined;
  return mapped;
}

function deviceCandidates(deviceLocales) {
  if (Array.isArray(deviceLocales)) return deviceLocales;
  if (deviceLocales === undefined || deviceLocales === null || deviceLocales === '') return [];
  return [deviceLocales];
}

function resolveDeviceLocale(deviceLocales) {
  const candidates = deviceCandidates(deviceLocales);
  for (const candidate of candidates) {
    const locale = normalizeDeviceRideXLocale(candidate);
    if (locale) return { locale, hadCandidate: candidates.length > 0, supportedMatch: true };
  }
  return { locale: undefined, hadCandidate: candidates.length > 0, supportedMatch: false };
}

function makeResult(locale, source, shouldPersistLocalPreference, shouldSyncAccountPreference, diagnostics) {
  return Object.freeze({
    locale,
    source,
    shouldPersistLocalPreference,
    shouldSyncAccountPreference,
    diagnostics: Object.freeze([...new Set(diagnostics)])
  });
}

/**
 * Resolve first-launch locale using the approved precedence.
 *
 * Unauthenticated: valid explicit session selection > saved local preference > supported
 * device locale > en-IN fallback.
 * Authenticated: explicit selection in this session > supported account preference > valid
 * local preference > supported device locale > en-IN fallback. When authenticated and the
 * account preference is absent/unsupported, the resolved local/device/fallback choice is
 * marked for account synchronization. Sync failures must not change the selected UI locale.
 */
export function resolveRideXLocale(input = {}) {
  const context = input && typeof input === 'object' ? input : {};
  const authenticated = context.authenticated === true;
  const diagnostics = [];

  if (hasValue(context.currentSessionExplicitLocale)) {
    const explicit = normalizeExplicitRideXLocale(context.currentSessionExplicitLocale);
    if (explicit) {
      return makeResult(explicit, 'CURRENT_SESSION_EXPLICIT_SELECTION', true, authenticated, diagnostics);
    }
    diagnostics.push('UNSUPPORTED_CURRENT_SESSION_SELECTION');
  }

  if (authenticated && hasValue(context.accountPreference)) {
    const accountLocale = normalizeExplicitRideXLocale(context.accountPreference);
    if (accountLocale) {
      return makeResult(accountLocale, 'ACCOUNT_PREFERENCE', true, false, diagnostics);
    }
    diagnostics.push('UNSUPPORTED_ACCOUNT_PREFERENCE');
  }

  if (hasValue(context.localPreference)) {
    const localLocale = normalizeExplicitRideXLocale(context.localPreference);
    if (localLocale) {
      return makeResult(localLocale, 'LOCAL_PREFERENCE', false, authenticated, diagnostics);
    }
    diagnostics.push('UNSUPPORTED_LOCAL_PREFERENCE');
  }

  const device = resolveDeviceLocale(context.deviceLocales);
  if (device.locale) {
    return makeResult(device.locale, 'DEVICE_LOCALE', true, authenticated, diagnostics);
  }
  if (device.hadCandidate && !device.supportedMatch) diagnostics.push('UNSUPPORTED_DEVICE_LOCALE');
  return makeResult('en-IN', 'DEFAULT_FALLBACK', true, authenticated, diagnostics);
}

export const RIDEX_SUPPORTED_LOCALES = SUPPORTED_LOCALES;
