package com.ridex.gateway.provider.config

import java.security.MessageDigest
import org.json.JSONArray
import org.json.JSONObject

/** Deterministic JSON canonicalizer used for signature and fingerprint verification. */
object CanonicalJson {
    fun fromMap(map: Map<String, Any?>): String = canonicalizeObject(JSONObject(map))

    fun canonicalizeObject(json: JSONObject): String {
        val keys = json.keys().asSequence().toList().sorted()
        return buildString {
            append('{')
            keys.forEachIndexed { index, key ->
                if (index > 0) append(',')
                append(JSONObject.quote(key))
                append(':')
                append(canonicalizeValue(json.get(key)))
            }
            append('}')
        }
    }

    private fun canonicalizeValue(value: Any?): String = when (value) {
        null, JSONObject.NULL -> "null"
        is JSONObject -> canonicalizeObject(value)
        is JSONArray -> buildString {
            append('[')
            for (index in 0 until value.length()) {
                if (index > 0) append(',')
                append(canonicalizeValue(value.get(index)))
            }
            append(']')
        }
        is String -> JSONObject.quote(value)
        is Boolean, is Number -> value.toString()
        else -> JSONObject.quote(value.toString())
    }

    fun sha256Hex(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
}

object SignedConfigCanonicalizer {
    fun canonicalBytes(config: ProviderSignedConfig): ByteArray {
        val root = JSONObject()
            .put("schemaVersion", config.schemaVersion)
            .put("configVersion", config.configVersion)
            .put("issuedAtEpochMs", config.issuedAtEpochMs)
            .put("expiresAtEpochMs", config.expiresAtEpochMs)
            .put("keyId", config.keyId)
            .put("payload", JSONObject(config.payload))

        return CanonicalJson.canonicalizeObject(root).toByteArray(Charsets.UTF_8)
    }
}
