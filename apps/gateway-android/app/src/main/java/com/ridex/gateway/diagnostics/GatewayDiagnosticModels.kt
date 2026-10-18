package com.ridex.gateway.diagnostics

import com.ridex.gateway.control.GatewayControlSnapshot
import com.ridex.gateway.health.GatewayHealthSnapshot
import com.ridex.gateway.provider.session.ProviderSessionState
import com.ridex.gateway.queue.QueueSummary
import com.ridex.gateway.runtime.GatewayRuntimeStatus
import com.ridex.gateway.security.ConfigDriftResult

/** Aggregated, non-secret diagnostic view. SMS bodies, tokens and credentials are never included. */
data class GatewayDiagnosticSnapshot(
    val diagnosticId: String,
    val capturedAtEpochMs: Long,
    val health: GatewayHealthSnapshot?,
    val runtime: GatewayRuntimeStatus,
    val control: GatewayControlSnapshot,
    val providerSessionState: ProviderSessionState,
    val queue: QueueSummary,
    val sims: List<SimDiagnosticInfo>,
    val signedConfigVersion: Long?,
    val signedConfigKeyId: String?,
    val signedConfigFingerprintPrefix: String?,
    val configDrift: ConfigDriftResult?,
    val appSignaturePrefix: String?,
    val recoveryLastAction: String,
    val watchdogRestartCount: Int,
    val recommendations: List<String>,
)

data class SimDiagnosticInfo(
    val logicalSlot: Int,
    val displayName: String,
    val carrierName: String,
    val subscriptionId: Int,
    val ready: Boolean,
)

fun GatewayDiagnosticSnapshot.toSafeSummary(): Map<String, Any?> = mapOf(
    "diagnosticId" to diagnosticId,
    "capturedAtEpochMs" to capturedAtEpochMs,
    "healthState" to health?.state?.name,
    "providerState" to runtime.providerState.name,
    "controlState" to control.state.name,
    "controlVersion" to control.version,
    "providerSessionState" to providerSessionState.name,
    "queueQueued" to queue.queued,
    "queueProcessing" to queue.processing,
    "queueRetryWait" to queue.retryWait,
    "queueSent" to queue.sent,
    "queueFailed" to queue.failed,
    "lastSmsQueueSyncAtEpochMs" to runtime.lastSmsQueueSyncAtEpochMs,
    "lastSmsQueueSyncResult" to runtime.lastSmsQueueSyncResult,
    "lastSmsQueueFetchedCount" to runtime.lastSmsQueueFetchedCount,
    "lastSmsQueueAddedCount" to runtime.lastSmsQueueAddedCount,
    "lastSmsQueueRequestId" to runtime.lastSmsQueueRequestId,
    "lastSmsQueueError" to runtime.lastSmsQueueError,
    "lastCallCycleAtEpochMs" to runtime.lastCallCycleAtEpochMs,
    "lastCallCycleResult" to runtime.lastCallCycleResult,
    "lastCallIngestedCount" to runtime.lastCallIngestedCount,
    "lastCallError" to runtime.lastCallError,
    "simCount" to sims.size,
    "selectedSimId" to health?.selectedSubscriptionId,
    "signedConfigVersion" to signedConfigVersion,
    "configDrift" to configDrift?.severity?.name,
    "recoveryLastAction" to recoveryLastAction,
    "watchdogRestartCount" to watchdogRestartCount,
    "recommendations" to recommendations,
)
