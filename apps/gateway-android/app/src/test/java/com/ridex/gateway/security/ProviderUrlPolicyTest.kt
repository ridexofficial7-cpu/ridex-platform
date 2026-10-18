package com.ridex.gateway.security

import org.junit.Assert.assertEquals
import org.junit.Test

class ProviderUrlPolicyTest {
    @Test fun acceptsRootHttpsUrl() {
        assertEquals("https://provider.example", ProviderUrlPolicy.requireSafeHttps(" https://provider.example/ "))
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsHttp() { ProviderUrlPolicy.requireSafeHttps("http://provider.example") }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsCredentials() { ProviderUrlPolicy.requireSafeHttps("https://user:pass@provider.example") }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsQuery() { ProviderUrlPolicy.requireSafeHttps("https://provider.example/?token=x") }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsPath() { ProviderUrlPolicy.requireSafeHttps("https://provider.example/api") }
}
