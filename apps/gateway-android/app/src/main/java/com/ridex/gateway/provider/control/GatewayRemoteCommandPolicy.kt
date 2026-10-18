package com.ridex.gateway.provider.control

import com.ridex.gateway.control.GatewayControlState

/** Deterministic device-side authorization and safety policy for Provider commands. */
object GatewayRemoteCommandPolicy {
    fun riskFor(action: GatewayCommandAction): GatewayCommandRisk = when (action) {
        GatewayCommandAction.FORCE_DIAGNOSTIC -> GatewayCommandRisk.LOW
        GatewayCommandAction.SELECT_SIM,
        GatewayCommandAction.SET_GATEWAY_MODE -> GatewayCommandRisk.MEDIUM
        GatewayCommandAction.UPDATE_CONFIG,
        GatewayCommandAction.PLACE_CALL,
        GatewayCommandAction.STOP_SMS,
        GatewayCommandAction.RESUME_SMS,
        GatewayCommandAction.STOP_CALLS,
        GatewayCommandAction.RESUME_CALLS -> GatewayCommandRisk.HIGH
        GatewayCommandAction.REVOKE_GATEWAY -> GatewayCommandRisk.CRITICAL
    }

    fun requiredApprovals(action: GatewayCommandAction): Int =
        if (riskFor(action) == GatewayCommandRisk.CRITICAL) 2 else 1

    fun validate(
        command: GatewayRemoteCommand,
        currentState: GatewayControlState,
        lastAcceptedSequence: Long?,
        nowEpochMs: Long = System.currentTimeMillis(),
    ): Result<Unit> = runCatching {
        require(command.schemaVersion == 1) { "UNSUPPORTED_COMMAND_SCHEMA" }
        require(command.commandId.isNotBlank()) { "COMMAND_ID_REQUIRED" }
        require(command.commandSequence > 0) { "COMMAND_SEQUENCE_INVALID" }
        require(command.actorId.isNotBlank()) { "ACTOR_ID_REQUIRED" }
        require(command.actorRole == GatewayCommandActorRole.SUPER_ADMIN) { "COMMAND_ACTOR_UNAUTHORIZED" }
        require(command.approvals.map { it.approvalId }.distinct().size == command.approvals.size) {
            "DUPLICATE_APPROVAL_ID"
        }
        require(command.approvals.map { it.approverId }.distinct().size == command.approvals.size) {
            "DUPLICATE_APPROVER"
        }
        require(command.approvals.all { it.approverRole == GatewayCommandActorRole.SUPER_ADMIN }) {
            "APPROVER_ROLE_UNAUTHORIZED"
        }
        require(command.approvals.all { it.approvedAtEpochMs <= nowEpochMs + 5 * 60 * 1000L }) {
            "APPROVAL_ISSUED_IN_FUTURE"
        }
        require(command.approvals.any { it.approverId == command.actorId }) {
            "ISSUER_APPROVAL_REQUIRED"
        }
        require(command.approvals.size >= requiredApprovals(command.action)) {
            "INSUFFICIENT_APPROVALS"
        }
        if (lastAcceptedSequence != null) {
            require(command.commandSequence > lastAcceptedSequence) { "COMMAND_SEQUENCE_REPLAY" }
        }
        require(currentState != GatewayControlState.REVOKED || command.action == GatewayCommandAction.REVOKE_GATEWAY) {
            "GATEWAY_ALREADY_REVOKED"
        }

        validatePayload(command)
    }

    private fun validatePayload(command: GatewayRemoteCommand) {
        when (command.action) {
            GatewayCommandAction.SET_GATEWAY_MODE -> {
                val state = command.payload.string("state")
                    ?: error("GATEWAY_STATE_REQUIRED")
                require(state in setOf("NORMAL", "MAINTENANCE", "SAFE_MODE")) {
                    "GATEWAY_STATE_NOT_ALLOWED"
                }
            }

            GatewayCommandAction.SELECT_SIM -> {
                val subscriptionId = command.payload.int("subscriptionId")
                    ?: error("SUBSCRIPTION_ID_REQUIRED")
                require(subscriptionId > 0) { "SUBSCRIPTION_ID_INVALID" }
            }

            GatewayCommandAction.UPDATE_CONFIG -> {
                validateOptionalInt(command.payload, "heartbeatSeconds", 30, 300)
                validateOptionalInt(command.payload, "queuePollSeconds", 5, 60)
                validateOptionalInt(command.payload, "localSmsDailyLimit", 1, 100)
                validateOptionalBoolean(command.payload, "smsEnabled")
                validateOptionalBoolean(command.payload, "callsEnabled")
            }

            GatewayCommandAction.FORCE_DIAGNOSTIC,
            GatewayCommandAction.STOP_SMS,
            GatewayCommandAction.RESUME_SMS,
            GatewayCommandAction.STOP_CALLS,
            GatewayCommandAction.RESUME_CALLS,
            GatewayCommandAction.REVOKE_GATEWAY -> Unit

            GatewayCommandAction.PLACE_CALL -> {
                require(command.payload.string("requestId")?.isNotBlank() == true) { "REQUEST_ID_REQUIRED" }
                require(command.payload.string("recipient")?.isNotBlank() == true) { "RECIPIENT_REQUIRED" }
                require(command.payload.string("purposeCode")?.isNotBlank() == true) { "PURPOSE_CODE_REQUIRED" }
                command.payload.int("subscriptionId")?.let { require(it > 0) { "SUBSCRIPTION_ID_INVALID" } }
            }
        }
    }

    private fun validateOptionalInt(payload: Map<String, Any?>, key: String, min: Int, max: Int) {
        val value = payload.int(key) ?: return
        require(value in min..max) { "${key.uppercase()}_OUT_OF_RANGE" }
    }

    private fun validateOptionalBoolean(payload: Map<String, Any?>, key: String) {
        val value = payload[key] ?: return
        require(value is Boolean) { "${key.uppercase()}_INVALID" }
    }

    private fun Map<String, Any?>.string(key: String): String? = this[key]?.toString()?.trim()?.takeIf { it.isNotBlank() }

    private fun Map<String, Any?>.int(key: String): Int? = when (val value = this[key]) {
        is Number -> value.toInt()
        is String -> value.toIntOrNull()
        else -> null
    }
}
