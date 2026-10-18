export type RideXSupportedLocale = 'en-IN' | 'hi-IN';
export type RideXLocaleSource =
  | 'CURRENT_SESSION_EXPLICIT_SELECTION'
  | 'ACCOUNT_PREFERENCE'
  | 'LOCAL_PREFERENCE'
  | 'DEVICE_LOCALE'
  | 'DEFAULT_FALLBACK';
export type RideXLocaleDiagnostic =
  | 'UNSUPPORTED_CURRENT_SESSION_SELECTION'
  | 'UNSUPPORTED_ACCOUNT_PREFERENCE'
  | 'UNSUPPORTED_LOCAL_PREFERENCE'
  | 'UNSUPPORTED_DEVICE_LOCALE';
export interface RideXLocaleResolutionInput {
  authenticated?: boolean;
  currentSessionExplicitLocale?: unknown;
  localPreference?: unknown;
  accountPreference?: unknown;
  deviceLocales?: unknown;
}
export interface RideXLocaleResolution {
  readonly locale: RideXSupportedLocale;
  readonly source: RideXLocaleSource;
  readonly shouldPersistLocalPreference: boolean;
  readonly shouldSyncAccountPreference: boolean;
  /** Safe diagnostic codes only; never includes raw locale/user/account data. */
  readonly diagnostics: readonly RideXLocaleDiagnostic[];
}
export declare function normalizeExplicitRideXLocale(candidate: unknown): RideXSupportedLocale | undefined;
export declare function isSupportedRideXLocale(candidate: unknown): candidate is RideXSupportedLocale;
export declare function normalizeDeviceRideXLocale(candidate: unknown): RideXSupportedLocale | undefined;
export declare function resolveRideXLocale(input?: RideXLocaleResolutionInput): RideXLocaleResolution;
export declare const RIDEX_SUPPORTED_LOCALES: readonly RideXSupportedLocale[];
