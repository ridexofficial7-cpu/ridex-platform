const CODE_TO_KEY = {
  INVALID_CREDENTIALS: "errors.invalidCredentials",
  AUTH_INVALID_CREDENTIALS: "errors.invalidCredentials",
  OTP_INVALID: "errors.otpInvalid",
  OTP_WRONG: "errors.otpInvalid",
  OTP_EXPIRED: "errors.otpExpired",
  OTP_ATTEMPTS_EXCEEDED: "errors.otpAttemptsExceeded",
  FORBIDDEN: "errors.permissionDenied",
  PERMISSION_DENIED: "errors.permissionDenied",
  SESSION_EXPIRED: "errors.sessionExpired",
  RATE_LIMITED: "errors.rateLimited",
  TOO_MANY_REQUESTS: "errors.rateLimited",
  NETWORK_ERROR: "errors.networkUnavailable",
};

function record(value) {
  return value && typeof value === "object" ? value : null;
}

function extractErrorCode(error) {
  const root = record(error);
  const details = record(root?.details);
  const nestedData = record(details?.data);
  const nestedError = record(details?.error);
  const nestedDataError = record(nestedData?.error);
  const candidates = [
    root?.errorCode,
    root?.code,
    details?.errorCode,
    details?.code,
    nestedData?.errorCode,
    nestedData?.code,
    nestedError?.code,
    nestedDataError?.code,
  ];
  const found = candidates.find((value) => typeof value === "string" && value.trim());
  return typeof found === "string" ? found.trim().toUpperCase() : "";
}

/** Translate known stable API error codes locally; do not display API prose as UI copy. */
export function localizedErrorMessage(error, t) {
  const root = record(error);
  const code = extractErrorCode(error);
  const codeKey = CODE_TO_KEY[code];
  if (codeKey) return t(codeKey);

  const status = Number(root?.status ?? 0);
  if (status === 401) return t("errors.invalidCredentials");
  if (status === 403) return t("errors.permissionDenied");
  if (status === 408 || (error instanceof DOMException && error.name === "AbortError")) return t("errors.requestTimedOut");
  if (status === 429) return t("errors.rateLimited");
  if (status >= 500) return t("errors.serviceUnavailable");
  if (status >= 400) return t("errors.requestFailed");
  if (error instanceof TypeError) return t("errors.networkUnavailable");
  if (error instanceof Error) return error.message;
  return t("errors.requestFailed");
}
