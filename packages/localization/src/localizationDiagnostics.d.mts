export type RideXDiagnosticLocale = 'en-IN' | 'hi-IN';
export interface RideXMissingKeyDiagnostic {
  key?: unknown;
  locale?: unknown;
}
export interface RideXMissingKeyReporterOptions {
  environment?: 'TEST' | 'LIVE' | string;
  debugEnabled?: boolean;
  build?: string;
  maxReported?: number;
  logger?: { warn: (message: string, metadata: Readonly<{ key: string; locale: RideXDiagnosticLocale; build: string }>) => void };
}
export interface RideXMissingKeyReporter {
  readonly enabled: boolean;
  reportMissing: (input?: RideXMissingKeyDiagnostic) => boolean;
  getReportedCount: () => number;
}
export declare function createRideXMissingKeyReporter(options?: RideXMissingKeyReporterOptions): RideXMissingKeyReporter;
