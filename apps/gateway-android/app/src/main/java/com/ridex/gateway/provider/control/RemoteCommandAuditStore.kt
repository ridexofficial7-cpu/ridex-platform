package com.ridex.gateway.provider.control

import com.ridex.gateway.data.storage.SecureStorage
import org.json.JSONArray
import org.json.JSONObject

/** Bounded encrypted audit trail for remote-command admission and execution outcomes. */
class RemoteCommandAuditStore(private val storage: SecureStorage) {
    @Synchronized
    fun ensureHealthy() {
        val raw = storage.getString(KEY) ?: return
        try {
            val parsed = JSONArray(raw)
            for (index in 0 until parsed.length()) {
                require(parsed.get(index) is JSONObject) { "AUDIT_ENTRY_INVALID" }
            }
        } catch (_: Exception) {
            throw IllegalStateException("COMMAND_AUDIT_CORRUPT")
        }
    }

    @Synchronized
    fun append(event: RemoteCommandAuditEvent) {
        ensureHealthy()
        val raw = storage.getString(KEY)
        val current = if (raw == null) JSONArray() else try {
            JSONArray(raw).also { parsed ->
                for (index in 0 until parsed.length()) {
                    require(parsed.get(index) is JSONObject) { "AUDIT_ENTRY_INVALID" }
                }
            }
        } catch (_: Exception) {
            // Do not silently replace a corrupt security audit with an empty log.
            throw IllegalStateException("COMMAND_AUDIT_CORRUPT")
        }
        val trimmed = JSONArray()
        val start = maxOf(0, current.length() - MAX_EVENTS + 1)
        for (index in start until current.length()) trimmed.put(current.get(index))
        trimmed.put(
            JSONObject()
                .put("commandId", event.commandId)
                .put("sequence", event.sequence)
                .put("action", event.action.name)
                .put("risk", event.risk.name)
                .put("actorId", event.actorId)
                .put("approvalCount", event.approvalCount)
                .put("result", event.result.name)
                .put("reason", safeReason(event.reason) ?: JSONObject.NULL)
                .put("atEpochMs", event.atEpochMs)
                .put("previousState", event.previousState ?: JSONObject.NULL)
                .put("resultingState", event.resultingState ?: JSONObject.NULL)
                .put("configVersion", event.configVersion ?: JSONObject.NULL),
        )
        storage.putString(KEY, trimmed.toString())
    }

    fun json(): String = storage.getString(KEY) ?: "[]"

    fun count(): Int {
        val raw = storage.getString(KEY) ?: return 0
        return try {
            JSONArray(raw).also { parsed ->
                for (index in 0 until parsed.length()) require(parsed.get(index) is JSONObject) { "AUDIT_ENTRY_INVALID" }
            }.length()
        } catch (_: Exception) {
            throw IllegalStateException("COMMAND_AUDIT_CORRUPT")
        }
    }

    private fun safeReason(value: String?): String? {
        if (value == null) return null
        val candidate = value.trim().uppercase()
        return if (candidate.matches(Regex("[A-Z0-9_:-]{1,80}"))) candidate else "UNCLASSIFIED_ERROR"
    }

    companion object {
        private const val KEY = "gateway_remote_command_audit_v1"
        private const val MAX_EVENTS = 80
    }
}

enum class RemoteCommandAuditResult {
    ACCEPTED,
    REJECTED,
    REPLAY_REJECTED,
    PROVIDER_ERROR,
    EXECUTION_FAILED,
}

data class RemoteCommandAuditEvent(
    val commandId: String,
    val sequence: Long,
    val action: GatewayCommandAction,
    val risk: GatewayCommandRisk,
    val actorId: String,
    val approvalCount: Int,
    val result: RemoteCommandAuditResult,
    val reason: String?,
    val atEpochMs: Long,
    val previousState: String?,
    val resultingState: String?,
    val configVersion: Long?,
)
