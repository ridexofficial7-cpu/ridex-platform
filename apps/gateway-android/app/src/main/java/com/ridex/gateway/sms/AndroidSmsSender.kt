package com.ridex.gateway.sms

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.telephony.SmsManager
import com.ridex.gateway.data.storage.SecureStorage

/**
 * Real SIM SMS transport for the selected subscription.
 * No root, Zygisk, LSPosed, or Riru dependency.
 */
class AndroidSmsSender(
    context: Context,
) : SmsSender {
    private val appContext = context.applicationContext
    private val resultStore = SmsResultStore(SecureStorage(appContext))

    override fun send(request: SmsSendRequest): Result<Unit> = runCatching {
        require(request.requestId.isNotBlank()) { "REQUEST_ID_REQUIRED" }
        require(request.recipient.isNotBlank()) { "RECIPIENT_REQUIRED" }
        require(request.message.isNotBlank()) { "MESSAGE_REQUIRED" }
        require(request.subscriptionId > 0) { "SUBSCRIPTION_ID_REQUIRED" }

        val supportsSmsMessaging =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                appContext.packageManager.hasSystemFeature(
                    PackageManager.FEATURE_TELEPHONY_MESSAGING,
                )
            } else {
                appContext.packageManager.hasSystemFeature(
                    PackageManager.FEATURE_TELEPHONY,
                )
            }

        require(supportsSmsMessaging) {
            "TELEPHONY_MESSAGING_UNAVAILABLE"
        }

        require(
            appContext.checkSelfPermission(Manifest.permission.SEND_SMS) ==
                PackageManager.PERMISSION_GRANTED,
        ) { "SEND_SMS_PERMISSION_REQUIRED" }

        val smsManager = appContext.getSystemService(SmsManager::class.java)
            .createForSubscriptionId(request.subscriptionId)

        val parts = smsManager.divideMessage(request.message)
        require(parts.isNotEmpty()) { "SMS_MESSAGE_EMPTY" }

        SmsDispatchRegistry.register(request.requestId, parts.size)
        resultStore.save(
            SmsResultRecord(
                requestId = request.requestId,
                status = SmsResultStatus.SUBMITTED,
                timestampEpochMs = System.currentTimeMillis(),
                totalParts = parts.size,
                completedParts = 0,
            ),
        )

        if (parts.size == 1) {
            val sentIntent = createResultPendingIntent(
                action = ACTION_SMS_SENT,
                requestId = request.requestId,
                partIndex = 0,
                totalParts = 1,
            )
            val deliveryIntent = createResultPendingIntent(
                action = ACTION_SMS_DELIVERED,
                requestId = request.requestId,
                partIndex = 0,
                totalParts = 1,
            )

            smsManager.sendTextMessage(
                request.recipient,
                null,
                request.message,
                sentIntent,
                deliveryIntent,
            )
        } else {
            val sentIntents = ArrayList<PendingIntent>(parts.size)
            val deliveryIntents = ArrayList<PendingIntent>(parts.size)

            parts.forEachIndexed { index, _ ->
                sentIntents += createResultPendingIntent(
                    action = ACTION_SMS_SENT,
                    requestId = request.requestId,
                    partIndex = index,
                    totalParts = parts.size,
                )
                deliveryIntents += createResultPendingIntent(
                    action = ACTION_SMS_DELIVERED,
                    requestId = request.requestId,
                    partIndex = index,
                    totalParts = parts.size,
                )
            }

            smsManager.sendMultipartTextMessage(
                request.recipient,
                null,
                ArrayList(parts),
                sentIntents,
                deliveryIntents,
            )
        }
    }.onFailure {
        SmsDispatchRegistry.remove(request.requestId)
        resultStore.save(
            SmsResultRecord(
                requestId = request.requestId,
                status = SmsResultStatus.FAILED,
                stage = SmsResultStage.SENT,
                timestampEpochMs = System.currentTimeMillis(),
                totalParts = 0,
                completedParts = 0,
                failureCode = classifyImmediateFailure(it),
            ),
        )
    }.map { Unit }

    private fun createResultPendingIntent(
        action: String,
        requestId: String,
        partIndex: Int,
        totalParts: Int,
    ): PendingIntent {
        val intent = Intent(appContext, SmsResultReceiver::class.java).apply {
            this.action = action
            data = Uri.parse("ridex://sms/$requestId/$partIndex/$totalParts")
            putExtra(EXTRA_REQUEST_ID, requestId)
            putExtra(EXTRA_PART_INDEX, partIndex)
            putExtra(EXTRA_TOTAL_PARTS, totalParts)
        }

        val requestCode = 1_000_000 +
            (requestId.hashCode() and 0x0007FFFF) * 32 + partIndex

        return PendingIntent.getBroadcast(
            appContext,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun classifyImmediateFailure(error: Throwable): String = when (error) {
        is SecurityException -> "SEND_SMS_PERMISSION_DENIED"
        is IllegalArgumentException -> "SMS_INVALID_ARGUMENT"
        is UnsupportedOperationException -> "TELEPHONY_MESSAGING_UNAVAILABLE"
        else -> "SMS_SUBMISSION_EXCEPTION"
    }

    companion object {
        const val ACTION_SMS_SENT = "com.ridex.gateway.action.SMS_SENT"
        const val ACTION_SMS_DELIVERED = "com.ridex.gateway.action.SMS_DELIVERED"
        const val EXTRA_REQUEST_ID = "requestId"
        const val EXTRA_PART_INDEX = "partIndex"
        const val EXTRA_TOTAL_PARTS = "totalParts"
    }
}