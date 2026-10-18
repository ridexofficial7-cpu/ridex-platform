package com.ridex.gateway.call

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.telecom.TelecomManager
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import com.ridex.gateway.data.storage.SecureStorage

/**
 * Places a real carrier call through Android Telecom for the selected subscription.
 * No root, Zygisk, LSPosed, Riru, or accessibility automation is used.
 */
class AndroidCallSender(context: Context) : CallSender {
    private val appContext = context.applicationContext
    private val resultStore = CallResultStore(SecureStorage(appContext))

    override fun place(request: CallRequest): Result<Unit> = runCatching {
        require(request.requestId.isNotBlank()) { "REQUEST_ID_REQUIRED" }
        require(request.recipient.isNotBlank()) { "RECIPIENT_REQUIRED" }
        require(request.subscriptionId > 0) { "SUBSCRIPTION_ID_REQUIRED" }
        require(ContextCompat.checkSelfPermission(appContext, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED) {
            "CALL_PHONE_PERMISSION_REQUIRED"
        }

        val telecom = appContext.getSystemService(TelecomManager::class.java)
            ?: error("TELECOM_SERVICE_UNAVAILABLE")
        val telephony = appContext.getSystemService(TelephonyManager::class.java)
            ?: error("TELEPHONY_SERVICE_UNAVAILABLE")

        val phoneAccount = telecom.callCapablePhoneAccounts.firstOrNull { handle ->
            runCatching {
                telephony.getSubscriptionId(handle) == request.subscriptionId
            }.getOrDefault(false)
        } ?: error("PHONE_ACCOUNT_FOR_SUBSCRIPTION_NOT_FOUND")

        val startedAt = System.currentTimeMillis()
        resultStore.save(CallRecord(
            requestId = request.requestId,
            recipient = request.recipient,
            subscriptionId = request.subscriptionId,
            purposeCode = request.purposeCode,
            status = CallStatus.STARTING,
            createdAtEpochMs = request.createdAtEpochMs,
            startedAtEpochMs = startedAt,
        ))

        val extras = Bundle().apply {
            putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, phoneAccount)
        }
        telecom.placeCall(Uri.fromParts("tel", request.recipient, null), extras)
    }.onFailure { error ->
        resultStore.save(CallRecord(
            requestId = request.requestId,
            recipient = request.recipient,
            subscriptionId = request.subscriptionId,
            purposeCode = request.purposeCode,
            status = CallStatus.FAILED,
            createdAtEpochMs = request.createdAtEpochMs,
            failureCode = classify(error),
        ))
    }.map { Unit }

    private fun classify(error: Throwable): String = when (error) {
        is SecurityException -> "CALL_PHONE_PERMISSION_DENIED"
        else -> error.message?.takeIf { it.isNotBlank() } ?: "CALL_SUBMISSION_EXCEPTION"
    }
}


