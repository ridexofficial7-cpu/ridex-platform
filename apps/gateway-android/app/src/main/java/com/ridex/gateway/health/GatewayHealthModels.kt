package com.ridex.gateway.health

/** Deterministic overall health state for the gateway node. */
enum class GatewayHealthState {
    HEALTHY,
    DEGRADED,
    OFFLINE,
    BLOCKED,
    MAINTENANCE,
    SAFE_MODE,
}

enum class ThermalHealth {
    NORMAL,
    LIGHT,
    MODERATE,
    SEVERE,
    CRITICAL,
    SHUTDOWN,
    UNKNOWN,
}

data class GatewayHealthSnapshot(
    val evaluatedAtEpochMs: Long,
    val state: GatewayHealthState,
    val providerConnected: Boolean,
    val networkAvailable: Boolean,
    val networkValidated: Boolean,
    val serviceRunning: Boolean,
    val selectedSimReady: Boolean,
    val selectedSubscriptionId: Int?,
    val batteryPercent: Int?,
    val charging: Boolean?,
    val batteryTemperatureC: Double?,
    val storageFreePercent: Int?,
    val memoryAvailablePercent: Int?,
    val thermalHealth: ThermalHealth,
    val clockPlausible: Boolean,
    val encryptionEnabled: Boolean?,
    val selinuxEnforcing: Boolean?,
    val verifiedBootState: String?,
    val bootloaderUnlocked: Boolean?,
    val warnings: List<String>,
)

object GatewayHealthStateMachine {
    fun calculate(
        providerConnected: Boolean,
        networkAvailable: Boolean,
        networkValidated: Boolean,
        serviceRunning: Boolean,
        selectedSimReady: Boolean,
        thermalHealth: ThermalHealth,
        clockPlausible: Boolean,
        encryptionEnabled: Boolean?,
        selinuxEnforcing: Boolean?,
        bootloaderUnlocked: Boolean?,
        maintenance: Boolean = false,
        blocked: Boolean = false,
    ): Pair<GatewayHealthState, List<String>> {
        if (blocked) return GatewayHealthState.BLOCKED to listOf("GATEWAY_BLOCKED")
        if (maintenance) return GatewayHealthState.MAINTENANCE to listOf("MAINTENANCE_MODE")

        val warnings = mutableListOf<String>()

        if (!networkAvailable || !networkValidated) warnings += "NETWORK_NOT_VALIDATED"
        if (!providerConnected) warnings += "PROVIDER_NOT_CONNECTED"
        if (!serviceRunning) warnings += "SERVICE_NOT_RUNNING"
        if (!selectedSimReady) warnings += "SELECTED_SIM_NOT_READY"
        if (!clockPlausible) warnings += "CLOCK_NOT_PLAUSIBLE"
        if (encryptionEnabled == false) warnings += "ENCRYPTION_NOT_CONFIRMED"
        if (selinuxEnforcing == false) warnings += "SELINUX_NOT_ENFORCING"
        if (bootloaderUnlocked == true) warnings += "BOOTLOADER_UNLOCKED"

        when (thermalHealth) {
            ThermalHealth.SEVERE, ThermalHealth.CRITICAL, ThermalHealth.SHUTDOWN ->
                warnings += "THERMAL_RISK"
            ThermalHealth.MODERATE -> warnings += "THERMAL_MODERATE"
            else -> Unit
        }

        val offline = !networkAvailable || !networkValidated
        val critical = !serviceRunning || thermalHealth == ThermalHealth.SHUTDOWN || !clockPlausible
        val degraded = warnings.isNotEmpty()

        return when {
            offline && !providerConnected -> GatewayHealthState.OFFLINE to warnings
            critical -> GatewayHealthState.DEGRADED to warnings
            degraded -> GatewayHealthState.DEGRADED to warnings
            else -> GatewayHealthState.HEALTHY to emptyList()
        }
    }
}
