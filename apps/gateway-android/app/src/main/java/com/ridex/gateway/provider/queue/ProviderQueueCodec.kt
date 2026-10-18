package com.ridex.gateway.provider.queue

import com.ridex.gateway.queue.GatewayQueueItem
import com.ridex.gateway.queue.QueueItemState
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

/** Parses and builds the Provider queue contract without binding to a live base URL. */
object ProviderQueueCodec {
    fun parsePendingResponse(json: String): List<GatewayQueueItem> {
        val root = JSONObject(json)
        val items = root.optJSONArray("items") ?: JSONArray()
        return buildList {
            for (index in 0 until items.length()) {
                val item = items.optJSONObject(index) ?: continue
                val requestId = item.optString("requestId").trim()
                val recipient = item.optString("recipient").trim()
                val message = item.optString("message")
                val purposeCode = item.optString("purposeCode").trim()
                if (requestId.isBlank() || recipient.isBlank() || purposeCode.isBlank() || message.isBlank()) continue

                val createdAt = item.optString("createdAt")
                val createdAtEpochMs = createdAt.toEpochMillisOrNow()
                add(
                    GatewayQueueItem(
                        requestId = requestId,
                        recipient = recipient,
                        message = message,
                        purposeCode = purposeCode,
                        createdAtEpochMs = createdAtEpochMs,
                        state = QueueItemState.QUEUED,
                    ),
                )
            }
        }
    }

    fun buildDeliveryResult(status: DeliveryStatus, failureCode: String?): String =
        JSONObject()
            .put("status", status.name)
            .apply {
                if (!failureCode.isNullOrBlank()) put("failureReason", failureCode)
            }
            .toString()

    private fun String.toEpochMillisOrNow(): Long =
        runCatching { Instant.parse(this).toEpochMilli() }.getOrElse { System.currentTimeMillis() }
}
