package com.ridex.gateway.provider.control

import com.ridex.gateway.data.storage.SecureStorage
import org.json.JSONArray
import org.json.JSONObject

/** Bounded replay journal for accepted Provider commands. */
class RemoteCommandJournalStore(private val storage: SecureStorage) {
    @Synchronized
    fun lastAcceptedSequence(): Long? = readState().first

    @Synchronized
    fun containsCommand(commandId: String): Boolean = readState().second.contains(commandId)

    @Synchronized
    fun accept(commandId: String, sequence: Long) {
        require(commandId.isNotBlank()) { "COMMAND_ID_REQUIRED" }
        require(sequence > 0) { "COMMAND_SEQUENCE_INVALID" }
        val (last, ids) = readState()
        val nextIds = LinkedHashSet(ids)
        nextIds.add(commandId)
        while (nextIds.size > MAX_IDS) nextIds.remove(nextIds.first())
        storage.putString(
            KEY,
            JSONObject()
                .put("lastAcceptedSequence", sequence)
                .put("commandIds", JSONArray(nextIds.toList()))
                .toString(),
        )
    }

    private fun readState(): Pair<Long?, LinkedHashSet<String>> {
        val raw = storage.getString(KEY) ?: return null to linkedSetOf()
        // Replay protection must fail closed. Treating a malformed persisted journal as
        // an empty journal would erase the last accepted sequence and could admit a
        // previously executed signed command after storage corruption or partial writes.
        return try {
            val json = JSONObject(raw)
            require(json.has("lastAcceptedSequence")) { "JOURNAL_SEQUENCE_MISSING" }
            require(json.has("commandIds")) { "JOURNAL_COMMAND_IDS_MISSING" }
            val sequenceValue = json.get("lastAcceptedSequence")
            require(sequenceValue is Number) { "JOURNAL_SEQUENCE_INVALID" }
            val sequence = sequenceValue.toLong()
            require(sequence > 0L && sequenceValue.toDouble() == sequence.toDouble()) { "JOURNAL_SEQUENCE_INVALID" }
            val array = json.get("commandIds") as? JSONArray
                ?: error("JOURNAL_COMMAND_IDS_INVALID")
            require(array.length() in 1..MAX_IDS) { "JOURNAL_COMMAND_IDS_INVALID" }
            val ids = linkedSetOf<String>()
            for (index in 0 until array.length()) {
                val value = array.get(index)
                require(value is String && value.isNotBlank()) { "JOURNAL_COMMAND_ID_INVALID" }
                require(ids.add(value)) { "JOURNAL_COMMAND_ID_DUPLICATE" }
            }
            sequence to ids
        } catch (_: Exception) {
            // Deliberately omit raw storage contents and parser exceptions from the error.
            throw IllegalStateException("COMMAND_JOURNAL_CORRUPT")
        }
    }

    companion object {
        private const val KEY = "gateway_remote_command_journal_v1"
        private const val MAX_IDS = 100
    }
}
