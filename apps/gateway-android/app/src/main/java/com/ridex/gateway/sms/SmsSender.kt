package com.ridex.gateway.sms

/** Abstraction so queue processing can be tested without Android telephony. */
interface SmsSender {
    fun send(request: SmsSendRequest): Result<Unit>
}
