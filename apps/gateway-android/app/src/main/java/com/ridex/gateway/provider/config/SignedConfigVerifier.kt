package com.ridex.gateway.provider.config

import java.security.KeyFactory
import java.security.PublicKey
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.util.Base64
import org.json.JSONObject

/** Strict Ed25519 verifier. Unknown/unpinned keys are rejected. */
class SignedConfigVerifier(
    private val trustedKeysBase64: Map<String, String>,
    private val maxClockSkewMs: Long = 5 * 60 * 1000L,
) {
    fun parse(json: String): ProviderSignedConfig = run {
        val root = JSONObject(json)
        val payloadJson = root.optJSONObject("payload") ?: throw IllegalArgumentException("PAYLOAD_REQUIRED")
        ProviderSignedConfig(
            schemaVersion = root.getInt("schemaVersion"),
            configVersion = root.getLong("configVersion"),
            issuedAtEpochMs = root.getLong("issuedAtEpochMs"),
            expiresAtEpochMs = root.getLong("expiresAtEpochMs"),
            keyId = root.getString("keyId"),
            payload = payloadJson.toMap(),
            signatureBase64 = root.getString("signatureBase64"),
        )
    }

    fun verify(config: ProviderSignedConfig, nowEpochMs: Long = System.currentTimeMillis()): Result<Unit> {
        require(config.schemaVersion == 1) { "UNSUPPORTED_CONFIG_SCHEMA" }
        require(config.configVersion > 0) { "CONFIG_VERSION_INVALID" }
        require(config.issuedAtEpochMs <= nowEpochMs + maxClockSkewMs) { "CONFIG_ISSUED_IN_FUTURE" }
        require(config.expiresAtEpochMs > config.issuedAtEpochMs) { "CONFIG_EXPIRY_INVALID" }
        require(nowEpochMs <= config.expiresAtEpochMs) { "CONFIG_EXPIRED" }
        val publicKeyBase64 = trustedKeysBase64[config.keyId]
            ?: return Result.failure(SecurityException("TRUSTED_KEY_NOT_FOUND"))
        val publicKey = decodePublicKey(publicKeyBase64)
        val signatureBytes = runCatching { Base64.getDecoder().decode(config.signatureBase64) }
            .getOrElse { return Result.failure(SecurityException("SIGNATURE_ENCODING_INVALID")) }

        val signature = Signature.getInstance("Ed25519")
        signature.initVerify(publicKey)
        signature.update(SignedConfigCanonicalizer.canonicalBytes(config))
        if (!signature.verify(signatureBytes)) {
            return Result.failure(SecurityException("BAD_CONFIG_SIGNATURE"))
        }
        return Result.success(Unit)
    }

    private fun decodePublicKey(base64: String): PublicKey {
        val encoded = Base64.getDecoder().decode(base64)
        return KeyFactory.getInstance("Ed25519")
            .generatePublic(X509EncodedKeySpec(encoded))
    }

    private fun JSONObject.toMap(): Map<String, Any?> = keys().asSequence().associateWith { key ->
        when (val value = get(key)) {
            is JSONObject -> value.toMap()
            else -> value
        }
    }
}
