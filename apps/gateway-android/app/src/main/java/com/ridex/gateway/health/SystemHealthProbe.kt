package com.ridex.gateway.health

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Environment
import android.os.PowerManager
import android.os.StatFs
import com.ridex.gateway.data.storage.SecureStorage
import java.util.concurrent.TimeUnit

/** Reads non-secret device health signals using standard Android APIs and harmless system commands. */
class SystemHealthProbe(context: Context) {
    private val appContext = context.applicationContext
    private val secureStorage = SecureStorage(appContext)

    fun readBatteryPercent(): Int? {
        val manager = appContext.getSystemService(BatteryManager::class.java) ?: return null
        val capacity = manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        return capacity.takeIf { it in 0..100 }
    }

    fun readCharging(): Boolean? {
        val intent = appContext.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return null
        return when (intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)) {
            BatteryManager.BATTERY_STATUS_CHARGING,
            BatteryManager.BATTERY_STATUS_FULL -> true
            BatteryManager.BATTERY_STATUS_DISCHARGING,
            BatteryManager.BATTERY_STATUS_NOT_CHARGING -> false
            else -> null
        }
    }

    fun readBatteryTemperatureC(): Double? {
        val intent = appContext.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return null
        val tenths = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE)
        return if (tenths == Int.MIN_VALUE) null else tenths / 10.0
    }

    fun readStorageFreePercent(): Int? {
        val statFs = StatFs(Environment.getDataDirectory().path)
        val total = statFs.totalBytes
        val free = statFs.availableBytes
        if (total <= 0L) return null
        return ((free * 100L) / total).toInt().coerceIn(0, 100)
    }

    fun readMemoryAvailablePercent(): Int? {
        val activityManager = appContext.getSystemService(ActivityManager::class.java) ?: return null
        val info = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(info)
        if (info.totalMem <= 0L) return null
        return ((info.availMem * 100L) / info.totalMem).toInt().coerceIn(0, 100)
    }

    fun readThermalHealth(): ThermalHealth {
        val powerManager = appContext.getSystemService(PowerManager::class.java) ?: return ThermalHealth.UNKNOWN
        return when (powerManager.currentThermalStatus) {
            PowerManager.THERMAL_STATUS_NONE -> ThermalHealth.NORMAL
            PowerManager.THERMAL_STATUS_LIGHT -> ThermalHealth.LIGHT
            PowerManager.THERMAL_STATUS_MODERATE -> ThermalHealth.MODERATE
            PowerManager.THERMAL_STATUS_SEVERE -> ThermalHealth.SEVERE
            PowerManager.THERMAL_STATUS_CRITICAL -> ThermalHealth.CRITICAL
            PowerManager.THERMAL_STATUS_EMERGENCY -> ThermalHealth.SHUTDOWN
            PowerManager.THERMAL_STATUS_SHUTDOWN -> ThermalHealth.SHUTDOWN
            else -> ThermalHealth.UNKNOWN
        }
    }

    fun readClockPlausible(nowEpochMs: Long = System.currentTimeMillis()): Boolean =
        nowEpochMs >= MIN_REASONABLE_EPOCH_MS

    fun readEncryptionEnabled(): Boolean? =
        readProperty("ro.crypto.state")?.equals("encrypted", ignoreCase = true)

    fun readVerifiedBootState(): String? = readProperty("ro.boot.verifiedbootstate")

    fun readBootloaderUnlocked(): Boolean? =
        when (readProperty("ro.boot.vbmeta.device_state")?.lowercase()) {
            "locked" -> false
            "unlocked" -> true
            else -> null
        }

    /**
     * Routine health reads are deliberately root-free. A previously verified SELinux
     * state is trusted only for the current boot session, identified by the kernel boot ID.
     * If no current-boot verification exists, the result is UNKNOWN and the security policy
     * remains fail-closed until the user explicitly performs a privileged verification.
     */
    fun readSelinuxEnforcing(): Boolean? {
        val verifiedBootId = secureStorage.getString(KEY_SELINUX_BOOT_ID)?.trim()?.takeIf { it.isNotEmpty() }
            ?: return null
        val currentBootId = readBootId() ?: return null
        if (verifiedBootId != currentBootId) return null
        return secureStorage.getString(KEY_SELINUX_ENFORCING)?.toBooleanStrictOrNull()
    }

    /**
     * Explicit privileged verification. This is the only normal Gateway code path that
     * invokes `su`. It is user-triggered and the result is cached for the current boot.
     */
    fun verifySelinuxEnforcing(): Result<Boolean> = runCatching {
        val output = runRootCommand("getenforce")?.trim()
            ?: error("SELINUX_PROBE_FAILED")
        val enforcing = when {
            output.equals("Enforcing", ignoreCase = true) -> true
            output.equals("Permissive", ignoreCase = true) -> false
            else -> error("SELINUX_STATE_UNKNOWN")
        }
        val bootId = readBootId() ?: error("BOOT_ID_UNAVAILABLE")
        secureStorage.putString(KEY_SELINUX_ENFORCING, enforcing.toString())
        secureStorage.putString(KEY_SELINUX_BOOT_ID, bootId)
        enforcing
    }

    private fun readBootId(): String? = runCommand("cat", "/proc/sys/kernel/random/boot_id")

    private fun readProperty(name: String): String? = runCommand("getprop", name)

    private fun runRootCommand(command: String): String? = runCatching {
        val process = ProcessBuilder("su", "-c", command)
            .redirectErrorStream(true)
            .start()
        val completed = process.waitFor(3, TimeUnit.SECONDS)
        if (!completed) {
            process.destroyForcibly()
            return@runCatching null
        }
        val output = process.inputStream.bufferedReader().use { it.readText().trim() }
        if (process.exitValue() != 0 || output.isBlank()) null else output
    }.getOrNull()

    private fun runCommand(vararg command: String): String? = runCatching {
        val process = ProcessBuilder(*command)
            .redirectErrorStream(true)
            .start()
        val output = process.inputStream.bufferedReader().use { it.readText().trim() }
        process.waitFor(2, TimeUnit.SECONDS)
        output.ifBlank { null }
    }.getOrNull()

    companion object {
        private const val MIN_REASONABLE_EPOCH_MS = 1_577_836_800_000L // 2020-01-01 UTC
        private const val KEY_SELINUX_ENFORCING = "gateway_selinux_enforcing_v1"
        private const val KEY_SELINUX_BOOT_ID = "gateway_selinux_boot_id_v1"
    }
}
