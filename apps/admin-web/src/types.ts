/** Shared domain types for the RideX Admin Web frontend.
 * Keep these aligned with the actual Admin API response contracts.
 */

export type Environment = "TEST" | "LIVE";

export type AdminType = "SUPER_ADMIN" | "GLOBAL_ADMIN" | "STATE_ADMIN" | "CITY_ADMIN";

export type AdminLevel = "GLOBAL" | "STATE" | "CITY";

/** Screen identifiers used by config/navigation.tsx and page routing. */
export type Screen =
  | "dashboard"
  | "deliveryHealth"
  | "admins"
  | "assets"
  | "audit"
  | "availability"
  | "backup"
  | "cities"
  | "cityZones"
  | "commission"
  | "customers"
  | "dataMerge"
  | "drivers"
  | "driversOps"
  | "events"
  | "fieldOps"
  | "finance"
  | "gateway"
  | "integrations"
  | "kyc"
  | "live"
  | "locations"
  | "matching"
  | "monitoring"
  | "botMonitor"
  | "notifications"
  | "otp"
  | "payments"
  | "platform"
  | "pricing"
  | "promotions"
  | "quickLocations"
  | "quickRide"
  | "reports"
  | "rides"
  | "roles"
  | "publicLinks"
  | "scopeAssignments"
  | "routeBuilder"
  | "routeRules"
  | "routesOps"
  | "safety"
  | "security"
  | "services"
  | "sessions"
  | "setup"
  | "sharingRoutes"
  | "states"
  | "support"
  | "vehicleCatalog"
  | "vehicles"
  | "workingRoutes";

export interface AdminPermission {
  module: string;
  action: string;
  /** Additional backend fields may exist; UI must not interpret unknown fields as grants. */
  [key: string]: unknown;
}

export interface AdminContext {
  adminId: string;
  userId: string;
  name: string;
  mobile: string;
  email: string | null;
  role: string;
  approvalStatus: string;
  adminType: AdminType;
  adminLevel: AdminLevel;
  stateId: string | null;
  cityId: string | null;
  stateName: string | null;
  cityName: string | null;
  isSuperAdmin: boolean;
  permissions: AdminPermission[];
}

export interface DashboardMetrics {
  activeRides: number | null;
  driversOnline: number | null;
  customers: number | null;
  pendingKyc: number | null;
  openSupport: number | null;
  todayRevenue: number | null;
  alerts: number | null;
  systemHealth: string;
  /** Raw backend response for diagnostic display; may be omitted. */
  raw?: unknown;
}

export interface ApiEnvelope<T = unknown> {
  success?: boolean;
  message?: string;
  data?: T;
  error?: string | { code?: string; message?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface WorkspaceConfig {
  title: string;
  eyebrow: string;
  desc: string;
  endpoint?: string;
  action?: string;
  permissionHints: string[];
}

