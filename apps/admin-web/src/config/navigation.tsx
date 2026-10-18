import type { ReactNode } from "react";
import type { AdminContext, Screen } from "../types";
import { Activity, BarChart3, Bell, CarFront, ClipboardList, Database, FileCheck2, Gauge, LayoutDashboard, LifeBuoy, LockKeyhole, Map, MapPinned, Megaphone, Network, Globe, ReceiptText, Route, Settings, ShieldCheck, Siren, SlidersHorizontal, Users, WalletCards, Wrench, UserCog, Building2 } from "lucide-react";
export interface NavItem { id: Screen; label: string; icon: ReactNode; superOnly?: boolean; permissionHints?: string[]; }
export interface NavGroup { label: string; items: NavItem[]; }
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Command Center",
    items: [
      { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={16}/>, permissionHints: ["dashboard"] },
      { id: "live", label: "Live Operations", icon: <Map size={16}/>, permissionHints: ["booking", "operation"] },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "rides", label: "Bookings & Rides", icon: <ReceiptText size={16}/>, permissionHints: ["booking", "ride", "operation"] },
      { id: "matching", label: "Matching", icon: <Network size={16}/>, permissionHints: ["matching"] },
      { id: "driversOps", label: "Driver Operations", icon: <CarFront size={16}/>, permissionHints: ["driver", "operation"] },
      { id: "drivers", label: "Drivers", icon: <CarFront size={16}/>, permissionHints: ["driver"] },
      { id: "kyc", label: "Drivers & KYC", icon: <FileCheck2 size={16}/>, permissionHints: ["kyc", "verification", "driver"] },
      { id: "vehicles", label: "Vehicles", icon: <Building2 size={16}/>, permissionHints: ["vehicle", "driver"] },
      { id: "vehicleCatalog", label: "Vehicle Catalog", icon: <Building2 size={16}/>, permissionHints: ["vehicle", "configuration"] },
      { id: "events", label: "Events", icon: <Activity size={16}/>, permissionHints: ["event", "operation"] },
      { id: "quickRide", label: "Quick Ride", icon: <Gauge size={16}/>, permissionHints: ["booking", "quick"] },
      { id: "fieldOps", label: "Field Operations", icon: <Wrench size={16}/>, permissionHints: ["field", "operation"] },
      { id: "services", label: "Services", icon: <SlidersHorizontal size={16}/>, permissionHints: ["service", "configuration"] },
    ],
  },
  {
    label: "Routes & Location",
    items: [
      { id: "routeBuilder", label: "Route Builder", icon: <Route size={16}/>, permissionHints: ["route"] },
      { id: "workingRoutes", label: "Working Routes", icon: <Route size={16}/>, permissionHints: ["route", "driver"] },
      { id: "routesOps", label: "Route Operations", icon: <Route size={16}/>, permissionHints: ["route", "operation"] },
      { id: "locations", label: "Location Master", icon: <MapPinned size={16}/>, permissionHints: ["location"] },
      { id: "states", label: "State Master", icon: <MapPinned size={16}/>, permissionHints: ["state", "location"] },
      { id: "cities", label: "City Master", icon: <MapPinned size={16}/>, permissionHints: ["city", "location"] },
      { id: "cityZones", label: "City Zones", icon: <MapPinned size={16}/>, permissionHints: ["city", "zone", "location"] },
      { id: "quickLocations", label: "Quick Locations", icon: <MapPinned size={16}/>, permissionHints: ["location", "quick"] },
      { id: "availability", label: "Location Availability", icon: <MapPinned size={16}/>, permissionHints: ["location", "availability", "operation"] },
      { id: "sharingRoutes", label: "Sharing Ride Routes", icon: <Route size={16}/>, permissionHints: ["route", "shared"] },
      { id: "routeRules", label: "Route Rules", icon: <Settings size={16}/>, permissionHints: ["route", "configuration"] },
    ],
  },
  {
    label: "Users",
    items: [
      { id: "customers", label: "Customers", icon: <Users size={16}/>, permissionHints: ["customer"] },
    ],
  },
  {
    label: "Finance",
    items: [
      { id: "payments", label: "Payments", icon: <ReceiptText size={16}/>, permissionHints: ["payment"] },
      { id: "finance", label: "Settlements", icon: <WalletCards size={16}/>, permissionHints: ["finance", "settlement"] },
      { id: "pricing", label: "Pricing", icon: <SlidersHorizontal size={16}/>, permissionHints: ["operations", "pricing", "configuration"] },
      { id: "commission", label: "Commission", icon: <BarChart3 size={16}/>, permissionHints: ["commission", "finance"] },
      { id: "promotions", label: "Promotions", icon: <Megaphone size={16}/>, permissionHints: ["promotion", "finance"] },
    ],
  },
  {
    label: "Safety & Support",
    items: [
      { id: "safety", label: "Safety / SOS", icon: <Siren size={16}/>, permissionHints: ["safety", "sos"] },
      { id: "support", label: "Support & Disputes", icon: <LifeBuoy size={16}/>, permissionHints: ["support", "dispute"] },
      { id: "notifications", label: "Notifications", icon: <Bell size={16}/>, permissionHints: ["notification"] },
    ],
  },
  {
    label: "Reports",
    items: [
      { id: "reports", label: "Reports & Analytics", icon: <BarChart3 size={16}/>, permissionHints: ["report", "dashboard"] },
      { id: "dataMerge", label: "Data Merge", icon: <Database size={16}/>, permissionHints: ["merge", "platform", "data"] },
    ],
  },
  {
    label: "Security & Admin",
    items: [
      { id: "admins", label: "Admin Users", icon: <UserCog size={16}/>, permissionHints: ["admin"] },
      { id: "scopeAssignments", label: "Geographic Scope & Admin Assignment", icon: <MapPinned size={16}/>, superOnly: true, permissionHints: ["admin", "scope", "assignment"] },
      { id: "roles", label: "Roles & Permissions", icon: <LockKeyhole size={16}/>, superOnly: true, permissionHints: ["role", "permission"] },
      { id: "sessions", label: "Admin Sessions", icon: <Activity size={16}/>, superOnly: true, permissionHints: ["session", "presence"] },
      { id: "security", label: "Security Center", icon: <ShieldCheck size={16}/>, permissionHints: ["security", "otp"] },
      { id: "audit", label: "Audit Logs", icon: <ClipboardList size={16}/>, permissionHints: ["audit", "security"] },
      { id: "otp", label: "OTP Configuration", icon: <SlidersHorizontal size={16}/>, permissionHints: ["otp", "security", "configuration"] },
      { id: "integrations", label: "Integrations", icon: <Settings size={16}/>, superOnly: true, permissionHints: ["integration", "configuration"] },
      { id: "setup", label: "TEST Setup", icon: <Gauge size={16}/>, superOnly: true, permissionHints: ["test", "platform"] },
    ],
  },
  {
    label: "Platform",
    items: [
      { id: "platform", label: "TEST / LIVE Control", icon: <Activity size={16}/>, superOnly: true, permissionHints: ["platform", "environment"] },
      { id: "deliveryHealth", label: "Realtime & Delivery Health", icon: <Activity size={16}/>, permissionHints: ["notification", "gateway", "platform", "delivery"] },
      { id: "publicLinks", label: "Public Links & Downloads", icon: <Globe size={16}/>, superOnly: true, permissionHints: ["platform", "configuration", "public", "download"] },
      { id: "monitoring", label: "Monitoring", icon: <Database size={16}/>, superOnly: true, permissionHints: ["monitoring", "platform"] },
      { id: "botMonitor", label: "Bot Monitor", icon: <Activity size={16}/>, superOnly: true, permissionHints: ["bot", "monitoring", "platform"] },
      { id: "backup", label: "Backup & Recovery", icon: <Database size={16}/>, superOnly: true, permissionHints: ["backup", "recovery"] },
      { id: "gateway", label: "Gateway", icon: <Network size={16}/>, permissionHints: ["gateway", "platform"] },
    ],
  },
  {
    label: "Assets",
    items: [
      { id: "assets", label: "Assets", icon: <Wrench size={16}/>, permissionHints: ["asset", "configuration"] },
    ],
  },
];
const KNOWN_SCOPE_ROLES = new Set(["ADMIN", "GLOBAL", "STATE", "CITY", "GLOBAL_ADMIN", "STATE_ADMIN", "CITY_ADMIN"]);
const TOKEN_ALIASES: Record<string, string> = {
  bookings: "booking", rides: "ride", drivers: "driver", customers: "customer", locations: "location",
  notifications: "notification", permissions: "permission", roles: "role", reports: "report", routes: "route",
  settlements: "settlement", vehicles: "vehicle", operations: "operation", integrations: "integration",
};

function tokens(value: unknown): Set<string> {
  const parts = String(value ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const result = new Set(parts);
  for (const part of parts) result.add(TOKEN_ALIASES[part] ?? part);
  return result;
}

export function getVisibleGroups(ctx: AdminContext) {
  const rawRole = String(ctx.role || "").toUpperCase().replace(/^ADMIN_/, "");
  const explicitSuperAdmin = ctx.isSuperAdmin === true && ["SUPER_ADMIN", "SUPERADMIN"].includes(String(ctx.role || "").toUpperCase().replace(/[^A-Z]/g, ""));
  const role = rawRole;
  const roleAccess: Record<string, Set<Screen>> = {
    SUPER_ADMIN: new Set(NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id))),
    OPERATIONS: new Set([
      "dashboard","live","rides","matching","driversOps","drivers","kyc","vehicles","vehicleCatalog","events","quickRide","fieldOps","services",
      "routeBuilder","workingRoutes","routesOps","locations","states","cities","cityZones","quickLocations","availability","sharingRoutes","routeRules",
      "customers","promotions","notifications","reports","gateway","deliveryHealth","assets",
    ]),
    FINANCE: new Set(["dashboard","payments","finance","pricing","commission","promotions","reports"]),
    SAFETY: new Set(["dashboard","live","drivers","customers","rides","safety","notifications","reports"]),
    SUPPORT: new Set(["dashboard","customers","drivers","rides","support","notifications","deliveryHealth","reports"]),
    VERIFICATION_KYC: new Set(["dashboard","drivers","vehicles","vehicleCatalog","kyc","customers","reports"]),
  };

  // Unknown roles receive no default all-pages access. Generic admin/scope roles are
  // allowed to continue only through explicit module permissions below.
  const roleAllowed = roleAccess[role] ?? (KNOWN_SCOPE_ROLES.has(role) ? new Set<Screen>(NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id))) : new Set<Screen>());
  const scope = String(ctx.adminLevel || "").toUpperCase();
  const scopeValid = scope === "GLOBAL" || (scope === "STATE" && Boolean(ctx.stateId)) || (scope === "CITY" && Boolean(ctx.stateId && ctx.cityId));
  if (!scopeValid || (!explicitSuperAdmin && !String(ctx.role || "").trim())) return [];

  const permissionPairs = ctx.permissions.map((permission) => ({
    module: tokens(permission.module),
    action: tokens(permission.action),
  }));
  const scopeAllows = (item: NavItem) => {
    if (scope === "CITY" && ["states", "cities"].includes(item.id)) return false;
    if (scope === "STATE" && item.id === "states") return false;
    return true;
  };
  const hasExplicitOtpConfigurationPermission = permissionPairs.some((permission) =>
    (permission.action.has("configure") && (
      permission.module.has("security") ||
      (permission.module.has("system") && permission.module.has("configuration"))
    )) ||
    (permission.action.has("manage") && permission.module.has("security"))
  );
  const roleAllowsItem = (item: NavItem) =>
    roleAllowed.has(item.id) || (item.id === "otp" && hasExplicitOtpConfigurationPermission);
  const permissionAllows = (item: NavItem) => {
    if (explicitSuperAdmin) return true;
    if (item.superOnly || !item.permissionHints?.length) return false;
    return item.permissionHints.some((hint) => {
      const required = tokens(hint);
      return permissionPairs.some((permission) => [...required].some((token) => permission.module.has(token) || permission.action.has(token)));
    });
  };

  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => roleAllowsItem(item) && scopeAllows(item) && permissionAllows(item)),
  })).filter((group) => group.items.length);
}

export function isScreenVisible(ctx: AdminContext, screen: Screen): boolean {
  return getVisibleGroups(ctx).some((group) => group.items.some((item) => item.id === screen));
}

