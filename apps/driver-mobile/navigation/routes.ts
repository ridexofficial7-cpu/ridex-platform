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


export const DRIVER_SCREENS = [
  "welcome",
  "login",
  "otp",
  "registration",
  "applicationStatus",
  "onboardingStatus",
  "home",
  "request",
  "accepted",
  "arrived",
  "trip",
  "completed",
  "history",
  "earnings",
  "wallet",
  "profile",
  "kyc",
  "payout",
  "safety",
  "sos",
  "notifications",
  "messages",
  "serviceMode",
] as const;

export type DriverScreen = (typeof DRIVER_SCREENS)[number];


/** Unified application roles used by App.tsx. */
export type AppRole = "CUSTOMER" | "DRIVER" | "ADMIN";

export const DEFAULT_ROLE: AppRole = "CUSTOMER";
