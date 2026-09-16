package com.winstone.connect.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Winstone Properties brand system for the phone app — the same language the
 * web CRM uses. White / warm ivory working surfaces, deep black type, charcoal
 * for authority surfaces, and one restrained champagne-gold accent.
 *
 * Colour always carries meaning:
 *   gold  = Winstone brand / primary action / key emphasis
 *   black = primary information, authority, navigation
 *   green = complete / successful / synced
 *   amber = attention / warm / pending
 *   red   = urgent / hot / error / failed
 *   blue  = information, technical or system state
 *   grey  = inactive / cold / neutral
 */

// Foundation
val WinWhite = Color(0xFFFFFFFF)
val WinIvory = Color(0xFFFAF9F6)
val WinInk = Color(0xFF0B0B0B)
val WinInkSecondary = Color(0xFF303030)
val WinInkMuted = Color(0xFF667085)
val WinBorder = Color(0xFFD9DDE3)
val WinCharcoal = Color(0xFF111318)

// Champagne gold — warm, muted, metallic; never bright yellow
val WinGold = Color(0xFFB99245)
val WinGoldLight = Color(0xFFC5A35A)
val WinGoldSoft = Color(0xFFF7F1E4)
val WinOnGold = Color(0xFF140F06)

// Semantic states
val WinSuccess = Color(0xFF16835B)
val WinWarning = Color(0xFFB7791F)
val WinError = Color(0xFFC0392B)
val WinInfo = Color(0xFF2563A6)

// Lead temperature
val WinHot = WinError
val WinWarm = WinWarning
val WinCold = WinInkMuted

// Dark surfaces
val WinDarkBackground = Color(0xFF0B0C0F)
val WinDarkSurface = Color(0xFF15171B)
val WinDarkBorder = Color(0xFF272B32)
val WinDarkSecondaryText = Color(0xFFB7BBC3)

// Older screen code refers to these names; they now point at the semantic
// colours above so every screen speaks the same language.
val WinGreen = WinSuccess
val WinGreenSoft = WinGoldSoft
val WinAmber = WinWarning
val WinRed = WinError
val WinLive = WinSuccess
val WinCream = WinWhite
val WinCreamDeep = WinIvory

private val WinstoneLight = lightColorScheme(
    primary = WinGold,
    onPrimary = WinOnGold,
    primaryContainer = WinGoldSoft,
    onPrimaryContainer = WinOnGold,
    secondary = WinCharcoal,
    onSecondary = WinWhite,
    background = WinWhite,
    onBackground = WinInk,
    surface = WinWhite,
    onSurface = WinInk,
    surfaceVariant = WinIvory,
    onSurfaceVariant = WinInkMuted,
    outline = WinBorder,
    outlineVariant = WinBorder,
    error = WinError,
    onError = WinWhite,
)

private val WinstoneDark = darkColorScheme(
    primary = WinGoldLight,
    onPrimary = WinDarkBackground,
    primaryContainer = Color(0xFF221F18),
    onPrimaryContainer = Color(0xFFD8B981),
    secondary = WinDarkSecondaryText,
    onSecondary = WinDarkBackground,
    background = WinDarkBackground,
    onBackground = WinWhite,
    surface = WinDarkSurface,
    onSurface = WinWhite,
    surfaceVariant = WinDarkSurface,
    onSurfaceVariant = WinDarkSecondaryText,
    outline = WinDarkBorder,
    outlineVariant = WinDarkBorder,
    error = Color(0xFFD4574A),
    onError = WinWhite,
)

@Composable
fun WinstoneTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(colorScheme = if (darkTheme) WinstoneDark else WinstoneLight, content = content)
}
