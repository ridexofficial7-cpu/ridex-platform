package com.ridex.gateway.provider.session

import org.junit.Assert.assertEquals
import org.junit.Test

class ProviderSessionRotationModelTest {
    @Test fun rotationGenerationDefaultsToOne() {
        val session = ProviderSession("g", "a", "r", 2L, 3L, 1L)
        assertEquals(1L, session.rotationGeneration)
    }

    @Test fun nextGenerationIsMonotonic() {
        val current = ProviderSession("g", "a", "r", 2L, 3L, 1L, rotationGeneration = 4L)
        assertEquals(5L, current.rotationGeneration + 1L)
    }
}
