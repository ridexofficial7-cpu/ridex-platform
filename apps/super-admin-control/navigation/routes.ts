/**
 * Independent Super Admin Control route contract.
 * Structural shell routes only; privileged operational actions are intentionally not exposed yet.
 */
export const SUPER_ADMIN_CONTROL_SCREENS = ["privateUnlock", "trustedDeviceEnrollment", "secureRecovery"] as const;
export type SuperAdminControlScreen = (typeof SUPER_ADMIN_CONTROL_SCREENS)[number];
