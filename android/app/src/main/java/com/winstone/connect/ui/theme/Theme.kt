package com.winstone.connect.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val WinGreen = Color(0xFF2E9E64)
val WinGreenSoft = Color(0xFFE4F4EA)
val WinCream = Color(0xFFFBF8F0)
val WinCreamDeep = Color(0xFFF4EFE2)
val WinBorder = Color(0xFFE4DECE)
val WinInk = Color(0xFF2B2A25)
val WinInkMuted = Color(0xFF6F6B60)
val WinAmber = Color(0xFFD89A2B)
val WinRed = Color(0xFFC4503F)
val WinLive = Color(0xFF35B473)

private val WinstoneLight = lightColorScheme(
    primary = WinGreen,
    onPrimary = Color.White,
    primaryContainer = WinGreenSoft,
    onPrimaryContainer = Color(0xFF217A4C),
    background = WinCream,
    onBackground = WinInk,
    surface = Color.White,
    onSurface = WinInk,
    surfaceVariant = WinCreamDeep,
    onSurfaceVariant = WinInkMuted,
    outlineVariant = WinBorder,
    error = WinRed,
)

@Composable
fun WinstoneTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = WinstoneLight, content = content)
}
