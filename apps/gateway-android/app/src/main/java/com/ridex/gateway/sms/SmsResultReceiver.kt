package com.ridex.gateway.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.SmsManager
import com.ridex.gateway.data.storage.SecureStorage

/** Receives Android telephony result callbacks and converts them to deterministic RideX result codes. */
class SmsResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val requestId = intent.getStringExtra(AndroidSmsSender.EXTRA_REQUEST_ID)
            ?.takeIf { it.isNotBlank() }
            ?: return
        val partIndex = intent.getIntExtra(AndroidSmsSender.EXTRA_PART_INDEX, -1)
        val totalParts = intent.getIntExtra(AndroidSmsSender.EXTRA_TOTAL_PARTS, 1)
        if (partIndex < 0 || totalParts < 1) return

        val store = SmsResultStore(SecureStorage(context.applicationContext))
        val failureCode = mapResultCode(resultCode)

        when (intent.action) {
            AndroidSmsSender.ACTION_SMS_SENT -> {
                SmsDispatchRegistry.onSentPart(
                    requestId = requestId,
                    partIndex = partIndex,
                    resultCode = resultCode,
                    failureCode = failureCode,
                    store = store,
                )
            }

            AndroidSmsSender.ACTION_SMS_DELIVERED -> {
                SmsDispatchRegistry.onDeliveredPart(
                    requestId = requestId,
                    partIndex = partIndex,
                    resultCode = resultCode,
                    store = store,
                )
            }
        }
    }

    private fun mapResultCode(code: Int): String? = when (code) {
        android.app.Activity.RESULT_OK -> null
        SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "GENERIC_FAILURE"
        SmsManager.RESULT_ERROR_RADIO_OFF -> "RADIO_OFF"
        SmsManager.RESULT_ERROR_NULL_PDU -> "NULL_PDU"
        SmsManager.RESULT_ERROR_NO_SERVICE -> "NO_SERVICE"
        SmsManager.RESULT_ERROR_LIMIT_EXCEEDED -> "LIMIT_EXCEEDED"
        SmsManager.RESULT_ERROR_FDN_CHECK_FAILURE -> "FDN_CHECK_FAILURE"
        else -> "SMS_PLATFORM_ERROR_$code"
    }
}
