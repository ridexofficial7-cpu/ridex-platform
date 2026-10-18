const SAFE_KEY = /^[A-Za-z][A-Za-z0-9_.:-]{0,99}$/;
const SAFE_BUILD = /^[A-Za-z0-9._+-]{1,32}$/;
const SUPPORTED_LOCALES = new Set(['en-IN', 'hi-IN']);

function safeBuild(value) {
  return typeof value === 'string' && SAFE_BUILD.test(value) ? value : 'unknown';
}

function safeLimit(value) {
  if (!Number.isInteger(value) || value < 1) return 100;
  return Math.min(value, 1000);
}

/**
 * Creates an opt-in, TEST-only missing-translation reporter.
 * Never receives or logs translated text, fallback copy, interpolation values,
 * account IDs, request payloads, or credentials.
 */
export function createRideXMissingKeyReporter(options = {}) {
  const enabled = options.environment === 'TEST'
    && options.debugEnabled === true
    && options.logger
    && typeof options.logger.warn === 'function';
  const build = safeBuild(options.build);
  const maxReported = safeLimit(options.maxReported);
  const seen = new Set();

  function reportMissing(input = {}) {
    if (!enabled || seen.size >= maxReported) return false;
    const key = input.key;
    const locale = input.locale;
    if (typeof key !== 'string' || !SAFE_KEY.test(key)) return false;
    if (typeof locale !== 'string' || !SUPPORTED_LOCALES.has(locale)) return false;
    const identity = `${locale}:${key}:${build}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    try {
      options.logger.warn('[RideX i18n] Missing translation', Object.freeze({ key, locale, build }));
      return true;
    } catch {
      return false;
    }
  }

  return Object.freeze({
    enabled: Boolean(enabled),
    reportMissing,
    getReportedCount: () => seen.size,
  });
}
