package com.ridex.gateway.gateway

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.Build
import android.content.pm.ServiceInfo
import com.ridex.gateway.network.NetworkMonitor
import com.ridex.gateway.provider.queue.HttpProviderQueueClient
import com.ridex.gateway.provider.outbox.ProviderResultOutboxStore
import com.ridex.gateway.provider.session.ProviderSessionStore
import com.ridex.gateway.data.storage.SecureStorage
import com.ridex.gateway.sim.SimManager
import com.ridex.gateway.sms.AndroidSmsSender
import com.ridex.gateway.sms.SmsResultStore
import com.ridex.gateway.call.CallQueueRuntime
import com.ridex.gateway.call.CallProcessResult
import com.ridex.gateway.provider.call.ProviderCallRuntime
import com.ridex.gateway.provider.ProviderRuntimeEndpoint
import com.ridex.gateway.provider.ProviderUnifiedReconciliation
import com.ridex.gateway.provider.session.ProviderSessionCoordinator
import com.ridex.gateway.queue.SmsQueueProcessor
import com.ridex.gateway.network.NetworkRuntimeState
import com.ridex.gateway.queue.GatewayQueueStore
import com.ridex.gateway.provider.heartbeat.HttpProviderHeartbeatClient
import com.ridex.gateway.runtime.GatewayRuntimeStatusStore
import com.ridex.gateway.health.GatewayHealthMonitor
import com.ridex.gateway.runtime.ProviderConnectionState
import com.ridex.gateway.recovery.GatewayRecoveryStore
import com.ridex.gateway.recovery.GatewayWatchdogPolicy
import com.ridex.gateway.control.GatewayControlStore
import com.ridex.gateway.provider.control.RemoteControlCoordinator
import com.ridex.gateway.provider.control.RemoteCommandCoordinator
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * Foreground gateway runtime with live network monitoring and deterministic recovery triggers.
 * Provider URL is deployment-time configured and HTTPS-only.
 */
class GatewayForegroundService : Service() {
    private lateinit var statusStore: GatewayRuntimeStatusStore
    private lateinit var coordinator: GatewayHeartbeatCoordinator
    private lateinit var networkMonitor: NetworkMonitor
    private lateinit var smsQueueProcessor: SmsQueueProcessor
    private lateinit var callQueueRuntime: CallQueueRuntime
    private lateinit var providerCallRuntime: ProviderCallRuntime
    private lateinit var providerSessionCoordinator: ProviderSessionCoordinator
    private lateinit var unifiedReconciliation: ProviderUnifiedReconciliation
    private lateinit var providerSessionStore: ProviderSessionStore
    private lateinit var healthMonitor: GatewayHealthMonitor
    private lateinit var recoveryStore: GatewayRecoveryStore
    private lateinit var controlStore: GatewayControlStore
    private lateinit var remoteControlCoordinator: RemoteControlCoordinator
    private lateinit var remoteCommandCoordinator: RemoteCommandCoordinator
    private var executor: ScheduledExecutorService? = null
    private var watchdogExecutor: ScheduledExecutorService? = null
    private var lastWorkerCycleAtMs = 0L

    override fun onCreate() {
        super.onCreate()
        statusStore = GatewayRuntimeStatusStore(this)
        recoveryStore = GatewayRecoveryStore(this)
        controlStore = GatewayControlStore(SecureStorage(this))
        remoteControlCoordinator = RemoteControlCoordinator(
            controlStore = controlStore,
            sessionStore = ProviderSessionStore(SecureStorage(this)),
            secureStorage = SecureStorage(this),
        )
        remoteCommandCoordinator = RemoteCommandCoordinator(this)
        coordinator = GatewayHeartbeatCoordinator(
            context = this,
            heartbeatClient = HttpProviderHeartbeatClient(),
        )
        networkMonitor = NetworkMonitor(this, ::handleNetworkState)
        providerSessionStore = ProviderSessionStore(SecureStorage(this))
        healthMonitor = GatewayHealthMonitor(this)
        callQueueRuntime = CallQueueRuntime(this)
        providerCallRuntime = ProviderCallRuntime(this)
        providerSessionCoordinator = ProviderSessionCoordinator(this)
        unifiedReconciliation = ProviderUnifiedReconciliation(this)
        smsQueueProcessor = SmsQueueProcessor(
            queueStore = GatewayQueueStore(this),
            providerQueueClient = HttpProviderQueueClient(),
            smsSender = AndroidSmsSender(this),
            smsResultStore = SmsResultStore(SecureStorage(this)),
            selectedSubscriptionIdProvider = { SimManager(this).getSelectedSubscriptionId() ?: 0 },
            providerResultOutboxStore = ProviderResultOutboxStore(this),
            ownerId = "gateway-${android.provider.Settings.Secure.getString(contentResolver, android.provider.Settings.Secure.ANDROID_ID) ?: "unknown"}",
        )

        createNotificationChannel()
        startForegroundCompat(buildNotification("Gateway service starting"))
        statusStore.setServiceRunning(true)
        recoveryStore.recordServiceStart()
        lastWorkerCycleAtMs = System.currentTimeMillis()
        GatewayQueueStore(this).recoverExpiredLeases()
        networkMonitor.start()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (executor == null) {
            startWorkerExecutor()
        }
        startWatchdogIfNeeded()
        return START_STICKY
    }

    override fun onDestroy() {
        networkMonitor.stop()
        callQueueRuntime.stopStateMonitoring()
        executor?.shutdownNow()
        executor = null
        watchdogExecutor?.shutdownNow()
        watchdogExecutor = null
        statusStore.setServiceRunning(false)
        statusStore.setProviderState(ProviderConnectionState.STOPPED)
        statusStore.recordHeartbeatResult("SERVICE_STOPPED")
        recoveryStore.recordServiceStopped()
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // stopWithTask=false keeps the service alive when the launcher task is removed.
        recoveryStore.recordTaskRemoved()
        super.onTaskRemoved(rootIntent)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun handleNetworkState(state: NetworkRuntimeState) {
        if (!state.validatedInternet) {
            statusStore.setProviderState(ProviderConnectionState.NETWORK_UNAVAILABLE)
            statusStore.recordHeartbeatResult("NETWORK_UNAVAILABLE")
            updateNotification("Network unavailable")
            return
        }

        // Recovery is deliberately delayed slightly so the new network has time to settle.
        executor?.let { scheduler ->
            scheduler.schedule(
                { runHeartbeatCycle() },
                NETWORK_RECOVERY_DELAY_SECONDS,
                TimeUnit.SECONDS,
            )
        }
        updateNotification("Network restored; reconnecting")
    }

    private fun runHeartbeatCycle() {
        lastWorkerCycleAtMs = System.currentTimeMillis()
        recoveryStore.recordWorkerCycle(lastWorkerCycleAtMs)
        when (providerSessionCoordinator.refreshIfNeeded()) {
            com.ridex.gateway.provider.session.ProviderSessionResult.NOT_CONFIGURED,
            com.ridex.gateway.provider.session.ProviderSessionResult.AUTH_REQUIRED,
            com.ridex.gateway.provider.session.ProviderSessionResult.AUTH_ERROR -> Unit
            com.ridex.gateway.provider.session.ProviderSessionResult.AUTHENTICATED,
            com.ridex.gateway.provider.session.ProviderSessionResult.REFRESHED -> Unit
        }

        runCatching {
            coordinator.runOnce()
        }.onFailure { error ->
            statusStore.setProviderState(ProviderConnectionState.HTTP_ERROR)
            statusStore.recordHeartbeatResult(
                result = "HEARTBEAT_RUNTIME_ERROR",
                error = error.message,
            )
        }

        runRemoteControlCycle()
        runRemoteCommandCycle()
        runCatching { healthMonitor.refresh() }
        runSmsQueueCycle()
        runCallQueueCycle()
        runUnifiedReconciliationCycle()
        val status = statusStore.read()
        val text = when (status.providerState) {
            ProviderConnectionState.CONNECTED -> "Provider heartbeat connected"
            ProviderConnectionState.AUTH_REQUIRED -> "Provider authentication required"
            ProviderConnectionState.NETWORK_UNAVAILABLE -> "Network unavailable"
            ProviderConnectionState.HTTP_ERROR -> "Provider heartbeat error"
            ProviderConnectionState.REJECTED -> "Provider rejected gateway"
            ProviderConnectionState.STOPPED -> "Gateway service stopped"
            ProviderConnectionState.NOT_CONFIGURED -> "Provider endpoint not configured"
        }
        updateNotification(text)
    }

    private fun runRemoteControlCycle() {
        val baseUrl = ProviderRuntimeEndpoint.baseUrl()
        if (baseUrl.isBlank()) return

        when (remoteControlCoordinator.applyRemote(baseUrl)) {
            com.ridex.gateway.provider.control.RemoteControlApplyResult.REVOKED ->
                updateNotification("Gateway revoked by Provider")
            com.ridex.gateway.provider.control.RemoteControlApplyResult.REJECTED_VERSION_ROLLBACK ->
                updateNotification("Remote control rollback rejected")
            else -> Unit
        }
    }

    private fun runRemoteCommandCycle() {
        val baseUrl = ProviderRuntimeEndpoint.baseUrl()
        if (baseUrl.isBlank()) return

        val result = remoteCommandCoordinator.syncOnce(baseUrl)

        when (result) {
            com.ridex.gateway.provider.control.RemoteCommandSyncResult.APPLIED ->
                android.util.Log.i("RideXGateway", "REMOTE_COMMAND_SYNC=APPLIED")

            com.ridex.gateway.provider.control.RemoteCommandSyncResult.REVOKED ->
                android.util.Log.w("RideXGateway", "REMOTE_COMMAND_SYNC=REVOKED")

            com.ridex.gateway.provider.control.RemoteCommandSyncResult.PROVIDER_ERROR ->
                android.util.Log.w("RideXGateway", "REMOTE_COMMAND_SYNC=PROVIDER_ERROR")

            com.ridex.gateway.provider.control.RemoteCommandSyncResult.EXECUTION_FAILED ->
                android.util.Log.w("RideXGateway", "REMOTE_COMMAND_SYNC=EXECUTION_FAILED")

            com.ridex.gateway.provider.control.RemoteCommandSyncResult.REJECTED ->
                android.util.Log.w("RideXGateway", "REMOTE_COMMAND_SYNC=REJECTED")

            com.ridex.gateway.provider.control.RemoteCommandSyncResult.REPLAY_REJECTED ->
                android.util.Log.w("RideXGateway", "REMOTE_COMMAND_SYNC=REPLAY_REJECTED")

            com.ridex.gateway.provider.control.RemoteCommandSyncResult.NO_COMMAND ->
                android.util.Log.d("RideXGateway", "REMOTE_COMMAND_SYNC=NO_COMMAND")

            com.ridex.gateway.provider.control.RemoteCommandSyncResult.SKIPPED_NO_SESSION ->
                android.util.Log.d("RideXGateway", "REMOTE_COMMAND_SYNC=SKIPPED_NO_SESSION")

            com.ridex.gateway.provider.control.RemoteCommandSyncResult.SKIPPED_SESSION_EXPIRED ->
                android.util.Log.d("RideXGateway", "REMOTE_COMMAND_SYNC=SKIPPED_SESSION_EXPIRED")
        }
    }

    private fun runSmsQueueCycle() {
        val control = controlStore.read()
        if (!control.communicationAllowed) {
            statusStore.recordSmsQueueCycle("SKIPPED_COMMUNICATION_BLOCKED")
            return
        }
        if (healthMonitor.read()?.state == com.ridex.gateway.health.GatewayHealthState.SAFE_MODE) {
            statusStore.recordSmsQueueCycle("SKIPPED_SAFE_MODE")
            return
        }

        val baseUrl = ProviderRuntimeEndpoint.baseUrl()
        if (baseUrl.isBlank()) {
            statusStore.recordSmsQueueCycle("SKIPPED_PROVIDER_NOT_CONFIGURED")
            return
        }

        val session = providerSessionStore.read()
        if (session == null) {
            statusStore.recordSmsQueueCycle("SKIPPED_NO_SESSION")
            return
        }
        if (!session.isAccessTokenUsable()) {
            statusStore.recordSmsQueueCycle("SKIPPED_ACCESS_TOKEN_UNUSABLE")
            return
        }

        runCatching {
            val ingest = smsQueueProcessor.ingestPending(baseUrl, session).getOrThrow()
            statusStore.recordSmsQueueCycle(
                result = "FETCH_SUCCESS",
                fetchedCount = ingest.fetchedCount,
                addedCount = ingest.addedCount,
                clearError = true,
            )

            when (val process = smsQueueProcessor.processNext()) {
                com.ridex.gateway.queue.ProcessNextResult.NothingToProcess -> {
                    statusStore.recordSmsQueueCycle(
                        result = "IDLE_NO_LOCAL_ITEM",
                        clearError = true,
                    )
                }
                is com.ridex.gateway.queue.ProcessNextResult.Submitted -> {
                    statusStore.recordSmsQueueCycle(
                        result = "SMS_SUBMITTED",
                        requestId = process.requestId,
                        clearError = true,
                    )
                }
                is com.ridex.gateway.queue.ProcessNextResult.SubmissionFailed -> {
                    statusStore.recordSmsQueueCycle(
                        result = "SMS_SUBMISSION_FAILED",
                        requestId = process.requestId,
                        error = process.failureCode,
                    )
                }
            }

            val items = GatewayQueueStore(this).itemsSnapshot()
            items.filter { it.state == com.ridex.gateway.queue.QueueItemState.PROCESSING }
                .forEach { item ->
                    smsQueueProcessor.reconcileResult(
                        requestId = item.requestId,
                        baseUrl = baseUrl,
                        session = session,
                    ).onSuccess { reconciliation ->
                        statusStore.recordSmsQueueCycle(
                            result = "RESULT_${reconciliation.name.uppercase()}",
                            requestId = item.requestId,
                            clearError = true,
                        )
                    }.onFailure { error ->
                        statusStore.recordSmsQueueCycle(
                            result = "RESULT_RECONCILE_PENDING",
                            requestId = item.requestId,
                            error = error.message ?: "SMS_RESULT_RECONCILE_FAILED",
                        )
                    }
                }
            val flushed = smsQueueProcessor.flushProviderResults(baseUrl, session)
            if (flushed > 0) {
                statusStore.recordSmsQueueCycle(
                    result = "BACKEND_RESULTS_FLUSHED",
                    clearError = true,
                )
            }
        }.onFailure { error ->
            statusStore.recordSmsQueueCycle(
                result = "QUEUE_CYCLE_ERROR",
                error = error.message ?: error.javaClass.simpleName,
            )
            android.util.Log.w(
                "RideXGateway",
                "SMS_QUEUE_CYCLE_ERROR=${error.message ?: error.javaClass.simpleName}",
            )
        }
    }

    private fun runCallQueueCycle() {
        if (!controlStore.read().communicationAllowed) {
            statusStore.recordCallCycle("SKIPPED_COMMUNICATION_BLOCKED")
            return
        }
        if (healthMonitor.read()?.state == com.ridex.gateway.health.GatewayHealthState.SAFE_MODE) {
            statusStore.recordCallCycle("SKIPPED_SAFE_MODE")
            return
        }
        val baseUrl = ProviderRuntimeEndpoint.baseUrl()
        if (baseUrl.isBlank()) {
            statusStore.recordCallCycle("SKIPPED_PROVIDER_NOT_CONFIGURED")
            return
        }
        val result = runCatching { providerCallRuntime.runOnce(baseUrl) }.getOrElse { error ->
            statusStore.recordCallCycle(
                "CYCLE_ERROR",
                error = error.message ?: error.javaClass.simpleName,
            )
            android.util.Log.w(
                "RideXGateway",
                "CALL_QUEUE_CYCLE_ERROR=${error.message ?: error.javaClass.simpleName}",
            )
            return
        }
        when (result) {
            is com.ridex.gateway.provider.call.ProviderCallCycleResult.APPLIED -> {
                statusStore.recordCallCycle(
                    "APPLIED",
                    ingestedCount = result.ingested,
                    clearError = true,
                )
            }
            com.ridex.gateway.provider.call.ProviderCallCycleResult.NOT_CONFIGURED ->
                statusStore.recordCallCycle("NOT_CONFIGURED")
            com.ridex.gateway.provider.call.ProviderCallCycleResult.NO_SESSION ->
                statusStore.recordCallCycle("NO_SESSION")
            com.ridex.gateway.provider.call.ProviderCallCycleResult.SESSION_EXPIRED ->
                statusStore.recordCallCycle("SESSION_EXPIRED")
            com.ridex.gateway.provider.call.ProviderCallCycleResult.PROVIDER_ERROR -> {
                statusStore.recordCallCycle(
                    "PROVIDER_ERROR",
                    error = "PROVIDER_CALL_SYNC_FAILED",
                )
                updateNotification("Provider call sync error")
            }
        }
    }

    private fun runUnifiedReconciliationCycle() {
        val baseUrl = ProviderRuntimeEndpoint.baseUrl()
        val session = providerSessionCoordinator.session() ?: return
        val result = unifiedReconciliation.reconcile(baseUrl, session)
        if (result.smsResultsSent > 0) {
            updateNotification("Provider SMS results reconciled: ${result.smsResultsSent}")
        }
        when (result.callCycle) {
            is com.ridex.gateway.provider.call.ProviderCallCycleResult.PROVIDER_ERROR ->
                updateNotification("Provider communication reconciliation error")
            else -> Unit
        }
    }

    private fun startWorkerExecutor() {
        executor?.shutdownNow()
        executor = Executors.newSingleThreadScheduledExecutor()
        executor?.scheduleAtFixedRate(
            { runHeartbeatCycle() },
            0L,
            HEARTBEAT_INTERVAL_SECONDS,
            TimeUnit.SECONDS,
        )
    }

    private fun startWatchdogIfNeeded() {
        if (watchdogExecutor != null) return
        watchdogExecutor = Executors.newSingleThreadScheduledExecutor()
        watchdogExecutor?.scheduleAtFixedRate(
            { watchdogTick() },
            WATCHDOG_INITIAL_DELAY_SECONDS,
            WATCHDOG_INTERVAL_SECONDS,
            TimeUnit.SECONDS,
        )
    }

    private fun watchdogTick() {
        val nowMs = System.currentTimeMillis()
        val staleForMs = nowMs - lastWorkerCycleAtMs
        if (GatewayWatchdogPolicy.shouldRestartWorker(lastWorkerCycleAtMs, nowMs)) {
            recoveryStore.recordWatchdogRestart(nowMs)
            startWorkerExecutor()
            updateNotification("Worker recovered by watchdog")
        }
    }

    private fun startForegroundCompat(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
        } else {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
            )
        }
    }

    private fun updateNotification(text: String) {
        getSystemService(NotificationManager::class.java)?.notify(
            NOTIFICATION_ID,
            buildNotification(text),
        )
    }

    private fun buildNotification(contentText: String): Notification =
        Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("RideX Gateway")
            .setContentText(contentText)
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build()

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "RideX Gateway Service",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Foreground service status for the RideX communication gateway."
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }

    companion object {
        private const val CHANNEL_ID = "ridex_gateway_service_v1"
        private const val NOTIFICATION_ID = 41001
        private const val HEARTBEAT_INTERVAL_SECONDS = 60L
        private const val NETWORK_RECOVERY_DELAY_SECONDS = 2L
        private const val WATCHDOG_INITIAL_DELAY_SECONDS = 30L
        private const val WATCHDOG_INTERVAL_SECONDS = 30L

        fun startFromBackground(context: android.content.Context) {
            val intent = Intent(context, GatewayForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }
}