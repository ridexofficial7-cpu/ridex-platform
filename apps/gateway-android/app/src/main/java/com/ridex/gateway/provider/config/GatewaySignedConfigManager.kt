package com.ridex.gateway.provider.config

import com.ridex.gateway.data.storage.SecureStorage

/** Applies only trusted, non-expired, non-rollback provider configurations. */
class GatewaySignedConfigManager(
    secureStorage: SecureStorage,
    private val verifier: SignedConfigVerifier,
) {
    private val store = GatewaySignedConfigStore(secureStorage)

    fun current(): StoredSignedConfig? = store.readCurrent()

    fun applyJson(json: String, nowEpochMs: Long = System.currentTimeMillis()): SignedConfigApplyResult {
        val config = runCatching { verifier.parse(json) }.getOrElse {
            store.appendAudit("REJECTED", null, null, null, "INVALID_ENVELOPE", nowEpochMs)
            return SignedConfigApplyResult(SignedConfigApplyStatus.REJECTED_INVALID, null, null, it.message)
        }

        val current = store.readCurrent()
        val fingerprint = CanonicalJson.sha256Hex(
            SignedConfigCanonicalizer.canonicalBytes(config).toString(Charsets.UTF_8),
        )

        verifier.verify(config, nowEpochMs).onFailure { error ->
            val status = when (error.message) {
                "TRUSTED_KEY_NOT_FOUND" -> SignedConfigApplyStatus.REJECTED_NO_TRUSTED_KEY
                "BAD_CONFIG_SIGNATURE" -> SignedConfigApplyStatus.REJECTED_BAD_SIGNATURE
                "CONFIG_EXPIRED" -> SignedConfigApplyStatus.REJECTED_EXPIRED
                "CONFIG_ISSUED_IN_FUTURE" -> SignedConfigApplyStatus.REJECTED_FUTURE_ISSUED_AT
                else -> SignedConfigApplyStatus.REJECTED_INVALID
            }
            store.appendAudit("REJECTED", config.configVersion, config.keyId, fingerprint, error.message, nowEpochMs)
            return SignedConfigApplyResult(status, config.configVersion, fingerprint, error.message)
        }

        if (current != null && config.configVersion < current.configVersion) {
            store.appendAudit("REJECTED", config.configVersion, config.keyId, fingerprint, "CONFIG_ROLLBACK", nowEpochMs)
            return SignedConfigApplyResult(
                SignedConfigApplyStatus.REJECTED_ROLLBACK,
                config.configVersion,
                fingerprint,
                "CONFIG_ROLLBACK",
            )
        }

        if (current != null && config.configVersion == current.configVersion) {
            return if (current.fingerprintSha256 == fingerprint) {
                SignedConfigApplyResult(SignedConfigApplyStatus.NO_CHANGE, config.configVersion, fingerprint)
            } else {
                store.appendAudit("REJECTED", config.configVersion, config.keyId, fingerprint, "VERSION_COLLISION", nowEpochMs)
                SignedConfigApplyResult(
                    SignedConfigApplyStatus.REJECTED_ROLLBACK,
                    config.configVersion,
                    fingerprint,
                    "VERSION_COLLISION",
                )
            }
        }

        store.save(config, fingerprint, nowEpochMs)
        return SignedConfigApplyResult(SignedConfigApplyStatus.APPLIED, config.configVersion, fingerprint)
    }
}
