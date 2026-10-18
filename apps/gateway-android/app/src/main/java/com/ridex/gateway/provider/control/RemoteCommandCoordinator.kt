package com.ridex.gateway.provider.control

import android.content.Context
import com.ridex.gateway.control.GatewayControlStore
import com.ridex.gateway.data.storage.SecureStorage
import com.ridex.gateway.provider.config.ProviderTrustConfig
import com.ridex.gateway.provider.session.ProviderSessionStore

/** End-to-end command admission pipeline: transport -> signature -> policy -> replay -> execute -> audit. */
class RemoteCommandCoordinator(
    context: Context,
    private val sessionStore: ProviderSessionStore = ProviderSessionStore(SecureStorage(context)),
    private val controlStore: GatewayControlStore = GatewayControlStore(SecureStorage(context)),
    private val client: ProviderCommandClient = HttpProviderCommandClient(),
    private val verifier: GatewayRemoteCommandVerifier = GatewayRemoteCommandVerifier(
        ProviderTrustConfig.pinnedEd25519CommandKeysBase64,
    ),
    private val policy: GatewayRemoteCommandPolicy = GatewayRemoteCommandPolicy,
    private val journal: RemoteCommandJournalStore = RemoteCommandJournalStore(SecureStorage(context)),
    private val audit: RemoteCommandAuditStore = RemoteCommandAuditStore(SecureStorage(context)),
    private val executor: RemoteCommandExecutor = RemoteCommandExecutor(context),
) {
    @Synchronized
    fun syncOnce(
        baseUrl: String,
        nowEpochMs: Long = System.currentTimeMillis(),
    ): RemoteCommandSyncResult {
        val session = sessionStore.read() ?: return RemoteCommandSyncResult.SKIPPED_NO_SESSION
        if (!session.isAccessTokenUsable(nowEpochMs)) return RemoteCommandSyncResult.SKIPPED_SESSION_EXPIRED
        // Do not execute remote commands when the local security audit cannot be
        // trusted; otherwise a command could mutate state without durable audit.
        runCatching { audit.ensureHealthy() }.getOrElse { return RemoteCommandSyncResult.PROVIDER_ERROR }

        return client.fetchNextCommand(baseUrl, session).fold(
            onSuccess = { command ->
                if (command == null) return@fold RemoteCommandSyncResult.NO_COMMAND
                val wasAlreadyAccepted = journal.containsCommand(command.commandId)
                val result = apply(command, nowEpochMs)
                val accepted = result == RemoteCommandSyncResult.APPLIED || result == RemoteCommandSyncResult.REVOKED || wasAlreadyAccepted
                val outcome = if (accepted) "ACKNOWLEDGED" else "FAILED"
                val failureCode = if (accepted) null else when (result) {
                    RemoteCommandSyncResult.REJECTED -> "COMMAND_REJECTED"
                    RemoteCommandSyncResult.REPLAY_REJECTED -> "COMMAND_REPLAY_REJECTED"
                    RemoteCommandSyncResult.EXECUTION_FAILED -> "COMMAND_EXECUTION_FAILED"
                    else -> "COMMAND_NOT_APPLIED"
                }
                client.acknowledgeCommand(baseUrl, session, command.commandId, command.deliveryAttempt, outcome, failureCode).fold(
                    onSuccess = { result },
                    onFailure = { error ->
                        audit.append(
                            RemoteCommandAuditEvent(
                                commandId = command.commandId,
                                sequence = command.commandSequence,
                                action = command.action,
                                risk = command.risk,
                                actorId = command.actorId,
                                approvalCount = command.approvals.size,
                                result = RemoteCommandAuditResult.PROVIDER_ERROR,
                                reason = error.message,
                                atEpochMs = nowEpochMs,
                                previousState = controlStore.read().state.name,
                                resultingState = controlStore.read().state.name,
                                configVersion = null,
                            ),
                        )
                        RemoteCommandSyncResult.PROVIDER_ERROR
                    },
                )
            },
            onFailure = { error ->
                audit.append(
                    RemoteCommandAuditEvent(
                        commandId = "TRANSPORT",
                        sequence = 0,
                        action = GatewayCommandAction.FORCE_DIAGNOSTIC,
                        risk = GatewayCommandRisk.LOW,
                        actorId = "PROVIDER",
                        approvalCount = 0,
                        result = RemoteCommandAuditResult.PROVIDER_ERROR,
                        reason = error.message,
                        atEpochMs = nowEpochMs,
                        previousState = null,
                        resultingState = null,
                        configVersion = null,
                    ),
                )
                RemoteCommandSyncResult.PROVIDER_ERROR
            },
        )
    }

    @Synchronized
    fun apply(
        command: GatewayRemoteCommand,
        nowEpochMs: Long = System.currentTimeMillis(),
    ): RemoteCommandSyncResult {
        val currentState = controlStore.read().state
        if (journal.containsCommand(command.commandId)) {
            audit.append(rejectedAudit(command, RemoteCommandAuditResult.REPLAY_REJECTED, "COMMAND_ID_REPLAY", currentState, nowEpochMs))
            return RemoteCommandSyncResult.REPLAY_REJECTED
        }

        verifier.verify(command, nowEpochMs).onFailure { error ->
            audit.append(rejectedAudit(command, RemoteCommandAuditResult.REJECTED, error.message, currentState, nowEpochMs))
        }.getOrElse { return RemoteCommandSyncResult.REJECTED }

        policy.validate(command, currentState, journal.lastAcceptedSequence(), nowEpochMs).onFailure { error ->
            val result = if (error.message == "COMMAND_SEQUENCE_REPLAY") RemoteCommandAuditResult.REPLAY_REJECTED else RemoteCommandAuditResult.REJECTED
            audit.append(rejectedAudit(command, result, error.message, currentState, nowEpochMs))
        }.getOrElse {
            val result = if (it.message == "COMMAND_SEQUENCE_REPLAY") RemoteCommandSyncResult.REPLAY_REJECTED else RemoteCommandSyncResult.REJECTED
            return result
        }

        return executor.execute(command, nowEpochMs).fold(
            onSuccess = { execution ->
                journal.accept(command.commandId, command.commandSequence)
                audit.append(
                    RemoteCommandAuditEvent(
                        commandId = command.commandId,
                        sequence = command.commandSequence,
                        action = command.action,
                        risk = command.risk,
                        actorId = command.actorId,
                        approvalCount = command.approvals.size,
                        result = RemoteCommandAuditResult.ACCEPTED,
                        reason = null,
                        atEpochMs = nowEpochMs,
                        previousState = execution.previousState?.name,
                        resultingState = execution.state.name,
                        configVersion = execution.configVersion,
                    ),
                )
                if (execution.state.name == "REVOKED") RemoteCommandSyncResult.REVOKED else RemoteCommandSyncResult.APPLIED
            },
            onFailure = { error ->
                audit.append(
                    RemoteCommandAuditEvent(
                        commandId = command.commandId,
                        sequence = command.commandSequence,
                        action = command.action,
                        risk = command.risk,
                        actorId = command.actorId,
                        approvalCount = command.approvals.size,
                        result = RemoteCommandAuditResult.EXECUTION_FAILED,
                        reason = error.message,
                        atEpochMs = nowEpochMs,
                        previousState = currentState.name,
                        resultingState = currentState.name,
                        configVersion = null,
                    ),
                )
                RemoteCommandSyncResult.EXECUTION_FAILED
            },
        )
    }

    private fun rejectedAudit(
        command: GatewayRemoteCommand,
        result: RemoteCommandAuditResult,
        reason: String?,
        currentState: com.ridex.gateway.control.GatewayControlState,
        nowEpochMs: Long,
    ) = RemoteCommandAuditEvent(
        commandId = command.commandId,
        sequence = command.commandSequence,
        action = command.action,
        risk = command.risk,
        actorId = command.actorId,
        approvalCount = command.approvals.size,
        result = result,
        reason = reason,
        atEpochMs = nowEpochMs,
        previousState = currentState.name,
        resultingState = currentState.name,
        configVersion = null,
    )


}

enum class RemoteCommandSyncResult {
    APPLIED,
    REVOKED,
    NO_COMMAND,
    REPLAY_REJECTED,
    REJECTED,
    EXECUTION_FAILED,
    PROVIDER_ERROR,
    SKIPPED_NO_SESSION,
    SKIPPED_SESSION_EXPIRED,
}
