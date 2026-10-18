package com.ridex.gateway.provider

import android.content.Context
import com.ridex.gateway.data.storage.SecureStorage
import com.ridex.gateway.provider.call.ProviderCallRuntime
import com.ridex.gateway.provider.queue.ProviderQueueClient
import com.ridex.gateway.provider.queue.HttpProviderQueueClient
import com.ridex.gateway.provider.outbox.ProviderResultOutboxFlusher
import com.ridex.gateway.provider.outbox.ProviderResultOutboxStore
import com.ridex.gateway.provider.session.ProviderSession

/** Single runtime boundary for communication reconciliation across SMS and Call channels. */
class ProviderUnifiedReconciliation(context: Context) {
    private val appContext = context.applicationContext
    private val smsFlusher = ProviderResultOutboxFlusher(
        store = ProviderResultOutboxStore(appContext),
        providerQueueClient = HttpProviderQueueClient(),
    )
    private val callRuntime = ProviderCallRuntime(appContext)

    fun reconcile(baseUrl: String, session: ProviderSession): UnifiedReconciliationResult {
        if (baseUrl.isBlank()) return UnifiedReconciliationResult.NOT_CONFIGURED
        if (!session.isAccessTokenUsable()) return UnifiedReconciliationResult.SESSION_EXPIRED

        val smsSent = runCatching { smsFlusher.flush(baseUrl, session) }.getOrDefault(0)
        val call = callRuntime.runOnce(baseUrl)
        return UnifiedReconciliationResult(
            smsResultsSent = smsSent,
            callCycle = call,
        )
    }
}

data class UnifiedReconciliationResult(
    val smsResultsSent: Int,
    val callCycle: com.ridex.gateway.provider.call.ProviderCallCycleResult,
) {
    companion object {
        val NOT_CONFIGURED = UnifiedReconciliationResult(0, com.ridex.gateway.provider.call.ProviderCallCycleResult.NOT_CONFIGURED)
        val SESSION_EXPIRED = UnifiedReconciliationResult(0, com.ridex.gateway.provider.call.ProviderCallCycleResult.SESSION_EXPIRED)
    }
}
