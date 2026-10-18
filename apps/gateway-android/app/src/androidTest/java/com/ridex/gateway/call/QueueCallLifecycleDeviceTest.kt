package com.ridex.gateway.call

import android.Manifest
import android.content.Context
import androidx.core.content.ContextCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.ridex.gateway.data.storage.SecureStorage
import com.ridex.gateway.provider.control.GatewayOperationalConfigStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class QueueCallLifecycleDeviceTest {

    @Test
    fun queueRealCallAndRecordLifecycle() {
        val context: Context =
            InstrumentationRegistry.getInstrumentation().targetContext

        assertTrue(
            "READ_PHONE_STATE permission is required",
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.READ_PHONE_STATE,
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED,
        )

        assertTrue(
            "CALL_PHONE permission is required",
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.CALL_PHONE,
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED,
        )

        val configStore =
            GatewayOperationalConfigStore(SecureStorage(context))
        val queue = CallQueueRuntime(context)

        val originalConfig = configStore.read()
        val requestId = "queue-call-test-${UUID.randomUUID()}"

        try {
            configStore.save(
                originalConfig.copy(
                    version = originalConfig.version + 1L,
                    callsEnabled = true,
                ),
            )

            val afterSave = configStore.read()
            check(afterSave.callsEnabled) {
                "CALL_CONFIG_READBACK_FAILED: callsEnabled=${afterSave.callsEnabled}, version=${afterSave.version}"
            }

            val secondConfigStore =
                GatewayOperationalConfigStore(SecureStorage(context))
            val secondRead = secondConfigStore.read()
            check(secondRead.callsEnabled) {
                "CALL_CONFIG_SECOND_INSTANCE_FAILED: callsEnabled=${secondRead.callsEnabled}, version=${secondRead.version}"
            }

            println(
                "RIDEX_CALL_CONFIG_TEST: originalCallsEnabled=${originalConfig.callsEnabled} " +
                    "afterSave=${afterSave.callsEnabled} " +
                    "secondInstance=${secondRead.callsEnabled} " +
                    "version=${secondRead.version}"
            )

            val request = CallRequest(
                requestId = requestId,
                recipient = "9122160691",
                subscriptionId = 2,
                purposeCode = "DEVICE_QUEUE_CALL_TEST",
            )

            val queued = queue.enqueue(
                recipient = request.recipient,
                purposeCode = request.purposeCode,
                requestId = request.requestId,
            ).getOrThrow()

            assertTrue("Call request was not queued", queued)

            val processResult = queue.processNext()

            assertTrue(
                "Queue processing did not start the call: $processResult",
                processResult is CallProcessResult.Started,
            )

            val started = queue.readResult(requestId)
            assertNotNull("STARTING CallRecord was not created", started)
            assertEquals(CallStatus.STARTING, started!!.status)
            assertNotNull("startedAtEpochMs was not recorded", started.startedAtEpochMs)

            var seenConnected = started.status == CallStatus.CONNECTED
            var terminal: CallRecord? = null

            repeat(300) {
                Thread.sleep(100L)

                val latest = queue.readResult(requestId) ?: return@repeat

                if (latest.status == CallStatus.CONNECTED) {
                    seenConnected = true
                }

                if (latest.status == CallStatus.ENDED ||
                    latest.status == CallStatus.FAILED
                ) {
                    terminal = latest
                    return@repeat
                }
            }

            val finalRecord = queue.readResult(requestId)
            assertNotNull("Final CallRecord was not found", finalRecord)

            println(
                "RIDEX_QUEUE_CALL_LIFECYCLE: requestId=$requestId " +
                    "status=${finalRecord!!.status} " +
                    "seenConnected=$seenConnected " +
                    "startedAt=${finalRecord.startedAtEpochMs} " +
                    "endedAt=${finalRecord.endedAtEpochMs} " +
                    "failure=${finalRecord.failureCode}"
            )

            assertEquals(
                "Real queue-driven call did not end normally",
                CallStatus.ENDED,
                finalRecord.status,
            )

            assertNotNull(
                "endedAtEpochMs was not recorded",
                finalRecord.endedAtEpochMs,
            )

        } finally {
            queue.stopStateMonitoring()

            val current = configStore.read()
            if (current.callsEnabled) {
                configStore.save(
                    current.copy(
                        version = current.version + 1L,
                        callsEnabled = false,
                    ),
                )
            }
        }
    }
}

