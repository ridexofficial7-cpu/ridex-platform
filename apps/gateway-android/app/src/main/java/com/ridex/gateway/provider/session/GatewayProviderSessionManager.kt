package com.ridex.gateway.provider.session

import com.ridex.gateway.data.storage.SecureStorage
import com.ridex.gateway.control.GatewayControlStore
import com.ridex.gateway.identity.GatewayIdentity
import com.ridex.gateway.provider.auth.ProviderAuthClient
import com.ridex.gateway.provider.auth.ProviderAuthResponse

/** Coordinates provider enrollment, refresh, expiry handling, and local secure persistence. */
class GatewayProviderSessionManager(
    secureStorage: SecureStorage,
    private val authClient: ProviderAuthClient,
) {
    private val secureStorageRef = secureStorage
    private val store = ProviderSessionStore(secureStorage)
    private val controlStore = GatewayControlStore(secureStorageRef)

    fun getSession(): ProviderSession? = store.read()

    fun getState(nowEpochMs: Long = System.currentTimeMillis()): ProviderSessionState =
        store.state(nowEpochMs)

    fun enroll(
        baseUrl: String,
        identity: GatewayIdentity,
        appVersion: String,
        enrollmentCode: String,
        assignedMobileNumber: String,
    ): Result<ProviderSession> {
        require(enrollmentCode.isNotBlank()) { "ENROLLMENT_CODE_REQUIRED" }

        val response = authClient.authenticate(
            baseUrl = baseUrl,
            identity = identity,
            appVersion = appVersion,
            enrollmentCode = enrollmentCode,
            assignedMobileNumber = assignedMobileNumber,
        ).getOrElse { return Result.failure(it) }

        return persist(identity.gatewayId, response)
    }

    fun refresh(
        baseUrl: String,
        gatewayId: String,
    ): Result<ProviderSession> {
        val existing = store.read()
            ?: return Result.failure(IllegalStateException("NO_PROVIDER_SESSION"))

        if (!existing.isRefreshTokenUsable()) {
            clearSession()
            return Result.failure(IllegalStateException("REFRESH_TOKEN_EXPIRED"))
        }

        val response = authClient.refresh(
            baseUrl = baseUrl,
            gatewayId = gatewayId,
            refreshToken = existing.refreshToken,
        ).getOrElse { return Result.failure(it) }

        return persist(gatewayId, response)
    }

    fun clearSession() {
        store.clear()
    }

    private fun persist(
        gatewayId: String,
        response: ProviderAuthResponse,
    ): Result<ProviderSession> = runCatching {
        val session = ProviderSession.fromResponse(
            gatewayId = gatewayId,
            response = response,
        )

        require(session.accessTokenExpiresAtEpochMs > session.issuedAtEpochMs) {
            "ACCESS_TOKEN_EXPIRY_INVALID"
        }
        require(session.refreshTokenExpiresAtEpochMs > session.issuedAtEpochMs) {
            "REFRESH_TOKEN_EXPIRY_INVALID"
        }

        val rotated = CredentialRotationManager(secureStorageRef)
            .rotate(gatewayId, response)
            .getOrElse { throw it }
        controlStore.clearRevokeForFreshEnrollment()
        rotated
    }
}
