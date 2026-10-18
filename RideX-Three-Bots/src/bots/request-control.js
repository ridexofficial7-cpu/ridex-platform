/**
 * Bot 1 — Request Control.
 * Safe primitives for a future backend integration. Does not cache business data.
 */
export class RequestControlBot {
  constructor({ windowMs = 60_000, maxRequests = 120, now = () => Date.now() } = {}) {
    this.windowMs = Math.max(1_000, Number(windowMs) || 60_000);
    this.maxRequests = Math.max(1, Number(maxRequests) || 120);
    this.now = now;
    this.buckets = new Map();
    this.inFlightGets = new Map();
  }

  checkLimit(clientKey) {
    const key = String(clientKey || "unknown").slice(0, 160);
    const now = this.now();
    const current = this.buckets.get(key);
    const bucket = !current || now - current.startedAt >= this.windowMs
      ? { startedAt: now, count: 0 }
      : current;
    bucket.count += 1;
    this.buckets.set(key, bucket);
    if (this.buckets.size > 10_000) {
      for (const [k, v] of this.buckets) {
        if (now - v.startedAt >= this.windowMs) this.buckets.delete(k);
      }
    }
    return {
      allowed: bucket.count <= this.maxRequests,
      remaining: Math.max(0, this.maxRequests - bucket.count),
      retryAfterMs: Math.max(0, this.windowMs - (now - bucket.startedAt))
    };
  }

  /**
   * Coalesces only simultaneous, explicitly safe GET work inside this process.
   * Caller must supply a key that includes identity/scope when data is private.
   * No result is cached after the promise settles.
   */
  coalesceSafeGet(key, work) {
    const safeKey = String(key || "");
    if (!safeKey || typeof work !== "function") {
      return Promise.reject(new TypeError("A non-empty safe GET key and work function are required."));
    }
    if (this.inFlightGets.has(safeKey)) return this.inFlightGets.get(safeKey);
    const promise = Promise.resolve().then(work);
    this.inFlightGets.set(safeKey, promise);
    promise.finally(() => {
      if (this.inFlightGets.get(safeKey) === promise) this.inFlightGets.delete(safeKey);
    }).catch(() => {});
    return promise;
  }

  status() {
    return { name: "request-control", mode: "active-local-primitives", activeCoalescedGets: this.inFlightGets.size };
  }
}
