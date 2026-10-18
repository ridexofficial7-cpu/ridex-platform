package com.ridex.gateway.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper

/**
 * Live default-network monitor. It reports only non-sensitive connectivity properties.
 * The Android framework callback is used instead of manifest CONNECTIVITY broadcasts.
 */
class NetworkMonitor(
    context: Context,
    private val onStateChanged: (NetworkRuntimeState) -> Unit,
) {
    private val appContext = context.applicationContext
    private val connectivityManager =
        appContext.getSystemService(ConnectivityManager::class.java)
    private val stateStore = NetworkStateStore(appContext)
    private val handler = Handler(Looper.getMainLooper())
    private var registered = false

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            publish(readCapabilities(network))
        }

        override fun onCapabilitiesChanged(
            network: Network,
            networkCapabilities: NetworkCapabilities,
        ) {
            publish(readCapabilities(network, networkCapabilities))
        }

        override fun onLost(network: Network) {
            publish(NetworkRuntimeState(
                available = false,
                validatedInternet = false,
                metered = true,
                transport = NetworkTransport.NONE,
                lastChangedAtEpochMs = System.currentTimeMillis(),
            ))
        }
    }

    fun currentState(): NetworkRuntimeState = stateStore.read()

    @Synchronized
    fun start() {
        if (registered) return
        connectivityManager.registerDefaultNetworkCallback(callback, handler)
        registered = true
        refreshCurrentNetwork()
    }

    @Synchronized
    fun stop() {
        if (!registered) return
        runCatching { connectivityManager.unregisterNetworkCallback(callback) }
        registered = false
    }

    private fun refreshCurrentNetwork() {
        val network = connectivityManager.activeNetwork
        val state = if (network == null) {
            NetworkRuntimeState(
                available = false,
                validatedInternet = false,
                metered = true,
                transport = NetworkTransport.NONE,
                lastChangedAtEpochMs = System.currentTimeMillis(),
            )
        } else {
            readCapabilities(network)
        }
        publish(state)
    }

    private fun readCapabilities(network: Network): NetworkRuntimeState {
        val capabilities = connectivityManager.getNetworkCapabilities(network)
            ?: return NetworkRuntimeState(
                available = false,
                validatedInternet = false,
                metered = true,
                transport = NetworkTransport.NONE,
                lastChangedAtEpochMs = System.currentTimeMillis(),
            )
        return readCapabilities(network, capabilities)
    }

    private fun readCapabilities(
        @Suppress("UNUSED_PARAMETER") network: Network,
        capabilities: NetworkCapabilities,
    ): NetworkRuntimeState {
        val internet = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        val validated = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        val transport = when {
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> NetworkTransport.WIFI
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> NetworkTransport.MOBILE
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> NetworkTransport.ETHERNET
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> NetworkTransport.VPN
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH) -> NetworkTransport.BLUETOOTH
            else -> NetworkTransport.OTHER
        }

        return NetworkRuntimeState(
            available = internet,
            validatedInternet = validated,
            metered = !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED),
            transport = transport,
            lastChangedAtEpochMs = System.currentTimeMillis(),
        )
    }

    private fun publish(state: NetworkRuntimeState) {
        stateStore.write(state)
        onStateChanged(state)
    }
}
