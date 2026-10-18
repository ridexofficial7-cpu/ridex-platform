package com.ridex.gateway.provider.outbox

import com.ridex.gateway.provider.queue.ProviderQueueClient
import com.ridex.gateway.provider.session.ProviderSession
import kotlin.math.min

/** Flushes durable Provider delivery results with bounded backoff. */
class ProviderResultOutboxFlusher(
    private val store: ProviderResultOutboxStore,
    private val providerQueueClient: ProviderQueueClient,
    private val baseRetryMs: Long = 30_000L,
    private val maxRetryMs: Long = 5 * 60_000L,
) {
    fun flush(baseUrl: String, session: ProviderSession, nowEpochMs: Long = System.currentTimeMillis()): Int {
        var sentCount = 0
        store.due(nowEpochMs).forEach { record ->
            val result = providerQueueClient.postDeliveryResult(
                baseUrl = baseUrl,
                accessToken = session.accessToken,
                requestId = record.requestId,
                status = record.status,
                failureCode = record.failureCode,
            )
            result.onSuccess {
                store.remove(record.requestId)
                sentCount++
            }.onFailure {
                val exponent = (record.attemptCount).coerceAtMost(20)
                val delay = min(baseRetryMs * (1L shl exponent), maxRetryMs)
                store.recordFailure(record.requestId, nowEpochMs + delay)
            }
        }
        return sentCount
    }
}
