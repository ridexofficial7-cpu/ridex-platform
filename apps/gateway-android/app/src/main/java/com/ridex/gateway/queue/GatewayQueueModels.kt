package com.ridex.gateway.queue

/** Queue item states. Only transient/operational state is exposed to the UI. */
enum class QueueItemState {
    QUEUED,
    LEASED,
    PROCESSING,
    RETRY_WAIT,
    SENT,
    FAILED,
}

data class GatewayQueueItem(
    val requestId: String,
    val recipient: String,
    val message: String,
    val purposeCode: String,
    val createdAtEpochMs: Long,
    val state: QueueItemState = QueueItemState.QUEUED,
    val leaseOwner: String? = null,
    val leaseUntilEpochMs: Long? = null,
    val attemptCount: Int = 0,
    val nextRetryAtEpochMs: Long? = null,
    val lastFailureCode: String? = null,
)

data class QueueSummary(
    val queued: Int = 0,
    val leased: Int = 0,
    val processing: Int = 0,
    val retryWait: Int = 0,
    val sent: Int = 0,
    val failed: Int = 0,
    val processedRequestCount: Int = 0,
)
