package com.ridex.gateway.provider.control
import com.ridex.gateway.security.ProviderUrlPolicy

import com.ridex.gateway.control.GatewayControlState
import com.ridex.gateway.provider.session.ProviderSession
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/** HTTPS-only remote-control transport. Final base URL remains intentionally unmapped. */
class HttpProviderControlClient(
    private val connectTimeoutMs: Int = 10_000,
    private val readTimeoutMs: Int = 15_000,
) : ProviderControlClient {

    override fun fetchControlState(
        baseUrl: String,
        session: ProviderSession,
    ): Result<ProviderControlResponse> = runCatching {
        requireHttps(baseUrl)
        require(session.isAccessTokenUsable()) { "ACCESS_TOKEN_EXPIRED" }

        val response = executeGet(
            url = joinUrl(baseUrl, "/gateway/v1/control/state"),
            accessToken = session.accessToken,
        )

        require(response.optBoolean("success", true)) {
            response.optString("error", "PROVIDER_CONTROL_REJECTED")
        }

        val state = GatewayControlState.valueOf(
            response.optString("state", GatewayControlState.NORMAL.name),
        )

        ProviderControlResponse(
            state = state,
            reason = response.optString("reason").takeIf { it.isNotBlank() },
            version = response.optLong("version").takeIf { response.has("version") },
        )
    }

    private fun executeGet(url: String, accessToken: String): JSONObject {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = connectTimeoutMs
            readTimeout = readTimeoutMs
            doInput = true
            useCaches = false
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Authorization", "Bearer $accessToken")
        }

        try {
            val statusCode = connection.responseCode
            val text = if (statusCode in 200..299) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            }
            if (statusCode == 401 || statusCode == 403) {
                throw SecurityException("PROVIDER_CONTROL_UNAUTHORIZED_$statusCode")
            }
            if (statusCode !in 200..299) {
                throw IOException("Provider control HTTP $statusCode")
            }
            return JSONObject(text)
        } finally {
            connection.disconnect()
        }
    }
    private fun requireHttps(baseUrl: String) { ProviderUrlPolicy.requireSafeHttps(baseUrl) }

    private fun joinUrl(baseUrl: String, path: String): String =
        baseUrl.trimEnd('/') + "/" + path.trimStart('/')
}
