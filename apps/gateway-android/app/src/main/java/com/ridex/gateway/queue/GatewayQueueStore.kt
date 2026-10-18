package com.ridex.gateway.queue

import android.content.Context
import com.ridex.gateway.data.storage.SecureStorage
import org.json.JSONArray
import org.json.JSONObject

/**
 * Persists queue state inside the existing Android Keystore-backed SecureStorage.
 * Queue content is encrypted at rest; no plaintext queue JSON file is written.
 */
class GatewayQueueStore(context: Context) {
    private val secureStorage = SecureStorage(context.applicationContext)
    private val stateMachine = GatewayQueueStateMachine()

    init {
        restore()
    }

    @Synchronized
    fun enqueue(item: GatewayQueueItem): Boolean {
        val added = stateMachine.enqueue(item)
        if (added) persist()
        return added
    }

    @Synchronized
    fun recoverExpiredLeases(nowEpochMs: Long = System.currentTimeMillis()): Int {
        val recovered = stateMachine.recoverExpiredLeases(nowEpochMs)
        if (recovered > 0) persist()
        return recovered
    }

    @Synchronized
    fun claimNext(nowEpochMs: Long, owner: String): GatewayQueueItem? {
        val item = stateMachine.claimNext(nowEpochMs, owner)
        if (item != null) persist()
        return item
    }

    @Synchronized
    fun beginProcessing(requestId: String, owner: String): GatewayQueueItem? {
        val item = stateMachine.beginProcessing(requestId, owner)
        if (item != null) persist()
        return item
    }

    @Synchronized
    fun markSent(requestId: String, owner: String): GatewayQueueItem? {
        val item = stateMachine.markSent(requestId, owner)
        if (item != null) persist()
        return item
    }

    @Synchronized
    fun markFailed(
        requestId: String,
        owner: String,
        retryable: Boolean,
        failureCode: String,
        nextRetryAtEpochMs: Long? = null,
    ): GatewayQueueItem? {
        val item = stateMachine.markFailed(
            requestId = requestId,
            owner = owner,
            retryable = retryable,
            failureCode = failureCode,
            nextRetryAtEpochMs = nextRetryAtEpochMs,
        )
        if (item != null) persist()
        return item
    }

    fun get(requestId: String): GatewayQueueItem? = stateMachine.get(requestId)

    fun itemsSnapshot(): List<GatewayQueueItem> = stateMachine.itemsSnapshot()

    fun isFinalized(requestId: String): Boolean = stateMachine.isFinalized(requestId)

    fun summary(): QueueSummary = stateMachine.summary()

    private fun persist() {
        val json = JSONObject()
            .put("schemaVersion", SCHEMA_VERSION)
            .put("items", JSONArray().apply {
                stateMachine.itemsSnapshot().forEach { item -> put(toJson(item)) }
            })
            .put("finalizedRequestIds", JSONArray().apply {
                stateMachine.finalizedRequestIdsSnapshot().forEach { put(it) }
            })

        secureStorage.putString(KEY_QUEUE, json.toString())
    }

    private fun restore() {
        val raw = secureStorage.getString(KEY_QUEUE) ?: return
        runCatching {
            val json = JSONObject(raw)
            val itemsJson = json.optJSONArray("items") ?: JSONArray()
            val restoredItems = buildList {
                for (index in 0 until itemsJson.length()) {
                    add(fromJson(itemsJson.getJSONObject(index)))
                }
            }

            val finalizedJson = json.optJSONArray("finalizedRequestIds") ?: JSONArray()
            val finalizedIds = buildList {
                for (index in 0 until finalizedJson.length()) {
                    add(finalizedJson.optString(index))
                }
            }

            stateMachine.restoreSnapshot(restoredItems, finalizedIds)
        }
    }

    private fun toJson(item: GatewayQueueItem): JSONObject = JSONObject()
        .put("requestId", item.requestId)
        .put("recipient", item.recipient)
        .put("message", item.message)
        .put("purposeCode", item.purposeCode)
        .put("createdAtEpochMs", item.createdAtEpochMs)
        .put("state", item.state.name)
        .put("attemptCount", item.attemptCount)
        .apply {
            if (item.leaseOwner != null) put("leaseOwner", item.leaseOwner)
            if (item.leaseUntilEpochMs != null) put("leaseUntilEpochMs", item.leaseUntilEpochMs)
            if (item.nextRetryAtEpochMs != null) put("nextRetryAtEpochMs", item.nextRetryAtEpochMs)
            if (item.lastFailureCode != null) put("lastFailureCode", item.lastFailureCode)
        }

    private fun fromJson(json: JSONObject): GatewayQueueItem = GatewayQueueItem(
        requestId = json.getString("requestId"),
        recipient = json.getString("recipient"),
        message = json.getString("message"),
        purposeCode = json.getString("purposeCode"),
        createdAtEpochMs = json.getLong("createdAtEpochMs"),
        state = runCatching {
            QueueItemState.valueOf(json.optString("state", QueueItemState.QUEUED.name))
        }.getOrDefault(QueueItemState.QUEUED),
        leaseOwner = json.optString("leaseOwner", "").takeIf { it.isNotBlank() },
        leaseUntilEpochMs = json.optLong("leaseUntilEpochMs", 0L).takeIf { it > 0L },
        attemptCount = json.optInt("attemptCount", 0),
        nextRetryAtEpochMs = json.optLong("nextRetryAtEpochMs", 0L).takeIf { it > 0L },
        lastFailureCode = json.optString("lastFailureCode", "").takeIf { it.isNotBlank() },
    )

    companion object {
        private const val KEY_QUEUE = "gateway_queue_v1"
        private const val SCHEMA_VERSION = 1
    }
}
