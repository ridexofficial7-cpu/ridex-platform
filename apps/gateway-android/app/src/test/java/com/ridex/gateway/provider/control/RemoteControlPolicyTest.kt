package com.ridex.gateway.provider.control

import org.junit.Assert.assertEquals
import org.junit.Test

class RemoteControlPolicyTest {
    @Test
    fun lowerRemoteVersionIsRejected() {
        assertEquals(
            RemoteControlDecision.REJECTED_VERSION_ROLLBACK,
            RemoteControlPolicy.decide("NORMAL", 5L, "MAINTENANCE", 4L),
        )
    }

    @Test
    fun revokeWins() {
        assertEquals(
            RemoteControlDecision.REVOKED,
            RemoteControlPolicy.decide("NORMAL", 5L, "REVOKED", 6L),
        )
    }

    @Test
    fun localRevokeCannotBeClearedRemotely() {
        assertEquals(
            RemoteControlDecision.REJECTED_REVOKED,
            RemoteControlPolicy.decide("REVOKED", 5L, "NORMAL", 6L),
        )
    }
}
