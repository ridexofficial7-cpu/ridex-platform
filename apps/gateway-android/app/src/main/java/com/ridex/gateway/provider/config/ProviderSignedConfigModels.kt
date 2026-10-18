package com.ridex.gateway.provider.config

/**
 * Provider-authored configuration envelope. The signature covers every field except
 * the signature itself through canonical JSON encoding.
 */
data class ProviderSignedConfig(
    val schemaVersion: Int,
    val configVersion: Long,
    val issuedAtEpochMs: Long,
    val expiresAtEpochMs: Long,
    val keyId: String,
    val payload: Map<String, Any?>,
    val signatureBase64: String,
)

enum class SignedConfigApplyStatus {
    APPLIED,
    NO_CHANGE,
    REJECTED_NO_TRUSTED_KEY,
    REJECTED_BAD_SIGNATURE,
    REJECTED_EXPIRED,
    REJECTED_FUTURE_ISSUED_AT,
    REJECTED_ROLLBACK,
    REJECTED_INVALID,
}

data class SignedConfigApplyResult(
    val status: SignedConfigApplyStatus,
    val configVersion: Long?,
    val configFingerprintSha256: String?,
    val reason: String? = null,
)
