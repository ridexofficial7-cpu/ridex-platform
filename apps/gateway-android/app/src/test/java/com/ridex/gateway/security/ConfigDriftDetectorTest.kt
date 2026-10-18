package com.ridex.gateway.security

import com.ridex.gateway.health.GatewayHealthSnapshot
import com.ridex.gateway.health.GatewayHealthState
import com.ridex.gateway.health.ThermalHealth
import org.junit.Assert.assertEquals
import org.junit.Test

class ConfigDriftDetectorTest {
    private fun snapshot(
        encryption: Boolean?,
        selinux: Boolean?,
        bootloaderUnlocked: Boolean?,
        verifiedBoot: String?,
    ) = GatewayHealthSnapshot(
        evaluatedAtEpochMs = 1L,
        state = GatewayHealthState.HEALTHY,
        providerConnected = true,
        networkAvailable = true,
        networkValidated = true,
        serviceRunning = true,
        selectedSimReady = true,
        selectedSubscriptionId = 1,
        batteryPercent = 80,
        charging = true,
        batteryTemperatureC = 30.0,
        storageFreePercent = 80,
        memoryAvailablePercent = 60,
        thermalHealth = ThermalHealth.NORMAL,
        clockPlausible = true,
        encryptionEnabled = encryption,
        selinuxEnforcing = selinux,
        verifiedBootState = verifiedBoot,
        bootloaderUnlocked = bootloaderUnlocked,
        warnings = emptyList(),
    )

    @Test
    fun encryptionOrSelinuxFailureBlocks() {
        val result = ConfigDriftDetector.evaluate(
            GatewaySecurityBaseline(),
            snapshot(false, true, true, "orange"),
            null,
        )
        assertEquals(DriftSeverity.BLOCK, result.severity)
    }

    @Test
    fun unlockedBootloaderIsWarningUnderTestBaseline() {
        val result = ConfigDriftDetector.evaluate(
            GatewaySecurityBaseline(allowBootloaderUnlocked = true),
            snapshot(true, true, true, "orange"),
            null,
        )
        assertEquals(DriftSeverity.WARNING, result.severity)
    }
}
