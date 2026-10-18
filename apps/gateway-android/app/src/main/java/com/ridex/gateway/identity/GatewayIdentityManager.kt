package com.ridex.gateway.identity

import android.content.Context
import android.provider.Settings
import com.ridex.gateway.data.storage.SecureStorage
import java.util.UUID

/** Creates and persists the local identity for exactly one Gateway App installation. */
class GatewayIdentityManager(context: Context) {
    private val appContext = context.applicationContext
    private val secureStorage = SecureStorage(appContext)

    @Synchronized
    fun getOrCreate(): GatewayIdentity {
        val existing = readExisting()
        if (existing != null) return existing

        val now = System.currentTimeMillis()
        val identity = GatewayIdentity(
            gatewayId = UUID.randomUUID().toString(),
            deviceId = resolveDeviceId(),
            installationId = UUID.randomUUID().toString(),
            createdAtEpochMs = now,
        )

        secureStorage.putString(KEY_GATEWAY_ID, identity.gatewayId)
        secureStorage.putString(KEY_DEVICE_ID, identity.deviceId)
        secureStorage.putString(KEY_INSTALLATION_ID, identity.installationId)
        secureStorage.putString(KEY_CREATED_AT, identity.createdAtEpochMs.toString())

        return identity
    }

    private fun readExisting(): GatewayIdentity? {
        val gatewayId = secureStorage.getString(KEY_GATEWAY_ID) ?: return null
        val deviceId = secureStorage.getString(KEY_DEVICE_ID) ?: return null
        val installationId = secureStorage.getString(KEY_INSTALLATION_ID) ?: return null
        val createdAt = secureStorage.getString(KEY_CREATED_AT)?.toLongOrNull() ?: return null

        return GatewayIdentity(
            gatewayId = gatewayId,
            deviceId = deviceId,
            installationId = installationId,
            createdAtEpochMs = createdAt,
        )
    }

    private fun resolveDeviceId(): String {
        return Settings.Secure.getString(
            appContext.contentResolver,
            Settings.Secure.ANDROID_ID,
        ).orEmpty().ifBlank { "ANDROID_ID_UNAVAILABLE" }
    }

    companion object {
        private const val KEY_GATEWAY_ID = "gateway_id"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_INSTALLATION_ID = "installation_id"
        private const val KEY_CREATED_AT = "created_at"
    }
}
