package com.ridex.gateway.boot

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import com.ridex.gateway.gateway.GatewayForegroundService

/**
 * Starts the dedicated gateway after Android has completed boot or the app has been replaced.
 * LOCKED_BOOT_COMPLETED is intentionally not used because gateway credentials live in
 * credential-protected storage and should only be accessed after the user has unlocked once.
 */
class GatewayBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                GatewayForegroundService.startFromBackground(context)
            }
        }
    }
}
