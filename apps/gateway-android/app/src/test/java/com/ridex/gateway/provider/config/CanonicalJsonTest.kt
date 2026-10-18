package com.ridex.gateway.provider.config

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class CanonicalJsonTest {
    @Test
    fun canonicalizationSortsObjectKeysRecursively() {
        val a = JSONObject("{\"b\":2,\"a\":{\"z\":1,\"y\":true}}")
        val b = JSONObject("{\"a\":{\"y\":true,\"z\":1},\"b\":2}")
        assertEquals(CanonicalJson.canonicalizeObject(a), CanonicalJson.canonicalizeObject(b))
    }
}
