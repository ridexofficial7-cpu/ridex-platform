package com.ridex.gateway.network

/** Non-sensitive snapshot of the device's currently usable default network. */
data class NetworkRuntimeState(
    val available: Boolean = false,
    val validatedInternet: Boolean = false,
    val metered: Boolean = true,
    val transport: NetworkTransport = NetworkTransport.NONE,
    val lastChangedAtEpochMs: Long? = null,
)

enum class NetworkTransport {
    NONE,
    WIFI,
    MOBILE,
    ETHERNET,
    VPN,
    BLUETOOTH,
    OTHER,
}
