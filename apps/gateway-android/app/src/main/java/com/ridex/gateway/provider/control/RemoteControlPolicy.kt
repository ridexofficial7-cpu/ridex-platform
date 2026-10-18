package com.ridex.gateway.provider.control

/** Pure deterministic remote-control precedence rules used for unit validation. */
object RemoteControlPolicy {
    fun decide(
        currentState: String,
        currentRemoteVersion: Long?,
        incomingState: String,
        incomingVersion: Long?,
    ): RemoteControlDecision {
        if (incomingVersion != null && currentRemoteVersion != null && incomingVersion < currentRemoteVersion) {
            return RemoteControlDecision.REJECTED_VERSION_ROLLBACK
        }
        if (currentState == "REVOKED" && incomingState != "REVOKED") {
            return RemoteControlDecision.REJECTED_REVOKED
        }
        return if (incomingState == "REVOKED") RemoteControlDecision.REVOKED else RemoteControlDecision.APPLY
    }
}

enum class RemoteControlDecision {
    APPLY,
    REVOKED,
    REJECTED_REVOKED,
    REJECTED_VERSION_ROLLBACK,
}
