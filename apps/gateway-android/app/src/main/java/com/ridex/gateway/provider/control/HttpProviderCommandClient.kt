package com.ridex.gateway.provider.control
import com.ridex.gateway.security.ProviderUrlPolicy

import com.ridex.gateway.provider.session.ProviderSession
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/** HTTPS-only command transport. Final Provider endpoint remains unmapped until integration. */
class HttpProviderCommandClient(
    private val connectTimeoutMs: Int = 10_000,
    private val readTimeoutMs: Int = 15_000,
) : ProviderCommandClient {
    override fun fetchNextCommand(
        baseUrl: String,
        session: ProviderSession,
    ): Result<GatewayRemoteCommand?> = runCatching {
        requireHttps(baseUrl)
        require(session.isAccessTokenUsable()) { "ACCESS_TOKEN_EXPIRED" }

        val connection = (URL(joinUrl(baseUrl, "/gateway/v1/commands/next")).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = connectTimeoutMs
            readTimeout = readTimeoutMs
            doInput = true
            useCaches = false
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Authorization", "Bearer ${session.accessToken}")
        }

        try {
            val statusCode = connection.responseCode
            if (statusCode == 204) return@runCatching null
            val text = if (statusCode in 200..299) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            }
            if (statusCode == 401 || statusCode == 403) {
                throw SecurityException("PROVIDER_COMMAND_UNAUTHORIZED_$statusCode")
            }
            if (statusCode !in 200..299) throw IOException("Provider command HTTP $statusCode")
            val root = JSONObject(text)
            if (!root.optBoolean("success", true)) throw IOException(root.optString("error", "PROVIDER_COMMAND_REJECTED"))
            val commandJson = root.optJSONObject("command") ?: return@runCatching null
            val attempt = root.optLong("deliveryAttempt", 0L)
            require(attempt > 0L) { "PROVIDER_COMMAND_DELIVERY_ATTEMPT_MISSING" }
            GatewayRemoteCommandCanonicalizer.fromJson(commandJson.toString()).copy(deliveryAttempt = attempt)
        } finally {
            connection.disconnect()
        }
    }
    override fun acknowledgeCommand(
        baseUrl: String,
        session: ProviderSession,
        commandId: String,
        deliveryAttempt: Long,
        outcome: String,
        failureCode: String?,
    ): Result<Unit> = runCatching {
        requireHttps(baseUrl)
        require(session.isAccessTokenUsable()) { "ACCESS_TOKEN_EXPIRED" }
        require(commandId.matches(Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"))) { "COMMAND_ID_INVALID" }
        require(deliveryAttempt > 0L) { "COMMAND_DELIVERY_ATTEMPT_INVALID" }
        require(outcome == "ACKNOWLEDGED" || outcome == "FAILED") { "COMMAND_ACK_OUTCOME_INVALID" }
        val body = JSONObject().put("deliveryAttempt", deliveryAttempt).put("outcome", outcome)
        if (!failureCode.isNullOrBlank()) body.put("failureCode", failureCode)
        val connection = (URL(joinUrl(baseUrl, "/gateway/v1/commands/$commandId/ack")).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = connectTimeoutMs
            readTimeout = readTimeoutMs
            doOutput = true
            doInput = true
            useCaches = false
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Authorization", "Bearer ${session.accessToken}")
        }
        try {
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val statusCode = connection.responseCode
            val text = if (statusCode in 200..299) connection.inputStream.bufferedReader().use { it.readText() }
                else connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (statusCode == 401 || statusCode == 403) throw SecurityException("PROVIDER_COMMAND_ACK_UNAUTHORIZED_$statusCode")
            if (statusCode !in 200..299) {
                val code = runCatching { JSONObject(text).optString("error", "PROVIDER_COMMAND_ACK_REJECTED") }.getOrDefault("PROVIDER_COMMAND_ACK_REJECTED")
                throw IOException(code)
            }
            val response = JSONObject(text)
            if (!response.optBoolean("success", false)) throw IOException(response.optString("error", "PROVIDER_COMMAND_ACK_REJECTED"))
        } finally {
            connection.disconnect()
        }
    }

    private fun requireHttps(baseUrl: String) { ProviderUrlPolicy.requireSafeHttps(baseUrl) }

    private fun joinUrl(baseUrl: String, path: String): String = baseUrl.trimEnd('/') + "/" + path.trimStart('/')
}

interface ProviderCommandClient {
    fun fetchNextCommand(baseUrl: String, session: ProviderSession): Result<GatewayRemoteCommand?>
    fun acknowledgeCommand(baseUrl: String, session: ProviderSession, commandId: String, deliveryAttempt: Long, outcome: String, failureCode: String?): Result<Unit>
}
