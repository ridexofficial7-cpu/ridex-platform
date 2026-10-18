/**
 * Conservative browser-side sanitization before rendering generic backend records.
 * This is a display safeguard only; authorization and server-side redaction remain mandatory.
 */
const SENSITIVE_FIELD = /(password|token|secret|otp|authorization|api.?key|private.?key|credential|cookie|signature|signed.?url|kyc.*url|document.*url|photo.?url|avatar.?url|image.?url|file.?url|documents?|attachments?|payment.*payload|webhook.*body|raw.?payload|access.?key|refresh.?key|bank.?account|card.?number|cvv|pan|aadhaar|identity.?number|storage.?key|storage.?path|file.?path|filesystem.?path)/i;
const DIAGNOSTIC_PII_FIELD = /(address|pickup|dropoff|destination|origin|latitude|longitude|(^|_)(lat|lng|lon)($|_)|location|mobile|phone|email|customerName|driverName|fullName|personName|contact)/i;
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const EMAIL_VALUE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_LIKE_VALUE = /(?<!\d)(?:\+?\d[\d ()-]{7,}\d)(?!\d)/g;
const COORDINATE_PAIR = /-?\d{1,3}\.\d{3,}\s*[,/]\s*-?\d{1,3}\.\d{3,}/g;
const URL_VALUE = /https?:\/\/[^\s"'<>]+/gi;

export function isSensitiveDisplayField(key: string): boolean {
  return SENSITIVE_FIELD.test(key);
}

export function redactForDisplay(value: unknown, depth = 0, diagnostic = false, parentKey = ""): unknown {
  if (depth > 4) return "[nested data omitted]";
  if (diagnostic && DIAGNOSTIC_PII_FIELD.test(parentKey)) return "[REDACTED FOR PRIVACY]";
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => redactForDisplay(entry, depth + 1, diagnostic, parentKey));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
      output[key] = isSensitiveDisplayField(key) || (diagnostic && DIAGNOSTIC_PII_FIELD.test(key))
        ? (diagnostic ? "[REDACTED FOR PRIVACY]" : "[REDACTED]")
        : redactForDisplay(entry, depth + 1, diagnostic, key);
    }
    return output;
  }
  if (typeof value === "string") {
    let safe = value.replace(BEARER_VALUE, "Bearer [REDACTED]").slice(0, 2000);
    if (diagnostic) safe = safe.replace(EMAIL_VALUE, "[EMAIL REDACTED]").replace(PHONE_LIKE_VALUE, "[PHONE REDACTED]").replace(COORDINATE_PAIR, "[COORDINATES REDACTED]").replace(URL_VALUE, "[URL REDACTED]");
    return safe;
  }
  return value;
}

export function safeDisplayJson(value: unknown): string {
  try {
    return JSON.stringify(redactForDisplay(value, 0, true), null, 2);
  } catch {
    return "[Details unavailable]";
  }
}
