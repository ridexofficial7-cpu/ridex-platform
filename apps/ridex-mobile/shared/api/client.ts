import { getRideXApiV1Url } from './config';

import { getSecureToken } from "../security/secureTokenStorage";
export type RideXApiClientOptions = {
  tokenKey?: string;
  token?: string;
  apiUrl?: string;
  timeoutMs?: number;
};

export type RideXRequestOptions = RequestInit & {
  skipAuth?: boolean;
};

export type RideXApiErrorDetails = {
  status?: number;
  code?: string;
  requestId?: string;
  retryable?: boolean;
  details?: unknown;
};

/**
 * Normalized RideX API error.
 *
 * The client keeps the HTTP status, backend error code, request id and
 * retryability available to callers so app layers can make deterministic
 * decisions without parsing error-message strings.
 */
export class RideXApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(message: string, input: RideXApiErrorDetails = {}) {
    super(message);
    this.name = 'RideXApiError';
    this.status = input.status ?? 0;
    this.code = input.code;
    this.requestId = input.requestId;
    this.retryable = Boolean(input.retryable);
    this.details = input.details;
  }
}

export function getRideXApiUrl(apiUrl?: string): string {
  return getRideXApiV1Url(apiUrl);
}

function joinUrl(baseUrl: string, input: RequestInfo | URL): string {
  if (input instanceof URL) {
    return input.toString();
  }

  // Request is part of RequestInfo. Preserve its actual URL for origin checks;
  // String(request) produces "[object Request]" and can bypass the intended
  // same-origin credential decision or make the request target invalid.
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.url;
  }

  if (typeof input !== 'string') {
    return String(input);
  }

  if (/^https?:\/\//i.test(input)) {
    return input;
  }

  return `${baseUrl}/${input.replace(/^\/+/, '')}`;
}

function mergeHeaders(init?: HeadersInit): Headers {
  return new Headers(init ?? {});
}

function makeRequestId(): string {
  const now = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `ridex-${now}-${random}`;
}

function isFormDataBody(body: unknown): boolean {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

function isBlobBody(body: unknown): boolean {
  return typeof Blob !== 'undefined' && body instanceof Blob;
}

function isArrayBufferBody(body: unknown): boolean {
  return typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer;
}

function isRawBody(body: unknown): boolean {
  return (
    typeof body === 'string' ||
    isFormDataBody(body) ||
    isBlobBody(body) ||
    isArrayBufferBody(body)
  );
}

function shouldSetJsonContentType(body: unknown): boolean {
  if (body == null || isRawBody(body)) {
    return false;
  }

  return typeof body === 'object';
}

function isRetryableStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

function getResponseRequestId(response: Response): string | undefined {
  return (
    response.headers.get('X-Request-ID') ??
    response.headers.get('x-request-id') ??
    undefined
  );
}

function getBodyMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }

  const candidate = body as Record<string, unknown>;

  if (typeof candidate.message === 'string' && candidate.message.trim()) {
    return candidate.message.trim();
  }

  if (
    typeof candidate.error === 'object' &&
    candidate.error !== null
  ) {
    const error = candidate.error as Record<string, unknown>;
    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message.trim();
    }
  }

  return undefined;
}

function getBodyCode(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }

  const candidate = body as Record<string, unknown>;

  if (typeof candidate.code === 'string') {
    return candidate.code;
  }

  if (
    typeof candidate.error === 'object' &&
    candidate.error !== null
  ) {
    const error = candidate.error as Record<string, unknown>;
    if (typeof error.code === 'string') {
      return error.code;
    }
  }

  return undefined;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }

  const text = await response.text().catch(() => '');
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function makeAbortError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export function createRideXFetch(
  options: RideXApiClientOptions = {},
) {
  const baseUrl = getRideXApiUrl(options.apiUrl);
  const timeoutMs = options.timeoutMs ?? 30_000;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('RideX API timeoutMs must be greater than 0');
  }

  return async function rideXFetch(
    input: RequestInfo | URL,
    init: RideXRequestOptions = {},
  ): Promise<Response> {
    const { skipAuth, ...requestInit } = init;
    const sourceRequest =
      typeof Request !== 'undefined' && input instanceof Request ? input : null;
    const headers = mergeHeaders(sourceRequest?.headers);
    new Headers(requestInit.headers ?? {}).forEach((value, key) => headers.set(key, value));
    const requestUrl = joinUrl(baseUrl, input);
    // Never attach bearer credentials to an absolute URL on another origin.
    // Also remove a caller-supplied Authorization header on cross-origin calls.
    let sameApiOrigin = false;
    try {
      sameApiOrigin = new URL(requestUrl).origin === new URL(baseUrl).origin;
    } catch {
      sameApiOrigin = false;
    }
    if (!sameApiOrigin) headers.delete('Authorization');
    const method = String(requestInit.method ?? sourceRequest?.method ?? 'GET').toUpperCase();

    if (
      requestInit.body &&
      !headers.has('Content-Type') &&
      method !== 'GET' &&
      method !== 'HEAD' &&
      shouldSetJsonContentType(requestInit.body)
    ) {
      headers.set('Content-Type', 'application/json');
    }

    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }

    if (!headers.has('X-Request-ID')) {
      headers.set('X-Request-ID', makeRequestId());
    }

    if (!skipAuth && sameApiOrigin) {
      const token =
        options.token ??
        (options.tokenKey
          ? await getSecureToken(options.tokenKey)
          : null);

      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }

    const controller = new AbortController();
    // Preserve cancellation supplied by a Request object when the caller does
    // not provide an explicit init.signal. Otherwise wrapping a Request to add
    // security headers can silently detach its cancellation contract.
    const callerSignal = requestInit.signal ?? sourceRequest?.signal;
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const handleCallerAbort = () => {
      controller.abort();
    };

    if (callerSignal) {
      if (callerSignal.aborted) {
        controller.abort();
      } else {
        callerSignal.addEventListener('abort', handleCallerAbort, {
          once: true,
        });
      }
    }

    try {
      // Passing the original Request preserves its body and standard request
      // options. String/URL inputs use the normalized absolute URL as before.
      return await fetch(sourceRequest ?? requestUrl, {
        ...requestInit,
        headers,
        // API endpoints must not redirect authenticated requests to another
        // origin. Reject redirects instead of relying on platform-specific
        // cross-origin Authorization stripping behavior.
        redirect: headers.has('Authorization') ? 'error' : requestInit.redirect,
        // Authenticated API responses can contain account, trip, or payment
        // data. Never let the client HTTP cache retain those responses.
        cache: headers.has('Authorization') ? 'no-store' : requestInit.cache,
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) {
        throw new RideXApiError(
          `RideX API request timed out after ${timeoutMs}ms`,
          {
            status: 408,
            retryable: true,
          },
        );
      }

      if (controller.signal.aborted) {
        if (callerSignal?.aborted) {
          throw makeAbortError('RideX API request was cancelled');
        }

        throw error;
      }

      throw error;
    } finally {
      clearTimeout(timeout);

      if (callerSignal) {
        callerSignal.removeEventListener('abort', handleCallerAbort);
      }
    }
  };
}

export function createRideXApiClient(
  options: RideXApiClientOptions = {},
) {
  const baseUrl = getRideXApiUrl(options.apiUrl);
  const request = createRideXFetch(options);

  async function json<T = unknown>(
    path: string,
    init: RideXRequestOptions = {},
  ): Promise<T> {
    const response = await request(path, init);
    const body = await parseResponseBody(response);

    const success =
      body &&
      typeof body === 'object' &&
      'success' in body
        ? (body as Record<string, unknown>).success
        : undefined;

    if (!response.ok || success === false) {
      throw new RideXApiError(
        getBodyMessage(body) ||
          `RideX API request failed (${response.status})`,
        {
          status: response.status,
          code: getBodyCode(body),
          requestId: getResponseRequestId(response),
          retryable: isRetryableStatus(response.status),
          details: body,
        },
      );
    }

    if (
      body &&
      typeof body === 'object' &&
      'data' in body
    ) {
      return (body as Record<string, unknown>).data as T;
    }

    return body as T;
  }

  function serializeBody(
    body: unknown,
    fallback: BodyInit | null | undefined,
  ): BodyInit | null | undefined {
    if (body === undefined) {
      return fallback;
    }

    if (isRawBody(body)) {
      return body as BodyInit;
    }

    return JSON.stringify(body);
  }

  return {
    baseUrl,
    request,
    json,

    get: <T = unknown>(
      path: string,
      init: RideXRequestOptions = {},
    ) =>
      json<T>(path, {
        ...init,
        method: 'GET',
      }),

    post: <T = unknown>(
      path: string,
      body?: unknown,
      init: RideXRequestOptions = {},
    ) =>
      json<T>(path, {
        ...init,
        method: 'POST',
        body: serializeBody(body, init.body),
      }),

    put: <T = unknown>(
      path: string,
      body?: unknown,
      init: RideXRequestOptions = {},
    ) =>
      json<T>(path, {
        ...init,
        method: 'PUT',
        body: serializeBody(body, init.body),
      }),

    patch: <T = unknown>(
      path: string,
      body?: unknown,
      init: RideXRequestOptions = {},
    ) =>
      json<T>(path, {
        ...init,
        method: 'PATCH',
        body: serializeBody(body, init.body),
      }),

    delete: <T = unknown>(
      path: string,
      init: RideXRequestOptions = {},
    ) =>
      json<T>(path, {
        ...init,
        method: 'DELETE',
      }),
  };
}
