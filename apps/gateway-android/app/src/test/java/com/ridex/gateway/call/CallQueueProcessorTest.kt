package com.ridex.gateway.call

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CallQueueProcessorTest {
    @Test fun callStatusEnumContainsTerminalStates() {
        assertEquals(CallStatus.ENDED, CallStatus.valueOf("ENDED"))
        assertEquals(CallStatus.FAILED, CallStatus.valueOf("FAILED"))
    }

    @Test fun duplicateCallRequestIdIsRejected() {
        val existing = CallRecord(
            requestId = "call-duplicate-test",
            recipient = "TEST_RECIPIENT",
            subscriptionId = 1,
            purposeCode = "TEST.CALL",
            status = CallStatus.STARTING,
            createdAtEpochMs = 1L,
        )
        var enqueueCalled = false

        val accepted = enqueueCallRequestUnlessAlreadyRecorded(existing) {
            enqueueCalled = true
            true
        }

        assertFalse(accepted)
        assertFalse(enqueueCalled)
    }

    @Test fun newCallRequestIdCanBeAccepted() {
        var enqueueCalled = false

        val accepted = enqueueCallRequestUnlessAlreadyRecorded(null) {
            enqueueCalled = true
            true
        }

        assertTrue(accepted)
        assertTrue(enqueueCalled)
    }

    @Test fun queueRejectionForNewRequestIsPreserved() {
        val accepted = enqueueCallRequestUnlessAlreadyRecorded(null) {
            false
        }

        assertFalse(accepted)
    }
}
