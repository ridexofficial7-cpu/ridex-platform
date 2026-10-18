package com.ridex.gateway.sim

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import com.ridex.gateway.data.storage.SecureStorage

/**
 * Discovers active SIM subscriptions without reading phone numbers or ICCIDs.
 * The app persists the selected subscription ID, not a slot-only assumption.
 */
class SimManager(context: Context) {
    private val appContext = context.applicationContext
    private val subscriptionManager =
        appContext.getSystemService(SubscriptionManager::class.java)
    private val selectionStore = SimSelectionStore(SecureStorage(appContext))

    fun hasReadPhoneStatePermission(): Boolean =
        ContextCompat.checkSelfPermission(
            appContext,
            Manifest.permission.READ_PHONE_STATE,
        ) == PackageManager.PERMISSION_GRANTED

    fun getActiveSimSlots(): Result<List<SimSlotInfo>> {
        if (!hasReadPhoneStatePermission()) {
            return Result.failure(SecurityException("READ_PHONE_STATE_REQUIRED"))
        }

        return runCatching {
            val subscriptions = subscriptionManager?.activeSubscriptionInfoList.orEmpty()

            subscriptions
                .asSequence()
                .filter { it.simSlotIndex == 0 || it.simSlotIndex == 1 }
                .sortedBy { it.simSlotIndex }
                .map { it.toSimSlotInfo() }
                .toList()
        }
    }

    fun getSelectedSubscriptionId(): Int? =
        selectionStore.getSelectedSubscriptionId()

    fun selectSubscription(subscriptionId: Int, available: List<SimSlotInfo>): Result<Unit> = runCatching {
        require(available.any { it.subscriptionId == subscriptionId }) {
            "SIM_SUBSCRIPTION_NOT_ACTIVE"
        }
        selectionStore.setSelectedSubscriptionId(subscriptionId)
    }

    fun clearInvalidSelection(available: List<SimSlotInfo>): Boolean {
        val selected = getSelectedSubscriptionId() ?: return false
        if (available.none { it.subscriptionId == selected }) {
            selectionStore.clearSelection()
            return true
        }
        return false
    }

    private fun SubscriptionInfo.toSimSlotInfo(): SimSlotInfo {
        val slotIndex = simSlotIndex
        val subscriptionId = subscriptionId
        val telephonyManager = appContext
            .getSystemService(TelephonyManager::class.java)
            ?.createForSubscriptionId(subscriptionId)

        val simState = runCatching { telephonyManager?.simState ?: TelephonyManager.SIM_STATE_UNKNOWN }
            .getOrDefault(TelephonyManager.SIM_STATE_UNKNOWN)

        return SimSlotInfo(
            logicalSlot = slotIndex + 1,
            slotIndex = slotIndex,
            subscriptionId = subscriptionId,
            displayName = displayName?.toString()?.trim().orEmpty().ifBlank {
                "SIM ${slotIndex + 1}"
            },
            carrierName = carrierName?.toString()?.trim().orEmpty().ifBlank {
                "Carrier unavailable"
            },
            simState = simState,
            isReady = simState == TelephonyManager.SIM_STATE_READY,
        )
    }
}
