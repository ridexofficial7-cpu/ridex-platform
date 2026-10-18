package com.ridex.gateway.provider.config

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProviderTrustConfigTest {
    @Test fun trustStoreUsesBuildTimePinnedKey() {
        assertFalse(ProviderTrustConfig.pinnedEd25519KeysBase64.isEmpty())
        assertTrue(ProviderTrustConfig.pinnedEd25519KeysBase64.containsKey("ridex-test-command-key-v1"))
        assertEquals(ProviderTrustConfig.pinnedEd25519KeysBase64, ProviderTrustConfig.pinnedEd25519CommandKeysBase64)
    }
}
