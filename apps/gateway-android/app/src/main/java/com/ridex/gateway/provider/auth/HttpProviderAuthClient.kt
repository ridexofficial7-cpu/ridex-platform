package com.ridex.gateway.provider.auth
import com.ridex.gateway.security.ProviderUrlPolicy

import com.ridex.gateway.identity.GatewayIdentity
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/**
 * Provider authentication transport.
 * HTTPS is mandatory; base URL is supplied at deployment/build time.
 */
class HttpProviderAuthClient(
    private val connectTimeoutMs: Int = 10_000,
    private val readTimeoutMs: Int = 15_000,
) : ProviderAuthClient {

    override fun authenticate(
        baseUrl: String,
        identity: GatewayIdentity,
        appVersion: String,
        enrollmentCode: String,
        assignedMobileNumber: String,
    ): Result<ProviderAuthResponse> = runCatching {
        requireHttps(baseUrl)

        val body = JSONObject()
            .put("gatewayId", identity.gatewayId)
            .put("deviceId", identity.deviceId)
            .put("installationId", identity.installationId)
            .put("appVersion", appVersion)
            .put("enrollmentCode", enrollmentCode)
            .put("assignedMobileNumber", assignedMobileNumber)

        executeJsonPost(
            url = joinUrl(baseUrl, "/gateway/v1/auth/enroll"),
            body = body,
        ).toAuthResponse()
    }

    override fun refresh(
        baseUrl: String,
        gatewayId: String,
        refreshToken: String,
    ): Result<ProviderAuthResponse> = runCatching {
        requireHttps(baseUrl)

        val body = JSONObject()
            .put("gatewayId", gatewayId)
            .put("refreshToken", refreshToken)

        executeJsonPost(
            url = joinUrl(baseUrl, "/gateway/v1/auth/refresh"),
            body = body,
        ).toAuthResponse()
    }

    private fun executeJsonPost(
        url: String,
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

            if (statusCode !in 200..299) {
                throw IOException("Provider auth HTTP $statusCode")
            }

            return JSONObject(responseText)
        } finally {
            connection.disconnect()
        }
    }

    private fun JSONObject.toAuthResponse(): ProviderAuthResponse {
        require(optBoolean("success", true)) {
            optString("error", "PROVIDER_AUTH_FAILED")
        }

        val accessToken = optString("accessToken")
        val refreshToken = optString("refreshToken")
        require(accessToken.isNotBlank()) { "ACCESS_TOKEN_MISSING" }
        require(refreshToken.isNotBlank()) { "REFRESH_TOKEN_MISSING" }

        return ProviderAuthResponse(
            accessToken = accessToken,
            refreshToken = refreshToken,
            accessTokenExpiresAtEpochMs = getLong("accessTokenExpiresAtEpochMs"),
            refreshTokenExpiresAtEpochMs = getLong("refreshTokenExpiresAtEpochMs"),
        )
    }
    private fun requireHttps(baseUrl: String) { ProviderUrlPolicy.requireSafeHttps(baseUrl) }

    private fun joinUrl(baseUrl: String, path: String): String =
        baseUrl.trimEnd('/') + "/" + path.trimStart('/')
}
