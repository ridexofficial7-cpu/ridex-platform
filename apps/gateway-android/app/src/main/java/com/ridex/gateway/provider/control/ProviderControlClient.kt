package com.ridex.gateway.provider.control

import com.ridex.gateway.control.GatewayControlState
import com.ridex.gateway.provider.session.ProviderSession

interface ProviderControlClient {
    fun fetchControlState(
        baseUrl: String,
        session: ProviderSession,
    ): Result<ProviderControlResponse>
}

data class ProviderControlResponse(
    val state: GatewayControlState,
    val reason: String?,
    val version: Long?,
)
