package com.ridex.gateway.provider.heartbeat

import com.ridex.gateway.provider.session.ProviderSession

interface ProviderHeartbeatClient {
    fun heartbeat(
        baseUrl: String,
        session: ProviderSession,
        request: ProviderHeartbeatRequest,
    ): Result<ProviderHeartbeatResponse>
}
