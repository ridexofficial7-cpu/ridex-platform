package com.ridex.gateway.call

import com.ridex.gateway.data.storage.SecureStorage
import org.json.JSONObject

/** Encrypted-at-rest local call execution state. */
class CallResultStore(private val storage: SecureStorage) : CallResultSink {
    @Synchronized
    override fun save(record: CallRecord) {
        storage.putString(key(record.requestId), JSONObject()
            .put("requestId", record.requestId)
            .put("recipient", record.recipient)
            .put("subscriptionId", record.subscriptionId)
            .put("purposeCode", record.purposeCode)
            .put("status", record.status.name)
            .put("createdAtEpochMs", record.createdAtEpochMs)
            .put("startedAtEpochMs", record.startedAtEpochMs ?: JSONObject.NULL)
            .put("endedAtEpochMs", record.endedAtEpochMs ?: JSONObject.NULL)
            .put("failureCode", record.failureCode ?: JSONObject.NULL)
            .toString())
    }

    @Synchronized
    fun read(requestId: String): CallRecord? {
        val raw = storage.getString(key(requestId)) ?: return null
        return runCatching {
            val json = JSONObject(raw)
            CallRecord(
                requestId = json.getString("requestId"),
                recipient = json.getString("recipient"),
                subscriptionId = json.getInt("subscriptionId"),
                purposeCode = json.getString("purposeCode"),
                status = CallStatus.valueOf(json.getString("status")),
                createdAtEpochMs = json.getLong("createdAtEpochMs"),
                startedAtEpochMs = json.optLong("startedAtEpochMs").takeIf { json.has("startedAtEpochMs") && !json.isNull("startedAtEpochMs") },
                endedAtEpochMs = json.optLong("endedAtEpochMs").takeIf { json.has("endedAtEpochMs") && !json.isNull("endedAtEpochMs") },
                failureCode = json.optString("failureCode").takeIf { it.isNotBlank() },
            )
        }.getOrNull()
    }

    private fun key(requestId: String) = "call_result_v1_$requestId"
}
