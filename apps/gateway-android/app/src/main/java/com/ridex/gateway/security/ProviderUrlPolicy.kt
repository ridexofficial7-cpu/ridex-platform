package com.ridex.gateway.security

import java.net.URI

/** Centralized provider URL validation. No credentials, fragments, query strings, or cleartext are allowed. */
object ProviderUrlPolicy {
    fun requireSafeHttps(baseUrl: String): String {
        val normalized = baseUrl.trim().trimEnd('/')
        require(normalized.isNotBlank()) { "PROVIDER_BASE_URL_NOT_CONFIGURED" }
        val uri = URI(normalized)
        require(uri.scheme.equals("https", ignoreCase = true)) { "PROVIDER_BASE_URL_MUST_USE_HTTPS" }
        require(!uri.host.isNullOrBlank()) { "PROVIDER_BASE_URL_HOST_REQUIRED" }
        require(uri.userInfo.isNullOrBlank()) { "PROVIDER_BASE_URL_CREDENTIALS_FORBIDDEN" }
        require(uri.query.isNullOrBlank()) { "PROVIDER_BASE_URL_QUERY_FORBIDDEN" }
        require(uri.fragment.isNullOrBlank()) { "PROVIDER_BASE_URL_FRAGMENT_FORBIDDEN" }
        require(uri.path.isNullOrBlank() || uri.path == "/") { "PROVIDER_BASE_URL_PATH_FORBIDDEN" }
        return normalized
    }
}
