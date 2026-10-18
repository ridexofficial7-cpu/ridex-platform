package com.ridex.gateway.provider.call

import android.content.Context
import com.ridex.gateway.data.storage.SecureStorage
import org.json.JSONArray
import org.json.JSONObject

/** Durable encrypted-at-rest outbox for Provider call delivery results. */
class ProviderCallResultOutbox(context: Context) {
    private val storage = SecureStorage(context.applicationContext)

    @Synchronized
    fun enqueue(
        requestId: String,
        status: CallDeliveryStatus,
        failureCode: String? = null,
    ) {
        val rows = readAll().toMutableList()
        if (rows.any {
                it.requestId == requestId &&
                    it.status == status &&
                    it.failureCode == failureCode
            }) {
            return
        }

        rows += Record(
            requestId = requestId,
            status = status,
            failureCode = failureCode,
            createdAt = System.currentTimeMillis(),
            attempts = 0,
            nextAttemptAt = System.currentTimeMillis(),
        )
        persist(rows)
    }

    @Synchronized
    fun due(now: Long = System.currentTimeMillis()): List<Record> =
        readAll().filter { it.nextAttemptAt <= now }

    @Synchronized
    fun remove(requestId: String, status: CallDeliveryStatus) {
        persist(
            readAll().filterNot {
                it.requestId == requestId && it.status == status
            },
        )
    }

    @Synchronized
    fun fail(
        requestId: String,
        status: CallDeliveryStatus,
        next: Long,
    ) {
        val rows = readAll().toMutableList()
        val index = rows.indexOfFirst {
            it.requestId == requestId && it.status == status
        }
        if (index < 0) return

        val current = rows[index]
        rows[index] = current.copy(
            attempts = current.attempts + 1,
            nextAttemptAt = next,
        )
        persist(rows)
    }

    private fun readAll(): List<Record> {
        val raw = storage.getString(KEY) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    val json = array.getJSONObject(index)
                    add(
                        Record(
                            requestId = json.getString("requestId"),
                            status = CallDeliveryStatus.valueOf(json.getString("status")),
                            failureCode = json
                                .optString("failureCode")
                                .takeIf { it.isNotBlank() },
                            createdAt = json.getLong("createdAt"),
                            attempts = json.optInt("attempts"),
                            nextAttemptAt = json.getLong("nextAttemptAt"),
                        ),
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    private fun persist(rows: List<Record>) {
        val array = JSONArray()
        rows.forEach { record ->
            val json = JSONObject()
                .put("requestId", record.requestId)
                .put("status", record.status.name)
                .put("createdAt", record.createdAt)
                .put("attempts", record.attempts)
                .put("nextAttemptAt", record.nextAttemptAt)
            record.failureCode?.let { json.put("failureCode", it) }
            array.put(json)
        }
        storage.putString(KEY, array.toString())
    }

    data class Record(
        val requestId: String,
        val status: CallDeliveryStatus,
        val failureCode: String?,
        val createdAt: Long,
        val attempts: Int,
        val nextAttemptAt: Long,
    )

    private companion object {
        const val KEY = "provider_call_result_outbox_v1"
    }
}
