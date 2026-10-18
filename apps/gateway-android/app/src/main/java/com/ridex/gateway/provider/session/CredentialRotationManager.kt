package com.ridex.gateway.provider.session

import com.ridex.gateway.data.storage.SecureStorage
import com.ridex.gateway.provider.auth.ProviderAuthResponse

/** Atomically replaces the active provider credentials after validating the new session. */
class CredentialRotationManager(secureStorage: SecureStorage) {
    private val store = ProviderSessionStore(secureStorage)

    fun rotate(
        gatewayId: String,
        response: ProviderAuthResponse,
        nowEpochMs: Long = System.currentTimeMillis(),
    ): Result<ProviderSession> = runCatching {
        require(gatewayId.isNotBlank()) { "GATEWAY_ID_REQUIRED" }
        require(response.accessToken.isNotBlank()) { "ACCESS_TOKEN_MISSING" }
        require(response.refreshToken.isNotBlank()) { "REFRESH_TOKEN_MISSING" }
        require(response.accessTokenExpiresAtEpochMs > nowEpochMs) { "ACCESS_TOKEN_EXPIRED" }
        require(response.refreshTokenExpiresAtEpochMs > nowEpochMs) { "REFRESH_TOKEN_EXPIRED" }

        val current = store.read()
        if (current != null) require(current.gatewayId == gatewayId) { "GATEWAY_ID_MISMATCH" }

        val nextGeneration = (current?.rotationGeneration ?: 0L) + 1L
        val next = ProviderSession(
            gatewayId = gatewayId,
            accessToken = response.accessToken,
            refreshToken = response.refreshToken,
            accessTokenExpiresAtEpochMs = response.accessTokenExpiresAtEpochMs,
            refreshTokenExpiresAtEpochMs = response.refreshTokenExpiresAtEpochMs,
            issuedAtEpochMs = nowEpochMs,
            rotationGeneration = nextGeneration,
        )
        store.save(next)
        next
    }
}
