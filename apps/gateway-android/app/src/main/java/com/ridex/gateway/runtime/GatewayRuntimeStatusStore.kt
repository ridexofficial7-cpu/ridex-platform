package com.ridex.gateway.runtime

import android.content.Context
import com.ridex.gateway.network.NetworkRuntimeState
import com.ridex.gateway.network.NetworkStateStore
import com.ridex.gateway.network.NetworkTransport

/** Stores only operational state; no tokens, OTPs, SMS bodies, or SIM secrets are written here. */
class GatewayRuntimeStatusStore(context: Context) {
    private val appContext = context.applicationContext
    private val networkStateStore = NetworkStateStore(appContext)
    private val prefs = appContext.getSharedPreferences(
        PREFS_NAME,
        Context.MODE_PRIVATE,
    )

    fun read(): GatewayRuntimeStatus = GatewayRuntimeStatus(
        serviceRunning = prefs.getBoolean(KEY_SERVICE_RUNNING, false),
        providerState = runCatching {
            ProviderConnectionState.valueOf(
                prefs.getString(KEY_PROVIDER_STATE, ProviderConnectionState.NOT_CONFIGURED.name)
                    ?: ProviderConnectionState.NOT_CONFIGURED.name,
            )
        }.getOrDefault(ProviderConnectionState.NOT_CONFIGURED),
        lastHeartbeatAtEpochMs = prefs.getLong(KEY_LAST_HEARTBEAT_AT, 0L).takeIf { it > 0L },
        lastHeartbeatResult = prefs.getString(KEY_LAST_HEARTBEAT_RESULT, "NOT_RUN") ?: "NOT_RUN",
        lastError = prefs.getString(KEY_LAST_ERROR, null),
        network = networkStateStore.read(),
        lastSmsQueueSyncAtEpochMs = prefs.getLong(KEY_SMS_QUEUE_SYNC_AT, 0L).takeIf { it > 0L },
        lastSmsQueueSyncResult = prefs.getString(KEY_SMS_QUEUE_RESULT, "NOT_RUN") ?: "NOT_RUN",
        lastSmsQueueFetchedCount = prefs.getInt(KEY_SMS_QUEUE_FETCHED, 0),
        lastSmsQueueAddedCount = prefs.getInt(KEY_SMS_QUEUE_ADDED, 0),
        lastSmsQueueRequestId = prefs.getString(KEY_SMS_QUEUE_REQUEST_ID, null),
        lastSmsQueueError = prefs.getString(KEY_SMS_QUEUE_ERROR, null),
        lastCallCycleAtEpochMs = prefs.getLong(KEY_CALL_CYCLE_AT, 0L).takeIf { it > 0L },
        lastCallCycleResult = prefs.getString(KEY_CALL_CYCLE_RESULT, "NOT_RUN") ?: "NOT_RUN",
        lastCallIngestedCount = prefs.getInt(KEY_CALL_INGESTED, 0),
        lastCallError = prefs.getString(KEY_CALL_ERROR, null),
    )

    fun setServiceRunning(value: Boolean) {
        prefs.edit().putBoolean(KEY_SERVICE_RUNNING, value).apply()
    }

    fun setProviderState(value: ProviderConnectionState) {
        prefs.edit().putString(KEY_PROVIDER_STATE, value.name).apply()
    }

    fun recordHeartbeatSuccess(timestampEpochMs: Long = System.currentTimeMillis()) {
        prefs.edit()
            .putLong(KEY_LAST_HEARTBEAT_AT, timestampEpochMs)
            .putString(KEY_LAST_HEARTBEAT_RESULT, "SUCCESS")
            .remove(KEY_LAST_ERROR)
            .apply()
    }


    fun recordSmsQueueCycle(
        result: String,
        fetchedCount: Int? = null,
        addedCount: Int? = null,
        requestId: String? = null,
        error: String? = null,
        clearError: Boolean = false,
        timestampEpochMs: Long = System.currentTimeMillis(),
    ) {
        prefs.edit()
            .putLong(KEY_SMS_QUEUE_SYNC_AT, timestampEpochMs)
            .putString(KEY_SMS_QUEUE_RESULT, result.take(MAX_ERROR_LENGTH))
            .apply {
                if (fetchedCount != null) putInt(KEY_SMS_QUEUE_FETCHED, fetchedCount.coerceAtLeast(0))
                if (addedCount != null) putInt(KEY_SMS_QUEUE_ADDED, addedCount.coerceAtLeast(0))
                if (!requestId.isNullOrBlank()) putString(KEY_SMS_QUEUE_REQUEST_ID, requestId.take(128))
                if (clearError) remove(KEY_SMS_QUEUE_ERROR)
                if (!error.isNullOrBlank()) putString(KEY_SMS_QUEUE_ERROR, error.take(MAX_ERROR_LENGTH))
            }
            .apply()
    }


    fun recordCallCycle(
        result: String,
        ingestedCount: Int? = null,
        error: String? = null,
        clearError: Boolean = false,
        timestampEpochMs: Long = System.currentTimeMillis(),
    ) {
        prefs.edit()
            .putLong(KEY_CALL_CYCLE_AT, timestampEpochMs)
            .putString(KEY_CALL_CYCLE_RESULT, result.take(MAX_ERROR_LENGTH))
            .apply {
                if (ingestedCount != null) putInt(KEY_CALL_INGESTED, ingestedCount.coerceAtLeast(0))
                if (clearError) remove(KEY_CALL_ERROR)
                if (!error.isNullOrBlank()) putString(KEY_CALL_ERROR, error.take(MAX_ERROR_LENGTH))
            }
            .apply()
    }

    fun recordHeartbeatResult(result: String, error: String? = null) {
        prefs.edit()
            .putString(KEY_LAST_HEARTBEAT_RESULT, result)
            .apply {
                if (error.isNullOrBlank()) remove(KEY_LAST_ERROR)
                else putString(KEY_LAST_ERROR, error.take(MAX_ERROR_LENGTH))
            }
            .apply()
    }

    companion object {
        private const val PREFS_NAME = "ridex_gateway_runtime_v1"
        private const val KEY_SERVICE_RUNNING = "service_running"
        private const val KEY_PROVIDER_STATE = "provider_state"
        private const val KEY_LAST_HEARTBEAT_AT = "last_heartbeat_at"
        private const val KEY_LAST_HEARTBEAT_RESULT = "last_heartbeat_result"
        private const val KEY_LAST_ERROR = "last_error"
        private const val KEY_SMS_QUEUE_SYNC_AT = "sms_queue_sync_at"
        private const val KEY_SMS_QUEUE_RESULT = "sms_queue_result"
        private const val KEY_SMS_QUEUE_FETCHED = "sms_queue_fetched"
        private const val KEY_SMS_QUEUE_ADDED = "sms_queue_added"
        private const val KEY_SMS_QUEUE_REQUEST_ID = "sms_queue_request_id"
        private const val KEY_SMS_QUEUE_ERROR = "sms_queue_error"
        private const val KEY_CALL_CYCLE_AT = "call_cycle_at"
        private const val KEY_CALL_CYCLE_RESULT = "call_cycle_result"
        private const val KEY_CALL_INGESTED = "call_ingested"
        private const val KEY_CALL_ERROR = "call_error"
        private const val MAX_ERROR_LENGTH = 180
    }
}
