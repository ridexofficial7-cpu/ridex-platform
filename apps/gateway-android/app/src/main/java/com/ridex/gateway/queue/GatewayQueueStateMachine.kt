package com.ridex.gateway.queue

/**
 * Pure deterministic queue state machine.
 * Gateway never retries an SMS request automatically.
 * A new SMS attempt is allowed only after a new request is received from the Provider.
 */
class GatewayQueueStateMachine(
    private val leaseDurationMs: Long = DEFAULT_LEASE_DURATION_MS,
) {
    private val items = linkedMapOf<String, GatewayQueueItem>()
    private val finalizedRequestIds = linkedSetOf<String>()

    fun enqueue(item: GatewayQueueItem): Boolean {
        require(item.requestId.isNotBlank()) { "requestId is required" }
        require(item.recipient.isNotBlank()) { "recipient is required" }
        require(item.purposeCode.isNotBlank()) { "purposeCode is required" }

        if (finalizedRequestIds.contains(item.requestId)) return false
        if (items.containsKey(item.requestId)) return false

        items[item.requestId] = item
        return true
    }

    fun restoreSnapshot(
        restoredItems: Collection<GatewayQueueItem>,
        finalizedIds: Collection<String>,
    ) {
        items.clear()
        finalizedRequestIds.clear()

        restoredItems.forEach { item ->
            if (item.requestId.isNotBlank()) {
                items[item.requestId] = item
            }
        }

        finalizedRequestIds.addAll(finalizedIds.filter { it.isNotBlank() })
    }

    fun itemsSnapshot(): List<GatewayQueueItem> = items.values.toList()

    fun finalizedRequestIdsSnapshot(): Set<String> = finalizedRequestIds.toSet()

    /**
     * An expired lease must never become retryable.
     * It is finalized as FAILED so the same request cannot be sent again
     * after a Gateway restart/crash.
     */
    fun recoverExpiredLeases(nowEpochMs: Long): Int {
        var recovered = 0

        items.entries.toList().forEach { (requestId, item) ->
            if (
                (item.state == QueueItemState.LEASED ||
                    item.state == QueueItemState.PROCESSING) &&
                item.leaseUntilEpochMs != null &&
                item.leaseUntilEpochMs <= nowEpochMs
            ) {
                items[requestId] = item.copy(
                    state = QueueItemState.FAILED,
                    leaseOwner = null,
                    leaseUntilEpochMs = null,
                    nextRetryAtEpochMs = null,
                    lastFailureCode = "LEASE_EXPIRED",
                )

                finalizedRequestIds += requestId
                recovered += 1
            }
        }

        return recovered
    }

    fun claimNext(nowEpochMs: Long, owner: String): GatewayQueueItem? {
        require(owner.isNotBlank()) { "owner is required" }

        recoverExpiredLeases(nowEpochMs)

        val candidate = items.values
            .asSequence()
            .filter { item -> item.state == QueueItemState.QUEUED }
            .minByOrNull { it.createdAtEpochMs }
            ?: return null

        val leased = candidate.copy(
            state = QueueItemState.LEASED,
            leaseOwner = owner,
            leaseUntilEpochMs = nowEpochMs + leaseDurationMs,
            attemptCount = candidate.attemptCount + 1,
        )

        items[candidate.requestId] = leased
        return leased
    }

    fun beginProcessing(
        requestId: String,
        owner: String,
    ): GatewayQueueItem? =
        updateOwned(requestId, owner) { item ->
            item.copy(state = QueueItemState.PROCESSING)
        }

    fun markSent(
        requestId: String,
        owner: String,
    ): GatewayQueueItem? {
        val item = updateOwned(requestId, owner) { current ->
            current.copy(
                state = QueueItemState.SENT,
                leaseOwner = null,
                leaseUntilEpochMs = null,
                nextRetryAtEpochMs = null,
                lastFailureCode = null,
            )
        } ?: return null

        finalizedRequestIds += requestId
        return item
    }

    /**
     * SMS failures are always terminal at Gateway level.
     * retryable=true is accepted for API compatibility, but the Gateway
     * never places an item into RETRY_WAIT.
     */
    fun markFailed(
        requestId: String,
        owner: String,
        retryable: Boolean,
        failureCode: String,
        nextRetryAtEpochMs: Long? = null,
    ): GatewayQueueItem? {
        require(failureCode.isNotBlank()) { "failureCode is required" }

        val item = updateOwned(requestId, owner) { current ->
            current.copy(
                state = QueueItemState.FAILED,
                leaseOwner = null,
                leaseUntilEpochMs = null,
                nextRetryAtEpochMs = null,
                lastFailureCode = failureCode,
            )
        } ?: return null

        finalizedRequestIds += requestId
        return item
    }

    fun get(requestId: String): GatewayQueueItem? = items[requestId]

    fun isFinalized(requestId: String): Boolean =
        finalizedRequestIds.contains(requestId)

    fun summary(): QueueSummary = QueueSummary(
        queued = items.values.count { it.state == QueueItemState.QUEUED },
        leased = items.values.count { it.state == QueueItemState.LEASED },
        processing = items.values.count { it.state == QueueItemState.PROCESSING },
        retryWait = items.values.count { it.state == QueueItemState.RETRY_WAIT },
        sent = items.values.count { it.state == QueueItemState.SENT },
        failed = items.values.count { it.state == QueueItemState.FAILED },
        processedRequestCount = finalizedRequestIds.size,
    )

    private fun updateOwned(
        requestId: String,
        owner: String,
        transform: (GatewayQueueItem) -> GatewayQueueItem,
    ): GatewayQueueItem? {
        val item = items[requestId] ?: return null
        if (item.leaseOwner != owner) return null

        val updated = transform(item)
        items[requestId] = updated
        return updated
    }

    companion object {
        const val DEFAULT_LEASE_DURATION_MS = 60_000L
    }
}
