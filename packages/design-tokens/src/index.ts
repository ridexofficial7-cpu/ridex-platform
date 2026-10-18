/**
 * RideX cross-surface design tokens.
 *
 * This package is dependency-free by design.  Business and security behavior
 * must never depend on these presentation-only values.
 */
export const RIDEX_DESIGN_TOKENS = {
  color: {
    primary: '#E11D48',
    primaryDark: '#BE123C',
    primarySoft: '#FFF1F2',
    ink: '#0F172A',
    text: '#334155',
    muted: '#64748B',
    mutedSubtle: '#94A3B8',
    border: '#E5E7EB',
    borderStrong: '#D7DEEB',
    surface: '#FFFFFF',
    surfaceSoft: '#F8FAFC',
    surfaceTint: '#F1F5F9',
    success: '#15803D',
    successSoft: '#ECFDF3',
    warning: '#B45309',
    warningSoft: '#FFF8E8',
    danger: '#DC2626',
    dangerSoft: '#FEF2F2',
    info: '#2563EB',
    infoSoft: '#EFF6FF',
    focus: 'rgba(225, 29, 72, 0.24)',
    shadow: 'rgba(15, 23, 42, 0.06)',
  },
  spacing: { xs: 6, sm: 10, md: 14, lg: 18, xl: 24, xxl: 30 },
  radius: { xs: 8, sm: 10, md: 14, lg: 18, xl: 20, pill: 999 },
  typography: { body: 14, caption: 12, title: 20, display: 28 },
  motion: { fastMs: 160, normalMs: 220, slowMs: 320 },
} as const;

const C = RIDEX_DESIGN_TOKENS.color;

/** Alias map retained for the current Customer and shared mobile surfaces. */
export const RIDEX_CUSTOMER_COLORS = {
  red: C.primary,
  darkRed: C.primaryDark,
  black: C.ink,
  text: C.text,
  muted: C.muted,
  line: C.border,
  bg: C.surfaceSoft,
  softRed: C.primarySoft,
  softGreen: C.successSoft,
  green: '#10B981',
  softBlue: C.infoSoft,
  blue: '#3B82F6',
  mapBg: C.surfaceTint,
} as const;

/** Alias map retained for existing Driver component style contracts. */
export const RIDEX_DRIVER_COLORS = {
  red: C.primary,
  redDark: C.primaryDark,
  black: C.ink,
  text: C.text,
  muted: C.muted,
  border: C.border,
  background: C.surfaceSoft,
  white: C.surface,
  softRed: C.primarySoft,
  softGreen: C.successSoft,
  green: C.success,
  amber: C.warning,
  softAmber: C.warningSoft,
  softBlue: C.infoSoft,
  blue: C.info,
} as const;

export const RIDEX_ADMIN_THEME = {
  background: C.surfaceSoft,
  surface: C.surface,
  text: C.ink,
  muted: C.muted,
  border: C.border,
  primary: C.primary,
  primaryDark: C.primaryDark,
  primarySoft: C.primarySoft,
  green: '#10B981',
  greenDark: '#059669',
  greenSoft: C.successSoft,
  red: C.primary,
  redSoft: C.primarySoft,
  yellow: '#F59E0B',
  blue: '#3B82F6',
  navy: C.ink,
  shadow: C.shadow,
} as const;

/** Current shared app-shell palette; key names preserve existing StyleSheet use. */
export const RIDEX_MOBILE_SHELL_COLORS = {
  red: C.primary,
  redDark: C.primaryDark,
  black: C.ink,
  muted: C.muted,
  border: C.border,
  background: C.surfaceSoft,
  white: C.surface,
  softRed: C.primarySoft,
  amber: C.warning,
  softAmber: C.warningSoft,
} as const;

export const RIDEX_SPACING = RIDEX_DESIGN_TOKENS.spacing;
