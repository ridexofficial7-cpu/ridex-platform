package com.ridex.gateway.provider.control

import java.security.KeyFactory
import java.security.PublicKey
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.util.Base64

/** Verifies signed commands against a statically pinned Provider command-key set. */
class GatewayRemoteCommandVerifier(
    private val trustedKeysBase64: Map<String, String>,
    private val maxClockSkewMs: Long = 5 * 60 * 1000L,
) {
    fun verify(
        command: GatewayRemoteCommand,
        nowEpochMs: Long = System.currentTimeMillis(),
    ): Result<Unit> = runCatching {
        require(command.schemaVersion == 1) { "UNSUPPORTED_COMMAND_SCHEMA" }
        require(command.issuedAtEpochMs <= nowEpochMs + maxClockSkewMs) { "COMMAND_ISSUED_IN_FUTURE" }
        require(command.expiresAtEpochMs > command.issuedAtEpochMs) { "COMMAND_EXPIRY_INVALID" }
        require(nowEpochMs <= command.expiresAtEpochMs) { "COMMAND_EXPIRED" }
        val publicKeyBase64 = trustedKeysBase64[command.keyId]
            ?: error("TRUSTED_COMMAND_KEY_NOT_FOUND")
        val publicKey = decodePublicKey(publicKeyBase64)
        val signatureBytes = runCatching { Base64.getDecoder().decode(command.signatureBase64) }
            .getOrElse { error("COMMAND_SIGNATURE_ENCODING_INVALID") }

        val signature = Signature.getInstance("Ed25519")
        signature.initVerify(publicKey)
        signature.update(GatewayRemoteCommandCanonicalizer.canonicalBytes(command))

        val signatureValid = runCatching {
            signature.verify(signatureBytes)
        }.getOrDefault(false)

        require(signatureValid) { "BAD_COMMAND_SIGNATURE" }
    }

    private fun decodePublicKey(base64: String): PublicKey =
        KeyFactory.getInstance("Ed25519")
            .generatePublic(X509EncodedKeySpec(Base64.getDecoder().decode(base64)))
}

