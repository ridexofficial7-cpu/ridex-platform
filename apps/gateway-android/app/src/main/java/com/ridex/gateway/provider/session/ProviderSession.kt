package com.ridex.gateway.provider.session

import com.ridex.gateway.provider.auth.ProviderAuthResponse

data class ProviderSession(
    val gatewayId: String,
    val accessToken: String,
    val refreshToken: String,
    val accessTokenExpiresAtEpochMs: Long,
    val refreshTokenExpiresAtEpochMs: Long,
    val issuedAtEpochMs: Long,
    val rotationGeneration: Long = 1L,
) {
    fun isAccessTokenUsable(nowEpochMs: Long = System.currentTimeMillis()): Boolean =
        accessToken.isNotBlank() && nowEpochMs < accessTokenExpiresAtEpochMs

    fun isRefreshTokenUsable(nowEpochMs: Long = System.currentTimeMillis()): Boolean =
        refreshToken.isNotBlank() && nowEpochMs < refreshTokenExpiresAtEpochMs

    fun shouldRefresh(
        nowEpochMs: Long = System.currentTimeMillis(),
        refreshWindowMs: Long = 60_000L,
    ): Boolean =
        isAccessTokenUsable(nowEpochMs) &&
            accessTokenExpiresAtEpochMs - nowEpochMs <= refreshWindowMs &&
            isRefreshTokenUsable(nowEpochMs)

    companion object {
        fun fromResponse(
            gatewayId: String,
            response: ProviderAuthResponse,
            nowEpochMs: Long = System.currentTimeMillis(),
        ): ProviderSession = ProviderSession(
            gatewayId = gatewayId,
            accessToken = response.accessToken,
            refreshToken = response.refreshToken,
            accessTokenExpiresAtEpochMs = response.accessTokenExpiresAtEpochMs,
            refreshTokenExpiresAtEpochMs = response.refreshTokenExpiresAtEpochMs,
            issuedAtEpochMs = nowEpochMs,
            rotationGeneration = 1L,
        )
    }
}

enum class ProviderSessionState {
    DISCONNECTED,
    AUTHENTICATED,
    EXPIRING,
    EXPIRED,
}
