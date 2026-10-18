package com.ridex.gateway.sms

/** Maps deterministic SMS result codes to queue retry/terminal semantics. */
object SmsFailureClassifier {
    private val retryableCodes = setOf(
        "NO_SERVICE",
        "RADIO_OFF",
        "NETWORK_ERROR",
        "SMS_PLATFORM_ERROR_NETWORK",
        "SIM_NOT_READY",
        "SMS_TEMPORARILY_UNAVAILABLE",
        "SIM_NOT_READY",
    )

    fun isRetryable(code: String): Boolean = retryableCodes.contains(code)

    fun normalize(code: String?): String =
        code?.trim()?.takeIf { it.isNotEmpty() } ?: "SMS_UNKNOWN_FAILURE"
}
