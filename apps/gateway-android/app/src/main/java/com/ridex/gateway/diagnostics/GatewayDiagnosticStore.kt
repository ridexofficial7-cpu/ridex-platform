package com.ridex.gateway.diagnostics

import com.ridex.gateway.data.storage.SecureStorage
import com.ridex.gateway.provider.session.ProviderSessionState
import com.ridex.gateway.queue.QueueSummary
import org.json.JSONArray
import org.json.JSONObject

/** Encrypted current snapshot + bounded diagnostic history. Contains no secrets. */
class GatewayDiagnosticStore(private val secureStorage: SecureStorage) {
    fun save(snapshot: GatewayDiagnosticSnapshot) {
        secureStorage.putString(KEY_CURRENT, encode(snapshot).toString())
        val history = readHistory().takeLast(MAX_HISTORY - 1) + snapshot
        val array = JSONArray()
        history.forEach { array.put(encode(it)) }
        secureStorage.putString(KEY_HISTORY, array.toString())
    }

    fun readCurrent(): GatewayDiagnosticSnapshot? = secureStorage.getString(KEY_CURRENT)?.let { decode(it) }

    fun readHistory(): List<GatewayDiagnosticSnapshot> {
        val raw = secureStorage.getString(KEY_HISTORY) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    array.optJSONObject(index)?.let { decode(it.toString())?.let(::add) }
                }
            }
        }.getOrElse { emptyList() }
    }

    private fun encode(snapshot: GatewayDiagnosticSnapshot): JSONObject = JSONObject()
        .put("diagnosticId", snapshot.diagnosticId)
        .put("capturedAtEpochMs", snapshot.capturedAtEpochMs)
        .put("healthState", snapshot.health?.state?.name ?: "")
        .put("providerState", snapshot.runtime.providerState.name)
        .put("controlState", snapshot.control.state.name)
        .put("controlSource", snapshot.control.source.name)
        .put("controlVersion", snapshot.control.version)
        .put("providerSessionState", snapshot.providerSessionState.name)
        .put("queueQueued", snapshot.queue.queued)
        .put("queueLeased", snapshot.queue.leased)
        .put("queueProcessing", snapshot.queue.processing)
        .put("queueRetryWait", snapshot.queue.retryWait)
        .put("queueSent", snapshot.queue.sent)
        .put("queueFailed", snapshot.queue.failed)
        .put("queueProcessedRequestCount", snapshot.queue.processedRequestCount)
        .put("simCount", snapshot.sims.size)
        .put("selectedSimId", snapshot.health?.selectedSubscriptionId ?: JSONObject.NULL)
        .put("signedConfigVersion", snapshot.signedConfigVersion ?: JSONObject.NULL)
        .put("signedConfigKeyId", snapshot.signedConfigKeyId ?: JSONObject.NULL)
        .put("signedConfigFingerprintPrefix", snapshot.signedConfigFingerprintPrefix ?: JSONObject.NULL)
        .put("configDrift", snapshot.configDrift?.severity?.name ?: JSONObject.NULL)
        .put("appSignaturePrefix", snapshot.appSignaturePrefix ?: JSONObject.NULL)
        .put("recoveryLastAction", snapshot.recoveryLastAction)
        .put("watchdogRestartCount", snapshot.watchdogRestartCount)
        .put("recommendations", JSONArray(snapshot.recommendations))

    private fun decode(raw: String): GatewayDiagnosticSnapshot? = runCatching {
        val json = JSONObject(raw)
        GatewayDiagnosticSnapshot(
            diagnosticId = json.getString("diagnosticId"),
            capturedAtEpochMs = json.getLong("capturedAtEpochMs"),
            health = null,
            runtime = com.ridex.gateway.runtime.GatewayRuntimeStatus(
                providerState = com.ridex.gateway.runtime.ProviderConnectionState.valueOf(json.getString("providerState")),
            ),
            control = com.ridex.gateway.control.GatewayControlSnapshot(
                state = com.ridex.gateway.control.GatewayControlState.valueOf(json.getString("controlState")),
                source = com.ridex.gateway.control.GatewayControlSource.valueOf(json.getString("controlSource")),
                reason = null,
                changedAtEpochMs = 0L,
                version = json.getLong("controlVersion"),
            ),
            providerSessionState = ProviderSessionState.valueOf(json.getString("providerSessionState")),
            queue = QueueSummary(
                queued = json.optInt("queueQueued"),
                leased = json.optInt("queueLeased"),
                processing = json.optInt("queueProcessing"),
                retryWait = json.optInt("queueRetryWait"),
                sent = json.optInt("queueSent"),
                failed = json.optInt("queueFailed"),
                processedRequestCount = json.optInt("queueProcessedRequestCount"),
            ),
            sims = emptyList(),
            signedConfigVersion = json.optLong("signedConfigVersion").takeIf { json.has("signedConfigVersion") && !json.isNull("signedConfigVersion") },
            signedConfigKeyId = json.optString("signedConfigKeyId").takeIf { it.isNotBlank() },
            signedConfigFingerprintPrefix = json.optString("signedConfigFingerprintPrefix").takeIf { it.isNotBlank() },
            configDrift = json.optString("configDrift").takeIf { it.isNotBlank() }?.let { severity ->
                com.ridex.gateway.security.DriftSeverity.valueOf(severity).let { com.ridex.gateway.security.ConfigDriftResult(it, emptyList()) }
            },
            appSignaturePrefix = json.optString("appSignaturePrefix").takeIf { it.isNotBlank() },
            recoveryLastAction = json.optString("recoveryLastAction", "NOT_RUN"),
            watchdogRestartCount = json.optInt("watchdogRestartCount"),
            recommendations = buildList {
                val array = json.optJSONArray("recommendations") ?: JSONArray()
                for (i in 0 until array.length()) add(array.optString(i))
            },
        )
    }.getOrNull()

    companion object {
        private const val KEY_CURRENT = "gateway_diagnostic_current_v1"
        private const val KEY_HISTORY = "gateway_diagnostic_history_v1"
        private const val MAX_HISTORY = 20
    }
}
