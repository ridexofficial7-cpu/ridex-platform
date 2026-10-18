package com.ridex.gateway.provider.control

import com.ridex.gateway.provider.config.ProviderTrustConfig
import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GatewayRemoteCommandVerifierTest {

    private val issuedAt = 1790977408317L
    private val expiresAt = 1790977708317L

    private val validCommand = GatewayRemoteCommand(
        schemaVersion = 1,
        commandId = "13257c84-a178-4f12-be82-a481eb82991a",
        commandSequence = 1L,
        issuedAtEpochMs = issuedAt,
        expiresAtEpochMs = expiresAt,
        keyId = "ridex-test-command-key-v1",
        actorId = "TEST-SUPER-ADMIN-001",
        actorRole = GatewayCommandActorRole.SUPER_ADMIN,
        action = GatewayCommandAction.FORCE_DIAGNOSTIC,
        payload = emptyMap(),
        approvals = listOf(
            GatewayCommandApproval(
                approvalId = "test-approval-1790977408315",
                approverId = "TEST-SUPER-ADMIN-001",
                approverRole = GatewayCommandActorRole.SUPER_ADMIN,
                approvedAtEpochMs = 1790977408315L,
            ),
        ),
        signatureBase64 =
            "vVk5QMtXdW3tYCvT2New3pscyV3QU1lTndEcM5xbL0bYdsI3Gy10BU0hYhHVCTFX3kRpWs2UFBr2j28o0eTmCA==",
    )

    private fun verifier(): GatewayRemoteCommandVerifier =
        GatewayRemoteCommandVerifier(
            ProviderTrustConfig.pinnedEd25519CommandKeysBase64,
        )

    private fun assertRejected(
        command: GatewayRemoteCommand,
        nowEpochMs: Long,
        expectedReason: String,
    ) {
        val result = verifier().verify(command, nowEpochMs)

        assertTrue(
            "Expected verifier rejection but verification succeeded.",
            result.isFailure,
        )

        assertEquals(
            expectedReason,
            result.exceptionOrNull()?.message,
        )
    }

    @Test
    fun validProviderCommandIsAccepted() {
        val result = verifier().verify(
            validCommand,
            issuedAt + 1_000L,
        )

        assertTrue(
            "Expected valid command to verify.",
            result.isSuccess,
        )
    }

    @Test
    fun tamperedSignatureIsRejected() {
        val original = Base64.getDecoder().decode(
            validCommand.signatureBase64,
        )

        original[0] = (original[0].toInt() xor 0x01).toByte()

        val tamperedSignature =
            Base64.getEncoder().encodeToString(original)

        assertRejected(
            validCommand.copy(
                signatureBase64 = tamperedSignature,
            ),
            issuedAt + 1_000L,
            "BAD_COMMAND_SIGNATURE",
        )
    }

    @Test
    fun unknownKeyIdIsRejected() {
        assertRejected(
            validCommand.copy(
                keyId = "ridex-test-unknown-key",
            ),
            issuedAt + 1_000L,
            "TRUSTED_COMMAND_KEY_NOT_FOUND",
        )
    }

    @Test
    fun expiredCommandIsRejected() {
        assertRejected(
            validCommand,
            expiresAt + 1L,
            "COMMAND_EXPIRED",
        )
    }

    @Test
    fun commandIssuedTooFarInFutureIsRejected() {
        assertRejected(
            validCommand,
            issuedAt - 5 * 60 * 1000L - 1L,
            "COMMAND_ISSUED_IN_FUTURE",
        )
    }
}
