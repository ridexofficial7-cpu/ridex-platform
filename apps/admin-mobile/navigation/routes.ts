/**
 * RideX Unified Navigation Route Registry
 *
 * Route-key contracts only. Authentication, onboarding state, business rules
 * and operational eligibility remain backend-authoritative.
 *
 * Testing architecture:
 * - CUSTOMER
 * - DRIVER
 * - ADMIN
 * are available inside the same Android APK.
 */



export const ADMIN_SCREENS = [
  "login",
  "otp",
  "dashboard",
  "live",
  "bookings",
  "customers",
  "drivers",
  "vehicles",
  "kyc",
  "matching",
  "matching-config",
  "events",
  "finance",
  "payments",
  "support",
  "safety",
  "notifications",
  "promotions",
  "pricing",
  "zones",
  "reports",
  "admins",
  "roles",
  "audit",
  "settings",
  "platform",
  "test-data",
  "routes",
  "locations",
  "route-builder",
  "otp-security",
  "presence",
  "vehicleCatalog",
  "gateway",
  "availability",
] as const;

export type AdminScreen = (typeof ADMIN_SCREENS)[number];

/** Unified application roles used by App.tsx. */
export type AppRole = "CUSTOMER" | "DRIVER" | "ADMIN";

export const DEFAULT_ROLE: AppRole = "CUSTOMER";
