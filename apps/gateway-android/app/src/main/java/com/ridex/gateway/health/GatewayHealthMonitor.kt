package com.ridex.gateway.health

import android.content.Context
import com.ridex.gateway.network.NetworkStateStore
import com.ridex.gateway.provider.session.ProviderSessionStore
import com.ridex.gateway.runtime.GatewayRuntimeStatusStore
import com.ridex.gateway.sim.SimManager
import com.ridex.gateway.data.storage.SecureStorage
import com.ridex.gateway.control.GatewayControlState
import com.ridex.gateway.control.GatewayControlStore
import com.ridex.gateway.security.GatewaySecurityPolicy

/** Deterministic health evaluator used by the foreground service and UI. */
class GatewayHealthMonitor(context: Context) {
    private val appContext = context.applicationContext
    private val healthStore = GatewayHealthStore(appContext)
    private val runtimeStore = GatewayRuntimeStatusStore(appContext)
    private val networkStore = NetworkStateStore(appContext)
    private val providerSessionStore = ProviderSessionStore(SecureStorage(appContext))
    private val simManager = SimManager(appContext)
    private val probe = SystemHealthProbe(appContext)
    private val controlStore = GatewayControlStore(SecureStorage(appContext))

    fun refresh(): GatewayHealthSnapshot {
        val runtime = runtimeStore.read()
        val network = networkStore.read()
        val selectedSubscriptionId = simManager.getSelectedSubscriptionId()
        val simSlots = simManager.getActiveSimSlots().getOrElse { emptyList() }
        val selectedSimReady = selectedSubscriptionId != null &&
            simSlots.any { it.subscriptionId == selectedSubscriptionId && it.isReady }
        val providerConnected = runtime.providerState.name == "CONNECTED" &&
            (providerSessionStore.read()?.isAccessTokenUsable() == true)

        val thermal = probe.readThermalHealth()
        val encryption = probe.readEncryptionEnabled()
        val selinux = probe.readSelinuxEnforcing()
        val verifiedBoot = probe.readVerifiedBootState()
        val bootloaderUnlocked = probe.readBootloaderUnlocked()
        val control = controlStore.read()
        val provisional = GatewayHealthSnapshot(
            evaluatedAtEpochMs = System.currentTimeMillis(),
            state = GatewayHealthState.DEGRADED,
            providerConnected = providerConnected,
            networkAvailable = network.available,
            networkValidated = network.validatedInternet,
            serviceRunning = runtime.serviceRunning,
            selectedSimReady = selectedSimReady,
            selectedSubscriptionId = selectedSubscriptionId,
            batteryPercent = probe.readBatteryPercent(),
            charging = probe.readCharging(),
            batteryTemperatureC = probe.readBatteryTemperatureC(),
            storageFreePercent = probe.readStorageFreePercent(),
            memoryAvailablePercent = probe.readMemoryAvailablePercent(),
            thermalHealth = thermal,
            clockPlausible = probe.readClockPlausible(),
            encryptionEnabled = encryption,
            selinuxEnforcing = selinux,
            verifiedBootState = verifiedBoot,
            bootloaderUnlocked = bootloaderUnlocked,
            warnings = emptyList(),
        )
        val securityDecision = GatewaySecurityPolicy.evaluate(provisional)
        val (baseState, baseWarnings) = GatewayHealthStateMachine.calculate(
            providerConnected = providerConnected,
            networkAvailable = network.available,
            networkValidated = network.validatedInternet,
            serviceRunning = runtime.serviceRunning,
            selectedSimReady = selectedSimReady,
            thermalHealth = thermal,
            clockPlausible = provisional.clockPlausible,
            encryptionEnabled = encryption,
            selinuxEnforcing = selinux,
            bootloaderUnlocked = bootloaderUnlocked,
            maintenance = control.state == GatewayControlState.MAINTENANCE,
            blocked = control.state == GatewayControlState.REVOKED,
        )
        val state = when {
            control.state == GatewayControlState.SAFE_MODE -> GatewayHealthState.SAFE_MODE
            securityDecision.communicationAllowed.not() -> GatewayHealthState.SAFE_MODE
            else -> baseState
        }
        val warnings = (baseWarnings + securityDecision.blockingReasons + securityDecision.warnings +
            if (control.state == GatewayControlState.SAFE_MODE) listOf("SAFE_MODE") else emptyList()).distinct()

        return GatewayHealthSnapshot(
            evaluatedAtEpochMs = System.currentTimeMillis(),
            state = state,
            providerConnected = providerConnected,
            networkAvailable = network.available,
            networkValidated = network.validatedInternet,
            serviceRunning = runtime.serviceRunning,
            selectedSimReady = selectedSimReady,
            selectedSubscriptionId = selectedSubscriptionId,
            batteryPercent = probe.readBatteryPercent(),
            charging = probe.readCharging(),
            batteryTemperatureC = probe.readBatteryTemperatureC(),
            storageFreePercent = probe.readStorageFreePercent(),
            memoryAvailablePercent = probe.readMemoryAvailablePercent(),
            thermalHealth = thermal,
            clockPlausible = probe.readClockPlausible(),
            encryptionEnabled = encryption,
            selinuxEnforcing = selinux,
            verifiedBootState = verifiedBoot,
            bootloaderUnlocked = bootloaderUnlocked,
            warnings = warnings,
        ).also(healthStore::write)
    }

    fun read(): GatewayHealthSnapshot? = healthStore.read()

}
