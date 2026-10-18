package com.ridex.gateway.security

/** Pure anti-rollback policy used before accepting provider-signed configuration. */
object GatewayConfigPolicy {
    fun canApply(
        currentVersion: Long?,
        incomingVersion: Long,
        currentFingerprint: String?,
        incomingFingerprint: String,
    ): Boolean {
        if (incomingVersion <= 0L) return false
        if (currentVersion == null) return true
        if (incomingVersion > currentVersion) return true
        return incomingVersion == currentVersion && currentFingerprint == incomingFingerprint
    }
}
