package com.ridex.gateway.provider.queue

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ProviderQueueCodecTest {
    @Test
    fun parsesLockedProviderQueueShape() {
        val json = """
            {
              "success": true,
              "count": 1,
              "items": [
                {
                  "requestId": "REQ-1",
                  "recipient": "9876543210",
                  "message": "RideX verification OTP: TEST",
                  "purposeCode": "CUSTOMER.AUTH.LOGIN",
                  "deliveryMethod": "SIM_SMS",
                  "status": "QUEUED",
                  "createdAt": "2026-10-02T13:00:00Z",
                  "attemptCount": 0
                }
              ]
            }
        """.trimIndent()

        val items = ProviderQueueCodec.parsePendingResponse(json)
        assertEquals(1, items.size)
        assertEquals("REQ-1", items.first().requestId)
        assertEquals("CUSTOMER.AUTH.LOGIN", items.first().purposeCode)
    }

    @Test
    fun deliveryResultContainsStatusAndOptionalReason() {
        val payload = ProviderQueueCodec.buildDeliveryResult(
            status = DeliveryStatus.FAILED,
            failureCode = "NO_SERVICE",
        )
        assertTrue(payload.contains("FAILED"))
        assertTrue(payload.contains("NO_SERVICE"))
    }
}
