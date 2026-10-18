package com.ridex.gateway.network

import android.content.Context
import org.json.JSONObject

/** Stores only non-sensitive connectivity state for UI/diagnostics. */
class NetworkStateStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(
        PREFS_NAME,
        Context.MODE_PRIVATE,
    )

    fun read(): NetworkRuntimeState = NetworkRuntimeState(
        available = prefs.getBoolean(KEY_AVAILABLE, false),
        validatedInternet = prefs.getBoolean(KEY_VALIDATED, false),
        metered = prefs.getBoolean(KEY_METERED, true),
        transport = runCatching {
            NetworkTransport.valueOf(
                prefs.getString(KEY_TRANSPORT, NetworkTransport.NONE.name)
                    ?: NetworkTransport.NONE.name,
            )
        }.getOrDefault(NetworkTransport.NONE),
        lastChangedAtEpochMs = prefs.getLong(KEY_CHANGED_AT, 0L).takeIf { it > 0L },
    )

    fun write(state: NetworkRuntimeState) {
        prefs.edit()
            .putBoolean(KEY_AVAILABLE, state.available)
            .putBoolean(KEY_VALIDATED, state.validatedInternet)
            .putBoolean(KEY_METERED, state.metered)
            .putString(KEY_TRANSPORT, state.transport.name)
            .apply {
                if (state.lastChangedAtEpochMs == null) remove(KEY_CHANGED_AT)
                else putLong(KEY_CHANGED_AT, state.lastChangedAtEpochMs)
            }
            .apply()
    }

    fun toJson(): JSONObject {
        val state = read()
        return JSONObject()
            .put("available", state.available)
            .put("validatedInternet", state.validatedInternet)
            .put("metered", state.metered)
            .put("transport", state.transport.name)
            .apply {
                if (state.lastChangedAtEpochMs != null) {
                    put("lastChangedAtEpochMs", state.lastChangedAtEpochMs)
                }
            }
    }

    companion object {
        private const val PREFS_NAME = "ridex_gateway_network_v1"
        private const val KEY_AVAILABLE = "available"
        private const val KEY_VALIDATED = "validated"
        private const val KEY_METERED = "metered"
        private const val KEY_TRANSPORT = "transport"
        private const val KEY_CHANGED_AT = "changed_at"
    }
}
