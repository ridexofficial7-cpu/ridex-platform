package com.ridex.gateway.assignment

import android.content.Context
import com.ridex.gateway.data.storage.SecureStorage

/** Stores the Super Admin-assigned business mobile separately from technical identity fields. */
class GatewayAssignmentStore(context: Context) {
    private val secureStorage = SecureStorage(context.applicationContext)

    fun getAssignedMobileNumber(): String? = secureStorage.getString(KEY_ASSIGNED_MOBILE)?.takeIf { isValidMobile(it) }

    fun saveAssignedMobileNumber(value: String) {
        require(isValidMobile(value)) { "ASSIGNED_MOBILE_NUMBER_INVALID" }
        secureStorage.putString(KEY_ASSIGNED_MOBILE, value.trim())
    }

    private fun isValidMobile(value: String): Boolean = Regex("^\\+?[0-9]{10,15}$").matches(value.trim())

    companion object { private const val KEY_ASSIGNED_MOBILE = "assigned_mobile_number" }
}
