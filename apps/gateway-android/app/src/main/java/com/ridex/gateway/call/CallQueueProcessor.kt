package com.ridex.gateway.call

import com.ridex.gateway.queue.RetryPolicy

/** Deterministic SIM-bound call queue orchestration with bounded retry policy. */
interface CallResultSink { fun save(record: CallRecord) }

class CallQueueProcessor(
    private val queueStore: CallQueueStore,
    private val sender: CallSender,
    private val resultSink: CallResultSink,
    private val selectedSubscriptionIdProvider: () -> Int,
    private val retryPolicy: RetryPolicy = RetryPolicy(),
) {
    fun enqueue(request: CallRequest): Boolean = queueStore.enqueue(request)

    fun processNext(nowEpochMs: Long = System.currentTimeMillis()): CallProcessResult {
        val request = queueStore.claimNext() ?: return CallProcessResult.NothingToProcess
        val selected = selectedSubscriptionIdProvider()
        if (selected <= 0 || selected != request.subscriptionId) {
            return fail(request, "SIM_NOT_READY", nowEpochMs)
        }
        return sender.place(request).fold(
            onSuccess = { CallProcessResult.Started(request.requestId, nowEpochMs) },
            onFailure = { fail(request, it.message ?: "CALL_SUBMISSION_EXCEPTION", nowEpochMs) },
        )
    }

    private fun fail(request: CallRequest, code: String, nowEpochMs: Long): CallProcessResult {
        val decision = retryPolicy.decide(code, 1, nowEpochMs)
        if (decision.retryable) queueStore.requeue(request)
        resultSink.save(CallRecord(
            requestId = request.requestId,
            recipient = request.recipient,
            subscriptionId = request.subscriptionId,
            purposeCode = request.purposeCode,
            status = CallStatus.FAILED,
            createdAtEpochMs = request.createdAtEpochMs,
            endedAtEpochMs = nowEpochMs,
            failureCode = decision.failureCode,
        ))
        return CallProcessResult.Failed(request.requestId, decision.failureCode)
    }
}

sealed interface CallProcessResult {
    data object NothingToProcess : CallProcessResult
    data class Started(val requestId: String, val startedAtEpochMs: Long) : CallProcessResult
    data class Failed(val requestId: String, val failureCode: String) : CallProcessResult
}
