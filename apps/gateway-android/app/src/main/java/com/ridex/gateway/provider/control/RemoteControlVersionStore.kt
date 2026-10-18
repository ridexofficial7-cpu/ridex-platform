package com.ridex.gateway.provider.control

import com.ridex.gateway.data.storage.SecureStorage
import org.json.JSONObject

/** Stores the highest accepted Provider remote-control version in encrypted storage. */
class RemoteControlVersionStore(private val storage: SecureStorage) {
    fun read(): Long? = storage.getString(KEY)?.let { raw ->
        runCatching { JSONObject(raw).getLong("version") }.getOrNull()
    }

    fun save(version: Long, nowEpochMs: Long = System.currentTimeMillis()) {
        storage.putString(
            KEY,
            JSONObject()
                .put("version", version)
                .put("savedAtEpochMs", nowEpochMs)
                .toString(),
        )
    }

    fun clear() = storage.remove(KEY)

    companion object {
        private const val KEY = "provider_remote_control_version_v1"
    }
}
