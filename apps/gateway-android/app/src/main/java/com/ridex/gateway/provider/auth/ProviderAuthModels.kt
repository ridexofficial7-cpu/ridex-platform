package com.ridex.gateway.provider.auth

import com.ridex.gateway.identity.GatewayIdentity

/** One-time enrollment credential issued by the Provider for a specific gateway installation. */
data class ProviderAuthRequest(
    val gatewayId: String,
    val deviceId: String,
    val installationId: String,
    val appVersion: String,
    val enrollmentCode: String,
    val assignedMobileNumber: String,
)

data class ProviderAuthResponse(
    val accessToken: String,
    val refreshToken: String,
    val accessTokenExpiresAtEpochMs: Long,
    val refreshTokenExpiresAtEpochMs: Long,
)

fun GatewayIdentity.toProviderAuthRequest(
    appVersion: String,
    enrollmentCode: String,
    assignedMobileNumber: String,
): ProviderAuthRequest = ProviderAuthRequest(
    gatewayId = gatewayId,
    deviceId = deviceId,
    installationId = installationId,
    appVersion = appVersion,
    enrollmentCode = enrollmentCode,
    assignedMobileNumber = assignedMobileNumber,
)
