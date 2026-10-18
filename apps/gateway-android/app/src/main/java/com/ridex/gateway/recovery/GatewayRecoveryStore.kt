package com.ridex.gateway.recovery

import android.content.Context

/** Persists non-secret watchdog/recovery telemetry. */
class GatewayRecoveryStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(
        PREFS_NAME,
        Context.MODE_PRIVATE,
    )

    fun recordServiceStart(nowMs: Long = System.currentTimeMillis()) {
        prefs.edit()
            .putLong(KEY_LAST_SERVICE_START_AT, nowMs)
            .putString(KEY_LAST_RECOVERY_ACTION, "SERVICE_STARTED")
            .apply()
    }

    fun recordWorkerCycle(nowMs: Long = System.currentTimeMillis()) {
        prefs.edit()
            .putLong(KEY_LAST_WORKER_CYCLE_AT, nowMs)
            .apply()
    }

    fun recordWatchdogRestart(nowMs: Long = System.currentTimeMillis()) {
        val count = prefs.getInt(KEY_WATCHDOG_RESTART_COUNT, 0) + 1
        prefs.edit()
            .putInt(KEY_WATCHDOG_RESTART_COUNT, count)
            .putLong(KEY_LAST_WATCHDOG_AT, nowMs)
            .putString(KEY_LAST_RECOVERY_ACTION, "WORKER_EXECUTOR_RESTARTED")
            .apply()
    }

    fun recordServiceStopped(nowMs: Long = System.currentTimeMillis()) {
        prefs.edit()
            .putLong(KEY_LAST_SERVICE_STOP_AT, nowMs)
            .putString(KEY_LAST_RECOVERY_ACTION, "SERVICE_STOPPED")
            .apply()
    }

    fun recordTaskRemoved(nowMs: Long = System.currentTimeMillis()) {
        prefs.edit()
            .putString(KEY_LAST_RECOVERY_ACTION, "TASK_REMOVED_SERVICE_PERSISTING")
            .putLong(KEY_LAST_TASK_REMOVED_AT, nowMs)
            .apply()
    }

    fun read(): GatewayRecoverySnapshot = GatewayRecoverySnapshot(
        lastServiceStartAt = prefs.getLong(KEY_LAST_SERVICE_START_AT, 0L).takeIf { it > 0L },
        lastWorkerCycleAt = prefs.getLong(KEY_LAST_WORKER_CYCLE_AT, 0L).takeIf { it > 0L },
        watchdogRestartCount = prefs.getInt(KEY_WATCHDOG_RESTART_COUNT, 0),
        lastWatchdogAt = prefs.getLong(KEY_LAST_WATCHDOG_AT, 0L).takeIf { it > 0L },
        lastServiceStopAt = prefs.getLong(KEY_LAST_SERVICE_STOP_AT, 0L).takeIf { it > 0L },
        lastRecoveryAction = prefs.getString(KEY_LAST_RECOVERY_ACTION, "NOT_RUN") ?: "NOT_RUN",
    )

    companion object {
        private const val PREFS_NAME = "ridex_gateway_recovery_v1"
        private const val KEY_LAST_SERVICE_START_AT = "last_service_start_at"
        private const val KEY_LAST_WORKER_CYCLE_AT = "last_worker_cycle_at"
        private const val KEY_WATCHDOG_RESTART_COUNT = "watchdog_restart_count"
        private const val KEY_LAST_WATCHDOG_AT = "last_watchdog_at"
        private const val KEY_LAST_SERVICE_STOP_AT = "last_service_stop_at"
        private const val KEY_LAST_TASK_REMOVED_AT = "last_task_removed_at"
        private const val KEY_LAST_RECOVERY_ACTION = "last_recovery_action"
    }
}

data class GatewayRecoverySnapshot(
    val lastServiceStartAt: Long?,
    val lastWorkerCycleAt: Long?,
    val watchdogRestartCount: Int,
    val lastWatchdogAt: Long?,
    val lastServiceStopAt: Long?,
    val lastRecoveryAction: String,
)
