package com.ridex.gateway.call

/**
 * Prevents a previously recorded call request from being submitted to the
 * queue again. Processor-managed retries use CallQueueStore.requeue directly.
 */
internal fun enqueueCallRequestUnlessAlreadyRecorded(
    existingRecord: CallRecord?,
    enqueue: () -> Boolean,
): Boolean {
    if (existingRecord != null) return false
    return enqueue()
}