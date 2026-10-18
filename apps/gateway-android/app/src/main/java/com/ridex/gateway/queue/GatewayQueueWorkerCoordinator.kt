package com.ridex.gateway.queue

import android.content.Context
import com.ridex.gateway.provider.queue.ProviderQueueClient

/**
 * Coordinates queue lifecycle. Phase 7 deliberately does not map a live Provider URL.
 */
class GatewayQueueWorkerCoordinator(
    context: Context,
    private val queueStore: GatewayQueueStore = GatewayQueueStore(context),
    private val providerQueueClient: ProviderQueueClient,
    private val ownerId: String,
) {
    fun recoverExpired(nowEpochMs: Long = System.currentTimeMillis()): Int =
        queueStore.recoverExpiredLeases(nowEpochMs)

    fun claimNext(nowEpochMs: Long = System.currentTimeMillis()): GatewayQueueItem? =
        queueStore.claimNext(nowEpochMs, ownerId)

    fun beginProcessing(requestId: String): GatewayQueueItem? =
        queueStore.beginProcessing(requestId, ownerId)

    fun markSent(requestId: String): GatewayQueueItem? =
        queueStore.markSent(requestId, ownerId)

    /**
     * SMS failures are terminal at Gateway level.
     * Kept as a compatibility method so legacy callers cannot schedule
     * an automatic retry.
     */
    fun markRetryableFailure(
        requestId: String,
        failureCode: String,
        nextRetryAtEpochMs: Long,
    ): GatewayQueueItem? = queueStore.markFailed(
        requestId = requestId,
        owner = ownerId,
        retryable = false,
        failureCode = failureCode,
    )

    fun markTerminalFailure(requestId: String, failureCode: String): GatewayQueueItem? =
        queueStore.markFailed(
            requestId = requestId,
            owner = ownerId,
            retryable = false,
            failureCode = failureCode,
        )

    fun summary(): QueueSummary = queueStore.summary()

    @Suppress("UNUSED_VARIABLE")
    fun providerClientMarker(): String = providerQueueClient::class.java.simpleName
}