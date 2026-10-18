package com.ridex.gateway.provider.control

/**
 * Provider-authorized commands for the dedicated RideX Gateway.
 * The outer envelope is signed by a pinned Provider key. Approval metadata is
 * contained inside the signed envelope and is validated by the device policy.
 */
enum class GatewayCommandAction {
    FORCE_DIAGNOSTIC,
    SET_GATEWAY_MODE,
    SELECT_SIM,
    UPDATE_CONFIG,
    STOP_SMS,
    RESUME_SMS,
    STOP_CALLS,
    RESUME_CALLS,
    PLACE_CALL,
    REVOKE_GATEWAY,
}

enum class GatewayCommandRisk {
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL,
}

enum class GatewayCommandActorRole {
    SUPER_ADMIN,
}

data class GatewayCommandApproval(
    val approvalId: String,
    val approverId: String,
    val approverRole: GatewayCommandActorRole,
    val approvedAtEpochMs: Long,
)

data class GatewayRemoteCommand(
    val schemaVersion: Int,
    val commandId: String,
    val commandSequence: Long,
    val issuedAtEpochMs: Long,
    val expiresAtEpochMs: Long,
    val keyId: String,
    val actorId: String,
    val actorRole: GatewayCommandActorRole,
    val action: GatewayCommandAction,
    val payload: Map<String, Any?>,
    val approvals: List<GatewayCommandApproval>,
    val signatureBase64: String,
    /** Provider transport lease attempt; not part of the signed command payload. */
    val deliveryAttempt: Long = 0,
) {
    val risk: GatewayCommandRisk
        get() = GatewayRemoteCommandPolicy.riskFor(action)
}

object GatewayRemoteCommandCanonicalizer {
    fun canonicalBytes(command: GatewayRemoteCommand): ByteArray {
        val approvals = org.json.JSONArray()
        command.approvals.forEach { approval ->
            approvals.put(
                org.json.JSONObject()
                    .put("approvalId", approval.approvalId)
                    .put("approverId", approval.approverId)
                    .put("approverRole", approval.approverRole.name)
                    .put("approvedAtEpochMs", approval.approvedAtEpochMs),
            )
        }

        val root = org.json.JSONObject()
            .put("schemaVersion", command.schemaVersion)
            .put("commandId", command.commandId)
            .put("commandSequence", command.commandSequence)
            .put("issuedAtEpochMs", command.issuedAtEpochMs)
            .put("expiresAtEpochMs", command.expiresAtEpochMs)
            .put("keyId", command.keyId)
            .put("actorId", command.actorId)
            .put("actorRole", command.actorRole.name)
            .put("action", command.action.name)
            .put("payload", org.json.JSONObject(command.payload))
            .put("approvals", approvals)

        return com.ridex.gateway.provider.config.CanonicalJson
            .canonicalizeObject(root)
            .toByteArray(Charsets.UTF_8)
    }

    fun fromJson(json: String): GatewayRemoteCommand {
        val root = org.json.JSONObject(json)
        val payloadObject = root.optJSONObject("payload") ?: org.json.JSONObject()
        val approvalsArray = root.optJSONArray("approvals") ?: org.json.JSONArray()

        val approvals = buildList {
            for (index in 0 until approvalsArray.length()) {
                val item = approvalsArray.optJSONObject(index) ?: continue
                add(
                    GatewayCommandApproval(
                        approvalId = item.getString("approvalId"),
                        approverId = item.getString("approverId"),
                        approverRole = GatewayCommandActorRole.valueOf(item.getString("approverRole")),
                        approvedAtEpochMs = item.getLong("approvedAtEpochMs"),
                    ),
                )
            }
        }

        return GatewayRemoteCommand(
            schemaVersion = root.getInt("schemaVersion"),
            commandId = root.getString("commandId"),
            commandSequence = root.getLong("commandSequence"),
            issuedAtEpochMs = root.getLong("issuedAtEpochMs"),
            expiresAtEpochMs = root.getLong("expiresAtEpochMs"),
            keyId = root.getString("keyId"),
            actorId = root.getString("actorId"),
            actorRole = GatewayCommandActorRole.valueOf(root.getString("actorRole")),
            action = GatewayCommandAction.valueOf(root.getString("action")),
            payload = payloadObject.toMap(),
            approvals = approvals,
            signatureBase64 = root.getString("signatureBase64"),
        )
    }

    private fun org.json.JSONObject.toMap(): Map<String, Any?> =
        keys().asSequence().associateWith { key ->
            when (val value = get(key)) {
                is org.json.JSONObject -> value.toMap()
                is org.json.JSONArray -> value
                else -> value
            }
        }
}
