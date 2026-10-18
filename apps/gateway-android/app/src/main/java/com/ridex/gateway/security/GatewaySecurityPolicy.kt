package com.ridex.gateway.security

import com.ridex.gateway.health.GatewayHealthSnapshot

/** Deterministic security hardening policy. It never mutates root/module/device settings. */
object GatewaySecurityPolicy {
    fun evaluate(snapshot: GatewayHealthSnapshot): SecurityPostureDecision {
        val blockingReasons = mutableListOf<String>()

        if (snapshot.encryptionEnabled != true) {
            blockingReasons += "ENCRYPTION_NOT_CONFIRMED"
        }
        if (snapshot.selinuxEnforcing != true) {
            blockingReasons += "SELINUX_NOT_ENFORCING"
        }
        if (snapshot.clockPlausible.not()) {
            blockingReasons += "CLOCK_NOT_PLAUSIBLE"
        }

        val warnings = mutableListOf<String>()
        if (snapshot.bootloaderUnlocked == true) {
            warnings += "BOOTLOADER_UNLOCKED"
        }
        if (snapshot.verifiedBootState.equals("orange", ignoreCase = true)) {
            warnings += "VERIFIED_BOOT_ORANGE"
        }

        return SecurityPostureDecision(
            communicationAllowed = blockingReasons.isEmpty(),
            blockingReasons = blockingReasons,
            warnings = warnings,
        )
    }
}

data class SecurityPostureDecision(
    val communicationAllowed: Boolean,
    val blockingReasons: List<String>,
    val warnings: List<String>,
)
