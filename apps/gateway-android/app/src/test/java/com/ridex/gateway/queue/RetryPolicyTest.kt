package com.ridex.gateway.queue

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RetryPolicyTest {
    @Test
    fun retryableFailureUsesBoundedBackoff() {
        val policy = RetryPolicy(maxAttempts = 3, initialDelayMs = 1_000L, maxDelayMs = 5_000L)

        val first = policy.decide("NETWORK_TIMEOUT", 1, 10_000L)
        val second = policy.decide("NETWORK_TIMEOUT", 2, 10_000L)
        val third = policy.decide("NETWORK_TIMEOUT", 3, 10_000L)

        assertTrue(first.retryable)
        assertEquals(11_000L, first.nextRetryAtEpochMs)
        assertTrue(second.retryable)
        assertEquals(12_000L, second.nextRetryAtEpochMs)
        assertFalse(third.retryable)
        assertEquals("RETRY_EXHAUSTED:NETWORK_TIMEOUT", third.failureCode)
    }

    @Test
    fun terminalFailureIsNotRetried() {
        val result = RetryPolicy().decide("INVALID_RECIPIENT", 1, 10_000L)
        assertFalse(result.retryable)
        assertEquals("INVALID_RECIPIENT", result.failureCode)
    }
}
