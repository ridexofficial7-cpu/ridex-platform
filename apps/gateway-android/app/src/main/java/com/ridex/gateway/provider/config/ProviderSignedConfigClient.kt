package com.ridex.gateway.provider.config

import com.ridex.gateway.provider.session.ProviderSession

interface ProviderSignedConfigClient {
    fun fetchSignedConfig(
        baseUrl: String,
        session: ProviderSession,
    ): Result<String>
}
