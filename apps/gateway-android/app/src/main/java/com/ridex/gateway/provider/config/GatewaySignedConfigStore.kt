package com.ridex.gateway.provider.config

import com.ridex.gateway.data.storage.SecureStorage
import org.json.JSONObject

/** Stores current signed configuration and a bounded non-secret audit trail securely. */
class GatewaySignedConfigStore(private val secureStorage: SecureStorage) {
    fun readCurrent(): StoredSignedConfig? {
        val raw = secureStorage.getString(KEY_CURRENT) ?: return null
        return runCatching {
            val json = JSONObject(raw)
            StoredSignedConfig(
                schemaVersion = json.getInt("schemaVersion"),
                configVersion = json.getLong("configVersion"),
                keyId = json.getString("keyId"),
                issuedAtEpochMs = json.getLong("issuedAtEpochMs"),
                expiresAtEpochMs = json.getLong("expiresAtEpochMs"),
                fingerprintSha256 = json.getString("fingerprintSha256"),
                canonicalPayload = json.getString("canonicalPayload"),
                appliedAtEpochMs = json.getLong("appliedAtEpochMs"),
            )
        }.getOrNull()
    }

    fun save(config: ProviderSignedConfig, fingerprintSha256: String, nowEpochMs: Long = System.currentTimeMillis()) {
        val json = JSONObject()
            .put("schemaVersion", config.schemaVersion)
            .put("configVersion", config.configVersion)
            .put("keyId", config.keyId)
            .put("issuedAtEpochMs", config.issuedAtEpochMs)
            .put("expiresAtEpochMs", config.expiresAtEpochMs)
            .put("fingerprintSha256", fingerprintSha256)
            .put("canonicalPayload", SignedConfigCanonicalizer.canonicalBytes(config).toString(Charsets.UTF_8))
            .put("appliedAtEpochMs", nowEpochMs)
        secureStorage.putString(KEY_CURRENT, json.toString())
        appendAudit("APPLIED", config.configVersion, config.keyId, fingerprintSha256, null, nowEpochMs)
    }

    fun appendAudit(
        action: String,
        configVersion: Long?,
        keyId: String?,
        fingerprintSha256: String?,
        reason: String?,
        nowEpochMs: Long = System.currentTimeMillis(),
    ) {
        val current = runCatching { secureStorage.getString(KEY_AUDIT) }.getOrNull()
        val records = current?.let { runCatching { org.json.JSONArray(it) }.getOrNull() } ?: org.json.JSONArray()
        val item = JSONObject()
            .put("action", action)
            .put("configVersion", configVersion ?: JSONObject.NULL)
            .put("keyId", keyId ?: JSONObject.NULL)
            .put("fingerprintSha256", fingerprintSha256 ?: JSONObject.NULL)
            .put("reason", reason ?: JSONObject.NULL)
            .put("atEpochMs", nowEpochMs)
        val trimmed = org.json.JSONArray()
        val start = maxOf(0, records.length() - MAX_AUDIT + 1)
        for (index in start until records.length()) trimmed.put(records.get(index))
        trimmed.put(item)
        secureStorage.putString(KEY_AUDIT, trimmed.toString())
    }

    fun auditJson(): String = secureStorage.getString(KEY_AUDIT) ?: "[]"

    companion object {
        private const val KEY_CURRENT = "provider_signed_config_v1"
        private const val KEY_AUDIT = "provider_signed_config_audit_v1"
        private const val MAX_AUDIT = 40
    }
}

data class StoredSignedConfig(
    val schemaVersion: Int,
    val configVersion: Long,
    val keyId: String,
    val issuedAtEpochMs: Long,
    val expiresAtEpochMs: Long,
    val fingerprintSha256: String,
    val canonicalPayload: String,
    val appliedAtEpochMs: Long,
)
