package com.ridex.gateway.provider.config

import java.security.KeyPairGenerator
import java.security.Signature
import java.util.Base64
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class SignedConfigVerifierTest {
    @Test
    fun verifiesEd25519SignatureAndRejectsTampering() {
        val keyPair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair()
        val unsigned = ProviderSignedConfig(
            schemaVersion = 1,
            configVersion = 1,
            issuedAtEpochMs = 1_700_000_000_000L,
            expiresAtEpochMs = 1_900_000_000_000L,
            keyId = "test-key",
            payload = mapOf("heartbeatSeconds" to 60, "allowBootloaderUnlocked" to true),
            signatureBase64 = "",
        )
        val signer = Signature.getInstance("Ed25519")
        signer.initSign(keyPair.private)
        signer.update(SignedConfigCanonicalizer.canonicalBytes(unsigned))
        val signature = Base64.getEncoder().encodeToString(signer.sign())
        val signed = unsigned.copy(signatureBase64 = signature)
        val publicKey = Base64.getEncoder().encodeToString(keyPair.public.encoded)

        val verifier = SignedConfigVerifier(mapOf("test-key" to publicKey))
        assertTrue(verifier.verify(signed, nowEpochMs = 1_800_000_000_000L).isSuccess)

        val tampered = signed.copy(configVersion = 2)
        if (verifier.verify(tampered, nowEpochMs = 1_800_000_000_000L).isSuccess) {
            fail("tampered config must not verify")
        }
    }
}
