package com.ridex.gateway.provider

import com.ridex.gateway.BuildConfig
import java.net.URI

/** Resolves the approved deployment-time Provider URL without embedding a production host. */
object ProviderRuntimeEndpoint {
    fun baseUrl(): String = BuildConfig.PROVIDER_BASE_URL.trim().trimEnd('/')

    fun requireConfiguredHttps(): String {
        val base = baseUrl()
        require(base.isNotBlank()) { "PROVIDER_BASE_URL_NOT_CONFIGURED" }
        val uri = URI(base)
        require(uri.scheme.equals("https", ignoreCase = true)) { "PROVIDER_BASE_URL_MUST_USE_HTTPS" }
        require(!uri.host.isNullOrBlank()) { "PROVIDER_BASE_URL_HOST_REQUIRED" }
        return base
    }
}
