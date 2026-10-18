package com.ridex.gateway.call

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.telecom.TelecomManager
import android.telephony.TelephonyManager
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.core.content.ContextCompat
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PhoneAccountSubscriptionMappingTest {

    @Test
    fun selectedSubscriptionHasCallCapablePhoneAccount() {
        val context: Context =
            InstrumentationRegistry.getInstrumentation().targetContext

        assertTrue(
            "READ_PHONE_STATE permission is required",
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.READ_PHONE_STATE,
            ) == PackageManager.PERMISSION_GRANTED,
        )

        val telecom = context.getSystemService(TelecomManager::class.java)
            ?: error("TELECOM_SERVICE_UNAVAILABLE")

        val telephony = context.getSystemService(TelephonyManager::class.java)
            ?: error("TELEPHONY_SERVICE_UNAVAILABLE")

        val requestedSubscriptionId = 2

        val matching = telecom.callCapablePhoneAccounts.filter { handle ->
            runCatching {
                telephony.getSubscriptionId(handle) == requestedSubscriptionId
            }.getOrDefault(false)
        }

        assertTrue(
            "No call-capable PhoneAccount mapped to subscriptionId=$requestedSubscriptionId",
            matching.isNotEmpty(),
        )

        println(
            "RIDEX_CALL_MAPPING_TEST: subscriptionId=$requestedSubscriptionId " +
                "matchedAccounts=${matching.size}",
        )

        matching.forEach { handle ->
            println(
                "RIDEX_CALL_MAPPING_TEST: component=${handle.componentName} id=${handle.id}"
            )
        }
    }
}
