/**
 * Race-safe coordination helpers for locale preference reads/writes.
 *
 * This module deliberately does not call an account API or mutate the current UI locale.
 * The application owns the monotonically increasing selectionGeneration and applies the
 * latest locale synchronously; old reads/writes can then be safely ignored.
 */
import { normalizeExplicitRideXLocale } from './localeResolver.mjs';

function validGeneration(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function frozen(value) {
  return Object.freeze(value);
}

/** Return a request intent only when an authenticated user has a supported selection. */
export function createRideXLocaleSyncIntent({ locale, selectionGeneration, authenticated } = {}) {
  if (authenticated !== true) return frozen({ status: 'NOT_AUTHENTICATED' });
  const normalized = normalizeExplicitRideXLocale(locale);
  if (!normalized) return frozen({ status: 'UNSUPPORTED_LOCALE' });
  if (!validGeneration(selectionGeneration)) return frozen({ status: 'INVALID_SELECTION_GENERATION' });
  return frozen({ status: 'READY', locale: normalized, selectionGeneration });
}

/**
 * An account-preference read may be applied only if no newer choice happened while it was
 * in flight and the user has not explicitly selected a locale in the current session.
 */
export function canApplyRideXAccountPreferenceRead({
  requestGeneration,
  currentGeneration,
  hasCurrentSessionExplicitSelection = false,
  accountLocale
} = {}) {
  if (!validGeneration(requestGeneration) || !validGeneration(currentGeneration)) return false;
  if (requestGeneration !== currentGeneration || hasCurrentSessionExplicitSelection === true) return false;
  return normalizeExplicitRideXLocale(accountLocale) !== undefined;
}

/**
 * A sync response is evidence about persistence only; it must never change the active UI
 * locale. A stale response is ignored when a later selectionGeneration now exists.
 */
export function classifyRideXLocaleSyncResult({
  requestGeneration,
  currentGeneration,
  requestSucceeded
} = {}) {
  if (!validGeneration(requestGeneration) || !validGeneration(currentGeneration)) {
    return frozen({ status: 'INVALID_SELECTION_GENERATION', shouldKeepCurrentLocale: true });
  }
  if (requestSucceeded !== true) {
    return frozen({ status: 'SYNC_FAILED_KEEP_CURRENT', shouldKeepCurrentLocale: true });
  }
  if (requestGeneration !== currentGeneration) {
    return frozen({ status: 'STALE_SYNC_RESULT_IGNORED', shouldKeepCurrentLocale: true });
  }
  return frozen({ status: 'SYNC_CONFIRMED_KEEP_CURRENT', shouldKeepCurrentLocale: true });
}
