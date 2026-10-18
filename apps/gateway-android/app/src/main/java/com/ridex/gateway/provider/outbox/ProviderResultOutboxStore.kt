package com.ridex.gateway.provider.outbox

import android.content.Context
import com.ridex.gateway.data.storage.SecureStorage
import com.ridex.gateway.provider.queue.DeliveryStatus
import org.json.JSONArray
import org.json.JSONObject

/** Durable encrypted outbox for Provider delivery results that could not be sent immediately. */
class ProviderResultOutboxStore(context: Context) {
    private val storage = SecureStorage(context.applicationContext)

    @Synchronized
    fun enqueue(requestId: String, status: DeliveryStatus, failureCode: String? = null) {
        require(requestId.isNotBlank())
        val records = readAll().toMutableList()
        val existing = records.firstOrNull { it.requestId == requestId }
        if (existing != null) {
            if (existing.status == status && existing.failureCode == failureCode) return
            records.remove(existing)
        }
        records += ProviderResultOutboxRecord(
            requestId = requestId,
            status = status,
            failureCode = failureCode,
            createdAtEpochMs = System.currentTimeMillis(),
            attemptCount = 0,
            nextAttemptAtEpochMs = System.currentTimeMillis(),
        )
        persist(records)
    }

    @Synchronized
    fun remove(requestId: String) {
        persist(readAll().filterNot { it.requestId == requestId })
    }

    @Synchronized
    fun recordFailure(requestId: String, nextAttemptAtEpochMs: Long): ProviderResultOutboxRecord? {
        val records = readAll().toMutableList()
        val index = records.indexOfFirst { it.requestId == requestId }
        if (index < 0) return null
        val updated = records[index].copy(
            attemptCount = records[index].attemptCount + 1,
            nextAttemptAtEpochMs = nextAttemptAtEpochMs,
        )
        records[index] = updated
        persist(records)
        return updated
    }

    @Synchronized
    fun due(nowEpochMs: Long = System.currentTimeMillis()): List<ProviderResultOutboxRecord> =
        readAll().filter { it.nextAttemptAtEpochMs <= nowEpochMs }

    fun readAll(): List<ProviderResultOutboxRecord> {
        val raw = storage.getString(KEY_OUTBOX) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    val json = array.getJSONObject(index)
                    add(
                        ProviderResultOutboxRecord(
                            requestId = json.getString("requestId"),
                            status = DeliveryStatus.valueOf(json.getString("status")),
                            failureCode = json.optString("failureCode").takeIf { it.isNotBlank() },
                            createdAtEpochMs = json.getLong("createdAtEpochMs"),
                            attemptCount = json.optInt("attemptCount", 0),
                            nextAttemptAtEpochMs = json.optLong("nextAttemptAtEpochMs", 0L),
                        ),
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    private fun persist(records: List<ProviderResultOutboxRecord>) {
        val array = JSONArray()
        records.forEach { record ->
            array.put(
                JSONObject()
                    .put("requestId", record.requestId)
                    .put("status", record.status.name)
                    .put("createdAtEpochMs", record.createdAtEpochMs)
                    .put("attemptCount", record.attemptCount)
                    .put("nextAttemptAtEpochMs", record.nextAttemptAtEpochMs)
                    .apply { record.failureCode?.let { put("failureCode", it) } },
            )
        }
        storage.putString(KEY_OUTBOX, array.toString())
    }

    companion object {
        private const val KEY_OUTBOX = "provider_delivery_result_outbox_v1"
    }
}

data class ProviderResultOutboxRecord(
    val requestId: String,
    val status: DeliveryStatus,
    val failureCode: String?,
    val createdAtEpochMs: Long,
    val attemptCount: Int,
    val nextAttemptAtEpochMs: Long,
)
