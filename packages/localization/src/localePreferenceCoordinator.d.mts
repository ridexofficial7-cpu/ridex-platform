import type { RideXSupportedLocale } from './localeResolver.mjs';
export interface RideXLocaleSyncIntentInput { locale?: unknown; selectionGeneration?: number; authenticated?: boolean; }
export type RideXLocaleSyncIntent =
 | { readonly status: 'READY'; readonly locale: RideXSupportedLocale; readonly selectionGeneration: number }
 | { readonly status: 'NOT_AUTHENTICATED' | 'UNSUPPORTED_LOCALE' | 'INVALID_SELECTION_GENERATION' };
export declare function createRideXLocaleSyncIntent(input?: RideXLocaleSyncIntentInput): RideXLocaleSyncIntent;
export interface RideXAccountPreferenceReadGuardInput {
  requestGeneration?: number;
  currentGeneration?: number;
  hasCurrentSessionExplicitSelection?: boolean;
  accountLocale?: unknown;
}
export declare function canApplyRideXAccountPreferenceRead(input?: RideXAccountPreferenceReadGuardInput): boolean;
export interface RideXLocaleSyncResultInput { requestGeneration?: number; currentGeneration?: number; requestSucceeded?: boolean; }
export type RideXLocaleSyncResultStatus = 'INVALID_SELECTION_GENERATION' | 'SYNC_FAILED_KEEP_CURRENT' | 'STALE_SYNC_RESULT_IGNORED' | 'SYNC_CONFIRMED_KEEP_CURRENT';
export interface RideXLocaleSyncResult { readonly status: RideXLocaleSyncResultStatus; readonly shouldKeepCurrentLocale: true; }
export declare function classifyRideXLocaleSyncResult(input?: RideXLocaleSyncResultInput): RideXLocaleSyncResult;
