package com.ridex.gateway.recovery

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GatewayWatchdogPolicyTest {
    @Test
    fun freshWorkerDoesNotRestart() {
        val now = 1_000_000L
        assertFalse(GatewayWatchdogPolicy.shouldRestartWorker(now - 149_999L, now))
    }

    @Test
    fun staleWorkerRestartsAtThreshold() {
        val now = 1_000_000L
        assertTrue(GatewayWatchdogPolicy.shouldRestartWorker(now - 150_000L, now))
    }

    @Test
    fun futureTimestampDoesNotRestart() {
        val now = 1_000_000L
        assertFalse(GatewayWatchdogPolicy.shouldRestartWorker(now + 1L, now))
    }

    @Test
    fun missingTimestampDoesNotRestart() {
        assertFalse(GatewayWatchdogPolicy.shouldRestartWorker(0L, 1_000L))
    }
}
