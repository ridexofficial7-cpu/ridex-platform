package com.ridex.gateway.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight

private val RideXDarkColors = darkColorScheme(
    primary = Color(0xFFFF304E),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFF3A0E16),
    onPrimaryContainer = Color(0xFFFFDADF),
    secondary = Color(0xFF7CE7AA),
    onSecondary = Color(0xFF00210E),
    secondaryContainer = Color(0xFF103824),
    onSecondaryContainer = Color(0xFF9CF8BE),
    background = Color(0xFF07080B),
    onBackground = Color(0xFFF4F6FA),
    surface = Color(0xFF0D0F14),
    onSurface = Color(0xFFF4F6FA),
    surfaceVariant = Color(0xFF171A22),
    onSurfaceVariant = Color(0xFF9DA5B3),
    outline = Color(0xFF343944),
    outlineVariant = Color(0xFF242832),
    error = Color(0xFFFF5C70),
    onError = Color(0xFF2C0010),
)

private val RideXTypography = Typography().run {
    copy(
        headlineLarge = headlineLarge.copy(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Black),
        headlineMedium = headlineMedium.copy(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold),
        headlineSmall = headlineSmall.copy(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold),
        titleLarge = titleLarge.copy(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold),
        titleMedium = titleMedium.copy(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold),
        bodyMedium = bodyMedium.copy(fontFamily = FontFamily.Monospace),
        bodySmall = bodySmall.copy(fontFamily = FontFamily.Monospace),
        labelLarge = labelLarge.copy(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold),
        labelMedium = labelMedium.copy(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold),
        labelSmall = labelSmall.copy(fontFamily = FontFamily.Monospace),
    )
}

@Composable
fun RideXGatewayTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = RideXDarkColors,
        typography = RideXTypography,
        content = content,
    )
}
