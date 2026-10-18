/**
 * Admin mobile asset registry.
 *
 * The Admin client intentionally ships without a second bundled image pack.
 * Navigation icons are rendered by AssetIcon using deterministic text fallbacks.
 * Backend-managed media can be introduced later without changing this registry.
 */
export const ADMIN_MOBILE_ASSETS = {
  logo: null,
  icons: {},
} as const;
