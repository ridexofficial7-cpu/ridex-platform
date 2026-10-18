package com.ridex.gateway.provider.control

import android.content.Context
import com.ridex.gateway.control.GatewayControlSource
import com.ridex.gateway.control.GatewayControlState
import com.ridex.gateway.control.GatewayControlStore
import com.ridex.gateway.data.storage.SecureStorage
import com.ridex.gateway.diagnostics.GatewayDiagnosticEngine
import com.ridex.gateway.provider.session.ProviderSessionStore
import com.ridex.gateway.sim.SimManager
import com.ridex.gateway.call.CallQueueRuntime

/** Executes only commands that have already passed signature and policy checks. */
class RemoteCommandExecutor(
    context: Context,
    private val controlStore: GatewayControlStore = GatewayControlStore(SecureStorage(context)),
    private val configStore: GatewayOperationalConfigStore = GatewayOperationalConfigStore(SecureStorage(context)),
    private val sessionStore: ProviderSessionStore = ProviderSessionStore(SecureStorage(context)),
    private val diagnosticEngine: GatewayDiagnosticEngine = GatewayDiagnosticEngine(context),
    private val callQueueRuntime: CallQueueRuntime = CallQueueRuntime(context),
) {
    private val appContext = context.applicationContext

    fun execute(command: GatewayRemoteCommand, nowEpochMs: Long = System.currentTimeMillis()): Result<RemoteCommandExecutionResult> = runCatching {
        val previousState = controlStore.read().state
        val result = when (command.action) {
            GatewayCommandAction.FORCE_DIAGNOSTIC -> {
                diagnosticEngine.capture()
                RemoteCommandExecutionResult("DIAGNOSTIC_CAPTURED", controlStore.read().state, configStore.read().version)
            }

            GatewayCommandAction.SET_GATEWAY_MODE -> {
                val nextState = GatewayControlState.valueOf(command.payload.requireString("state"))
                val next = controlStore.setState(
                    state = nextState,
                    reason = command.payload.string("reason") ?: "REMOTE_COMMAND",
                    source = GatewayControlSource.REMOTE,
                    nowEpochMs = nowEpochMs,
                )
                RemoteCommandExecutionResult("GATEWAY_MODE_CHANGED", next.state, configStore.read().version)
            }

            GatewayCommandAction.SELECT_SIM -> {
                val subscriptionId = command.payload.requireInt("subscriptionId")
                val simManager = SimManager(appContext)
                val slots = simManager.getActiveSimSlots().getOrThrow()
                simManager.selectSubscription(subscriptionId, slots).getOrThrow()
                val current = configStore.read()
                val next = current.copy(
                    version = current.version + 1L,
                    selectedSubscriptionId = subscriptionId,
                )
                configStore.save(next)
                RemoteCommandExecutionResult("SIM_SELECTED", controlStore.read().state, next.version)
            }

            GatewayCommandAction.UPDATE_CONFIG -> {
                val current = configStore.read()
                val next = current.copy(
                    version = current.version + 1L,
                    heartbeatSeconds = command.payload.int("heartbeatSeconds") ?: current.heartbeatSeconds,
                    queuePollSeconds = command.payload.int("queuePollSeconds") ?: current.queuePollSeconds,
                    localSmsDailyLimit = command.payload.int("localSmsDailyLimit") ?: current.localSmsDailyLimit,
                    smsEnabled = command.payload.boolean("smsEnabled") ?: current.smsEnabled,
                    callsEnabled = command.payload.boolean("callsEnabled") ?: current.callsEnabled,
                )
                configStore.save(next)
                RemoteCommandExecutionResult("CONFIG_UPDATED", controlStore.read().state, next.version)
            }

            GatewayCommandAction.STOP_SMS,
            GatewayCommandAction.RESUME_SMS,
            GatewayCommandAction.STOP_CALLS,
            GatewayCommandAction.RESUME_CALLS -> {
                val current = configStore.read()
                val next = when (command.action) {
                    GatewayCommandAction.STOP_SMS -> current.copy(version = current.version + 1L, smsEnabled = false)
                    GatewayCommandAction.RESUME_SMS -> current.copy(version = current.version + 1L, smsEnabled = true)
                    GatewayCommandAction.STOP_CALLS -> current.copy(version = current.version + 1L, callsEnabled = false)
                    GatewayCommandAction.RESUME_CALLS -> current.copy(version = current.version + 1L, callsEnabled = true)
                    else -> current
                }
                configStore.save(next)
                RemoteCommandExecutionResult("CHANNEL_CONFIGURATION_UPDATED", controlStore.read().state, next.version)
            }

            GatewayCommandAction.PLACE_CALL -> {
                val requestId = command.payload.requireString("requestId")
                val recipient = command.payload.requireString("recipient")
                val purposeCode = command.payload.requireString("purposeCode")
                val subscriptionId = command.payload.int("subscriptionId")
                val accepted = callQueueRuntime.enqueueFromProvider(recipient, purposeCode, requestId, subscriptionId).getOrThrow()
                require(accepted) { "CALL_REQUEST_DUPLICATE" }
                RemoteCommandExecutionResult("CALL_QUEUED", controlStore.read().state, configStore.read().version)
            }

            GatewayCommandAction.REVOKE_GATEWAY -> {
                val next = controlStore.forceRevoke(
                    reason = command.payload.string("reason") ?: "REMOTE_REVOKE",
                    nowEpochMs = nowEpochMs,
                )
                sessionStore.clear()
                RemoteCommandExecutionResult("GATEWAY_REVOKED", next.state, configStore.read().version)
            }
        }

        result.copy(previousState = previousState)
    }

    private fun Map<String, Any?>.requireString(key: String): String = string(key) ?: error("${key.uppercase()}_REQUIRED")

    private fun Map<String, Any?>.string(key: String): String? = this[key]?.toString()?.trim()?.takeIf { it.isNotBlank() }
    private fun Map<String, Any?>.int(key: String): Int? = when (val value = this[key]) {
        is Number -> value.toInt()
        is String -> value.toIntOrNull()
        else -> null
    }
    private fun Map<String, Any?>.requireInt(key: String): Int = int(key) ?: error("${key.uppercase()}_REQUIRED")
    private fun Map<String, Any?>.boolean(key: String): Boolean? = this[key] as? Boolean
}

data class RemoteCommandExecutionResult(
    val status: String,
    val state: GatewayControlState,
    val configVersion: Long,
    val previousState: GatewayControlState? = null,
)
