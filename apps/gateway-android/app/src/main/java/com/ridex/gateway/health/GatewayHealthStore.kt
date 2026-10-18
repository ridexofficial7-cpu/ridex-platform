package com.ridex.gateway.health

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Persists only non-sensitive health/diagnostic state. */
class GatewayHealthStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(
        PREFS_NAME,
        Context.MODE_PRIVATE,
    )

    fun read(): GatewayHealthSnapshot? {
        val raw = prefs.getString(KEY_SNAPSHOT, null) ?: return null
        return runCatching {
            val json = JSONObject(raw)
            GatewayHealthSnapshot(
                evaluatedAtEpochMs = json.getLong("evaluatedAtEpochMs"),
                state = GatewayHealthState.valueOf(json.getString("state")),
                providerConnected = json.getBoolean("providerConnected"),
                networkAvailable = json.getBoolean("networkAvailable"),
                networkValidated = json.getBoolean("networkValidated"),
                serviceRunning = json.getBoolean("serviceRunning"),
                selectedSimReady = json.getBoolean("selectedSimReady"),
                selectedSubscriptionId = if (json.isNull("selectedSubscriptionId")) null else json.getInt("selectedSubscriptionId"),
                batteryPercent = nullableInt(json, "batteryPercent"),
                charging = nullableBoolean(json, "charging"),
                batteryTemperatureC = nullableDouble(json, "batteryTemperatureC"),
                storageFreePercent = nullableInt(json, "storageFreePercent"),
                memoryAvailablePercent = nullableInt(json, "memoryAvailablePercent"),
                thermalHealth = ThermalHealth.valueOf(json.getString("thermalHealth")),
                clockPlausible = json.getBoolean("clockPlausible"),
                encryptionEnabled = nullableBoolean(json, "encryptionEnabled"),
                selinuxEnforcing = nullableBoolean(json, "selinuxEnforcing"),
                verifiedBootState = nullableString(json, "verifiedBootState"),
                bootloaderUnlocked = nullableBoolean(json, "bootloaderUnlocked"),
                warnings = json.getJSONArray("warnings").toStringList(),
            )
        }.getOrNull()
    }

    fun write(snapshot: GatewayHealthSnapshot) {
        val json = JSONObject()
            .put("evaluatedAtEpochMs", snapshot.evaluatedAtEpochMs)
            .put("state", snapshot.state.name)
            .put("providerConnected", snapshot.providerConnected)
            .put("networkAvailable", snapshot.networkAvailable)
            .put("networkValidated", snapshot.networkValidated)
            .put("serviceRunning", snapshot.serviceRunning)
            .put("selectedSimReady", snapshot.selectedSimReady)
            .put("selectedSubscriptionId", snapshot.selectedSubscriptionId)
            .put("batteryPercent", snapshot.batteryPercent)
            .put("charging", snapshot.charging)
            .put("batteryTemperatureC", snapshot.batteryTemperatureC)
            .put("storageFreePercent", snapshot.storageFreePercent)
            .put("memoryAvailablePercent", snapshot.memoryAvailablePercent)
            .put("thermalHealth", snapshot.thermalHealth.name)
            .put("clockPlausible", snapshot.clockPlausible)
            .put("encryptionEnabled", snapshot.encryptionEnabled)
            .put("selinuxEnforcing", snapshot.selinuxEnforcing)
            .put("verifiedBootState", snapshot.verifiedBootState)
            .put("bootloaderUnlocked", snapshot.bootloaderUnlocked)
            .put("warnings", JSONArray(snapshot.warnings))
        prefs.edit().putString(KEY_SNAPSHOT, json.toString()).apply()
    }

    private fun nullableInt(json: JSONObject, key: String): Int? =
        if (json.isNull(key)) null else json.getInt(key)

    private fun nullableBoolean(json: JSONObject, key: String): Boolean? =
        if (json.isNull(key)) null else json.getBoolean(key)

    private fun nullableDouble(json: JSONObject, key: String): Double? =
        if (json.isNull(key)) null else json.getDouble(key)

    private fun nullableString(json: JSONObject, key: String): String? =
        if (json.isNull(key)) null else json.getString(key)

    private fun JSONArray.toStringList(): List<String> =
        (0 until length()).map { getString(it) }

    companion object {
        private const val PREFS_NAME = "ridex_gateway_health_v1"
        private const val KEY_SNAPSHOT = "health_snapshot"
    }
}
