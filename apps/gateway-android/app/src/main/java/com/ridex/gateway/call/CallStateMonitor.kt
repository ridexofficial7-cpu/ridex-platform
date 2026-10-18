package com.ridex.gateway.call

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import com.ridex.gateway.data.storage.SecureStorage

/**
 * Records carrier call-state transitions for the latest gateway call.
 * The dedicated gateway is expected to have no unrelated voice traffic.
 */
class CallStateMonitor(context: Context) {
    private val appContext = context.applicationContext
    private val store = CallResultStore(SecureStorage(appContext))
    private val telephony = appContext.getSystemService(TelephonyManager::class.java)
    private var callback: TelephonyCallback? = null

    fun start(requestId: String): Result<Unit> = runCatching {
        require(ContextCompat.checkSelfPermission(appContext, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED) {
            "READ_PHONE_STATE_REQUIRED"
        }
        val current = store.read(requestId) ?: error("CALL_RESULT_NOT_FOUND")
        val listener = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
            override fun onCallStateChanged(state: Int) {
                val latest = store.read(requestId) ?: return
                val mapped = when (state) {
                    TelephonyManager.CALL_STATE_RINGING -> CallStatus.RINGING
                    TelephonyManager.CALL_STATE_OFFHOOK -> CallStatus.CONNECTED
                    TelephonyManager.CALL_STATE_IDLE -> {
                        if (latest.status == CallStatus.CONNECTED || latest.status == CallStatus.RINGING || latest.status == CallStatus.STARTING) CallStatus.ENDED else latest.status
                    }
                    else -> latest.status
                }
                if (mapped != latest.status) {
                    store.save(latest.copy(
                        status = mapped,
                        endedAtEpochMs = if (mapped == CallStatus.ENDED) System.currentTimeMillis() else latest.endedAtEpochMs,
                    ))
                }
            }
        }
        callback = listener
        telephony?.registerTelephonyCallback(appContext.mainExecutor, listener)
            ?: error("TELEPHONY_SERVICE_UNAVAILABLE")
    }

    fun stop() {
        val cb = callback ?: return
        telephony?.unregisterTelephonyCallback(cb)
        callback = null
    }
}
