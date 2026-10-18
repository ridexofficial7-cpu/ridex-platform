package com.ridex.gateway.provider.call
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
object ProviderCallCodec {
    fun parsePendingResponse(json: String): List<ProviderCallItem> {
        val items = JSONObject(json).optJSONArray("items") ?: JSONArray()
        return buildList {
            for (i in 0 until items.length()) {
                val item = items.optJSONObject(i) ?: continue
                val requestId = item.optString("requestId").trim(); val recipient = item.optString("recipient").trim(); val purpose = item.optString("purposeCode").trim()
                if (requestId.isBlank() || recipient.isBlank() || purpose.isBlank()) continue
                add(ProviderCallItem(requestId, recipient, purpose, item.optInt("subscriptionId", -1).takeIf { it > 0 }, item.optString("createdAt").toEpochMillisOrNow()))
            }
        }
    }
    fun buildResult(status: CallDeliveryStatus, failureCode: String?): String = JSONObject().put("status", status.name).apply { if (!failureCode.isNullOrBlank()) put("failureReason", failureCode) }.toString()
    private fun String.toEpochMillisOrNow() = runCatching { Instant.parse(this).toEpochMilli() }.getOrElse { System.currentTimeMillis() }
}
