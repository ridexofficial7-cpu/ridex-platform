package com.ridex.gateway.provider.queue
import com.ridex.gateway.security.ProviderUrlPolicy

import com.ridex.gateway.queue.GatewayQueueItem
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/** HTTPS-only Provider queue transport. Endpoint paths follow the locked Provider contract. */
class HttpProviderQueueClient(
    private val connectTimeoutMs: Int = 10_000,
    private val readTimeoutMs: Int = 15_000,
) : ProviderQueueClient {

    override fun fetchPending(
        baseUrl: String,
        accessToken: String,
    ): Result<List<GatewayQueueItem>> = runCatching {
        requireHttps(baseUrl)
        require(accessToken.isNotBlank()) { "ACCESS_TOKEN_REQUIRED" }
        val response = executeJsonGet(
            url = joinUrl(baseUrl, "/gateway/v1/sms/queue"),
            accessToken = accessToken,
        )
        ProviderQueueCodec.parsePendingResponse(response.toString())
    }

    override fun postDeliveryResult(
        baseUrl: String,
        accessToken: String,
        requestId: String,
        status: DeliveryStatus,
        failureCode: String?,
    ): Result<Unit> = runCatching {
        requireHttps(baseUrl)
        require(accessToken.isNotBlank()) { "ACCESS_TOKEN_REQUIRED" }
        require(requestId.isNotBlank()) { "REQUEST_ID_REQUIRED" }
        val body = ProviderQueueCodec.buildDeliveryResult(status, failureCode)
        executeJsonPost(
            url = joinUrl(baseUrl, "/gateway/v1/sms/$requestId/result"),
            accessToken = accessToken,
            body = body,
        )
        Unit
    }

    private fun executeJsonGet(
        url: String,
        accessToken: String,
    ): JSONObject {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = connectTimeoutMs
            readTimeout = readTimeoutMs
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Authorization", "Bearer $accessToken")
        }
        return try {
            val statusCode = connection.responseCode
            val text = if (statusCode in 200..299) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            }
            if (statusCode == 401 || statusCode == 403) {
                throw SecurityException("PROVIDER_QUEUE_UNAUTHORIZED_$statusCode")
            }
            if (statusCode !in 200..299) {
                throw IOException(classifyHttpFailure(statusCode))
            }
            JSONObject(text)
        } finally {
            connection.disconnect()
        }
    }

    private fun executeJsonPost(
        url: String,
        accessToken: String,
        body: String,
    ) {
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
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val statusCode = connection.responseCode
            if (statusCode == 401 || statusCode == 403) {
                throw SecurityException("PROVIDER_RESULT_UNAUTHORIZED_$statusCode")
            }
            if (statusCode !in 200..299) {
                throw IOException(classifyHttpFailure(statusCode))
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun classifyHttpFailure(statusCode: Int): String = when {
        statusCode == 429 -> "PROVIDER_HTTP_429"
        statusCode >= 500 -> "PROVIDER_HTTP_5XX"
        statusCode >= 400 -> "PROVIDER_HTTP_4XX"
        else -> "PROVIDER_HTTP_$statusCode"
    }
    private fun requireHttps(baseUrl: String) { ProviderUrlPolicy.requireSafeHttps(baseUrl) }

    private fun joinUrl(baseUrl: String, path: String): String =
        baseUrl.trimEnd('/') + "/" + path.trimStart('/')
}
