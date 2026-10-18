package com.ridex.gateway.sms

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SmsFailureClassifierTest {
    @Test
    fun transientCodesAreRetryable() {
        assertTrue(SmsFailureClassifier.isRetryable("NO_SERVICE"))
        assertTrue(SmsFailureClassifier.isRetryable("SIM_NOT_READY"))
        assertFalse(SmsFailureClassifier.isRetryable("INVALID_RECIPIENT"))
    }

    @Test
    fun blankFailureNormalizes() {
        assertTrue(SmsFailureClassifier.normalize("   ").isNotBlank())
    }
}
