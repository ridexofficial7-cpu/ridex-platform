package com.ridex.gateway

import android.Manifest
import android.content.Context
import android.content.pm.ActivityInfo
import android.os.PowerManager
import android.provider.Settings
import android.net.Uri
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.ridex.gateway.assignment.GatewayAssignmentStore
import com.ridex.gateway.control.GatewayControlSource
import com.ridex.gateway.control.GatewayControlState
import com.ridex.gateway.control.GatewayControlStore
import com.ridex.gateway.data.storage.SecureStorage
import com.ridex.gateway.diagnostics.GatewayDiagnosticEngine
import com.ridex.gateway.diagnostics.GatewayDiagnosticSnapshot
import com.ridex.gateway.gateway.GatewayForegroundService
import com.ridex.gateway.health.GatewayHealthMonitor
import com.ridex.gateway.health.SystemHealthProbe
import com.ridex.gateway.identity.GatewayIdentity
import com.ridex.gateway.identity.GatewayIdentityManager
import com.ridex.gateway.provider.ProviderRuntimeEndpoint
import com.ridex.gateway.provider.auth.HttpProviderAuthClient
import com.ridex.gateway.provider.config.GatewaySignedConfigStore
import com.ridex.gateway.provider.control.GatewayOperationalConfigStore
import com.ridex.gateway.provider.control.RemoteCommandAuditStore
import com.ridex.gateway.provider.control.RemoteCommandJournalStore
import com.ridex.gateway.provider.session.GatewayProviderSessionManager
import com.ridex.gateway.provider.session.ProviderSessionState
import com.ridex.gateway.provider.session.ProviderSessionStore
import com.ridex.gateway.queue.GatewayQueueStore
import com.ridex.gateway.queue.QueueItemState
import com.ridex.gateway.recovery.GatewayRecoveryStore
import com.ridex.gateway.runtime.GatewayRuntimeStatus
import com.ridex.gateway.runtime.GatewayRuntimeStatusStore
import com.ridex.gateway.security.AppSignatureProbe
import com.ridex.gateway.security.ConfigDriftDetector
import com.ridex.gateway.security.DriftSeverity
import com.ridex.gateway.security.GatewaySecurityBaseline
import com.ridex.gateway.sim.SimManager
import com.ridex.gateway.sim.SimSlotInfo
import com.ridex.gateway.sms.AndroidSmsSender
import com.ridex.gateway.sms.SmsResultRecord
import com.ridex.gateway.sms.SmsResultStore
import com.ridex.gateway.ui.theme.RideXGatewayTheme
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/* UI V3: scrolling body */
private enum class GatewayTab(val label: String) {
    OVERVIEW("Overview"),
    DELIVERY("Delivery"),
    SIM("SIM"),
    SECURITY("Security"),
    DIAGNOSTICS("Diagnostics"),
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        window.setFlags(
            android.view.WindowManager.LayoutParams.FLAG_SECURE,
            android.view.WindowManager.LayoutParams.FLAG_SECURE,
        )

        val identity = GatewayIdentityManager(this).getOrCreate()
        val providerSessionStore = ProviderSessionStore(SecureStorage(this))
        val providerSessionState = providerSessionStore.state()

        ContextCompat.startForegroundService(
            this,
            Intent(this, GatewayForegroundService::class.java),
        )

        setContent {
            RideXGatewayTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    GatewayDashboard(
                        identity = identity,
                        initialProviderSessionState = providerSessionState,
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GatewayDashboard(
    identity: GatewayIdentity,
    initialProviderSessionState: ProviderSessionState,
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val simManager = remember(context) { SimManager(context) }
    val runtimeStatusStore = remember(context) { GatewayRuntimeStatusStore(context) }
    val recoveryStore = remember(context) { GatewayRecoveryStore(context) }
    val healthMonitor = remember(context) { GatewayHealthMonitor(context) }
    val controlStore = remember(context) { GatewayControlStore(SecureStorage(context)) }
    val signedConfigStore = remember(context) { GatewaySignedConfigStore(SecureStorage(context)) }
    val diagnosticEngine = remember(context) { GatewayDiagnosticEngine(context) }
    val remoteCommandAuditStore = remember(context) { RemoteCommandAuditStore(SecureStorage(context)) }
    val remoteCommandJournalStore = remember(context) { RemoteCommandJournalStore(SecureStorage(context)) }
    val operationalConfigStore = remember(context) { GatewayOperationalConfigStore(SecureStorage(context)) }
    val assignmentStore = remember(context) { GatewayAssignmentStore(context) }
    val queueStore = remember(context) { GatewayQueueStore(context) }
    val smsSender = remember(context) { AndroidSmsSender(context) }
    val smsResultStore = remember(context) { SmsResultStore(SecureStorage(context)) }
    val appSignatureProbe = remember(context) { AppSignatureProbe(context) }
    val securePrefs = remember(context) {
        context.getSharedPreferences("ridex_gateway_ui_v2", android.content.Context.MODE_PRIVATE)
    }

    val providerSessionManager = remember(context) {
        GatewayProviderSessionManager(
            SecureStorage(context),
            HttpProviderAuthClient(),
        )
    }
    val enrollmentScope = rememberCoroutineScope()

    var selectedTabIndex by rememberSaveable { mutableStateOf(0) }
    var providerSessionUiState by remember { mutableStateOf(initialProviderSessionState) }
    var enrollmentCode by remember { mutableStateOf("") }
    var enrollmentBusy by remember { mutableStateOf(false) }
    var enrollmentError by remember { mutableStateOf<String?>(null) }
    var enrollmentSuccess by remember { mutableStateOf(false) }
    var assignmentState by remember {
        mutableStateOf(assignmentStore.getAssignedMobileNumber().orEmpty())
    }
    var healthSnapshot by remember { mutableStateOf(healthMonitor.read()) }
    var runtimeStatus by remember { mutableStateOf(runtimeStatusStore.read()) }
    var recoverySnapshot by remember { mutableStateOf(recoveryStore.read()) }
    var queueSummary by remember { mutableStateOf(queueStore.summary()) }
    var controlSnapshot by remember { mutableStateOf(controlStore.read()) }
    var diagnosticSnapshot by remember {
        mutableStateOf<GatewayDiagnosticSnapshot?>(diagnosticEngine.readCurrent())
    }
    var remoteCommandAuditCount by remember { mutableStateOf(remoteCommandAuditStore.count()) }
    var remoteCommandLastSequence by remember {
        mutableStateOf(remoteCommandJournalStore.lastAcceptedSequence())
    }
    var operationalConfig by remember { mutableStateOf(operationalConfigStore.read()) }
    var permissionGranted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.READ_PHONE_STATE,
            ) == PackageManager.PERMISSION_GRANTED,
        )
    }
    var smsPermissionGranted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.SEND_SMS,
            ) == PackageManager.PERMISSION_GRANTED,
        )
    }
    var callPermissionGranted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.CALL_PHONE,
            ) == PackageManager.PERMISSION_GRANTED,
        )
    }
    var notificationsGranted by remember {
        mutableStateOf(
            Build.VERSION.SDK_INT < 33 ||
                ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.POST_NOTIFICATIONS,
                ) == PackageManager.PERMISSION_GRANTED,
        )
    }
    var batteryUnrestricted by remember { mutableStateOf(true) }
    var simSlots by remember { mutableStateOf<List<SimSlotInfo>>(emptyList()) }
    var selectedSubscriptionId by rememberSaveable { mutableStateOf<Int?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var smsResult by remember { mutableStateOf<SmsResultRecord?>(smsResultStore.read()) }
    var testRecipient by rememberSaveable { mutableStateOf("") }
    var testMessage by rememberSaveable { mutableStateOf("RideX Gateway test SMS") }
    var testSendAcknowledged by rememberSaveable { mutableStateOf(false) }
    var smsSendError by remember { mutableStateOf<String?>(null) }
    var showFirstRunGuide by rememberSaveable {
        mutableStateOf(!securePrefs.getBoolean("first_run_guide_seen", false))
    }

    fun markGuideSeen() {
        securePrefs.edit().putBoolean("first_run_guide_seen", true).apply()
        showFirstRunGuide = false
    }

    fun refreshSims() {
        if (!permissionGranted) {
            simSlots = emptyList()
            loadError = null
            return
        }
        simManager.getActiveSimSlots()
            .onSuccess { slots ->
                simManager.clearInvalidSelection(slots)
                simSlots = slots
                selectedSubscriptionId = simManager.getSelectedSubscriptionId()
                loadError = null
            }
            .onFailure { error ->
                simSlots = emptyList()
                selectedSubscriptionId = simManager.getSelectedSubscriptionId()
                loadError = error.message ?: "SIM_DISCOVERY_FAILED"
            }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        permissionGranted = granted
        if (granted) refreshSims()
    }

    val smsPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        smsPermissionGranted = granted
        if (!granted) smsSendError = "SEND_SMS_PERMISSION_REQUIRED"
    }

    val callPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        callPermissionGranted = granted
    }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        notificationsGranted = granted
    }

    LaunchedEffect(permissionGranted) {
        refreshSims()
    }

    LaunchedEffect(Unit) {
        while (true) {
            runtimeStatus = runtimeStatusStore.read()
            recoverySnapshot = recoveryStore.read()
            queueSummary = queueStore.summary()
            smsResult = smsResultStore.read()
            healthSnapshot = healthMonitor.refresh()
            controlSnapshot = controlStore.read()
            diagnosticSnapshot = diagnosticEngine.readCurrent()
            remoteCommandAuditCount = remoteCommandAuditStore.count()
            remoteCommandLastSequence = remoteCommandJournalStore.lastAcceptedSequence()
            operationalConfig = operationalConfigStore.read()
            providerSessionUiState = providerSessionManager.getState()

            batteryUnrestricted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
                powerManager?.isIgnoringBatteryOptimizations(context.packageName) ?: false
            } else true
            notificationsGranted = Build.VERSION.SDK_INT < 33 ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            callPermissionGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
            delay(3_000)
        }
    }

    val alerts = buildGatewayAlerts(
        runtimeStatus = runtimeStatus,
        health = healthSnapshot,
        queueSummary = queueSummary,
        control = controlSnapshot,
        providerSessionState = providerSessionUiState,
        selectedSimId = selectedSubscriptionId,
    )

    Scaffold(
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent,
                    titleContentColor = RideXUiColors.TextPrimary,
                    actionIconContentColor = RideXUiColors.Red,
                ),
                title = {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("RIDEX", fontWeight = FontWeight.Black, letterSpacing = 1.6.sp)
                            Text(" / GATEWAY", fontWeight = FontWeight.Medium, color = RideXUiColors.Red)
                        }
                        Text(
                            "SECURE COMMUNICATION NODE • v${BuildConfig.VERSION_NAME}",
                            style = MaterialTheme.typography.labelSmall,
                            color = RideXUiColors.TextMuted,
                        )
                    }
                },
                actions = {
                    SignalBadge(
                        label = if (ProviderRuntimeEndpoint.baseUrl().isBlank()) "OFFLINE" else "TEST NODE",
                        active = ProviderRuntimeEndpoint.baseUrl().isNotBlank(),
                    )
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(HackerBackdropBrush())
                .techGridBackground()
                .padding(innerPadding),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(bottom = 12.dp)
                    .navigationBarsPadding(),
            ) {
                PermissionReadinessCard(
                    readPhoneState = permissionGranted,
                    sms = smsPermissionGranted,
                    call = callPermissionGranted,
                    notifications = notificationsGranted,
                    batteryUnrestricted = batteryUnrestricted,
                    onReadPhoneState = { permissionLauncher.launch(Manifest.permission.READ_PHONE_STATE) },
                    onSms = { smsPermissionLauncher.launch(Manifest.permission.SEND_SMS) },
                    onCall = { callPermissionLauncher.launch(Manifest.permission.CALL_PHONE) },
                    onNotifications = {
                        if (Build.VERSION.SDK_INT >= 33) notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    },
                    onBatterySettings = {
                        runCatching {
                            context.startActivity(
                                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")),
                            )
                        }
                    },
                )
                StatusCard(
                    runtimeStatus = runtimeStatus,
                    queueSummary = queueSummary,
                    alerts = alerts,
                    onOpenDelivery = { selectedTabIndex = GatewayTab.DELIVERY.ordinal },
                )

                ScrollableTabRow(
                    selectedTabIndex = selectedTabIndex,
                    edgePadding = 12.dp,
                ) {
                    GatewayTab.values().forEachIndexed { index, tab ->
                        Tab(
                            selected = selectedTabIndex == index,
                            onClick = { selectedTabIndex = index },
                            text = { Text(tab.label) },
                        )
                    }
                }

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                when (GatewayTab.values()[selectedTabIndex]) {
                    GatewayTab.OVERVIEW -> {
                        OverviewTab(
                            identity = identity,
                            assignmentMobile = assignmentState,
                            runtimeStatus = runtimeStatus,
                            providerSessionState = providerSessionUiState,
                            health = healthSnapshot,
                            queueSummary = queueSummary,
                            recovery = recoverySnapshot,
                            alerts = alerts,
                            selectedSubscriptionId = selectedSubscriptionId,
                        )
                    }

                    GatewayTab.DELIVERY -> {
                        DeliveryTab(
                            smsPermissionGranted = smsPermissionGranted,
                            selectedSimReady = simSlots.any { it.subscriptionId == selectedSubscriptionId && it.isReady },
                            selectedSubscriptionId = selectedSubscriptionId,
                            recipient = testRecipient,
                            message = testMessage,
                            acknowledged = testSendAcknowledged,
                            lastResult = smsResult,
                            error = smsSendError,
                            runtimeStatus = runtimeStatus,
                            queueSummary = queueSummary,
                            onRequestPermission = {
                                smsPermissionLauncher.launch(Manifest.permission.SEND_SMS)
                            },
                            onRecipientChange = {
                                testRecipient = it
                                smsSendError = null
                            },
                            onMessageChange = {
                                testMessage = it
                                smsSendError = null
                            },
                            onAcknowledgedChange = { testSendAcknowledged = it },
                            onSend = {
                                val subscriptionId = selectedSubscriptionId
                                if (subscriptionId != null) {
                                    smsSendError = null
                                    smsSender.send(
                                        com.ridex.gateway.sms.SmsSendRequest(
                                            requestId = UUID.randomUUID().toString(),
                                            recipient = testRecipient.trim(),
                                            message = testMessage,
                                            subscriptionId = subscriptionId,
                                        ),
                                    ).onFailure { error ->
                                        smsSendError = error.message ?: "SMS_SEND_FAILED"
                                    }
                                }
                            },
                        )
                    }

                    GatewayTab.SIM -> {
                        SimTab(
                            permissionGranted = permissionGranted,
                            simSlots = simSlots,
                            selectedSubscriptionId = selectedSubscriptionId,
                            loadError = loadError,
                            onRequestPermission = {
                                permissionLauncher.launch(Manifest.permission.READ_PHONE_STATE)
                            },
                            onRefresh = { refreshSims() },
                            onSelect = { subscriptionId ->
                                simManager.selectSubscription(subscriptionId, simSlots)
                                    .onSuccess { selectedSubscriptionId = subscriptionId }
                                    .onFailure { error -> loadError = error.message ?: "SIM_SELECTION_FAILED" }
                            },
                        )

                        SectionCard("Provider Authentication") {
                            AuthenticationSection(
                                assignmentState = assignmentState,
                                enrollmentCode = enrollmentCode,
                                providerSessionUiState = providerSessionUiState,
                                enrollmentBusy = enrollmentBusy,
                                enrollmentSuccess = enrollmentSuccess,
                                enrollmentError = enrollmentError,
                                onAssignmentChange = {
                                    assignmentState = it
                                    enrollmentError = null
                                    enrollmentSuccess = false
                                },
                                onEnrollmentCodeChange = {
                                    enrollmentCode = it
                                    enrollmentError = null
                                    enrollmentSuccess = false
                                },
                                onEnroll = {
                                    val assignedMobile = assignmentState.trim()
                                    val code = enrollmentCode.trim()
                                    val baseUrl = ProviderRuntimeEndpoint.baseUrl()
                                    val validMobile = assignedMobile.isNotBlank() &&
                                        Regex("^\\+?[0-9]{10,15}$").matches(assignedMobile)
                                    when {
                                        !validMobile -> enrollmentError = "ASSIGNED_MOBILE_NUMBER_REQUIRED_OR_INVALID"
                                        code.isBlank() -> enrollmentError = "ENROLLMENT_CODE_REQUIRED"
                                        baseUrl.isBlank() -> enrollmentError = "PROVIDER_BASE_URL_NOT_CONFIGURED"
                                        else -> {
                                            enrollmentBusy = true
                                            enrollmentError = null
                                            enrollmentSuccess = false
                                            enrollmentScope.launch {
                                                val result = withContext(Dispatchers.IO) {
                                                    runCatching {
                                                        val configuredUrl = ProviderRuntimeEndpoint.requireConfiguredHttps()
                                                        assignmentStore.saveAssignedMobileNumber(assignedMobile)
                                                        providerSessionManager.enroll(
                                                            baseUrl = configuredUrl,
                                                            identity = identity,
                                                            appVersion = BuildConfig.VERSION_NAME,
                                                            enrollmentCode = code,
                                                            assignedMobileNumber = assignedMobile,
                                                        ).getOrThrow()
                                                    }
                                                }
                                                enrollmentBusy = false
                                                enrollmentCode = ""
                                                result.onSuccess {
                                                    providerSessionUiState = providerSessionManager.getState()
                                                    controlSnapshot = controlStore.read()
                                                    enrollmentSuccess = true
                                                }.onFailure { error ->
                                                    enrollmentError = error.message ?: "PROVIDER_ENROLLMENT_FAILED"
                                                    enrollmentSuccess = false
                                                }
                                            }
                                        }
                                    }
                                },
                            )
                        }
                    }

                    GatewayTab.SECURITY -> {
                        SecurityTab(
                            controlSnapshot = controlSnapshot,
                            controlStore = controlStore,
                            health = healthSnapshot,
                            signedConfigStore = signedConfigStore,
                            appSignatureProbe = appSignatureProbe,
                            remoteCommandAuditCount = remoteCommandAuditCount,
                            remoteCommandLastSequence = remoteCommandLastSequence,
                        )
                    }

                    GatewayTab.DIAGNOSTICS -> {
                        DiagnosticsTab(
                            runtimeStatus = runtimeStatus,
                            health = healthSnapshot,
                            recovery = recoverySnapshot,
                            queueSummary = queueSummary,
                            diagnosticSnapshot = diagnosticSnapshot,
                            operationalConfig = operationalConfig,
                            onRunDiagnostic = {
                                diagnosticSnapshot = diagnosticEngine.capture()
                            },
                        )
                    }
                }
            }
        }
    }
    }

    if (showFirstRunGuide) {
        AlertDialog(
            onDismissRequest = { markGuideSeen() },
            title = { Text("Welcome to RideX Gateway") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    GuideStep("1", "Provider", "Enroll this Gateway with the one-time Provider code.")
                    GuideStep("2", "SIM", "Select the SIM that will actually send SMS and make calls.")
                    GuideStep("3", "Run", "The foreground service keeps heartbeat and delivery workers running.")
                    GuideStep("4", "Delivery", "Backend-created messages arrive through the secure Provider queue.")
                    GuideStep("5", "Monitor", "Use Delivery and Diagnostics to see queue sync, errors and results.")
                }
            },
            confirmButton = {
                Button(onClick = { markGuideSeen() }) {
                    Text("Got it")
                }
            },
        )
    }
}

private fun buildGatewayAlerts(
    runtimeStatus: GatewayRuntimeStatus,
    health: com.ridex.gateway.health.GatewayHealthSnapshot?,
    queueSummary: com.ridex.gateway.queue.QueueSummary,
    control: com.ridex.gateway.control.GatewayControlSnapshot,
    providerSessionState: ProviderSessionState,
    selectedSimId: Int?,
): List<String> = buildList {
    if (!runtimeStatus.serviceRunning) add("Gateway foreground service is not running")
    if (runtimeStatus.providerState.name in setOf("NETWORK_UNAVAILABLE", "HTTP_ERROR", "REJECTED")) {
        add("Provider connection requires attention")
    }
    if (providerSessionState.name != "AUTHENTICATED") add("Provider session is not authenticated")
    if (control.state != GatewayControlState.NORMAL) add("Gateway control state: ${control.state.name}")
    if (selectedSimId == null || health?.selectedSimReady != true) add("Communication SIM is not ready")
    if (queueSummary.retryWait > 0) add("${queueSummary.retryWait} SMS waiting for retry")
    if (queueSummary.failed > 0) add("${queueSummary.failed} SMS delivery failures need review")
    if (!runtimeStatus.lastSmsQueueError.isNullOrBlank()) add("Last SMS queue error: ${runtimeStatus.lastSmsQueueError}")
    if (runtimeStatus.lastError != null) add("Last provider error: ${runtimeStatus.lastError}")
}

@Composable
private fun StatusCard(
    runtimeStatus: GatewayRuntimeStatus,
    queueSummary: com.ridex.gateway.queue.QueueSummary,
    alerts: List<String>,
    onOpenDelivery: () -> Unit,
) {
    val healthy = runtimeStatus.serviceRunning && runtimeStatus.providerState.name !in setOf("NETWORK_UNAVAILABLE", "HTTP_ERROR", "REJECTED")
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = RideXUiColors.Panel),
        border = androidx.compose.foundation.BorderStroke(1.dp, RideXUiColors.Border),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Brush.linearGradient(listOf(RideXUiColors.PanelElevated, RideXUiColors.Panel)))
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("NODE STATUS", style = MaterialTheme.typography.labelSmall, color = RideXUiColors.TextMuted, letterSpacing = 1.5.sp)
                    Spacer(Modifier.height(2.dp))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StatusDot(active = healthy)
                        Text(
                            if (runtimeStatus.serviceRunning) "OPERATIONAL" else "STOPPED",
                            style = MaterialTheme.typography.headlineSmall.copy(fontFamily = FontFamily.Monospace),
                            fontWeight = FontWeight.Black,
                            color = if (healthy) RideXUiColors.Green else RideXUiColors.Red,
                        )
                    }
                }
                AssistChip(
                    onClick = onOpenDelivery,
                    label = { Text("QUEUE ${queueSummary.queued + queueSummary.processing}") },
                    colors = androidx.compose.material3.AssistChipDefaults.assistChipColors(
                        containerColor = RideXUiColors.PanelStrong,
                        labelColor = RideXUiColors.TextPrimary,
                    ),
                    border = androidx.compose.foundation.BorderStroke(1.dp, RideXUiColors.Border),
                )
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MetricBox("PROVIDER", runtimeStatus.providerState.name.replace('_', ' '), Modifier.weight(1f), healthy)
                MetricBox("PENDING", (queueSummary.queued + queueSummary.processing).toString(), Modifier.weight(1f), false)
                MetricBox("ALERTS", alerts.size.toString(), Modifier.weight(1f), alerts.isEmpty())
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    alerts.firstOrNull() ?: "ALL PRIMARY TELEMETRY CHANNELS CLEAR",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (alerts.isEmpty()) RideXUiColors.TextSecondary else RideXUiColors.Warning,
                    fontFamily = FontFamily.Monospace,
                )
            }
        }
    }
}

@Composable
private fun PermissionReadinessCard(
    readPhoneState: Boolean,
    sms: Boolean,
    call: Boolean,
    notifications: Boolean,
    batteryUnrestricted: Boolean,
    onReadPhoneState: () -> Unit,
    onSms: () -> Unit,
    onCall: () -> Unit,
    onNotifications: () -> Unit,
    onBatterySettings: () -> Unit,
) {
    val allCritical = readPhoneState && sms && call && notifications && batteryUnrestricted
    SectionCard(title = "FIRST-RUN SYSTEM READINESS", subtitle = if (allCritical) "READY FOR CONTINUOUS OPERATION" else "ACTION REQUIRED") {
        PermissionLine("READ_PHONE_STATE", readPhoneState, onReadPhoneState, button = "ALLOW")
        PermissionLine("SEND_SMS", sms, onSms, button = "ALLOW")
        PermissionLine("CALL_PHONE", call, onCall, button = "ALLOW")
        PermissionLine("POST_NOTIFICATIONS", notifications, onNotifications, button = "ALLOW", enabled = Build.VERSION.SDK_INT >= 33)
        PermissionLine("BATTERY / BACKGROUND", batteryUnrestricted, onBatterySettings, button = "CHECK")
        Text(
            "The Gateway uses a foreground service for continuous heartbeat and delivery work. Battery/autostart policies remain device-specific.",
            style = MaterialTheme.typography.bodySmall,
            color = RideXUiColors.TextMuted,
            fontFamily = FontFamily.Monospace,
        )
    }
}

@Composable
private fun PermissionLine(label: String, ready: Boolean, onAction: () -> Unit, button: String, enabled: Boolean = true) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        StatusDot(active = ready)
        Text(label, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace, modifier = Modifier.weight(1f), color = RideXUiColors.TextSecondary)
        if (!ready) {
            OutlinedButton(onClick = onAction, enabled = enabled, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 4.dp)) {
                Text(button, style = MaterialTheme.typography.labelSmall)
            }
        } else {
            Text("READY", style = MaterialTheme.typography.labelSmall, color = RideXUiColors.Green, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun SignalBadge(label: String, active: Boolean) {
    Surface(
        shape = RoundedCornerShape(50),
        color = RideXUiColors.PanelStrong,
        border = androidx.compose.foundation.BorderStroke(1.dp, if (active) RideXUiColors.BorderStrong else RideXUiColors.Red),
    ) {
        Row(modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            StatusDot(active = active)
            Text(label, style = MaterialTheme.typography.labelSmall, fontFamily = FontFamily.Monospace, color = RideXUiColors.TextPrimary)
        }
    }
}

@Composable
private fun StatusDot(active: Boolean) {
    Box(
        modifier = Modifier
            .size(9.dp)
            .clip(CircleShape)
            .background(if (active) RideXUiColors.Green else RideXUiColors.Red),
    )
}

@Composable
private fun MetricBox(label: String, value: String, modifier: Modifier, positive: Boolean) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        color = RideXUiColors.PanelStrong,
        border = androidx.compose.foundation.BorderStroke(1.dp, RideXUiColors.Border),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = RideXUiColors.TextMuted, fontFamily = FontFamily.Monospace)
            Spacer(Modifier.height(3.dp))
            Text(value, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, color = if (positive) RideXUiColors.TextPrimary else RideXUiColors.Warning)
        }
    }
}

@Composable
private fun OverviewTab(
    identity: GatewayIdentity,
    assignmentMobile: String,
    runtimeStatus: GatewayRuntimeStatus,
    providerSessionState: ProviderSessionState,
    health: com.ridex.gateway.health.GatewayHealthSnapshot?,
    queueSummary: com.ridex.gateway.queue.QueueSummary,
    recovery: com.ridex.gateway.recovery.GatewayRecoverySnapshot,
    alerts: List<String>,
    selectedSubscriptionId: Int?,
) {
    SectionCard("At a glance") {
        HealthRow("Gateway service", if (runtimeStatus.serviceRunning) "RUNNING" else "STOPPED")
        HealthRow("Provider", runtimeStatus.providerState.name)
        HealthRow("Provider session", providerSessionState.name)
        HealthRow("Network", networkLabel(runtimeStatus))
        HealthRow("Selected SIM", selectedSubscriptionId?.toString() ?: "NOT SELECTED")
        HealthRow("Last heartbeat", runtimeStatus.lastHeartbeatAtEpochMs?.let(::formatEpoch) ?: "NOT RUN")
        HealthRow("Last queue sync", runtimeStatus.lastSmsQueueSyncAtEpochMs?.let(::formatEpoch) ?: "NOT RUN")
    }

    if (alerts.isNotEmpty()) {
        SectionCard("Attention") {
            alerts.take(6).forEach { message ->
                Text(
                    "• $message",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(vertical = 4.dp),
                )
            }
        }
    }

    SectionCard("Gateway identity") {
        IdentityRow("Gateway ID", identity.gatewayId)
        IdentityRow("Assigned mobile", assignmentMobile.ifBlank { "NOT ASSIGNED" })
        IdentityRow("Device ID", identity.deviceId)
        IdentityRow("Installation ID", identity.installationId)
        HealthRow("Local secure storage", "ANDROID KEYSTORE")
    }

    SectionCard("Delivery snapshot") {
        HealthRow("Queued", queueSummary.queued.toString())
        HealthRow("Leased", queueSummary.leased.toString())
        HealthRow("Processing", queueSummary.processing.toString())
        HealthRow("Retry wait", queueSummary.retryWait.toString())
        HealthRow("Sent", queueSummary.sent.toString())
        HealthRow("Failed", queueSummary.failed.toString())
        HealthRow("Last fetch", runtimeStatus.lastSmsQueueFetchedCount.toString())
        HealthRow("Last added", runtimeStatus.lastSmsQueueAddedCount.toString())
        HealthRow("Last result", runtimeStatus.lastSmsQueueSyncResult)
        runtimeStatus.lastSmsQueueRequestId?.let { HealthRow("Last request", it) }
        runtimeStatus.lastSmsQueueError?.let { HealthRow("Last queue error", it) }
    }

    SectionCard("Recovery") {
        HealthRow("Last recovery", recovery.lastRecoveryAction)
        HealthRow("Watchdog restarts", recovery.watchdogRestartCount.toString())
        HealthRow("Sticky service", "ENABLED")
        HealthRow("Boot auto-start", "ENABLED")
    }
}

@Composable
private fun DeliveryTab(
    smsPermissionGranted: Boolean,
    selectedSimReady: Boolean,
    selectedSubscriptionId: Int?,
    recipient: String,
    message: String,
    acknowledged: Boolean,
    lastResult: SmsResultRecord?,
    error: String?,
    runtimeStatus: GatewayRuntimeStatus,
    queueSummary: com.ridex.gateway.queue.QueueSummary,
    onRequestPermission: () -> Unit,
    onRecipientChange: (String) -> Unit,
    onMessageChange: (String) -> Unit,
    onAcknowledgedChange: (Boolean) -> Unit,
    onSend: () -> Unit,
) {
    SectionCard("Provider → Gateway queue") {
        HealthRow("Sync state", runtimeStatus.lastSmsQueueSyncResult)
        HealthRow("Last sync", runtimeStatus.lastSmsQueueSyncAtEpochMs?.let(::formatEpoch) ?: "NOT RUN")
        HealthRow("Fetched", runtimeStatus.lastSmsQueueFetchedCount.toString())
        HealthRow("Added locally", runtimeStatus.lastSmsQueueAddedCount.toString())
        HealthRow("Local queue", "Q=${queueSummary.queued} P=${queueSummary.processing} R=${queueSummary.retryWait}")
        runtimeStatus.lastSmsQueueRequestId?.let { HealthRow("Request", it) }
        runtimeStatus.lastSmsQueueError?.let { errorValue ->
            Text(
                "Last queue error: $errorValue",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
        Text(
            "Automatic path: Provider queue → Gateway local queue → Android SMS → result reconciliation → Provider → Backend.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    SectionCard("SMS delivery lifecycle") {
        HealthRow("Queued", queueSummary.queued.toString())
        HealthRow("Processing", queueSummary.processing.toString())
        HealthRow("Retry wait", queueSummary.retryWait.toString())
        HealthRow("Sent", queueSummary.sent.toString())
        HealthRow("Failed", queueSummary.failed.toString())
        HealthRow("Idempotency", "REQUEST ID")
        HealthRow("Provider result", "BACKEND OUTBOX")
    }

    SectionCard("Real SMS engine — TEST ONLY") {
        Text(
            "This sends a real SMS through the selected Android subscription. Use only for controlled testing.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        HealthRow("SEND_SMS permission", if (smsPermissionGranted) "READY" else "REQUIRED")
        HealthRow("Selected SIM", selectedSubscriptionId?.toString() ?: "NOT SELECTED")
        HealthRow("Selected SIM state", if (selectedSimReady) "READY" else "NOT READY")
        if (!smsPermissionGranted) {
            Button(onClick = onRequestPermission) { Text("Allow SMS permission") }
            Spacer(Modifier.height(6.dp))
        }
        OutlinedTextField(
            value = recipient,
            onValueChange = onRecipientChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Test recipient") },
            singleLine = true,
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = message,
            onValueChange = onMessageChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Test message") },
            minLines = 3,
        )
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = acknowledged, onCheckedChange = onAcknowledgedChange)
            Text("I understand this sends a real SMS.", style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.height(8.dp))
        Button(
            onClick = onSend,
            enabled = smsPermissionGranted && selectedSubscriptionId != null && selectedSimReady &&
                recipient.trim().isNotEmpty() && message.isNotBlank() && acknowledged,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Send Test SMS") }
        error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.height(8.dp))
        if (lastResult != null) {
            HealthRow("Last request", lastResult.requestId)
            HealthRow("Last result", lastResult.status.name)
            HealthRow("Completed", "${lastResult.completedParts}/${lastResult.totalParts}")
            lastResult.failureCode?.let { HealthRow("Failure", it) }
        } else {
            Text("No local SMS result yet.", style = MaterialTheme.typography.bodySmall)
        }
    }

    SectionCard("Call delivery") {
        HealthRow("Last sync", runtimeStatus.lastCallCycleAtEpochMs?.let(::formatEpoch) ?: "NOT RUN")
        HealthRow("Sync result", runtimeStatus.lastCallCycleResult)
        HealthRow("Ingested", runtimeStatus.lastCallIngestedCount.toString())
        runtimeStatus.lastCallError?.let { HealthRow("Last error", it) }
        Text(
            "Calls use the same Provider → Gateway separation. Provider decides the request; the Gateway executes the selected SIM call lifecycle.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun SimTab(
    permissionGranted: Boolean,
    simSlots: List<SimSlotInfo>,
    selectedSubscriptionId: Int?,
    loadError: String?,
    onRequestPermission: () -> Unit,
    onRefresh: () -> Unit,
    onSelect: (Int) -> Unit,
) {
    SectionCard("Communication SIM") {
        if (!permissionGranted) {
            Text(
                "SIM access is required to discover active subscriptions. The Gateway does not need SMS-reading access for this workflow.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            Button(onClick = onRequestPermission) { Text("Allow SIM access") }
        } else if (simSlots.isEmpty()) {
            Text(
                if (loadError == null) "No active SIM subscription detected." else "Unable to load SIM subscriptions.",
                style = MaterialTheme.typography.bodySmall,
            )
            loadError?.let {
                Spacer(Modifier.height(4.dp))
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onRefresh) { Text("Refresh SIM status") }
        } else {
            Text(
                "Select exactly one SIM for Gateway delivery. The subscription ID is stored securely; phone numbers and ICCIDs are not collected.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            simSlots.forEach { slot ->
                SimChoiceCard(slot, selectedSubscriptionId == slot.subscriptionId, { onSelect(slot.subscriptionId) })
                Spacer(Modifier.height(8.dp))
            }
            loadError?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(6.dp))
            }
            OutlinedButton(onClick = onRefresh) { Text("Refresh SIM status") }
        }
    }
}

@Composable
private fun AuthenticationSection(
    assignmentState: String,
    enrollmentCode: String,
    providerSessionUiState: ProviderSessionState,
    enrollmentBusy: Boolean,
    enrollmentSuccess: Boolean,
    enrollmentError: String?,
    onAssignmentChange: (String) -> Unit,
    onEnrollmentCodeChange: (String) -> Unit,
    onEnroll: () -> Unit,
) {
    HealthRow("Session", providerSessionUiState.name)
    HealthRow("Enrollment", "ONE-TIME CODE")
    HealthRow("Access token", "KEYSTORE ENCRYPTED")
    HealthRow("Refresh token", "KEYSTORE ENCRYPTED")
    HealthRow("Transport", "HTTPS ONLY")
    HealthRow("Provider endpoint", if (ProviderRuntimeEndpoint.baseUrl().isBlank()) "NOT CONFIGURED" else "CONFIGURED")
    Spacer(Modifier.height(8.dp))
    OutlinedTextField(
        value = assignmentState,
        onValueChange = onAssignmentChange,
        modifier = Modifier.fillMaxWidth(),
        label = { Text("Assigned Gateway mobile") },
        placeholder = { Text("10–15 digit number") },
        singleLine = true,
    )
    Spacer(Modifier.height(8.dp))
    OutlinedTextField(
        value = enrollmentCode,
        onValueChange = onEnrollmentCodeChange,
        modifier = Modifier.fillMaxWidth(),
        label = { Text("Provider enrollment code") },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
    )
    Spacer(Modifier.height(8.dp))
    Button(
        onClick = onEnroll,
        modifier = Modifier.fillMaxWidth(),
        enabled = !enrollmentBusy && enrollmentCode.isNotBlank() && assignmentState.isNotBlank() && ProviderRuntimeEndpoint.baseUrl().isNotBlank(),
    ) { Text(if (enrollmentBusy) "Enrolling…" else "Enroll Gateway") }
    if (enrollmentSuccess) {
        Spacer(Modifier.height(6.dp))
        Text("Enrollment successful. Session is stored securely.", style = MaterialTheme.typography.bodySmall)
    }
    enrollmentError?.let {
        Spacer(Modifier.height(6.dp))
        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun SecurityTab(
    controlSnapshot: com.ridex.gateway.control.GatewayControlSnapshot,
    controlStore: GatewayControlStore,
    health: com.ridex.gateway.health.GatewayHealthSnapshot?,
    signedConfigStore: GatewaySignedConfigStore,
    appSignatureProbe: AppSignatureProbe,
    remoteCommandAuditCount: Int,
    remoteCommandLastSequence: Long?,
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val securityScope = rememberCoroutineScope()
    val selinuxProbe = remember(context) { SystemHealthProbe(context) }
    var selinuxVerificationMessage by remember { mutableStateOf<String?>(null) }

    SectionCard("Gateway control") {
        HealthRow("Control state", controlSnapshot.state.name)
        HealthRow("Control source", controlSnapshot.source.name)
        HealthRow("Communication", if (controlSnapshot.communicationAllowed) "ALLOWED" else "BLOCKED")
        HealthRow("Reason", controlSnapshot.reason ?: "NONE")
        if (controlSnapshot.state != GatewayControlState.REVOKED) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = {
                        val next = if (controlSnapshot.state == GatewayControlState.MAINTENANCE) GatewayControlState.NORMAL else GatewayControlState.MAINTENANCE
                        controlStore.setState(
                            state = next,
                            reason = if (next == GatewayControlState.MAINTENANCE) "LOCAL_MAINTENANCE" else "LOCAL_RESUME",
                            source = GatewayControlSource.LOCAL,
                        )
                    },
                    enabled = controlSnapshot.state != GatewayControlState.SAFE_MODE,
                ) { Text(if (controlSnapshot.state == GatewayControlState.MAINTENANCE) "Resume" else "Maintenance") }
                OutlinedButton(
                    onClick = {
                        val next = if (controlSnapshot.state == GatewayControlState.SAFE_MODE) GatewayControlState.NORMAL else GatewayControlState.SAFE_MODE
                        controlStore.setState(
                            state = next,
                            reason = if (next == GatewayControlState.SAFE_MODE) "LOCAL_SAFE_MODE" else "LOCAL_SAFE_MODE_EXIT",
                            source = GatewayControlSource.LOCAL,
                        )
                    },
                    enabled = controlSnapshot.state != GatewayControlState.MAINTENANCE,
                ) { Text(if (controlSnapshot.state == GatewayControlState.SAFE_MODE) "Exit Safe Mode" else "Safe Mode") }
            }
        } else {
            Text(
                "Gateway is revoked by Provider authority. Fresh enrollment is required before communication can resume.",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }

    val signedConfig = signedConfigStore.readCurrent()
    val appSignature = appSignatureProbe.sha256Hex()
    val drift = health?.let {
        ConfigDriftDetector.evaluate(
            baseline = GatewaySecurityBaseline(),
            health = it,
            appSignatureSha256 = appSignature,
        )
    }

    SectionCard("Signed configuration & integrity") {
        HealthRow("Provider config", signedConfig?.configVersion?.let { "VERSION $it" } ?: "NOT PROVISIONED")
        HealthRow("Trusted key", signedConfig?.keyId ?: "NOT CONFIGURED")
        HealthRow("Config fingerprint", signedConfig?.fingerprintSha256?.take(12)?.uppercase() ?: "NONE")
        HealthRow("App signature", appSignature?.take(12)?.uppercase() ?: "UNAVAILABLE")
        HealthRow("Integrity", when (drift?.severity) {
            DriftSeverity.BLOCK -> "BLOCK"
            DriftSeverity.WARNING -> "WARNING"
            DriftSeverity.CLEAR -> "CLEAR"
            null -> "NOT EVALUATED"
        })
        drift?.reasons?.take(4)?.forEach { HealthRow("Drift", it) }
    }

    SectionCard("Remote command security") {
        HealthRow("Authority", "SUPER ADMIN ONLY")
        HealthRow("Signing", "ED25519 / PINNED KEY")
        HealthRow("Replay protection", "COMMAND ID + SEQUENCE")
        HealthRow("Critical approvals", "2 DISTINCT SUPER ADMINS")
        HealthRow("Audit records", remoteCommandAuditCount.toString())
        HealthRow("Last accepted sequence", remoteCommandLastSequence?.toString() ?: "NONE")
    }

    SectionCard("Device security") {
        HealthRow("Encryption", when (health?.encryptionEnabled) { true -> "ENCRYPTED"; false -> "NOT ENCRYPTED"; null -> "UNKNOWN" })
        HealthRow("SELinux", when (health?.selinuxEnforcing) { true -> "ENFORCING"; false -> "NOT ENFORCING"; null -> "UNKNOWN" })
        HealthRow("Verified Boot", health?.verifiedBootState ?: "UNKNOWN")
        HealthRow("Bootloader", when (health?.bootloaderUnlocked) { true -> "UNLOCKED"; false -> "LOCKED"; null -> "UNKNOWN" })

        Spacer(Modifier.height(8.dp))

        Button(
            onClick = {
                selinuxVerificationMessage = "Verifying SELinux..."
                securityScope.launch {
                    val result = withContext(Dispatchers.IO) {
                        selinuxProbe.verifySelinuxEnforcing()
                    }

                    result
                        .onSuccess { enforcing ->
                            selinuxVerificationMessage =
                                if (enforcing) {
                                    "SELinux verified: ENFORCING for current boot"
                                } else {
                                    "SELinux verification failed: NOT ENFORCING"
                                }
                        }
                        .onFailure { error ->
                            selinuxVerificationMessage =
                                "SELinux verification failed: ${
                                    error.message ?: "SELINUX_VERIFICATION_FAILED"
                                }"
                        }
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Verify SELinux")
        }

        selinuxVerificationMessage?.let {
            Spacer(Modifier.height(4.dp))
            Text(
                it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Text(
            "Security diagnostics are read-only; the Gateway does not alter root, modules or system boot configuration.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun DiagnosticsTab(
    runtimeStatus: GatewayRuntimeStatus,
    health: com.ridex.gateway.health.GatewayHealthSnapshot?,
    recovery: com.ridex.gateway.recovery.GatewayRecoverySnapshot,
    queueSummary: com.ridex.gateway.queue.QueueSummary,
    diagnosticSnapshot: GatewayDiagnosticSnapshot?,
    operationalConfig: com.ridex.gateway.provider.control.GatewayOperationalConfig,
    onRunDiagnostic: () -> Unit,
) {
    SectionCard("Health") {
        HealthRow("Overall", health?.state?.name ?: "NOT EVALUATED")
        HealthRow("Gateway service", if (health?.serviceRunning == true) "RUNNING" else "STOPPED")
        HealthRow("Provider", if (health?.providerConnected == true) "CONNECTED" else "NOT CONNECTED")
        HealthRow("Network", when {
            health?.networkValidated == true -> "VALIDATED"
            health?.networkAvailable == true -> "CONNECTED / UNVALIDATED"
            else -> "UNAVAILABLE"
        })
        HealthRow("SIM service", if (health?.selectedSimReady == true) "READY" else "NOT READY")
        HealthRow("Battery", health?.batteryPercent?.let { "$it%" } ?: "UNKNOWN")
        HealthRow("Charging", when (health?.charging) { true -> "YES"; false -> "NO"; null -> "UNKNOWN" })
        HealthRow("Storage free", health?.storageFreePercent?.let { "$it%" } ?: "UNKNOWN")
        HealthRow("Memory free", health?.memoryAvailablePercent?.let { "$it%" } ?: "UNKNOWN")
        HealthRow("Thermal", health?.thermalHealth?.name ?: "UNKNOWN")
    }

    SectionCard("Queue sync diagnostics") {
        HealthRow("Last sync", runtimeStatus.lastSmsQueueSyncAtEpochMs?.let(::formatEpoch) ?: "NOT RUN")
        HealthRow("Sync result", runtimeStatus.lastSmsQueueSyncResult)
        HealthRow("Fetched", runtimeStatus.lastSmsQueueFetchedCount.toString())
        HealthRow("Added", runtimeStatus.lastSmsQueueAddedCount.toString())
        HealthRow("Local queue", "Q=${queueSummary.queued} L=${queueSummary.leased} P=${queueSummary.processing}")
        HealthRow("Last request", runtimeStatus.lastSmsQueueRequestId ?: "NONE")
        HealthRow("Last error", runtimeStatus.lastSmsQueueError ?: "NONE")
        Text(
            "This is the explicit provider-queue telemetry added so automatic SMS failures cannot disappear silently.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    SectionCard("Recovery & operational config") {
        HealthRow("Last recovery", recovery.lastRecoveryAction)
        HealthRow("Watchdog restarts", recovery.watchdogRestartCount.toString())
        HealthRow("Config version", operationalConfig.version.toString())
        HealthRow("Heartbeat", "${operationalConfig.heartbeatSeconds} SEC")
        HealthRow("Queue poll", "${operationalConfig.queuePollSeconds} SEC")
        HealthRow("SMS daily cap", operationalConfig.localSmsDailyLimit.toString())
        HealthRow("SMS channel", if (operationalConfig.smsEnabled) "ENABLED" else "STOPPED")
        HealthRow("Call channel", if (operationalConfig.callsEnabled) "ENABLED" else "STOPPED")
    }

    SectionCard("Full diagnostic") {
        HealthRow("Diagnostic ID", diagnosticSnapshot?.diagnosticId?.take(8)?.uppercase() ?: "NOT RUN")
        HealthRow("Captured", diagnosticSnapshot?.capturedAtEpochMs?.let(::formatEpoch) ?: "NOT RUN")
        HealthRow("Provider session", diagnosticSnapshot?.providerSessionState?.name ?: "NOT RUN")
        HealthRow("Control", diagnosticSnapshot?.control?.state?.name ?: "NOT RUN")
        HealthRow("Security drift", diagnosticSnapshot?.configDrift?.severity?.name ?: "NOT RUN")
        diagnosticSnapshot?.recommendations?.take(6)?.forEach { HealthRow("Action", it) }
        Spacer(Modifier.height(6.dp))
        Button(onClick = onRunDiagnostic, modifier = Modifier.fillMaxWidth()) {
            Text("Run Full Diagnostic")
        }
        Spacer(Modifier.height(4.dp))
        Text(
            "Diagnostic snapshots exclude OTPs, SMS bodies, access tokens, refresh tokens and credentials.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    SectionCard("Automatic triggers") {
        TriggerRow("Every heartbeat", "Provider session refresh + heartbeat + remote control/command + health + SMS + call + reconciliation")
        TriggerRow("Network restored", "Schedule an accelerated heartbeat recovery cycle")
        TriggerRow("SMS callback", "Reconcile Android result and send Provider result")
        TriggerRow("Worker stale", "Watchdog restarts worker executor")
        TriggerRow("Remote revoke", "Block communication and require fresh enrollment")
        TriggerRow("Safe mode", "Stop delivery work until safe mode is exited")
    }
}

@Composable
private fun TriggerRow(trigger: String, action: String) {
    Column(modifier = Modifier.padding(vertical = 5.dp)) {
        Text(trigger, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
        Text(action, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}

@Composable
private fun GuideStep(number: String, title: String, detail: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
        Surface(
            modifier = Modifier.size(28.dp),
            shape = RoundedCornerShape(50),
            color = MaterialTheme.colorScheme.primary,
        ) {
            BoxCentered { Text(number, color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold) }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun BoxCentered(content: @Composable () -> Unit) {
    androidx.compose.foundation.layout.Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
        content = { content() },
    )
}

@Composable
private fun SimChoiceCard(slot: SimSlotInfo, selected: Boolean, onSelect: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("SIM ${slot.logicalSlot}", fontWeight = FontWeight.SemiBold)
                    Text(slot.displayName, style = MaterialTheme.typography.bodySmall)
                    Text(slot.carrierName, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                FilterChip(selected = selected, onClick = onSelect, label = { Text(if (selected) "Selected" else "Select") })
            }
            Spacer(Modifier.height(6.dp))
            HealthRow("Subscription", slot.subscriptionId.toString())
            HealthRow("State", if (slot.isReady) "READY" else "NOT READY")
        }
    }
}

@Composable
private fun SectionCard(title: String, subtitle: String? = null, content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = RideXUiColors.Panel),
        border = androidx.compose.foundation.BorderStroke(1.dp, RideXUiColors.Border),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(RideXUiColors.PanelElevated, RideXUiColors.Panel)))
                .padding(horizontal = 15.dp, vertical = 14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                Box(modifier = Modifier.size(width = 4.dp, height = 28.dp).clip(RoundedCornerShape(4.dp)).background(RideXUiColors.Red))
                Column(modifier = Modifier.weight(1f)) {
                    Text(title.uppercase(Locale.US), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = RideXUiColors.TextPrimary, fontFamily = FontFamily.Monospace)
                    subtitle?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = RideXUiColors.TextMuted, fontFamily = FontFamily.Monospace) }
                }
            }
            Spacer(Modifier.height(10.dp))
            content()
        }
    }
}

@Composable
private fun HealthRow(label: String, value: String) {
    val upper = value.uppercase(Locale.US)
    val valueColor = when {
        upper.contains("FAIL") || upper.contains("BLOCK") || upper.contains("STOPPED") || upper.contains("UNAVAILABLE") || upper.contains("REVOKED") || upper.contains("ERROR") -> RideXUiColors.Red
        upper.contains("READY") || upper.contains("ONLINE") || upper.contains("CONNECTED") || upper.contains("ALLOWED") || upper.contains("ENABLED") || upper.contains("CLEAR") || upper.contains("SUCCESS") || upper.contains("RUNNING") -> RideXUiColors.Green
        else -> RideXUiColors.TextSecondary
    }
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 7.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = RideXUiColors.TextMuted, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Monospace, color = valueColor, textAlign = TextAlign.End, modifier = Modifier.padding(start = 12.dp))
    }
    HorizontalDivider(color = RideXUiColors.Border)
}

@Composable
private fun IdentityRow(label: String, value: String) {
    Column(modifier = Modifier.padding(vertical = 7.dp)) {
        Text(label.uppercase(Locale.US), style = MaterialTheme.typography.labelSmall, color = RideXUiColors.TextMuted, fontFamily = FontFamily.Monospace)
        Spacer(Modifier.height(3.dp))
        Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, fontFamily = FontFamily.Monospace, color = RideXUiColors.TextPrimary)
    }
    HorizontalDivider(color = RideXUiColors.Border)
}

private fun HackerBackdropBrush(): Brush = Brush.radialGradient(
    colors = listOf(RideXUiColors.BackgroundGlow, RideXUiColors.Background),
    radius = 900f,
)

private fun Modifier.techGridBackground(): Modifier = drawBehind {
    val step = 34.dp.toPx()
    var x = 0f
    while (x <= size.width) {
        drawLine(
            color = RideXUiColors.Border.copy(alpha = 0.24f),
            start = androidx.compose.ui.geometry.Offset(x, 0f),
            end = androidx.compose.ui.geometry.Offset(x, size.height),
            strokeWidth = 1f,
        )
        x += step
    }
    var y = 0f
    while (y <= size.height) {
        drawLine(
            color = RideXUiColors.Border.copy(alpha = 0.18f),
            start = androidx.compose.ui.geometry.Offset(0f, y),
            end = androidx.compose.ui.geometry.Offset(size.width, y),
            strokeWidth = 1f,
        )
        y += step
    }
}

private object RideXUiColors {
    val Background = Color(0xFF07080B)
    val BackgroundGlow = Color(0xFF1A0A0D)
    val Panel = Color(0xFF0D0F14)
    val PanelElevated = Color(0xFF13161D)
    val PanelStrong = Color(0xFF171A22)
    val Border = Color(0xFF242832)
    val BorderStrong = Color(0xFF44303A)
    val Red = Color(0xFFFF304E)
    val Green = Color(0xFF55E38A)
    val Warning = Color(0xFFFFC857)
    val TextPrimary = Color(0xFFF4F6FA)
    val TextSecondary = Color(0xFFD0D4DC)
    val TextMuted = Color(0xFF7C8492)
}

private fun networkLabel(status: GatewayRuntimeStatus): String =
    when {
        !status.network.available -> "UNAVAILABLE"
        status.network.validatedInternet -> "ONLINE"
        else -> "CONNECTED / UNVALIDATED"
    }

private fun formatEpoch(epochMs: Long): String =
    SimpleDateFormat("dd MMM HH:mm:ss", Locale.US).format(Date(epochMs))
