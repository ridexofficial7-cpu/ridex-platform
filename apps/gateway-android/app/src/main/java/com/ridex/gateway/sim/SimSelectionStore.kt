package com.ridex.gateway.sim

import com.ridex.gateway.data.storage.SecureStorage

/** Persists only the chosen subscription ID; the selected SIM is never stored in plaintext preferences. */
class SimSelectionStore(
    private val secureStorage: SecureStorage,
) {
    fun getSelectedSubscriptionId(): Int? =
        secureStorage.getString(KEY_SELECTED_SUBSCRIPTION_ID)?.toIntOrNull()

    fun setSelectedSubscriptionId(subscriptionId: Int) {
        secureStorage.putString(KEY_SELECTED_SUBSCRIPTION_ID, subscriptionId.toString())
    }

    fun clearSelection() {
        secureStorage.remove(KEY_SELECTED_SUBSCRIPTION_ID)
    }

    companion object {
        private const val KEY_SELECTED_SUBSCRIPTION_ID = "selected_communication_subscription_id_v1"
    }
}
