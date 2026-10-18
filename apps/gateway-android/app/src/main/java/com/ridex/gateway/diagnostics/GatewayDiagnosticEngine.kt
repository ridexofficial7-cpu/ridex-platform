package com.ridex.gateway.diagnostics

import android.content.Context
import com.ridex.gateway.control.GatewayControlStore
import com.ridex.gateway.data.storage.SecureStorage
import com.ridex.gateway.health.GatewayHealthMonitor
import com.ridex.gateway.provider.config.GatewaySignedConfigStore
import com.ridex.gateway.provider.session.ProviderSessionStore
import com.ridex.gateway.queue.GatewayQueueStore
import com.ridex.gateway.recovery.GatewayRecoveryStore
import com.ridex.gateway.runtime.GatewayRuntimeStatusStore
import com.ridex.gateway.security.AppSignatureProbe
import com.ridex.gateway.security.ConfigDriftDetector
import com.ridex.gateway.security.GatewaySecurityBaseline
import com.ridex.gateway.sim.SimManager
import java.util.UUID

/** Builds a deterministic safe diagnostic snapshot from already-existing gateway components. */
class GatewayDiagnosticEngine(context: Context) {
    private val appContext = context.applicationContext
    private val secureStorage = SecureStorage(appContext)
    private val store = GatewayDiagnosticStore(secureStorage)
    private val healthMonitor = GatewayHealthMonitor(appContext)
    private val runtimeStore = GatewayRuntimeStatusStore(appContext)
    private val controlStore = GatewayControlStore(secureStorage)
    private val providerSessionStore = ProviderSessionStore(secureStorage)
    private val queueStore = GatewayQueueStore(appContext)
    private val recoveryStore = GatewayRecoveryStore(appContext)
    private val signedConfigStore = GatewaySignedConfigStore(secureStorage)
    private val appSignatureProbe = AppSignatureProbe(appContext)
    private val simManager = SimManager(appContext)

    fun capture(): GatewayDiagnosticSnapshot {
        val health = healthMonitor.refresh()
        val runtime = runtimeStore.read()
        val control = controlStore.read()
        val sessionState = providerSessionStore.state()
        val queue = queueStore.summary()
        val recovery = recoveryStore.read()
        val signedConfig = signedConfigStore.readCurrent()
        val appSignature = appSignatureProbe.sha256Hex()
        val drift = ConfigDriftDetector.evaluate(
            baseline = GatewaySecurityBaseline(),
            health = health,
            appSignatureSha256 = appSignature,
        )
        val sims = simManager.getActiveSimSlots().getOrElse { emptyList() }
        val diagnosticSims = sims.map {
            SimDiagnosticInfo(
                logicalSlot = it.logicalSlot,
                displayName = it.displayName,
                carrierName = it.carrierName,
                subscriptionId = it.subscriptionId,
                ready = it.isReady,
            )
        }
        val recommendations = buildRecommendations(
            health = health,
            controlState = control.state.name,
            driftSeverity = drift.severity.name,
            sessionState = sessionState.name,
            queue = queue,
        )
        return GatewayDiagnosticSnapshot(
            diagnosticId = UUID.randomUUID().toString(),
            capturedAtEpochMs = System.currentTimeMillis(),
            health = health,
            runtime = runtime,
            control = control,
            providerSessionState = sessionState,
            queue = queue,
            sims = diagnosticSims,
            signedConfigVersion = signedConfig?.configVersion,
            signedConfigKeyId = signedConfig?.keyId,
            signedConfigFingerprintPrefix = signedConfig?.fingerprintSha256?.take(12)?.uppercase(),
            configDrift = drift,
            appSignaturePrefix = appSignature?.take(12)?.uppercase(),
            recoveryLastAction = recovery.lastRecoveryAction,
            watchdogRestartCount = recovery.watchdogRestartCount,
            recommendations = recommendations,
        ).also(store::save)
    }

    fun readCurrent(): GatewayDiagnosticSnapshot? = store.readCurrent()
    fun readHistory(): List<GatewayDiagnosticSnapshot> = store.readHistory()

    private fun buildRecommendations(
        health: com.ridex.gateway.health.GatewayHealthSnapshot,
        controlState: String,
        driftSeverity: String,
        sessionState: String,
        queue: com.ridex.gateway.queue.QueueSummary,
    ): List<String> = buildList {
        if (controlState != "NORMAL") add("GATEWAY_CONTROL_${controlState}")
        if (driftSeverity == "BLOCK") add("SECURITY_DRIFT_REQUIRES_ADMIN")
        else if (driftSeverity == "WARNING") add("REVIEW_SECURITY_WARNINGS")
        if (!health.networkValidated) add("WAIT_FOR_VALIDATED_NETWORK")
        if (sessionState != "AUTHENTICATED") add("PROVIDER_SESSION_${sessionState}")
        if (!health.selectedSimReady) add("SELECT_OR_READY_THE_COMMUNICATION_SIM")
        if (queue.retryWait > 0 || queue.failed > 0) add("REVIEW_SMS_RETRY_OR_FAILURE_QUEUE")
        if (health.thermalHealth.name in setOf("SEVERE", "CRITICAL", "SHUTDOWN")) add("THERMAL_RISK_REQUIRES_ATTENTION")
        if (health.batteryPercent != null && health.batteryPercent < 20) add("CONNECT_CHARGER")
        if (isEmpty()) add("NO_IMMEDIATE_ACTION")
    }
}
