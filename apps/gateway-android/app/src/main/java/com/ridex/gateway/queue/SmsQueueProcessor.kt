package com.ridex.gateway.queue

import com.ridex.gateway.provider.queue.DeliveryStatus
import com.ridex.gateway.provider.queue.ProviderQueueClient
import com.ridex.gateway.provider.outbox.ProviderResultOutboxFlusher
import com.ridex.gateway.provider.outbox.ProviderResultOutboxStore
import com.ridex.gateway.provider.session.ProviderSession
import com.ridex.gateway.sms.SmsFailureClassifier
import com.ridex.gateway.sms.SmsResultStatus
import com.ridex.gateway.sms.SmsResultStore
import com.ridex.gateway.sms.SmsSendRequest
import com.ridex.gateway.sms.SmsSender
import java.util.UUID

/**
 * Deterministic queue-to-SMS orchestration.
 *
 * Gateway is an executor, not a retry authority.
 * A request received from Provider gets one SMS submission attempt.
 * Any failure is finalized locally and reported back to Provider.
 * A new SMS attempt requires a new Provider request.
 */
class SmsQueueProcessor(
    private val queueStore: GatewayQueueStore,
    private val providerQueueClient: ProviderQueueClient,
    private val smsSender: SmsSender,
    private val smsResultStore: SmsResultStore,
    private val selectedSubscriptionIdProvider: () -> Int,
    private val providerResultOutboxStore: ProviderResultOutboxStore,
    private val ownerId: String = UUID.randomUUID().toString(),
) {
    private val resultOutboxFlusher = ProviderResultOutboxFlusher(
        store = providerResultOutboxStore,
        providerQueueClient = providerQueueClient,
    )

    fun ingestPending(
        baseUrl: String,
        session: ProviderSession,
    ): Result<QueueIngestResult> =
        providerQueueClient.fetchPending(
            baseUrl,
            session.accessToken,
        ).map { items ->
            var added = 0

            items.forEach { item ->
                if (queueStore.enqueue(item)) {
                    added++
                }
            }

            QueueIngestResult(
                fetchedCount = items.size,
                addedCount = added,
            )
        }

    fun processNext(
        nowEpochMs: Long = System.currentTimeMillis(),
    ): ProcessNextResult {
        queueStore.recoverExpiredLeases(nowEpochMs)

        val item = queueStore.claimNext(nowEpochMs, ownerId)
            ?: return ProcessNextResult.NothingToProcess

        queueStore.beginProcessing(item.requestId, ownerId)

        val subscriptionId = selectedSubscriptionIdProvider()

        if (subscriptionId <= 0) {
            val failureCode = "SIM_NOT_READY"

            queueStore.markFailed(
                requestId = item.requestId,
                owner = ownerId,
                retryable = false,
                failureCode = failureCode,
            )

            providerResultOutboxStore.enqueue(
                requestId = item.requestId,
                status = DeliveryStatus.FAILED,
                failureCode = failureCode,
            )

            return ProcessNextResult.SubmissionFailed(
                requestId = item.requestId,
                failureCode = failureCode,
            )
        }

        return smsSender.send(
            SmsSendRequest(
                requestId = item.requestId,
                recipient = item.recipient,
                message = item.message,
                subscriptionId = subscriptionId,
            ),
        ).fold(
            onSuccess = {
                ProcessNextResult.Submitted(item.requestId)
            },
            onFailure = { error ->
                val failureCode = classifySendError(error)

                queueStore.markFailed(
                    requestId = item.requestId,
                    owner = ownerId,
                    retryable = false,
                    failureCode = failureCode,
                )

                providerResultOutboxStore.enqueue(
                    requestId = item.requestId,
                    status = DeliveryStatus.FAILED,
                    failureCode = failureCode,
                )

                ProcessNextResult.SubmissionFailed(
                    requestId = item.requestId,
                    failureCode = failureCode,
                )
            },
        )
    }

    /**
     * Reconciles the latest Android SMS callback for a request back to the
     * local queue and Provider.
     *
     * Gateway never retries a failed SMS callback. The failure is finalized
     * and reported to Provider/Backend. A later retry requires a new request.
     */
    fun reconcileResult(
        requestId: String,
        baseUrl: String,
        session: ProviderSession,
        nowEpochMs: Long = System.currentTimeMillis(),
    ): Result<ReconciliationResult> {
        val current = queueStore.get(requestId)
            ?: return Result.failure(
                IllegalStateException("QUEUE_ITEM_NOT_FOUND"),
            )

        val result = smsResultStore.readFor(requestId)
            ?: return Result.failure(
                IllegalStateException("SMS_RESULT_NOT_FOUND"),
            )

        val owner = current.leaseOwner
            ?: return Result.failure(
                IllegalStateException("QUEUE_LEASE_OWNER_MISSING"),
            )

        return when (result.status) {
            SmsResultStatus.SENT,
            SmsResultStatus.DELIVERED -> {
                queueStore.markSent(requestId, owner)

                providerResultOutboxStore.enqueue(
                    requestId,
                    DeliveryStatus.SENT,
                )

                resultOutboxFlusher.flush(
                    baseUrl,
                    session,
                )

                Result.success(ReconciliationResult.Sent)
            }

            SmsResultStatus.FAILED -> {
                val failureCode =
                    SmsFailureClassifier.normalize(result.failureCode)

                queueStore.markFailed(
                    requestId = requestId,
                    owner = owner,
                    retryable = false,
                    failureCode = failureCode,
                )

                providerResultOutboxStore.enqueue(
                    requestId = requestId,
                    status = DeliveryStatus.FAILED,
                    failureCode = failureCode,
                )

                resultOutboxFlusher.flush(
                    baseUrl,
                    session,
                )

                Result.success(ReconciliationResult.Failed)
            }

            SmsResultStatus.SUBMITTED ->
                Result.success(
                    ReconciliationResult.AwaitingAndroidCallback,
                )
        }
    }

    fun flushProviderResults(
        baseUrl: String,
        session: ProviderSession,
        nowEpochMs: Long = System.currentTimeMillis(),
    ): Int =
        resultOutboxFlusher.flush(
            baseUrl,
            session,
            nowEpochMs,
        )

    private fun classifySendError(error: Throwable): String =
        when (error) {
            is SecurityException -> "SEND_SMS_PERMISSION_DENIED"
            is IllegalArgumentException -> "SMS_INVALID_ARGUMENT"
            else ->
                error.message
                    ?.takeIf { it.isNotBlank() }
                    ?: "SMS_SUBMISSION_EXCEPTION"
        }
}

data class QueueIngestResult(
    val fetchedCount: Int,
    val addedCount: Int,
)

sealed interface ProcessNextResult {
    data object NothingToProcess : ProcessNextResult

    data class Submitted(
        val requestId: String,
    ) : ProcessNextResult

    data class SubmissionFailed(
        val requestId: String,
        val failureCode: String,
    ) : ProcessNextResult
}

enum class ReconciliationResult {
    Sent,
    Failed,
    AwaitingAndroidCallback,
}