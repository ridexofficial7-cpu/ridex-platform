package com.ridex.gateway.sim

/** Runtime information for one active logical SIM slot. */
data class SimSlotInfo(
    val logicalSlot: Int,
    val slotIndex: Int,
    val subscriptionId: Int,
    val displayName: String,
    val carrierName: String,
    val simState: Int,
    val isReady: Boolean,
)
