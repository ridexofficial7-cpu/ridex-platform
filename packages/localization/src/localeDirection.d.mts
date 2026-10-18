export type RideXTextDirection = 'ltr';
export declare function resolveRideXTextDirection(locale: string): RideXTextDirection;
export declare function isRideXLocaleDirectionSupported(locale: string, direction: string): boolean;
export declare function isolateRideXDirectionalValue(value: string | number): string;
export declare const RideXSupportedDirectionLocales: readonly ['en-IN', 'hi-IN'];
