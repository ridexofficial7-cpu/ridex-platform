package com.ridex.gateway.provider.heartbeat

/** Minimal deterministic heartbeat payload. No SMS body/OTP is included. */
data class ProviderHeartbeatRequest(
    val gatewayId: String,
    val deviceId: String,
    val installationId: String,
    val appVersion: String,
    val selectedSubscriptionId: Int?,
    val simReady: Boolean,
    val networkAvailable: Boolean,
    val sentAtEpochMs: Long,
)

data class ProviderHeartbeatResponse(
    val accepted: Boolean,
    val message: String = "HEARTBEAT_ACCEPTED",
)
