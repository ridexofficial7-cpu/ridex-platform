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

export const CUSTOMER_SCREENS = [
  "welcome",
  "login",
  "otp",
  "home",
  "location",
  "rideType",
  "goods",
  "fare",
  "confirmed",
  "payment",
  "rating",
  "rebook",
  "gallery",
  "safety",
  "rides",
  "profile",
  "wallet",
  "editProfile",
  "support",
  "notifications",
  "event",
  "qrScanner",
  "rideDetails",
  "display",
] as const;

export type CustomerScreen = (typeof CUSTOMER_SCREENS)[number];



/** Unified application roles used by App.tsx. */
export type AppRole = "CUSTOMER" | "DRIVER" | "ADMIN";

export const DEFAULT_ROLE: AppRole = "CUSTOMER";
