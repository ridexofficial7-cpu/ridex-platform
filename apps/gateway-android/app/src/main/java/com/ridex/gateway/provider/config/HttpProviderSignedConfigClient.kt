package com.ridex.gateway.provider.config
import com.ridex.gateway.security.ProviderUrlPolicy

import com.ridex.gateway.provider.session.ProviderSession
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/** HTTPS-only transport for the Provider-signed configuration document. */
class HttpProviderSignedConfigClient(
    private val connectTimeoutMs: Int = 10_000,
    private val readTimeoutMs: Int = 15_000,
) : ProviderSignedConfigClient {
    override fun fetchSignedConfig(
        baseUrl: String,
        session: ProviderSession,
    ): Result<String> = runCatching {
        requireHttps(baseUrl)
        require(session.isAccessTokenUsable()) { "ACCESS_TOKEN_EXPIRED" }
        val connection = (URL(joinUrl(baseUrl, "/gateway/v1/config/signed")).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = connectTimeoutMs
            readTimeout = readTimeoutMs
            doInput = true
            useCaches = false
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Authorization", "Bearer ${session.accessToken}")
        }
        try {
            val status = connection.responseCode
            val text = if (status in 200..299) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            }
            if (status == 401 || status == 403) throw SecurityException("PROVIDER_CONFIG_UNAUTHORIZED_$status")
            if (status !in 200..299) throw IOException("Provider config HTTP $status")
            text
        } finally {
            connection.disconnect()
        }
    }
    private fun requireHttps(baseUrl: String) { ProviderUrlPolicy.requireSafeHttps(baseUrl) }

    private fun joinUrl(baseUrl: String, path: String): String = baseUrl.trimEnd('/') + "/" + path.trimStart('/')
}
