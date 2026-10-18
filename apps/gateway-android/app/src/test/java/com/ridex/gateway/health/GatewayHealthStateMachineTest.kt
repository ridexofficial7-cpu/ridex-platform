package com.ridex.gateway.health

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GatewayHealthStateMachineTest {
    @Test
    fun healthy_when_all_required_signals_are_good() {
        val (state, warnings) = GatewayHealthStateMachine.calculate(
            providerConnected = true,
            networkAvailable = true,
            networkValidated = true,
            serviceRunning = true,
            selectedSimReady = true,
            thermalHealth = ThermalHealth.NORMAL,
            clockPlausible = true,
            encryptionEnabled = true,
            selinuxEnforcing = true,
            bootloaderUnlocked = false,
        )

        assertEquals(GatewayHealthState.HEALTHY, state)
        assertTrue(warnings.isEmpty())
    }

    @Test
    fun offline_when_network_and_provider_are_unavailable() {
        val (state, warnings) = GatewayHealthStateMachine.calculate(
            providerConnected = false,
            networkAvailable = false,
            networkValidated = false,
            serviceRunning = true,
            selectedSimReady = true,
            thermalHealth = ThermalHealth.NORMAL,
            clockPlausible = true,
            encryptionEnabled = true,
            selinuxEnforcing = true,
            bootloaderUnlocked = false,
        )

        assertEquals(GatewayHealthState.OFFLINE, state)
        assertTrue(warnings.contains("NETWORK_NOT_VALIDATED"))
    }

    @Test
    fun degraded_when_bootloader_is_unlocked() {
        val (state, warnings) = GatewayHealthStateMachine.calculate(
            providerConnected = true,
            networkAvailable = true,
            networkValidated = true,
            serviceRunning = true,
            selectedSimReady = true,
            thermalHealth = ThermalHealth.NORMAL,
            clockPlausible = true,
            encryptionEnabled = true,
            selinuxEnforcing = true,
            bootloaderUnlocked = true,
        )

        assertEquals(GatewayHealthState.DEGRADED, state)
        assertTrue(warnings.contains("BOOTLOADER_UNLOCKED"))
    }

    @Test
    fun blocked_takes_priority() {
        val (state, warnings) = GatewayHealthStateMachine.calculate(
            providerConnected = true,
            networkAvailable = true,
            networkValidated = true,
            serviceRunning = true,
            selectedSimReady = true,
            thermalHealth = ThermalHealth.NORMAL,
            clockPlausible = true,
            encryptionEnabled = true,
            selinuxEnforcing = true,
            bootloaderUnlocked = false,
            blocked = true,
            maintenance = true,
        )

        assertEquals(GatewayHealthState.BLOCKED, state)
        assertEquals(listOf("GATEWAY_BLOCKED"), warnings)
    }
}
