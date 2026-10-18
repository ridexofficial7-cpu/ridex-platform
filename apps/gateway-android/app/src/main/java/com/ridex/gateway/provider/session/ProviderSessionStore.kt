package com.ridex.gateway.provider.session

import com.ridex.gateway.data.storage.SecureStorage
import org.json.JSONObject

/** Stores the complete provider session as one Keystore-backed encrypted value. */
class ProviderSessionStore(
    private val secureStorage: SecureStorage,
) {
    fun save(session: ProviderSession) {
        val json = JSONObject()
            .put("gatewayId", session.gatewayId)
            .put("accessToken", session.accessToken)
            .put("refreshToken", session.refreshToken)
            .put("accessTokenExpiresAtEpochMs", session.accessTokenExpiresAtEpochMs)
            .put("refreshTokenExpiresAtEpochMs", session.refreshTokenExpiresAtEpochMs)
            .put("issuedAtEpochMs", session.issuedAtEpochMs)
            .put("rotationGeneration", session.rotationGeneration)

        secureStorage.putString(KEY_SESSION, json.toString())
    }

    fun read(): ProviderSession? {
        val raw = secureStorage.getString(KEY_SESSION) ?: return null
        return runCatching {
            val json = JSONObject(raw)
            ProviderSession(
                gatewayId = json.getString("gatewayId"),
                accessToken = json.getString("accessToken"),
                refreshToken = json.getString("refreshToken"),
                accessTokenExpiresAtEpochMs = json.getLong("accessTokenExpiresAtEpochMs"),
                refreshTokenExpiresAtEpochMs = json.getLong("refreshTokenExpiresAtEpochMs"),
                issuedAtEpochMs = json.getLong("issuedAtEpochMs"),
                rotationGeneration = json.optLong("rotationGeneration", 1L),
            )
        }.getOrNull()
    }

    fun state(nowEpochMs: Long = System.currentTimeMillis()): ProviderSessionState {
        val session = read() ?: return ProviderSessionState.DISCONNECTED
        return when {
            !session.isRefreshTokenUsable(nowEpochMs) -> ProviderSessionState.EXPIRED
            session.shouldRefresh(nowEpochMs) -> ProviderSessionState.EXPIRING
            else -> ProviderSessionState.AUTHENTICATED
        }
    }

    fun clear() {
        secureStorage.remove(KEY_SESSION)
    }

    companion object {
        private const val KEY_SESSION = "provider_session_v1"
    }
}
