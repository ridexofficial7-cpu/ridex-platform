package com.ridex.gateway.gateway

import android.content.Context
import com.ridex.gateway.identity.GatewayIdentityManager
import com.ridex.gateway.provider.heartbeat.ProviderHeartbeatClient
import com.ridex.gateway.provider.heartbeat.ProviderHeartbeatRequest
import com.ridex.gateway.provider.session.ProviderSessionStore
import com.ridex.gateway.network.NetworkStateStore
import com.ridex.gateway.provider.ProviderRuntimeEndpoint
import com.ridex.gateway.data.storage.SecureStorage
import com.ridex.gateway.runtime.GatewayRuntimeStatusStore
import com.ridex.gateway.runtime.ProviderConnectionState
import com.ridex.gateway.sim.SimManager

/** Runs one deterministic provider heartbeat cycle; no live URL is configured in Phase 5. */
class GatewayHeartbeatCoordinator(
    context: Context,
    private val heartbeatClient: ProviderHeartbeatClient,
) {
    private val appContext = context.applicationContext
    private val identityManager = GatewayIdentityManager(appContext)
    private val secureStorage = SecureStorage(appContext)
    private val sessionStore = ProviderSessionStore(secureStorage)
    private val statusStore = GatewayRuntimeStatusStore(appContext)
    private val simManager = SimManager(appContext)
    private val networkStateStore = NetworkStateStore(appContext)

    fun runOnce() {
        val baseUrl = ProviderRuntimeEndpoint.baseUrl()
        if (baseUrl.isBlank()) {
            statusStore.setProviderState(ProviderConnectionState.NOT_CONFIGURED)
            statusStore.recordHeartbeatResult("NOT_CONFIGURED")
            return
        }

        val session = sessionStore.read()
        if (session == null || !session.isAccessTokenUsable()) {
            statusStore.setProviderState(ProviderConnectionState.AUTH_REQUIRED)
            statusStore.recordHeartbeatResult("AUTH_REQUIRED")
            return
        }

        if (!networkStateStore.read().validatedInternet) {
            statusStore.setProviderState(ProviderConnectionState.NETWORK_UNAVAILABLE)
            statusStore.recordHeartbeatResult("NETWORK_UNAVAILABLE")
            return
        }

        val identity = identityManager.getOrCreate()
        val selectedSubscriptionId = simManager.getSelectedSubscriptionId()
        val availableSims = simManager.getActiveSimSlots().getOrElse { emptyList() }
        val selectedSim = availableSims.firstOrNull { it.subscriptionId == selectedSubscriptionId }

        val request = ProviderHeartbeatRequest(
            gatewayId = identity.gatewayId,
            deviceId = identity.deviceId,
            installationId = identity.installationId,
            appVersion = appVersion(),
            selectedSubscriptionId = selectedSubscriptionId,
            simReady = selectedSim?.isReady == true,
            networkAvailable = true,
            sentAtEpochMs = System.currentTimeMillis(),
        )

        val result = heartbeatClient.heartbeat(
            baseUrl = baseUrl,
            session = session,
            request = request,
        )

        result
            .onSuccess {
                statusStore.setProviderState(ProviderConnectionState.CONNECTED)
                statusStore.recordHeartbeatSuccess()
            }
            .onFailure { error ->
                val state = when (error) {
                    is SecurityException -> ProviderConnectionState.REJECTED
                    else -> ProviderConnectionState.HTTP_ERROR
                }
                statusStore.setProviderState(state)
                statusStore.recordHeartbeatResult(
                    result = state.name,
                    error = error.message,
                )
            }
    }


    @Suppress("DEPRECATION")
    private fun appVersion(): String {
        val packageInfo = appContext.packageManager.getPackageInfo(appContext.packageName, 0)
        return packageInfo.versionName ?: "unknown"
    }

}
