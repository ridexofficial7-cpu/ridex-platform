package com.ridex.gateway.queue

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GatewayQueueStateMachineTest {
    private fun item(requestId: String, createdAt: Long = 1000L) = GatewayQueueItem(
        requestId = requestId,
        recipient = "9876543210",
        message = "TEST MESSAGE",
        purposeCode = "CUSTOMER.AUTH.LOGIN",
        createdAtEpochMs = createdAt,
    )

    @Test
    fun duplicateRequestIsRejected() {
        val queue = GatewayQueueStateMachine()

        assertTrue(queue.enqueue(item("REQ-1")))
        assertFalse(queue.enqueue(item("REQ-1")))
        assertEquals(1, queue.summary().queued)
    }

    @Test
    fun claimCreatesLeaseAndProcessingCanStart() {
        val queue = GatewayQueueStateMachine()
        queue.enqueue(item("REQ-1"))

        val leased = queue.claimNext(10_000L, "gateway-1")

        assertNotNull(leased)
        assertEquals(QueueItemState.LEASED, leased?.state)
        assertEquals("gateway-1", leased?.leaseOwner)
        assertEquals(70_000L, leased?.leaseUntilEpochMs)

        val processing = queue.beginProcessing("REQ-1", "gateway-1")
        assertEquals(QueueItemState.PROCESSING, processing?.state)
    }

    @Test
    fun wrongOwnerCannotFinalize() {
        val queue = GatewayQueueStateMachine()
        queue.enqueue(item("REQ-1"))
        queue.claimNext(10_000L, "gateway-1")

        assertNull(queue.markSent("REQ-1", "gateway-2"))
        assertEquals(QueueItemState.LEASED, queue.get("REQ-1")?.state)
    }

    @Test
    fun sentRequestBecomesFinalizedAndCannotBeEnqueuedAgain() {
        val queue = GatewayQueueStateMachine()
        queue.enqueue(item("REQ-1"))
        queue.claimNext(10_000L, "gateway-1")
        queue.markSent("REQ-1", "gateway-1")

        assertTrue(queue.isFinalized("REQ-1"))
        assertFalse(queue.enqueue(item("REQ-1", 2000L)))
        assertEquals(1, queue.summary().sent)
    }

    @Test
    fun retryableFailureIsTerminalAndCannotBeClaimedAgain() {
        val queue = GatewayQueueStateMachine()
        queue.enqueue(item("REQ-1"))
        queue.claimNext(10_000L, "gateway-1")

        queue.markFailed(
            requestId = "REQ-1",
            owner = "gateway-1",
            retryable = true,
            failureCode = "NETWORK_TIMEOUT",
            nextRetryAtEpochMs = 20_000L,
        )

        assertEquals(QueueItemState.FAILED, queue.get("REQ-1")?.state)
        assertTrue(queue.isFinalized("REQ-1"))
        assertNull(queue.claimNext(20_000L, "gateway-1"))
        assertFalse(queue.enqueue(item("REQ-1", 2000L)))
    }

    @Test
    fun expiredLeaseBecomesTerminalFailureAndCannotBeClaimedAgain() {
        val queue = GatewayQueueStateMachine()
        queue.enqueue(item("REQ-1"))
        queue.claimNext(10_000L, "gateway-1")

        val recovered = queue.recoverExpiredLeases(70_000L)

        assertEquals(1, recovered)
        assertEquals(QueueItemState.FAILED, queue.get("REQ-1")?.state)
        assertTrue(queue.isFinalized("REQ-1"))
        assertNull(queue.claimNext(70_000L, "gateway-2"))
    }

    @Test
    fun snapshotRestorePreservesPendingAndFinalizedState() {
        val queue = GatewayQueueStateMachine()
        queue.enqueue(item("REQ-1"))
        queue.enqueue(item("REQ-2", 2000L))
        queue.claimNext(10_000L, "gateway-1")
        queue.markSent("REQ-1", "gateway-1")

        val restored = GatewayQueueStateMachine()
        restored.restoreSnapshot(
            queue.itemsSnapshot(),
            queue.finalizedRequestIdsSnapshot(),
        )

        assertTrue(restored.isFinalized("REQ-1"))
        assertFalse(restored.enqueue(item("REQ-1")))
        assertEquals(QueueItemState.QUEUED, restored.get("REQ-2")?.state)
        assertEquals(1, restored.summary().sent)
        assertEquals(1, restored.summary().queued)
    }

    @Test
    fun terminalFailureIsFinalized() {
        val queue = GatewayQueueStateMachine()
        queue.enqueue(item("REQ-1"))
        queue.claimNext(10_000L, "gateway-1")

        queue.markFailed(
            requestId = "REQ-1",
            owner = "gateway-1",
            retryable = false,
            failureCode = "INVALID_RECIPIENT",
        )

        assertTrue(queue.isFinalized("REQ-1"))
        assertEquals(QueueItemState.FAILED, queue.get("REQ-1")?.state)
        assertNull(queue.claimNext(20_000L, "gateway-1"))
    }
}
