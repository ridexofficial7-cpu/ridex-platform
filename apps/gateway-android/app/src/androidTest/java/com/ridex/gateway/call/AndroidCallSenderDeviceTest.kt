package com.ridex.gateway.call

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class AndroidCallSenderDeviceTest {

    @Test
    fun placeRealTestCallThroughSelectedSubscription() {
        val context: Context =
            InstrumentationRegistry.getInstrumentation().targetContext

        val requestId = "device-call-test-${UUID.randomUUID()}"

        val request = CallRequest(
            requestId = requestId,
            recipient = "9122160691",
            subscriptionId = 2,
            purposeCode = "DEVICE_CALL_TEST",
        )

        val result = AndroidCallSender(context).place(request)

        assertTrue(
            "Real call submission failed: ${result.exceptionOrNull()?.message}",
            result.isSuccess,
        )

        println(
            "RIDEX_CALL_DEVICE_TEST: submitted=true " +
                "requestId=$requestId subscriptionId=2 recipient=9122160691"
        )
    }
}
