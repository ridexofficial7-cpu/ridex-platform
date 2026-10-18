package com.ridex.gateway.security

import com.ridex.gateway.health.GatewayHealthSnapshot

/** Provider-signed security expectations. Missing optional values are not guessed. */
data class GatewaySecurityBaseline(
    val requireEncryption: Boolean = true,
    val requireSelinuxEnforcing: Boolean = true,
    val allowBootloaderUnlocked: Boolean = true,
    val expectedVerifiedBootState: String? = null,
    val expectedAppSignatureSha256: String? = null,
) {
    companion object {
        fun fromPayload(payload: Map<String, Any?>): GatewaySecurityBaseline {
            val baseline = payload["securityBaseline"] as? Map<*, *> ?: emptyMap<Any?, Any?>()
            return GatewaySecurityBaseline(
                requireEncryption = baseline.boolean("requireEncryption", true),
                requireSelinuxEnforcing = baseline.boolean("requireSelinuxEnforcing", true),
                allowBootloaderUnlocked = baseline.boolean("allowBootloaderUnlocked", true),
                expectedVerifiedBootState = baseline.string("expectedVerifiedBootState"),
                expectedAppSignatureSha256 = baseline.string("expectedAppSignatureSha256"),
            )
        }

        private fun Map<*, *>.boolean(key: String, default: Boolean): Boolean =
            (this[key] as? Boolean) ?: default

        private fun Map<*, *>.string(key: String): String? =
            (this[key] as? String)?.takeIf { it.isNotBlank() }
    }
}

enum class DriftSeverity {
    CLEAR,
    WARNING,
    BLOCK,
}

data class ConfigDriftResult(
    val severity: DriftSeverity,
    val reasons: List<String>,
)

object ConfigDriftDetector {
    fun evaluate(
        baseline: GatewaySecurityBaseline,
        health: GatewayHealthSnapshot,
        appSignatureSha256: String?,
    ): ConfigDriftResult {
        val blocking = mutableListOf<String>()
        val warnings = mutableListOf<String>()

        if (baseline.requireEncryption && health.encryptionEnabled != true) {
            blocking += "ENCRYPTION_REQUIREMENT_FAILED"
        }
        if (baseline.requireSelinuxEnforcing && health.selinuxEnforcing != true) {
            blocking += "SELINUX_REQUIREMENT_FAILED"
        }
        if (!baseline.allowBootloaderUnlocked && health.bootloaderUnlocked == true) {
            blocking += "BOOTLOADER_UNLOCKED_NOT_ALLOWED"
        } else if (health.bootloaderUnlocked == true) {
            warnings += "BOOTLOADER_UNLOCKED"
        }

        baseline.expectedVerifiedBootState?.let { expected ->
            if (!health.verifiedBootState.equals(expected, ignoreCase = true)) {
                warnings += "VERIFIED_BOOT_STATE_DRIFT"
            }
        }

        baseline.expectedAppSignatureSha256?.let { expected ->
            when {
                appSignatureSha256 == null -> blocking += "APP_SIGNATURE_UNAVAILABLE"
                !appSignatureSha256.equals(expected, ignoreCase = true) -> blocking += "APP_SIGNATURE_DRIFT"
            }
        }

        return when {
            blocking.isNotEmpty() -> ConfigDriftResult(DriftSeverity.BLOCK, blocking + warnings)
            warnings.isNotEmpty() -> ConfigDriftResult(DriftSeverity.WARNING, warnings)
            else -> ConfigDriftResult(DriftSeverity.CLEAR, emptyList())
        }
    }
}
