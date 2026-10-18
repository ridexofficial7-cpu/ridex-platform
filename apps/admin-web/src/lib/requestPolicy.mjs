/** Pure request-retry policy shared by the REST client and Node unit tests. */
/** Accept only same-origin-relative API paths. Routes are supplied by the local contract registry. */
export function isSafeApiPath(path) {
  if (typeof path !== "string") return false;
  const raw = path.trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || /[\u0000-\u001f\u007f\\]/.test(raw) || raw.includes("#")) return false;
  const rawPath = raw.split("?", 1)[0];
  if (!rawPath || rawPath.startsWith("//")) return false;
  const segments = rawPath.split("/").slice(1);
  for (const segment of segments) {
    let decoded;
    try { decoded = decodeURIComponent(segment); } catch { return false; }
    if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) return false;
  }
  try {
    const parsed = new URL(raw, "https://ridex-admin.invalid");
    return parsed.origin === "https://ridex-admin.invalid" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 504]);

export function isSafeReadMethod(method) {
  const normalized = String(method || "GET").toUpperCase();
  return normalized === "GET" || normalized === "HEAD";
}

export function isRetryableStatus(status) {
  return RETRYABLE_STATUSES.has(Number(status));
}

export function retryDelayMs(retryAfterHeader, attempt, now = Date.now()) {
  const retryAfter = typeof retryAfterHeader === "string" ? retryAfterHeader.trim() : "";
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(10_000, seconds * 1000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, Math.min(10_000, date - now));
  }
  const safeAttempt = Math.max(1, Number.isFinite(Number(attempt)) ? Number(attempt) : 1);
  return Math.min(4_000, safeAttempt * 600);
}

export function waitWithAbort(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }
    let timer;
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, Math.max(0, Number(ms) || 0));
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}


/**
 * Fail closed on non-read operations for administrative API paths while the actual
 * backend route contract is unverified. Authentication requests are outside these
 * prefixes, so login/OTP/logout remain usable. This client guard is not authorization;
 * backend authorization and geographic-scope enforcement remain mandatory.
 */
const SOURCE_VERIFIED_ADMIN_MUTATIONS = new Set([
  // Backend source confirms PUT /admin/matching/configuration. Its handler
  // uses an operational-configuration guard, transaction-bound audit logging,
  // and rejects service-availability changes unless the actor is Super Admin.
  "PUT /admin/matching/configuration",
  // Backup creation is Super Admin-only and audits a successfully verified snapshot.
  // Production requires its exact server-side confirmation phrase.
  "POST /admin/platform/recovery/backups",
  // Bot health checks are read-only probes; backend route requires Super Admin
  // and writes an audit event for each requested check.
  "POST /admin/bots/check",
]);

export function shouldBlockUnverifiedAdminMutation(path, method, contractStatus) {
  if (isSafeReadMethod(method)) return false;
  if (contractStatus === "VERIFIED_AGAINST_BACKEND_SOURCE") return false;
  const rawPath = String(path ?? "").split(/[?#]/, 1)[0];
  const normalized = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const normalizedPath = normalized.replace(/\/+$/, "") || "/";
  const normalizedMethod = String(method || "GET").toUpperCase();
  if (SOURCE_VERIFIED_ADMIN_MUTATIONS.has(`${normalizedMethod} ${normalizedPath}`)) return false;
  // Restore path is narrowly limited to one encoded backup identifier segment.
  // Backend still enforces Super Admin, verified snapshot, same environment,
  // checksum integrity and the exact TEST/PRODUCTION confirmation phrase.
  if (normalizedMethod === "POST" && /^\/admin\/platform\/recovery\/backups\/[A-Za-z0-9_-]+\/restore$/.test(normalizedPath)) return false;
  // Only support endpoints whose handlers explicitly assert case-level scope and
  // write their changes plus audit rows transactionally are enabled here.
  if (normalizedMethod === "POST" && /^\/support\/admin\/cases\/[A-Za-z0-9_-]+\/internal-notes$/.test(normalizedPath)) return false;
  if (normalizedMethod === "PATCH" && /^\/support\/admin\/cases\/[A-Za-z0-9_-]+\/escalation$/.test(normalizedPath)) return false;
  // Case updates require a bounded change reason, server-side scope/transition checks and a durable audit row.
  if (normalizedMethod === "PATCH" && /^\/support\/admin\/cases\/[A-Za-z0-9_-]+$/.test(normalizedPath)) return false;
  // Role-permission replacement has exact permission checks, exact confirmation and before/after audit.
  if (normalizedMethod === "POST" && /^\/admin\/roles\/[A-Za-z0-9_-]+\/permissions$/.test(normalizedPath)) return false;
  // Session revocations are Super Admin-only, exact-confirmation actions with audit records.
  if (normalizedMethod === "DELETE" && /^\/admin\/admin-presence\/sessions\/[A-Za-z0-9_-]+$/.test(normalizedPath)) return false;
  if (normalizedMethod === "POST" && /^\/admin\/admin-presence\/admins\/[A-Za-z0-9_-]+\/revoke-all$/.test(normalizedPath)) return false;
  const administrative = /(?:^|\/)(?:admin|platform|configuration)(?:\/|$)/i.test(normalizedPath) || /(?:^|\/)support\/admin(?:\/|$)/i.test(normalizedPath);
  return administrative;
}

