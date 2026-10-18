package com.ridex.gateway.security

import com.ridex.gateway.data.storage.SecureStorage
import org.json.JSONObject

/** Persists the last deterministic integrity/drift evaluation without secrets. */
class ConfigDriftStateStore(private val secureStorage: SecureStorage) {
    fun save(result: ConfigDriftResult, evaluatedAtEpochMs: Long = System.currentTimeMillis()) {
        secureStorage.putString(
            KEY_STATE,
            JSONObject()
                .put("severity", result.severity.name)
                .put("reasons", result.reasons.joinToString("|"))
                .put("evaluatedAtEpochMs", evaluatedAtEpochMs)
                .toString(),
        )
    }

    fun read(): StoredDriftState? {
        val raw = secureStorage.getString(KEY_STATE) ?: return null
        return runCatching {
            val json = JSONObject(raw)
            StoredDriftState(
                severity = DriftSeverity.valueOf(json.getString("severity")),
                reasons = json.optString("reasons").split('|').filter { it.isNotBlank() },
                evaluatedAtEpochMs = json.getLong("evaluatedAtEpochMs"),
            )
        }.getOrNull()
    }

    companion object {
        private const val KEY_STATE = "config_drift_state_v1"
    }
}

data class StoredDriftState(
    val severity: DriftSeverity,
    val reasons: List<String>,
    val evaluatedAtEpochMs: Long,
)
