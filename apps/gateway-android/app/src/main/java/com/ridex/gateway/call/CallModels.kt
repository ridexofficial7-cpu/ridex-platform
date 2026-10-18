package com.ridex.gateway.call

enum class CallStatus { QUEUED, STARTING, RINGING, CONNECTED, ENDED, FAILED }

data class CallRequest(
    val requestId: String,
    val recipient: String,
    val subscriptionId: Int,
    val purposeCode: String,
    val createdAtEpochMs: Long = System.currentTimeMillis(),
)

data class CallRecord(
    val requestId: String,
    val recipient: String,
    val subscriptionId: Int,
    val purposeCode: String,
    val status: CallStatus,
    val createdAtEpochMs: Long,
    val startedAtEpochMs: Long? = null,
    val endedAtEpochMs: Long? = null,
    val failureCode: String? = null,
)
