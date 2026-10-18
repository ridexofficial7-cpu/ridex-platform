import { storage } from "./storage";
import { API_CONTRACT_STATUS, RIDEX_API } from "./apiContract";
import { APP_VERSION_HEADER, RUNTIME_CONFIG_VALID, RUNTIME_CONFIG_WARNING } from "./runtimeConfig";
import { getApiBaseUrl, getEnvironmentConfigWarning, getSelectedEnvironment, isEnvironmentAvailable } from "./environmentSelection";
import { getAcceptLanguageHeader } from "./languagePreference";
import { isRetryableStatus, isSafeReadMethod, retryDelayMs, shouldBlockUnverifiedAdminMutation, waitWithAbort, isSafeApiPath } from "./requestPolicy.mjs";
import type { AdminContext, ApiEnvelope, DashboardMetrics, WorkspaceConfig } from "../types";


export class ApiError extends Error {
  constructor(message: string, public status = 0, public details?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

function dispatchApiSignal(state: "reachable" | "degraded", statusCode?: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ridex-admin-api-signal", { detail: { state, observedAt: new Date().toISOString(), ...(statusCode ? { statusCode } : {}) } }));
}

function requestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function parseResponse(response: Response): Promise<ApiEnvelope> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as ApiEnvelope; } catch {
    // Do not echo HTML error pages or arbitrary server bodies into the Admin UI.
    return { message: "The API returned a non-JSON response." };
  }
}


/**
 * Shared REST client. Only GET/HEAD are retried; every attempt receives a fresh
 * AbortController. Retry delays happen after the request timer/listener cleanup.
 * Mutations are never automatically replayed; their idempotency key remains stable.
 */
export async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  if (!isSafeApiPath(path)) {
    throw new ApiError("Blocked an unsafe API path. Use a same-origin-relative path from the Admin API contract registry.", 400);
  }
  if (!RUNTIME_CONFIG_VALID) {
      throw new ApiError(RUNTIME_CONFIG_WARNING || "Invalid RideX Admin runtime configuration.", 0);
  }
  const activeEnvironment = getSelectedEnvironment();
  if (!isEnvironmentAvailable(activeEnvironment)) {
      throw new ApiError(getEnvironmentConfigWarning(activeEnvironment), 0);
  }

  const method = String(init.method || "GET").toUpperCase();
  if (shouldBlockUnverifiedAdminMutation(path, method, API_CONTRACT_STATUS)) {
    throw new ApiError("Administrative changes are blocked until the route, request schema, permissions and geographic scope are verified against backend source.", 501);
  }

  const isPasswordLoginRequest = path.split("?")[0] === RIDEX_API.auth.passwordLogin;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Accept-Language", getAcceptLanguageHeader());
  headers.set("X-Request-Id", headers.get("X-Request-Id") || requestId());
  headers.set("X-App-Version", headers.get("X-App-Version") || APP_VERSION_HEADER);
  try {
    headers.set("X-Device-Id", headers.get("X-Device-Id") || storage.deviceId);
  } catch {
    // Privacy modes may deny browser storage; requests can still proceed without a device ID.
  }
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (isPasswordLoginRequest) {
    // Password login is a fresh credential exchange; never attach a previous session token.
    headers.delete("Authorization");
  } else {
    try {
      if (storage.token) headers.set("Authorization", `Bearer ${storage.token}`);
    } catch {
      // An unavailable session store means the request is unauthenticated.
    }
  }

  const safeRead = isSafeReadMethod(method);
  if (!safeRead && !headers.has("Idempotency-Key")) headers.set("Idempotency-Key", requestId());
  const maxAttempts = safeRead ? 3 : 1;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    let response: Response | null = null;
    // RequestInit.signal may be null in newer DOM/TypeScript definitions; the
    // retry helper accepts an AbortSignal only when one was actually supplied.
    const callerSignal = init.signal ?? undefined;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Math.max(1, timeoutMs));
    const abortFromCaller = () => controller.abort();
    if (callerSignal?.aborted) controller.abort();
    else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

    let retryDelay: number | null = null;
    try {
      response = await fetch(`${getApiBaseUrl()}${path}`, {
        ...init,
        headers,
        // Authenticated API endpoints must not follow redirects. A redirect can
        // conceal a deployment/proxy misconfiguration and should never be a
        // supported path for forwarding an Admin bearer token.
        redirect: headers.has("Authorization") ? "error" : init.redirect,
        signal: controller.signal,
        // Admin responses may contain scoped customer, driver, trip or financial
        // data. Keep them out of the browser HTTP cache.
        cache: "no-store",
      });
      const data = await parseResponse(response);
      if (response.status === 401 && !isPasswordLoginRequest && headers.has("Authorization")) {
        try { storage.token = ""; } catch { /* no storage available */ }
        window.dispatchEvent(new CustomEvent("ridex-admin-auth-expired"));
      }
      if (!response.ok || data.success === false) {
        throw new ApiError(
          String(data.message || (typeof data.error === "string" ? data.error : data.error?.message) || `Request failed (${response.status})`),
          response.status,
          data,
        );
      }
      dispatchApiSignal("reachable");
      return (data.data ?? data) as T;
    } catch (error) {
      if (callerSignal?.aborted) throw error; // Caller cancellation must never trigger a retry.
      const normalized = timedOut || (error instanceof DOMException && error.name === "AbortError")
        ? new ApiError("Request timed out", 408)
        : error;
      lastError = normalized;
      const retryableApi = normalized instanceof ApiError && isRetryableStatus(normalized.status);
      const retryableNetwork = normalized instanceof TypeError;
      const serverOrNetworkIssue = retryableNetwork || (normalized instanceof ApiError && (normalized.status === 408 || normalized.status >= 500));
      if (serverOrNetworkIssue) dispatchApiSignal("degraded", normalized instanceof ApiError ? normalized.status : undefined);
      if (!safeRead || attempt >= maxAttempts || (!retryableApi && !retryableNetwork)) throw normalized;
      retryDelay = retryDelayMs(response?.headers.get("Retry-After") ?? null, attempt);
    } finally {
      window.clearTimeout(timer);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }

    if (retryDelay !== null) await waitWithAbort(retryDelay, callerSignal);
  }
  throw lastError instanceof Error ? lastError : new ApiError("Request failed");
}

export const passwordLogin = (identifier: string, password: string) =>
  request<any>(RIDEX_API.auth.passwordLogin, {
    method: "POST",
    body: JSON.stringify({ actorType: "ADMIN", identifier, password }),
  });

export const sendOtp = (actorId: string, purposeCode: string) =>
  request<any>(RIDEX_API.auth.sendOtp, {
    method: "POST",
    body: JSON.stringify({ actorType: "ADMIN", actorId, purposeCode }),
  });

export const resendOtp = (actorId: string, purposeCode: string) =>
  request<any>(RIDEX_API.auth.resendOtp, {
    method: "POST",
    body: JSON.stringify({ actorType: "ADMIN", actorId, purposeCode }),
  });

export const verifyOtp = (actorId: string, purposeCode: string, otp: string) =>
  request<any>(RIDEX_API.auth.verifyOtp, {
    method: "POST",
    body: JSON.stringify({ actorType: "ADMIN", actorId, purposeCode, otp }),
  });

export const completePasswordReset = (mobile: string, otp: string, newPassword: string) =>
  request<any>(RIDEX_API.auth.passwordResetComplete, {
    method: "POST",
    body: JSON.stringify({ actorType: "ADMIN", mobile, otp, newPassword }),
  });
export async function loadAdminContext(): Promise<AdminContext> {
  const data = await request<any>(RIDEX_API.admin.me);
  const isSuperAdmin = data.isSuperAdmin === true;
  const rawLevel = data.adminLevel ?? data.scope?.level ?? (isSuperAdmin ? "GLOBAL" : undefined);
  const level = String(rawLevel ?? "").toUpperCase();
  if (!["GLOBAL", "STATE", "CITY"].includes(level)) {
    throw new ApiError("Admin context has no valid GLOBAL/STATE/CITY scope. Access was denied until the backend context is corrected.", 403, data);
  }
  const adminLevel = level as AdminContext["adminLevel"];
  const adminId = String(data.adminId ?? data.id ?? "").trim();
  const userId = String(data.userId ?? "").trim();
  const role = String(data.role ?? "").trim();
  if (!adminId || !role) {
    throw new ApiError("Admin profile is missing the required administrator ID or role. Access was denied.", 403, data);
  }
  const stateId = data.stateId ?? data.scope?.stateId ?? null;
  const cityId = data.cityId ?? data.scope?.cityId ?? null;
  if (adminLevel === "STATE" && !stateId) {
    throw new ApiError("STATE Admin has no assigned state. Access was denied until a valid state is configured.", 403, data);
  }
  if (adminLevel === "CITY" && (!stateId || !cityId)) {
    throw new ApiError("CITY Admin must have both state and city assignments. Access was denied until a valid assignment is configured.", 403, data);
  }
  const normalizedPermissions = Array.isArray(data.permissions)
    ? data.permissions.filter((p: unknown) => p && typeof p === "object" && typeof (p as Record<string, unknown>).module === "string" && typeof (p as Record<string, unknown>).action === "string")
    : [];
  const adminType: AdminContext["adminType"] = isSuperAdmin ? "SUPER_ADMIN" : adminLevel === "CITY" ? "CITY_ADMIN" : adminLevel === "STATE" ? "STATE_ADMIN" : "GLOBAL_ADMIN";

  return {
    adminId,
    userId: userId || adminId,
    name: String(data.name || "RideX Admin"),
    mobile: data.mobile || "",
    email: data.email ?? null,
    role,
    approvalStatus: String(data.approvalStatus || ""),
    adminType,
    adminLevel,
    stateId: stateId == null ? null : String(stateId),
    cityId: cityId == null ? null : String(cityId),
    stateName: data.stateName ?? data.scope?.stateName ?? null,
    cityName: data.cityName ?? data.scope?.cityName ?? null,
    isSuperAdmin,
    permissions: normalizedPermissions,
  };
}

/** Always clear the local session, even if the server-side revoke call fails. */
export const logout = async () => {
  let failure: unknown = null;
  try {
    if (storage.token) await request(RIDEX_API.auth.logout, { method: "POST" });
  } catch (error) {
    failure = error;
  } finally {
    try { storage.token = ""; } catch { /* clear is best-effort in restricted storage */ }
    window.dispatchEvent(new CustomEvent("ridex-admin-local-logout"));
  }
  if (failure) throw failure;
};

/** Return the first non-nullish candidate field from a backend metrics object. */
function pick(source: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function maybeNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function loadDashboard(): Promise<DashboardMetrics> {
  const raw = await request<any>(RIDEX_API.admin.dashboard);
  const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const metrics = (root.metrics && typeof root.metrics === "object" ? root.metrics : root) as Record<string, unknown>;
  return {
    activeRides: maybeNum(pick(metrics, ["activeRides", "activeBookings", "activeTrips"])),
    driversOnline: maybeNum(pick(metrics, ["driversOnline", "onlineDrivers", "availableDrivers"])),
    customers: maybeNum(pick(metrics, ["customers", "customerCount", "totalCustomers"])),
    pendingKyc: maybeNum(pick(metrics, ["pendingKyc", "pendingKYC", "kycPending"])),
    openSupport: maybeNum(pick(metrics, ["openSupport", "openSupportCases", "supportOpen"])),
    todayRevenue: maybeNum(pick(metrics, ["todayRevenue", "revenueToday", "totalRevenueToday"])),
    alerts: maybeNum(pick(metrics, ["alerts", "activeAlerts", "alertCount"])),
    systemHealth: String(pick(metrics, ["systemHealth", "health", "status"]) ?? "Unknown"),
    raw,
  };
}

export async function getWorkspaceData(endpoint?: string) {
  if (!endpoint) throw new ApiError("This workspace has no confirmed read endpoint yet.", 501);
  return request<any>(endpoint);
}

export const WORKSPACES: Record<string, WorkspaceConfig> = {
  live: { title: "Live Operations", eyebrow: "OPERATIONS", desc: "Authorized ride and driver activity.", endpoint: RIDEX_API.admin.bookings, action: "Refresh live view", permissionHints: ["booking", "operation", "dashboard"] },
  deliveryHealth: { title: "Realtime & Delivery Health", eyebrow: "PLATFORM / NOTIFICATIONS", desc: "Realtime transport plus device and recent delivery-attempt health returned for the signed-in Admin account. This is not global Broadcaster/Provider health.", endpoint: RIDEX_API.notificationDeviceHealth, action: "Refresh delivery health", permissionHints: ["notification", "gateway", "platform", "delivery"] },
  matching: { title: "Matching", eyebrow: "OPERATIONS", desc: "Current matching configuration and deterministic controls.", endpoint: RIDEX_API.admin.matchingConfiguration, action: "Refresh configuration", permissionHints: ["matching", "operations"] },
  quickRide: { title: "Quick Ride", eyebrow: "OPERATIONS", desc: "Backend quick-create endpoint is available; creation form remains intentionally unopinionated until its body schema is locked.", endpoint: RIDEX_API.admin.bookings, action: "Refresh booking context", permissionHints: ["booking", "quick"] },
  driversOps: { title: "Driver Operations", eyebrow: "OPERATIONS", desc: "Driver operational records within backend authorization scope.", endpoint: RIDEX_API.admin.drivers, action: "Refresh drivers", permissionHints: ["driver", "operation"] },
  routesOps: { title: "Route Operations", eyebrow: "OPERATIONS", desc: "Route records and operational route state.", endpoint: RIDEX_API.admin.routes, action: "Refresh routes", permissionHints: ["route", "operation"] },
  fieldOps: { title: "Field Operations", eyebrow: "OPERATIONS", desc: "Field tasks within authorized geography.", endpoint: RIDEX_API.admin.fieldTasks, action: "Refresh tasks", permissionHints: ["field", "operation"] },
  events: { title: "Events & Sessions", eyebrow: "RIDES & SERVICES", desc: "Admin-defined event records and sessions.", endpoint: RIDEX_API.admin.events, action: "Refresh events", permissionHints: ["event", "operation"] },
  rides: { title: "Rides", eyebrow: "RIDES & SERVICES", desc: "Bookings within authorized administrative scope.", endpoint: RIDEX_API.admin.bookings, action: "Refresh rides", permissionHints: ["booking", "ride"] },
  customers: { title: "Customers", eyebrow: "RIDES & SERVICES", desc: "Customer records within authorized scope.", endpoint: RIDEX_API.admin.customers, action: "Refresh customers", permissionHints: ["customer"] },
  services: { title: "Services", eyebrow: "RIDES & SERVICES", desc: "Backend metadata and service configuration references.", action: "Refresh metadata", permissionHints: ["service", "configuration"] },
  drivers: { title: "Drivers", eyebrow: "DRIVERS & VEHICLES", desc: "Driver profiles, status and backend-authorized fields.", endpoint: RIDEX_API.admin.drivers, action: "Refresh drivers", permissionHints: ["driver"] },
  vehicles: { title: "Vehicles", eyebrow: "DRIVERS & VEHICLES", desc: "Driver vehicle records within authorized scope.", endpoint: RIDEX_API.admin.drivers, action: "Refresh drivers", permissionHints: ["vehicle", "driver"] },
  vehicleCatalog: { title: "Vehicle Catalog", eyebrow: "DRIVERS & VEHICLES", desc: "Authoritative passenger and cargo vehicle catalog, specifications, capacity and service eligibility.", endpoint: RIDEX_API.meta.vehicleCatalog, action: "Refresh vehicle catalog", permissionHints: ["vehicle", "configuration"] },
  gateway: { title: "Gateway Management", eyebrow: "PLATFORM / BROADCASTER", desc: "Gateway provisioning, identity, heartbeat and operational control surface.", endpoint: RIDEX_API.admin.gateways, action: "Refresh gateways", permissionHints: ["gateway", "platform"] },
  availability: { title: "Location Availability", eyebrow: "LOCATIONS & ROUTES", desc: "Location-specific customer-visible vehicle/service availability from the authoritative backend contract.", endpoint: RIDEX_API.admin.availability, action: "Check availability", permissionHints: ["availability", "location", "operation"] },
  workingRoutes: { title: "Working Routes", eyebrow: "DRIVERS & VEHICLES", desc: "Driver working-route API requires a driver ID; this workspace starts from the authorized driver list.", endpoint: RIDEX_API.admin.drivers, action: "Open drivers", permissionHints: ["route", "driver"] },
  kyc: { title: "KYC Queue", eyebrow: "KYC & VERIFICATION", desc: "Driver verification queue and documents are sourced from the admin driver APIs.", endpoint: RIDEX_API.admin.drivers, action: "Refresh queue", permissionHints: ["kyc", "driver", "verification"] },
  states: { title: "State Master", eyebrow: "LOCATIONS & ROUTES", desc: "State records available to the authenticated administrator.", endpoint: RIDEX_API.admin.states, action: "Refresh states", permissionHints: ["state", "location"] },
  cities: { title: "City Master", eyebrow: "LOCATIONS & ROUTES", desc: "City records linked to state scope.", endpoint: RIDEX_API.admin.cities, action: "Refresh cities", permissionHints: ["city", "location"] },
  locations: { title: "Location Master", eyebrow: "LOCATIONS & ROUTES", desc: "Validated operational locations.", endpoint: RIDEX_API.admin.locations, action: "Refresh locations", permissionHints: ["location"] },
  quickLocations: { title: "Quick Locations", eyebrow: "LOCATIONS & ROUTES", desc: "Quick-location records from the backend admin API.", endpoint: RIDEX_API.admin.quickLocations, action: "Refresh quick locations", permissionHints: ["location", "quick"] },
  cityZones: { title: "City Zones", eyebrow: "LOCATIONS & ROUTES", desc: "City service zones and geographic operating boundaries.", endpoint: RIDEX_API.admin.cityZones, action: "Refresh city zones", permissionHints: ["city", "zone", "location"] },
  routeBuilder: { title: "Route Builder", eyebrow: "LOCATIONS & ROUTES", desc: "Route definitions from the backend route API.", endpoint: RIDEX_API.admin.routes, action: "Refresh routes", permissionHints: ["route"] },
  sharingRoutes: { title: "Sharing Ride Routes", eyebrow: "LOCATIONS & ROUTES", desc: "Shared-route definitions from the dedicated admin shared-routes API.", endpoint: RIDEX_API.admin.sharedRoutes, action: "Refresh shared routes", permissionHints: ["shared", "route"] },
  routeRules: { title: "Route Rules", eyebrow: "LOCATIONS & ROUTES", desc: "Current route configuration is exposed from the backend without adding a synthetic rule model.", endpoint: RIDEX_API.admin.routes, action: "Refresh routes", permissionHints: ["route", "configuration"] },
  finance: { title: "Finance & Settlements", eyebrow: "FINANCE", desc: "Authorized settlement records and payout controls.", endpoint: RIDEX_API.admin.settlements, action: "Refresh settlements", permissionHints: ["finance", "payment", "settlement", "payout"] },
  payments: { title: "Payments", eyebrow: "FINANCE", desc: "Payment records within authorized scope.", endpoint: RIDEX_API.admin.payments, action: "Refresh payments", permissionHints: ["payment"] },
  pricing: { title: "Pricing", eyebrow: "FINANCE", desc: "Deterministic pricing rules managed by authorized operations admins. Geographic-zone scope is enforced by the backend; the UI withholds pricing for STATE/CITY admins until that route contract is verified.", endpoint: RIDEX_API.admin.pricingRules, action: "Refresh pricing", permissionHints: ["operations", "pricing", "configuration"] },
  commission: { title: "Commission", eyebrow: "FINANCE", desc: "Driver commission configuration and current records.", endpoint: RIDEX_API.admin.driverCommission, action: "Refresh commission", permissionHints: ["commission", "finance"] },
  promotions: { title: "Promotions", eyebrow: "FINANCE", desc: "Controlled promotion records.", endpoint: RIDEX_API.admin.promotions, action: "Refresh promotions", permissionHints: ["promotion", "finance"] },
  safety: { title: "Safety / SOS", eyebrow: "SAFETY & SUPPORT", desc: "Safety and SOS records under admin scope.", endpoint: RIDEX_API.admin.safety, action: "Refresh safety", permissionHints: ["safety", "sos"] },
  support: { title: "Support & Disputes", eyebrow: "SAFETY & SUPPORT", desc: "Support cases returned by the case-scope-aware Admin support API.", endpoint: RIDEX_API.support.adminCases, action: "Refresh support", permissionHints: ["support", "dispute"] },
  notifications: { title: "Notifications", eyebrow: "SAFETY & SUPPORT", desc: "Admin notification context and delivery visibility.", endpoint: RIDEX_API.notifications, action: "Refresh notifications", permissionHints: ["notification"] },
  reports: { title: "Reports & Analytics", eyebrow: "REPORTS", desc: "Dashboard-backed reporting context; dedicated report endpoints are not assumed where absent from the confirmed route inventory.", endpoint: RIDEX_API.admin.dashboard, action: "Refresh dashboard data", permissionHints: ["report", "dashboard"] },
  dataMerge: { title: "Data Merge", eyebrow: "REPORTS & PLATFORM", desc: "Review-controlled historical/current data merge jobs with explicit review and execution actions.", endpoint: RIDEX_API.admin.dataMerge, action: "Refresh merge jobs", permissionHints: ["merge", "platform", "data"] },
  admins: { title: "Admin Users", eyebrow: "SECURITY & ACCESS", desc: "Admin account lifecycle and approval.", endpoint: RIDEX_API.admin.admins, action: "Refresh admins", permissionHints: ["admin", "user"] },
  scopeAssignments: { title: "Geographic Scope & Admin Assignment", eyebrow: "SECURITY / GEOGRAPHIC SCOPE", desc: "Review returned Admin assignment and GLOBAL/STATE/CITY scope metadata. Assignment changes remain disabled until backend routes and authorization rules are verified.", endpoint: RIDEX_API.admin.admins, action: "Refresh Admin assignments", permissionHints: ["admin", "scope", "assignment"] },
  roles: { title: "Roles & Permissions", eyebrow: "SECURITY & ACCESS", desc: "Roles and permission definitions from the backend.", endpoint: RIDEX_API.admin.roles, action: "Refresh roles", permissionHints: ["role", "permission"] },
  sessions: { title: "Admin Sessions", eyebrow: "SECURITY & ACCESS", desc: "Current admin presence and authenticated sessions.", endpoint: RIDEX_API.admin.adminPresence, action: "Refresh sessions", permissionHints: ["session", "presence"] },
  security: { title: "Security Center", eyebrow: "SECURITY & ACCESS", desc: "OTP/security configuration and security-related admin visibility.", endpoint: RIDEX_API.admin.otpConfigurations, action: "Refresh security", permissionHints: ["security", "otp"] },
  audit: { title: "Audit Logs", eyebrow: "SECURITY & ACCESS", desc: "Audited actor/action/request context from the backend.", endpoint: RIDEX_API.admin.auditLogs, action: "Refresh audit", permissionHints: ["audit", "security"] },
  setup: { title: "TEST Setup", eyebrow: "PLATFORM", desc: "TEST summary and test records.", endpoint: RIDEX_API.admin.testDataSummary, action: "Refresh TEST", permissionHints: ["test", "platform"] },
  platform: { title: "TEST / LIVE Control", eyebrow: "PLATFORM", desc: "Environment state and release lifecycle data.", endpoint: RIDEX_API.admin.platformState, action: "Refresh platform", permissionHints: ["platform", "environment"] },
  publicLinks: { title: "Public Links & Downloads", eyebrow: "PLATFORM / PUBLIC WEBSITE", desc: "Review backend-returned app download URLs and public link settings. Save, history and rollback remain disabled until the exact API contract is verified.", endpoint: RIDEX_API.public.appDownloadLinks, action: "Refresh public links", permissionHints: ["platform", "configuration", "public", "download"] },
  monitoring: { title: "Monitoring", eyebrow: "PLATFORM", desc: "Backend health is read from the public health endpoint; no synthetic health is shown.", endpoint: RIDEX_API.health, action: "Refresh health", permissionHints: ["monitoring", "platform"] },
  backup: { title: "Backup & Recovery", eyebrow: "PLATFORM", desc: "Backup snapshots and recovery readiness.", endpoint: RIDEX_API.admin.backups, action: "Refresh backups", permissionHints: ["backup", "recovery"] },
  otp: { title: "OTP Configuration", eyebrow: "SYSTEM CONFIGURATION", desc: "Purpose-level OTP configuration, history and audit.", endpoint: RIDEX_API.admin.otpConfigurations, action: "Refresh OTP configuration", permissionHints: ["otp", "security", "configuration"] },
  integrations: { title: "Integrations", eyebrow: "SYSTEM CONFIGURATION", desc: "Integration status is exposed without rendering credentials or provider secrets.", endpoint: RIDEX_API.admin.platformState, action: "Refresh integration context", permissionHints: ["integration", "configuration"] },
  assets: { title: "App Media / Assets", eyebrow: "SYSTEM CONFIGURATION", desc: "Server-backed asset upload, version, activation and rollback workspace with scope-aware authorization.", endpoint: RIDEX_API.admin.assets, action: "Refresh assets", permissionHints: ["asset", "configuration"] },
};
