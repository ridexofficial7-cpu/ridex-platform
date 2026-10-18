package com.ridex.gateway.identity

data class GatewayIdentity(
    val gatewayId: String,
    val deviceId: String,
    val installationId: String,
    val createdAtEpochMs: Long,
)
