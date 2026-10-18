package com.ridex.gateway.provider.heartbeat
import com.ridex.gateway.security.ProviderUrlPolicy

import com.ridex.gateway.provider.session.ProviderSession
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/** HTTPS-only canonical heartbeat transport. */
class HttpProviderHeartbeatClient(
    private val connectTimeoutMs: Int = 10_000,
    private val readTimeoutMs: Int = 15_000,
) : ProviderHeartbeatClient {

    override fun heartbeat(
        baseUrl: String,
        session: ProviderSession,
        request: ProviderHeartbeatRequest,
    ): Result<ProviderHeartbeatResponse> = runCatching {
        requireHttps(baseUrl)
        require(session.isAccessTokenUsable()) { "ACCESS_TOKEN_EXPIRED" }

        val body = JSONObject()
            .put("gatewayId", request.gatewayId)
            .put("deviceId", request.deviceId)
            .put("installationId", request.installationId)
            .put("appVersion", request.appVersion)
            .put("selectedSubscriptionId", request.selectedSubscriptionId)
            .put("simReady", request.simReady)
            .put("networkAvailable", request.networkAvailable)
            .put("sentAtEpochMs", request.sentAtEpochMs)

        val response = executeJsonPost(
            url = joinUrl(baseUrl, "/gateway/v1/heartbeat"),
            accessToken = session.accessToken,
            body = body,
        )

        val accepted = response.optBoolean("success", true)
        if (!accepted) {
            throw IOException(response.optString("error", "PROVIDER_HEARTBEAT_REJECTED"))
        }

        ProviderHeartbeatResponse(
            accepted = true,
            message = response.optString("message", "HEARTBEAT_ACCEPTED"),
        )
    }

    private fun executeJsonPost(
        url: String,
        accessToken: String,
        body: JSONObject,
    ): JSONObject {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = connectTimeoutMs
            readTimeout = readTimeoutMs
            doInput = true
            doOutput = true
            useCaches = false
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Authorization", "Bearer $accessToken")
        }

        try {
            connection.outputStream.use { output ->
                output.write(body.toString().toByteArray(Charsets.UTF_8))
            }

            val statusCode = connection.responseCode
            val responseText = if (statusCode in 200..299) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            }

            if (statusCode == 401 || statusCode == 403) {
                throw SecurityException("PROVIDER_HEARTBEAT_UNAUTHORIZED_$statusCode")
            }
            if (statusCode !in 200..299) {
                throw IOException("Provider heartbeat HTTP $statusCode")
            }
            return JSONObject(responseText)
        } finally {
            connection.disconnect()
        }
    }
    private fun requireHttps(baseUrl: String) { ProviderUrlPolicy.requireSafeHttps(baseUrl) }

    private fun joinUrl(baseUrl: String, path: String): String =
        baseUrl.trimEnd('/') + "/" + path.trimStart('/')
}
