package com.ridex.gateway.recovery

/** Pure deterministic watchdog policy; no Android dependencies. */
object GatewayWatchdogPolicy {
    const val CHECK_INTERVAL_MS = 30_000L
    const val STALE_THRESHOLD_MS = 150_000L

    fun shouldRestartWorker(lastWorkerCycleAtMs: Long, nowMs: Long): Boolean {
        if (lastWorkerCycleAtMs <= 0L) return false
        if (nowMs < lastWorkerCycleAtMs) return false
        return nowMs - lastWorkerCycleAtMs >= STALE_THRESHOLD_MS
    }
}
