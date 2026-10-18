package com.ridex.gateway.provider.queue

import com.ridex.gateway.queue.GatewayQueueItem

/** Canonical Provider queue transport contract. */
interface ProviderQueueClient {
    fun fetchPending(
        baseUrl: String,
        accessToken: String,
    ): Result<List<GatewayQueueItem>>

    fun postDeliveryResult(
        baseUrl: String,
        accessToken: String,
        requestId: String,
        status: DeliveryStatus,
        failureCode: String? = null,
    ): Result<Unit>
}

enum class DeliveryStatus {
    SENT,
    FAILED,
}
