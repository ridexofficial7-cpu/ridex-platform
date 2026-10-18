package com.ridex.gateway.runtime

import com.ridex.gateway.network.NetworkRuntimeState

/** Non-secret runtime state used by the UI and foreground gateway service. */
data class GatewayRuntimeStatus(
    val serviceRunning: Boolean = false,
    val providerState: ProviderConnectionState = ProviderConnectionState.NOT_CONFIGURED,
    val lastHeartbeatAtEpochMs: Long? = null,
    val lastHeartbeatResult: String = "NOT_RUN",
    val lastError: String? = null,
    val network: NetworkRuntimeState = NetworkRuntimeState(),
    val lastSmsQueueSyncAtEpochMs: Long? = null,
    val lastSmsQueueSyncResult: String = "NOT_RUN",
    val lastSmsQueueFetchedCount: Int = 0,
    val lastSmsQueueAddedCount: Int = 0,
    val lastSmsQueueRequestId: String? = null,
    val lastSmsQueueError: String? = null,
    val lastCallCycleAtEpochMs: Long? = null,
    val lastCallCycleResult: String = "NOT_RUN",
    val lastCallIngestedCount: Int = 0,
    val lastCallError: String? = null,
)

enum class ProviderConnectionState {
    NOT_CONFIGURED,
    AUTH_REQUIRED,
    CONNECTED,
    NETWORK_UNAVAILABLE,
    HTTP_ERROR,
    REJECTED,
    STOPPED,
}
