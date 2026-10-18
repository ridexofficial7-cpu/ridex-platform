package com.ridex.gateway.provider.call

import android.content.Context
import com.ridex.gateway.call.CallQueueRuntime
import com.ridex.gateway.call.CallStatus
import com.ridex.gateway.call.CallResultStore
import com.ridex.gateway.provider.ProviderEndpointConfig
import com.ridex.gateway.provider.ProviderRuntimeEndpoint
import com.ridex.gateway.provider.session.ProviderSession
import com.ridex.gateway.provider.session.ProviderSessionStore
import com.ridex.gateway.data.storage.SecureStorage
import kotlin.math.min

/** Provider call ingress + local queue + result reconciliation. */
class ProviderCallRuntime(context: Context) {
    private val appContext=context.applicationContext
    private val client:ProviderCallClient=HttpProviderCallClient(
        queuePath=ProviderEndpointConfig.CALL_QUEUE_PATH,
        resultPathTemplate=ProviderEndpointConfig.CALL_RESULT_PATH_TEMPLATE,
    )
    private val sessionStore=ProviderSessionStore(SecureStorage(appContext))
    private val queue=CallQueueRuntime(appContext)
    private val outbox=ProviderCallResultOutbox(appContext)
    private val tracker=ProviderCallTracker(appContext)
    private val resultStore=CallResultStore(SecureStorage(appContext))

    fun runOnce(baseUrl:String=ProviderRuntimeEndpoint.baseUrl()):ProviderCallCycleResult{
        if(baseUrl.isBlank()) return ProviderCallCycleResult.NOT_CONFIGURED
        val session=sessionStore.read() ?: return ProviderCallCycleResult.NO_SESSION
        if(!session.isAccessTokenUsable()) return ProviderCallCycleResult.SESSION_EXPIRED
        val fetched=client.fetchPending(baseUrl,session.accessToken)
        val ingested=fetched.fold(onSuccess={items->items.count{item->queue.enqueueFromProvider(item.recipient,item.purposeCode,item.requestId,item.subscriptionId).getOrElse{false}.also{ if(it) tracker.add(item.requestId) }}},onFailure={return ProviderCallCycleResult.PROVIDER_ERROR})
        queue.processNext()
        reconcile(session)
        flush(baseUrl,session)
        return ProviderCallCycleResult.APPLIED(ingested)
    }

    private fun reconcile(session:ProviderSession){
        tracker.all().forEach { requestId ->
            val record=resultStore.read(requestId) ?: return@forEach
            val status=when(record.status){
                CallStatus.STARTING -> CallDeliveryStatus.STARTED
                CallStatus.CONNECTED -> CallDeliveryStatus.CONNECTED
                CallStatus.ENDED -> CallDeliveryStatus.ENDED
                CallStatus.FAILED -> CallDeliveryStatus.FAILED
                else -> null
            } ?: return@forEach
            if(tracker.reported(requestId)==status) return@forEach
            outbox.enqueue(requestId,status,record.failureCode)
            tracker.markReported(requestId,status)
        }
    }

    private fun flush(baseUrl:String,session:ProviderSession){
        outbox.due().forEach{record->
            client.postResult(baseUrl,session.accessToken,record.requestId,record.status,record.failureCode).onSuccess{outbox.remove(record.requestId,record.status)}.onFailure{
                val delay=min(30_000L*(1L shl record.attempts.coerceAtMost(20)),300_000L);outbox.fail(record.requestId,record.status,System.currentTimeMillis()+delay)
            }
        }
    }
}

sealed interface ProviderCallCycleResult{
    data object NOT_CONFIGURED:ProviderCallCycleResult
    data object NO_SESSION:ProviderCallCycleResult
    data object SESSION_EXPIRED:ProviderCallCycleResult
    data object PROVIDER_ERROR:ProviderCallCycleResult
    data class APPLIED(val ingested:Int):ProviderCallCycleResult
}
