package com.ridex.gateway.sms

import java.util.concurrent.ConcurrentHashMap

/**
 * Tracks only in-flight SMS callback aggregation in memory.
 * Persistent last-result metadata is handled by SmsResultStore.
 */
object SmsDispatchRegistry {
    private data class Pending(
        val totalParts: Int,
        val sentParts: MutableSet<Int> = mutableSetOf(),
        val deliveredParts: MutableSet<Int> = mutableSetOf(),
        var sentFailed: Pair<String, Int>? = null,
    )

    private val pending = ConcurrentHashMap<String, Pending>()

    fun register(requestId: String, totalParts: Int) {
        pending[requestId] = Pending(totalParts = totalParts)
    }

    fun remove(requestId: String) {
        pending.remove(requestId)
    }

    fun onSentPart(
        requestId: String,
        partIndex: Int,
        resultCode: Int,
        failureCode: String?,
        store: SmsResultStore,
    ) {
        val state = pending[requestId] ?: return

        if (resultCode == android.app.Activity.RESULT_OK) {
            state.sentParts += partIndex
            if (state.sentParts.size == state.totalParts) {
                store.save(
                    SmsResultRecord(
                        requestId = requestId,
                        status = SmsResultStatus.SENT,
                        stage = SmsResultStage.SENT,
                        timestampEpochMs = System.currentTimeMillis(),
                        totalParts = state.totalParts,
                        completedParts = state.sentParts.size,
                    ),
                )
            } else {
                store.save(
                    SmsResultRecord(
                        requestId = requestId,
                        status = SmsResultStatus.SUBMITTED,
                        stage = SmsResultStage.SENT,
                        timestampEpochMs = System.currentTimeMillis(),
                        totalParts = state.totalParts,
                        completedParts = state.sentParts.size,
                    ),
                )
            }
        } else {
            val code = failureCode ?: "SMS_PLATFORM_ERROR"
            state.sentFailed = code to resultCode
            store.save(
                SmsResultRecord(
                    requestId = requestId,
                    status = SmsResultStatus.FAILED,
                    stage = SmsResultStage.SENT,
                    timestampEpochMs = System.currentTimeMillis(),
                    totalParts = state.totalParts,
                    completedParts = state.sentParts.size,
                    failureCode = code,
                    platformResultCode = resultCode,
                ),
            )
            pending.remove(requestId)
        }
    }

    fun onDeliveredPart(
        requestId: String,
        partIndex: Int,
        resultCode: Int,
        store: SmsResultStore,
    ) {
        val state = pending[requestId] ?: return
        if (resultCode == android.app.Activity.RESULT_OK) {
            state.deliveredParts += partIndex
            if (state.deliveredParts.size == state.totalParts) {
                store.save(
                    SmsResultRecord(
                        requestId = requestId,
                        status = SmsResultStatus.DELIVERED,
                        stage = SmsResultStage.DELIVERED,
                        timestampEpochMs = System.currentTimeMillis(),
                        totalParts = state.totalParts,
                        completedParts = state.deliveredParts.size,
                    ),
                )
                pending.remove(requestId)
            }
        }
    }
}
