package com.ridex.gateway.provider.config

/** Provider signing public keys pinned at build time; trust is never learned from network data. */
object ProviderTrustConfig {
    val pinnedEd25519KeysBase64: Map<String, String> = mapOf(
        "ridex-test-command-key-v1" to "MCowBQYDK2VwAyEAgSk8JGifmN8Ps0ERGZe+GnN0IiQcf4q7XdLPT8z/u1w=",
    )
    val pinnedEd25519CommandKeysBase64: Map<String, String> = pinnedEd25519KeysBase64
}
