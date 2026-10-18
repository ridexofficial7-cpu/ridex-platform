package com.ridex.gateway.control

import com.ridex.gateway.data.storage.SecureStorage
import org.json.JSONArray
import org.json.JSONObject

/** Stores gateway control state and a small non-secret transition history using Keystore-backed storage. */
class GatewayControlStore(
    secureStorage: SecureStorage,
) {
    private val storage = secureStorage

    @Synchronized
    fun read(): GatewayControlSnapshot {
        val raw = storage.getString(KEY_STATE) ?: return defaultSnapshot()
        return runCatching {
            val json = JSONObject(raw)
            GatewayControlSnapshot(
                state = GatewayControlState.valueOf(json.optString("state", GatewayControlState.NORMAL.name)),
                source = GatewayControlSource.valueOf(json.optString("source", GatewayControlSource.SYSTEM.name)),
                reason = json.optString("reason").takeIf { it.isNotBlank() },
                changedAtEpochMs = json.optLong("changedAtEpochMs", 0L),
                version = json.optLong("version", 1L),
            )
        }.getOrElse { defaultSnapshot() }
    }

    @Synchronized
    fun setState(
        state: GatewayControlState,
        reason: String? = null,
        source: GatewayControlSource,
        nowEpochMs: Long = System.currentTimeMillis(),
    ): GatewayControlSnapshot {
        val current = read()
        if (current.state == GatewayControlState.REVOKED && state != GatewayControlState.REVOKED) {
            // REVOKED must not be locally cleared. A future enrollment flow will explicitly clear it.
            return current
        }

        val next = GatewayControlSnapshot(
            state = state,
            source = source,
            reason = reason?.trim()?.take(240),
            changedAtEpochMs = nowEpochMs,
            version = current.version + 1L,
        )

        storage.putString(KEY_STATE, encodeSnapshot(next))
        appendHistory(next)
        return next
    }

    @Synchronized
    fun forceRevoke(
        reason: String = "REMOTE_REVOKE",
        nowEpochMs: Long = System.currentTimeMillis(),
    ): GatewayControlSnapshot {
        val current = read()
        val next = GatewayControlSnapshot(
            state = GatewayControlState.REVOKED,
            source = GatewayControlSource.REMOTE,
            reason = reason.trim().take(240),
            changedAtEpochMs = nowEpochMs,
            version = current.version + 1L,
        )
        storage.putString(KEY_STATE, encodeSnapshot(next))
        appendHistory(next)
        return next
    }

    @Synchronized
    fun clearRevokeForFreshEnrollment(
        nowEpochMs: Long = System.currentTimeMillis(),
    ): GatewayControlSnapshot {
        val current = read()
        val next = GatewayControlSnapshot(
            state = GatewayControlState.NORMAL,
            source = GatewayControlSource.SYSTEM,
            reason = "FRESH_ENROLLMENT",
            changedAtEpochMs = nowEpochMs,
            version = current.version + 1L,
        )
        storage.putString(KEY_STATE, encodeSnapshot(next))
        appendHistory(next)
        return next
    }

    @Synchronized
    fun history(): List<GatewayControlSnapshot> {
        val raw = storage.getString(KEY_HISTORY) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    val json = array.optJSONObject(index) ?: continue
                    add(
                        GatewayControlSnapshot(
                            state = GatewayControlState.valueOf(json.optString("state", GatewayControlState.NORMAL.name)),
                            source = GatewayControlSource.valueOf(json.optString("source", GatewayControlSource.SYSTEM.name)),
                            reason = json.optString("reason").takeIf { it.isNotBlank() },
                            changedAtEpochMs = json.optLong("changedAtEpochMs", 0L),
                            version = json.optLong("version", 1L),
                        ),
                    )
                }
            }
        }.getOrElse { emptyList() }
    }

    private fun appendHistory(snapshot: GatewayControlSnapshot) {
        val array = JSONArray()
        history().takeLast(MAX_HISTORY - 1).forEach { array.put(encodeJson(it)) }
        array.put(encodeJson(snapshot))
        storage.putString(KEY_HISTORY, array.toString())
    }

    private fun encodeSnapshot(snapshot: GatewayControlSnapshot): String = encodeJson(snapshot).toString()

    private fun encodeJson(snapshot: GatewayControlSnapshot): JSONObject = JSONObject()
        .put("state", snapshot.state.name)
        .put("source", snapshot.source.name)
        .put("reason", snapshot.reason ?: "")
        .put("changedAtEpochMs", snapshot.changedAtEpochMs)
        .put("version", snapshot.version)

    private fun defaultSnapshot(): GatewayControlSnapshot = GatewayControlSnapshot(
        state = GatewayControlState.NORMAL,
        source = GatewayControlSource.SYSTEM,
        reason = "INITIAL_STATE",
        changedAtEpochMs = System.currentTimeMillis(),
        version = 1L,
    )

    companion object {
        private const val KEY_STATE = "gateway_control_state_v1"
        private const val KEY_HISTORY = "gateway_control_history_v1"
        private const val MAX_HISTORY = 40
    }
}
