package com.ridex.gateway.provider.auth

import com.ridex.gateway.identity.GatewayIdentity

interface ProviderAuthClient {
    fun authenticate(
        baseUrl: String,
        identity: GatewayIdentity,
        appVersion: String,
        enrollmentCode: String,
        assignedMobileNumber: String,
    ): Result<ProviderAuthResponse>

    fun refresh(
        baseUrl: String,
        gatewayId: String,
        refreshToken: String,
    ): Result<ProviderAuthResponse>
}
