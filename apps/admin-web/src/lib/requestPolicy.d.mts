export function isSafeReadMethod(method: string): boolean;
export function isRetryableStatus(status: number): boolean;
export function retryDelayMs(retryAfterHeader: string | null, attempt: number, now?: number): number;
export function waitWithAbort(ms: number, signal?: AbortSignal): Promise<void>;

export function shouldBlockUnverifiedAdminMutation(path: string, method: string, contractStatus: string): boolean;

export function isSafeApiPath(path: unknown): boolean;
