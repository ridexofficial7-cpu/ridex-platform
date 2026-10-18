package com.ridex.gateway.sms

data class SmsSendRequest(
    val requestId: String,
    val recipient: String,
    val message: String,
    val subscriptionId: Int,
)

enum class SmsResultStage {
    SENT,
    DELIVERED,
}

enum class SmsResultStatus {
    SUBMITTED,
    SENT,
    FAILED,
    DELIVERED,
}

data class SmsResultRecord(
    val requestId: String,
    val status: SmsResultStatus,
    val stage: SmsResultStage? = null,
    val timestampEpochMs: Long,
    val totalParts: Int,
    val completedParts: Int,
    val failureCode: String? = null,
    val platformResultCode: Int? = null,
)
