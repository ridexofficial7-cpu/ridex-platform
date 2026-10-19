/**
 * Frontend route inventory used by RideX Admin Web. These paths are relative to
 * VITE_RIDEX_API_URL (normally ending in /api/v1). The reference ZIPs explicitly
 * say their API examples are illustrative; backend route/method/schema verification
 * remains a release gate until the actual backend source and contract tests are available.
 * Full verification must cover method, request schema, response schema, permission and geographic scope.
 * Do not describe any route below as backend-confirmed solely because it is centralized here.
 */
export const API_CONTRACT_STATUS = "NOT_VERIFIED_AGAINST_BACKEND_SOURCE" as const;

export const RIDEX_API = Object.freeze({
  health: "/health",
  meta: {
    vehicleCatalog: "/meta/vehicle-catalog",
  },
  public: {
    appDownloadLinks: "/public/app-download-links",
  },
  auth: {
    passwordLogin: "/auth/password/login",
    sendOtp: "/auth/send-otp",
    resendOtp: "/auth/resend-otp",
    verifyOtp: "/auth/verify-otp",
    passwordResetComplete: "/auth/password/reset/complete",
    logout: "/auth/logout",
  },
  admin: {
    me: "/admin/me",
    botStatus: "/admin/bots/status",
    botEvents: "/admin/bots/events",
    botCheck: "/admin/bots/check",
    dashboard: "/admin/dashboard",
    bookings: "/admin/bookings",
    quickBooking: "/admin/bookings/quick-create",
    matchingConfiguration: "/admin/matching/configuration",
    drivers: "/admin/drivers",
    customers: "/admin/customers",
    events: "/admin/events",
    fieldTasks: "/admin/field-tasks",
    gateways: "/admin/gateways",
    assets: "/admin/assets",
    routes: "/admin/routes",
    locations: "/admin/locations",
    quickLocations: "/admin/quick-locations",
    states: "/admin/states",
    cities: "/admin/cities",
    cityZones: "/admin/operations/city-zones",
    pricingRules: "/admin/operations/pricing-rules",
    sharedRoutes: "/admin/shared-routes/routes",
    sharedRoutePoints: "/admin/shared-routes/points",
    availability: "/admin/operations/availability",
    driverCommission: "/admin/driver-commission",
    settlements: "/admin/payouts/settlements",
    payoutsReconcile: "/admin/payouts/reconcile",
    payments: "/admin/payments",
    promotions: "/admin/promotions",
    safety: "/admin/safety/sos",
    supportCases: "/admin/support/cases",
    notifications: "/notifications",
    notificationsBroadcast: "/admin/notifications/broadcast",
    dataMerge: "/admin/platform/data-merge",
    admins: "/admin/admins",
    roles: "/admin/roles",
    adminPresence: "/admin/admin-presence",
    otpConfigurations: "/admin/security/otp-configurations",
    auditLogs: "/admin/audit-logs",
    testData: "/admin/test-data",
    testDataSummary: "/admin/test-data/summary",
    testDataSeed: "/admin/test-data/seed",
    platformState: "/admin/platform/state",
    platformEnvironment: "/admin/platform/environment",
    platformTesters: "/admin/platform/testers",
    platformReleases: "/admin/platform/releases",
    appDownloadLinks: "/admin/platform/app-download-links",
    backups: "/admin/platform/recovery/backups",
    failoverReadiness: "/admin/platform/recovery/failover-readiness",
    recoveryStatus: "/admin/platform/recovery/status",
    setupTestPassenger: "/admin/setup-test-passenger",
    setupTestPickup: "/admin/setup-test-pickup",
    operationsCityZones: "/admin/operations/city-zones",
  },
  support: {
    adminCases: "/support/admin/cases",
  },
  realtime: "/realtime/stream",
  notifications: "/notifications",
  notificationDeviceHealth: "/notifications/device-health",
} as const);

/** Build a path from a known collection route and safely encoded path segments. */
export function resourcePath(collectionPath: string, ...segments: Array<string | number>): string {
  const base = collectionPath.replace(/\/$/, "");
  return segments.reduce<string>((path, segment) => `${path}/${encodeURIComponent(String(segment))}`, base);
}

/** Build a query string without hand-concatenating user-provided values. */
export function withQuery(path: string, params: Record<string, string | number | boolean | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}
