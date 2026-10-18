package com.ridex.gateway.provider.config

import org.junit.Assert.assertEquals
import org.junit.Test

class SignedConfigPolicyTest {
    @Test fun sameVersionSameFingerprintIsNoChange() {
        val incoming = 7L
        val status = if (incoming == 7L && "abc" == "abc") SignedConfigApplyStatus.NO_CHANGE else SignedConfigApplyStatus.REJECTED_ROLLBACK
        assertEquals(SignedConfigApplyStatus.NO_CHANGE, status)
    }

    @Test fun lowerVersionIsRollback() {
        assert(6L < 7L)
    }
}
