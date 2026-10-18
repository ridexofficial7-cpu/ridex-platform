package com.ridex.gateway.provider.call

data class ProviderCallItem(val requestId: String, val recipient: String, val purposeCode: String, val subscriptionId: Int? = null, val createdAtEpochMs: Long = System.currentTimeMillis())
enum class CallDeliveryStatus { STARTED, CONNECTED, ENDED, FAILED }
interface ProviderCallClient {
    fun fetchPending(baseUrl: String, accessToken: String): Result<List<ProviderCallItem>>
    fun postResult(baseUrl: String, accessToken: String, requestId: String, status: CallDeliveryStatus, failureCode: String? = null): Result<Unit>
}
