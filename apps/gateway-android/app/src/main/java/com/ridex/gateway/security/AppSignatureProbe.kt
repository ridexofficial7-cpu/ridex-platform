package com.ridex.gateway.security

import android.content.Context
import android.content.pm.PackageManager
import java.security.MessageDigest

/** Calculates the active APK signing certificate fingerprint for tamper/drift detection. */
class AppSignatureProbe(private val context: Context) {
    fun sha256Hex(): String? = runCatching {
        val packageManager = context.packageManager
        val packageInfo = packageManager.getPackageInfo(
            context.packageName,
            PackageManager.GET_SIGNING_CERTIFICATES,
        )
        val signature = packageInfo.signingInfo?.apkContentsSigners?.firstOrNull()
            ?: return null
        MessageDigest.getInstance("SHA-256")
            .digest(signature.toByteArray())
            .joinToString("") { "%02x".format(it) }
    }.getOrNull()
}
