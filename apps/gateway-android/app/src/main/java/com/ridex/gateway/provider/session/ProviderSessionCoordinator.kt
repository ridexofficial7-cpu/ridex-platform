package com.ridex.gateway.provider.session

import android.content.Context
import com.ridex.gateway.identity.GatewayIdentityManager
import com.ridex.gateway.provider.ProviderRuntimeEndpoint
import com.ridex.gateway.provider.auth.HttpProviderAuthClient
import com.ridex.gateway.runtime.GatewayRuntimeStatusStore
import com.ridex.gateway.runtime.ProviderConnectionState

/** Keeps Provider authentication usable at runtime: refreshes expiring sessions and reports auth state. */
class ProviderSessionCoordinator(context: Context) {
    private val appContext = context.applicationContext
    private val secureStorage = com.ridex.gateway.data.storage.SecureStorage(appContext)
    private val sessionManager = GatewayProviderSessionManager(secureStorage, HttpProviderAuthClient())
    private val identityManager = GatewayIdentityManager(appContext)
    private val statusStore = GatewayRuntimeStatusStore(appContext)

    fun refreshIfNeeded(): ProviderSessionResult {
        val baseUrl = runCatching { ProviderRuntimeEndpoint.requireConfiguredHttps() }
            .getOrElse { return ProviderSessionResult.NOT_CONFIGURED }
        val identity = identityManager.getOrCreate()
        val current = sessionManager.getSession() ?: return ProviderSessionResult.AUTH_REQUIRED

        if (current.isAccessTokenUsable() && !current.shouldRefresh()) {
            return ProviderSessionResult.AUTHENTICATED
        }
        if (!current.isRefreshTokenUsable()) {
            sessionManager.clearSession()
            statusStore.setProviderState(ProviderConnectionState.AUTH_REQUIRED)
            statusStore.recordHeartbeatResult("REFRESH_TOKEN_EXPIRED")
            return ProviderSessionResult.AUTH_REQUIRED
        }

        return sessionManager.refresh(baseUrl, identity.gatewayId)
            .fold(
                onSuccess = {
                    statusStore.setProviderState(ProviderConnectionState.CONNECTED)
                    statusStore.recordHeartbeatResult("SESSION_REFRESHED")
                    ProviderSessionResult.REFRESHED
                },
                onFailure = {
                    statusStore.setProviderState(ProviderConnectionState.AUTH_REQUIRED)
                    statusStore.recordHeartbeatResult("SESSION_REFRESH_FAILED", it.message)
                    ProviderSessionResult.AUTH_ERROR
                },
            )
    }

    fun session(): ProviderSession? = sessionManager.getSession()
}

enum class ProviderSessionResult {
    NOT_CONFIGURED,
    AUTH_REQUIRED,
    AUTHENTICATED,
    REFRESHED,
    AUTH_ERROR,
}
