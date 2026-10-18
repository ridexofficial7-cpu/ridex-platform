package com.ridex.gateway.data.storage

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class SecureStorageRoundTripTest {

    @Test
    fun secureStorageWriteAndReadBack() {
        val context: Context =
            InstrumentationRegistry.getInstrumentation().targetContext

        val key = "diagnostic_roundtrip_${UUID.randomUUID()}"
        val expected = "RIDEX_STORAGE_TEST_${UUID.randomUUID()}"

        val storage = SecureStorage(context)
        storage.putString(key, expected)

        val rawPrefs =
            context.getSharedPreferences("ridex_gateway_secure", Context.MODE_PRIVATE)
        val raw = rawPrefs.getString(key, null)

        assertNotNull("SharedPreferences raw value was not written", raw)
        assertTrue("Encrypted value is unexpectedly blank", !raw.isNullOrBlank())

        val actual = storage.getString(key)

        println(
            "RIDEX_STORAGE_TEST: rawPresent=${raw != null} " +
                "rawLength=${raw?.length ?: 0} " +
                "readBack=${actual != null} " +
                "match=${actual == expected}"
        )

        assertNotNull("SecureStorage read returned null", actual)
        assertEquals(expected, actual)
    }
}
