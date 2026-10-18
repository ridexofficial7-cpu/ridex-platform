package com.ridex.gateway.provider.call

import android.content.Context
import com.ridex.gateway.data.storage.SecureStorage
import org.json.JSONArray
import org.json.JSONObject

/** Tracks Provider call result reporting state durably. */
class ProviderCallTracker(context: Context) {
    private val storage = SecureStorage(context.applicationContext)

    @Synchronized
    fun add(requestId: String) {
        val rows = readIds().toMutableSet()
        if (rows.add(requestId)) {
            writeIds(rows)
        }
    }

    @Synchronized
    fun all(): Set<String> = readIds()

    @Synchronized
    fun markReported(requestId: String, status: CallDeliveryStatus) {
        val states = readStates().toMutableMap()
        states[requestId] = status
        writeStates(states)
    }

    @Synchronized
    fun reported(requestId: String): CallDeliveryStatus? = readStates()[requestId]

    private fun readIds(): Set<String> {
        val raw = storage.getString(KEY_IDS) ?: return emptySet()
        return runCatching {
            val array = JSONArray(raw)
            buildSet {
                for (index in 0 until array.length()) {
                    add(array.getString(index))
                }
            }
        }.getOrDefault(emptySet())
    }

    private fun writeIds(rows: Set<String>) {
        val array = JSONArray()
        rows.forEach(array::put)
        storage.putString(KEY_IDS, array.toString())
    }

    private fun readStates(): Map<String, CallDeliveryStatus> {
        val raw = storage.getString(KEY_STATES) ?: return emptyMap()
        return runCatching {
            val json = JSONObject(raw)
            buildMap {
                val keys = json.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    put(key, CallDeliveryStatus.valueOf(json.getString(key)))
                }
            }
        }.getOrDefault(emptyMap())
    }

    private fun writeStates(rows: Map<String, CallDeliveryStatus>) {
        val json = JSONObject()
        rows.forEach { (key, value) -> json.put(key, value.name) }
        storage.putString(KEY_STATES, json.toString())
    }

    private companion object {
        const val KEY_IDS = "provider_call_tracker_ids_v1"
        const val KEY_STATES = "provider_call_tracker_states_v1"
    }
}
