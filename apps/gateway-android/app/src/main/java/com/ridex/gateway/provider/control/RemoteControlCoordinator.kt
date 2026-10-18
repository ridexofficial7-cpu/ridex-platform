package com.ridex.gateway.provider.control

import com.ridex.gateway.control.GatewayControlSource
import com.ridex.gateway.control.GatewayControlState
import com.ridex.gateway.control.GatewayControlStore
import com.ridex.gateway.data.storage.SecureStorage
import com.ridex.gateway.provider.session.ProviderSessionStore

/**
 * Applies Provider control deterministically. Remote-control versions are tracked separately
 * from local control-history versions; REVOKED always wins.
 */
class RemoteControlCoordinator(
    private val controlStore: GatewayControlStore,
    private val sessionStore: ProviderSessionStore,
    private val client: ProviderControlClient = HttpProviderControlClient(),
    secureStorage: SecureStorage,
) {
    private val versionStore = RemoteControlVersionStore(secureStorage)

    fun applyRemote(
        baseUrl: String,
        nowEpochMs: Long = System.currentTimeMillis(),
    ): RemoteControlApplyResult {
        val session = sessionStore.read() ?: return RemoteControlApplyResult.SKIPPED_NO_SESSION
        if (!session.isAccessTokenUsable(nowEpochMs)) return RemoteControlApplyResult.SKIPPED_SESSION_EXPIRED

        return client.fetchControlState(baseUrl, session).fold(
            onSuccess = { remote ->
                val current = controlStore.read()
                val lastRemoteVersion = versionStore.read()
                val remoteVersion = remote.version

                if (remoteVersion != null && lastRemoteVersion != null && remoteVersion < lastRemoteVersion) {
                    return@fold RemoteControlApplyResult.REJECTED_VERSION_ROLLBACK
                }

                if (current.state == GatewayControlState.REVOKED && remote.state != GatewayControlState.REVOKED) {
                    return@fold RemoteControlApplyResult.REJECTED_REVOKED
                }

                when (remote.state) {
                    GatewayControlState.REVOKED -> {
                        if (current.state != GatewayControlState.REVOKED || remoteVersion == null || remoteVersion > (lastRemoteVersion ?: Long.MIN_VALUE)) {
                            controlStore.forceRevoke(
                                reason = remote.reason ?: "REMOTE_REVOKE",
                                nowEpochMs = nowEpochMs,
                            )
                            sessionStore.clear()
                        }
                        remoteVersion?.let { versionStore.save(it, nowEpochMs) }
                        RemoteControlApplyResult.REVOKED
                    }
                    GatewayControlState.NORMAL,
                    GatewayControlState.MAINTENANCE,
                    GatewayControlState.SAFE_MODE -> {
                        if (current.state != remote.state || current.source != GatewayControlSource.REMOTE ||
                            (remoteVersion != null && remoteVersion != lastRemoteVersion)) {
                            controlStore.setState(
                                state = remote.state,
                                reason = remote.reason ?: "REMOTE_CONTROL",
                                source = GatewayControlSource.REMOTE,
                                nowEpochMs = nowEpochMs,
                            )
                        }
                        remoteVersion?.let { versionStore.save(it, nowEpochMs) }
                        RemoteControlApplyResult.APPLIED
                    }
                }
            },
            onFailure = { RemoteControlApplyResult.PROVIDER_ERROR },
        )
    }
}

enum class RemoteControlApplyResult {
    APPLIED,
    REVOKED,
    REJECTED_REVOKED,
    REJECTED_VERSION_ROLLBACK,
    PROVIDER_ERROR,
    SKIPPED_NO_SESSION,
    SKIPPED_SESSION_EXPIRED,
}
