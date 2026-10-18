package com.ridex.gateway.call

import com.ridex.gateway.data.storage.SecureStorage
import org.json.JSONArray
import org.json.JSONObject

/** Encrypted persistent call queue with request-id idempotency. */
class CallQueueStore(private val storage: SecureStorage) {
    @Synchronized fun enqueue(request: CallRequest): Boolean {
        val rows = readAll().toMutableList()
        if (rows.any { it.requestId == request.requestId }) return false
        rows += request
        writeAll(rows)
        return true
    }

    @Synchronized fun claimNext(): CallRequest? {
        val rows = readAll().toMutableList()
        val item = rows.firstOrNull() ?: return null
        rows.removeAt(0)
        writeAll(rows)
        return item
    }

    @Synchronized fun requeue(request: CallRequest) {
        val rows = readAll().toMutableList()
        if (rows.none { it.requestId == request.requestId }) {
            rows += request
            writeAll(rows)
        }
    }

    @Synchronized fun size(): Int = readAll().size

    private fun readAll(): List<CallRequest> {
        val raw = storage.getString(KEY) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (i in 0 until array.length()) {
                    val j = array.getJSONObject(i)
                    add(CallRequest(
                        requestId = j.getString("requestId"),
                        recipient = j.getString("recipient"),
                        subscriptionId = j.getInt("subscriptionId"),
                        purposeCode = j.getString("purposeCode"),
                        createdAtEpochMs = j.getLong("createdAtEpochMs"),
                    ))
                }
            }
        }.getOrDefault(emptyList())
    }

    private fun writeAll(items: List<CallRequest>) {
        val array = JSONArray()
        items.forEach { item ->
            array.put(JSONObject()
                .put("requestId", item.requestId)
                .put("recipient", item.recipient)
                .put("subscriptionId", item.subscriptionId)
                .put("purposeCode", item.purposeCode)
                .put("createdAtEpochMs", item.createdAtEpochMs))
        }
        storage.putString(KEY, array.toString())
    }

    companion object { private const val KEY = "gateway_call_queue_v1" }
}
