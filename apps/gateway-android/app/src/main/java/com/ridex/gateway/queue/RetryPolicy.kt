package com.ridex.gateway.queue

/** Deterministic exponential-backoff policy for temporary gateway failures. */
data class RetryDecision(
    val retryable: Boolean,
    val nextRetryAtEpochMs: Long? = null,
    val failureCode: String,
)

class RetryPolicy(
    private val maxAttempts: Int = DEFAULT_MAX_ATTEMPTS,
    private val initialDelayMs: Long = DEFAULT_INITIAL_DELAY_MS,
    private val maxDelayMs: Long = DEFAULT_MAX_DELAY_MS,
) {
    init {
        require(maxAttempts >= 1)
        require(initialDelayMs >= 0L)
        require(maxDelayMs >= initialDelayMs)
    }

    fun decide(
        failureCode: String,
        attemptCount: Int,
        nowEpochMs: Long,
    ): RetryDecision {
        require(failureCode.isNotBlank())
        require(attemptCount >= 1)

        val retryable = RetryFailureCodes.isRetryable(failureCode)
        if (!retryable || attemptCount >= maxAttempts) {
            return RetryDecision(
                retryable = false,
                failureCode = if (retryable && attemptCount >= maxAttempts) {
                    "RETRY_EXHAUSTED:$failureCode"
                } else {
                    failureCode
                },
            )
        }

        val exponent = (attemptCount - 1).coerceAtMost(20)
        val delay = (initialDelayMs * (1L shl exponent)).coerceAtMost(maxDelayMs)
        return RetryDecision(
            retryable = true,
            nextRetryAtEpochMs = nowEpochMs + delay,
            failureCode = failureCode,
        )
    }

    companion object {
        const val DEFAULT_MAX_ATTEMPTS = 3
        const val DEFAULT_INITIAL_DELAY_MS = 30_000L
        const val DEFAULT_MAX_DELAY_MS = 5 * 60_000L
    }
}

object RetryFailureCodes {
    private val retryable = setOf(
        "NETWORK_TIMEOUT",
        "PROVIDER_TIMEOUT",
        "NETWORK_ERROR",
        "NO_SERVICE",
        "RADIO_OFF",
        "SMS_TEMPORARILY_UNAVAILABLE",
        "SIM_NOT_READY",
        "PROVIDER_HTTP_429",
        "PROVIDER_HTTP_5XX",
        "LEASE_EXPIRED",
    )

    fun isRetryable(code: String): Boolean = retryable.contains(code)
}
