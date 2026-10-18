package com.ridex.gateway.control

/**
 * Runtime control states for the dedicated gateway node.
 * REVOKED is a security terminal state until a fresh enrollment is completed.
 */
enum class GatewayControlState {
    NORMAL,
    MAINTENANCE,
    SAFE_MODE,
    REVOKED,
}

enum class GatewayControlSource {
    LOCAL,
    REMOTE,
    SYSTEM,
}

data class GatewayControlSnapshot(
    val state: GatewayControlState,
    val source: GatewayControlSource,
    val reason: String?,
    val changedAtEpochMs: Long,
    val version: Long,
) {
    val communicationAllowed: Boolean
        get() = state == GatewayControlState.NORMAL
}
