package com.ridex.gateway.sms

import com.ridex.gateway.data.storage.SecureStorage
import org.json.JSONObject

/** Persists only non-content SMS result metadata through encrypted storage. */
class SmsResultStore(
    private val secureStorage: SecureStorage,
) {
    fun save(record: SmsResultRecord) {
        val json = JSONObject()
            .put("requestId", record.requestId)
            .put("status", record.status.name)
            .put("timestampEpochMs", record.timestampEpochMs)
            .put("totalParts", record.totalParts)
            .put("completedParts", record.completedParts)
            .apply {
                record.stage?.let { put("stage", it.name) }
                record.failureCode?.let { put("failureCode", it) }
                record.platformResultCode?.let { put("platformResultCode", it) }
            }
        secureStorage.putString(KEY_LAST_RESULT, json.toString())
    }

    fun read(): SmsResultRecord? {
        val raw = secureStorage.getString(KEY_LAST_RESULT) ?: return null
        return runCatching {
            val json = JSONObject(raw)
            SmsResultRecord(
                requestId = json.getString("requestId"),
                status = SmsResultStatus.valueOf(json.getString("status")),
                stage = json.optString("stage").takeIf { it.isNotBlank() }
                    ?.let { runCatching { SmsResultStage.valueOf(it) }.getOrNull() },
                timestampEpochMs = json.getLong("timestampEpochMs"),
                totalParts = json.optInt("totalParts", 1),
                completedParts = json.optInt("completedParts", 0),
                failureCode = json.optString("failureCode").takeIf { it.isNotBlank() },
                platformResultCode = if (json.has("platformResultCode")) {
                    json.optInt("platformResultCode")
                } else {
                    null
                },
            )
        }.getOrNull()
    }

    fun readFor(requestId: String): SmsResultRecord? =
        read()?.takeIf { it.requestId == requestId }

    companion object {
        private const val KEY_LAST_RESULT = "gateway_last_sms_result_v1"
    }
}
