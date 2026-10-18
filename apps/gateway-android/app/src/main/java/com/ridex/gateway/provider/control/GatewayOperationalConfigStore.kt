package com.ridex.gateway.provider.control

import com.ridex.gateway.data.storage.SecureStorage
import org.json.JSONObject

/** Versioned gateway runtime configuration. Values are bounded before persistence. */
class GatewayOperationalConfigStore(
    private val storage: SecureStorage,
) {
    @Synchronized
    fun read(): GatewayOperationalConfig {
        val raw = storage.getString(KEY) ?: return GatewayOperationalConfig()
        return runCatching {
            val json = JSONObject(raw)
            GatewayOperationalConfig(
                version = json.optLong("version", 1L),
                selectedSubscriptionId = if (json.has("selectedSubscriptionId") && !json.isNull("selectedSubscriptionId")) json.optInt("selectedSubscriptionId") else null,
                heartbeatSeconds = json.optInt("heartbeatSeconds", 60),
                queuePollSeconds = json.optInt("queuePollSeconds", 10),
                localSmsDailyLimit = json.optInt("localSmsDailyLimit", 100),
                smsEnabled = json.optBoolean("smsEnabled", true),
                callsEnabled = json.optBoolean("callsEnabled", false),
            ).validated()
        }.getOrElse { GatewayOperationalConfig() }
    }

    @Synchronized
    fun save(next: GatewayOperationalConfig): GatewayOperationalConfig {
        val current = read()
        require(next.version > current.version) { "CONFIG_VERSION_MUST_INCREASE" }
        val validated = next.validated()
        storage.putString(
            KEY,
            JSONObject()
                .put("version", validated.version)
                .put("selectedSubscriptionId", validated.selectedSubscriptionId ?: JSONObject.NULL)
                .put("heartbeatSeconds", validated.heartbeatSeconds)
                .put("queuePollSeconds", validated.queuePollSeconds)
                .put("localSmsDailyLimit", validated.localSmsDailyLimit)
                .put("smsEnabled", validated.smsEnabled)
                .put("callsEnabled", validated.callsEnabled)
                .toString(),
        )
        return validated
    }

    companion object {
        private const val KEY = "gateway_operational_config_v1"
    }
}

data class GatewayOperationalConfig(
    val version: Long = 1L,
    val selectedSubscriptionId: Int? = null,
    val heartbeatSeconds: Int = 60,
    val queuePollSeconds: Int = 10,
    val localSmsDailyLimit: Int = 100,
    val smsEnabled: Boolean = true,
    val callsEnabled: Boolean = false,
) {
    fun validated(): GatewayOperationalConfig {
        require(version > 0) { "CONFIG_VERSION_INVALID" }
        selectedSubscriptionId?.let { require(it > 0) { "SUBSCRIPTION_ID_INVALID" } }
        require(heartbeatSeconds in 30..300) { "HEARTBEAT_SECONDS_OUT_OF_RANGE" }
        require(queuePollSeconds in 5..60) { "QUEUE_POLL_SECONDS_OUT_OF_RANGE" }
        require(localSmsDailyLimit in 1..100) { "LOCAL_SMS_DAILY_LIMIT_OUT_OF_RANGE" }
        return this
    }
}

