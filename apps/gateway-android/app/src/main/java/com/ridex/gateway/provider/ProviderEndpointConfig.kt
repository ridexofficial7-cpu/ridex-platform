package com.ridex.gateway.provider

object ProviderEndpointConfig {
    const val BASE_URL: String = ""
    const val CONTROL_STATE_PATH: String = "/gateway/v1/control/state"
    const val CALL_QUEUE_PATH: String = "/gateway/v1/calls/queue"
    const val CALL_RESULT_PATH_TEMPLATE: String = "/gateway/v1/calls/%s/result"
}
