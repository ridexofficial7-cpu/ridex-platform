package com.ridex.gateway.provider.session

import com.ridex.gateway.provider.auth.ProviderAuthResponse
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProviderSessionTest {
    @Test
    fun usableAccessTokenAndRefreshToken_areDetected() {
        val now = 1_000_000L
        val session = ProviderSession.fromResponse(
            gatewayId = "gateway-1",
            response = ProviderAuthResponse(
                accessToken = "access",
                refreshToken = "refresh",
                accessTokenExpiresAtEpochMs = now + 300_000L,
                refreshTokenExpiresAtEpochMs = now + 86_400_000L,
            ),
            nowEpochMs = now,
        )

        assertTrue(session.isAccessTokenUsable(now))
        assertTrue(session.isRefreshTokenUsable(now))
        assertFalse(session.shouldRefresh(now))
    }

    @Test
    fun accessToken_nearExpiry_requiresRefresh() {
        val now = 1_000_000L
        val session = ProviderSession.fromResponse(
            gatewayId = "gateway-1",
            response = ProviderAuthResponse(
                accessToken = "access",
                refreshToken = "refresh",
                accessTokenExpiresAtEpochMs = now + 30_000L,
                refreshTokenExpiresAtEpochMs = now + 86_400_000L,
            ),
            nowEpochMs = now,
        )

        assertTrue(session.shouldRefresh(now))
    }
}
