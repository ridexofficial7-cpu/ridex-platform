package com.ridex.gateway.call

interface CallSender {
    fun place(request: CallRequest): Result<Unit>
}
