const SUPPORTED_LOCALES = new Set(['en-IN', 'hi-IN']);

export function resolveRideXTextDirection(locale) {
  return SUPPORTED_LOCALES.has(locale) ? 'ltr' : 'ltr';
}

export function isRideXLocaleDirectionSupported(locale, direction) {
  return SUPPORTED_LOCALES.has(locale) && direction === 'ltr';
}

export function isolateRideXDirectionalValue(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const text = String(value);
  if (!text.trim() || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) return '';
  // Unicode LRI/PDI isolates a short LTR identifier when embedded in translated text.
  return `\u2066${text}\u2069`;
}

export const RideXSupportedDirectionLocales = Object.freeze(['en-IN', 'hi-IN']);
