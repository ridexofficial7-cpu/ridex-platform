package com.ridex.gateway.call

import android.content.Context
import com.ridex.gateway.data.storage.SecureStorage
import com.ridex.gateway.provider.control.GatewayOperationalConfigStore
import com.ridex.gateway.sim.SimManager

/** Runtime facade enforcing the gateway call-channel switch and selected SIM. */
class CallQueueRuntime(context: Context) {
    private val appContext = context.applicationContext
    private val configStore = GatewayOperationalConfigStore(SecureStorage(appContext))
    private val simManager = SimManager(appContext)
    private val resultStore = CallResultStore(SecureStorage(appContext))
    private val queueStore = CallQueueStore(SecureStorage(appContext))
    private val stateMonitor = CallStateMonitor(appContext)
    private val processor = CallQueueProcessor(
        queueStore = queueStore,
        sender = AndroidCallSender(appContext),
        resultSink = resultStore,
        selectedSubscriptionIdProvider = { simManager.getSelectedSubscriptionId() ?: -1 },
    )

    @Synchronized fun enqueue(recipient: String, purposeCode: String, requestId: String): Result<Boolean> = runCatching {
        val config = configStore.read()
        require(config.callsEnabled) { "CALL_CHANNEL_DISABLED" }
        val subscriptionId = simManager.getSelectedSubscriptionId() ?: error("SIM_NOT_SELECTED")
        enqueueUnlessAlreadyRecorded(CallRequest(requestId, recipient, subscriptionId, purposeCode))
    }

    @Synchronized fun enqueueFromProvider(recipient: String, purposeCode: String, requestId: String, subscriptionId: Int?): Result<Boolean> = runCatching {
        val config = configStore.read()
        require(config.callsEnabled) { "CALL_CHANNEL_DISABLED" }
        val selected = simManager.getSelectedSubscriptionId() ?: error("SIM_NOT_SELECTED")
        if (subscriptionId != null) require(subscriptionId == selected) { "PROVIDER_SUBSCRIPTION_MISMATCH" }
        enqueueUnlessAlreadyRecorded(CallRequest(requestId, recipient, selected, purposeCode))
    }

    private fun enqueueUnlessAlreadyRecorded(request: CallRequest): Boolean =
        enqueueCallRequestUnlessAlreadyRecorded(resultStore.read(request.requestId)) {
            processor.enqueue(request)
        }

    @Synchronized fun processNext(): CallProcessResult {
        if (!configStore.read().callsEnabled) return CallProcessResult.NothingToProcess
        return when (val result = processor.processNext()) {
            is CallProcessResult.Started -> {
                stateMonitor.start(result.requestId)
                result
            }
            else -> result
        }
    }

    fun stopStateMonitoring() = stateMonitor.stop()

    fun readResult(requestId: String): CallRecord? = resultStore.read(requestId)
}
