package com.winstone.connect.ui

import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.telecom.TelecomManager
import androidx.annotation.RequiresApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.winstone.connect.data.sync.CallSyncQueue
import com.winstone.connect.telephony.CallPhase
import com.winstone.connect.telephony.LiveCallLauncher
import kotlinx.coroutines.delay

/**
 * কলের সময়ের পর্দা — লাইভ টাইমার, রেকর্ডিং চিহ্ন, নোট, মিউট/স্পিকার,
 * কল কাটা এবং কল শেষে ফলাফল (outcome) পাঠানো।
 */
@Composable
fun LiveCallScreen(phase: CallPhase) {
    val context = LocalContext.current
    var notes by remember { mutableStateOf("") }
    var muted by remember { mutableStateOf(false) }
    var speaker by remember { mutableStateOf(false) }
    var elapsed by remember { mutableLongStateOf(0L) }

    val audio = remember { context.getSystemService(Context.AUDIO_SERVICE) as AudioManager }

    LaunchedEffect(phase) {
        while (phase == CallPhase.Connected || phase == CallPhase.Dialing) {
            val start = LiveCallLauncher.connectedAt
            elapsed = if (start > 0L) (System.currentTimeMillis() - start) / 1000 else 0L
            delay(1000)
        }
    }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(40.dp))
            Text(
                text = LiveCallLauncher.activeLeadName ?: "কল চলছে",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Text(
                text = LiveCallLauncher.activePhone.orEmpty(),
                fontSize = 16.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = when (phase) {
                    CallPhase.Dialing -> "ডায়াল করা হচ্ছে…"
                    CallPhase.Connected -> formatDuration(elapsed)
                    CallPhase.Ended -> "কল শেষ"
                    CallPhase.Idle -> ""
                },
                fontSize = 32.sp,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.primary,
            )
            if (LiveCallLauncher.recording && phase == CallPhase.Connected) {
                Spacer(Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .background(Color(0xFFB3261E), RoundedCornerShape(50))
                        .padding(horizontal = 12.dp, vertical = 4.dp)
                ) {
                    Text("● REC", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }

            Spacer(Modifier.height(24.dp))
            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                label = { Text("লাইভ নোট") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
            )

            Spacer(Modifier.height(20.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedButton(
                    onClick = {
                        muted = !muted
                        @Suppress("DEPRECATION")
                        audio.isMicrophoneMute = muted
                    },
                    modifier = Modifier.weight(1f),
                ) { Text(if (muted) "মিউট বন্ধ" else "মিউট") }
                OutlinedButton(
                    onClick = {
                        speaker = !speaker
                        @Suppress("DEPRECATION")
                        audio.isSpeakerphoneOn = speaker
                    },
                    modifier = Modifier.weight(1f),
                ) { Text(if (speaker) "স্পিকার বন্ধ" else "স্পিকার") }
            }

            Spacer(Modifier.height(12.dp))
            if (phase != CallPhase.Ended) {
                Button(
                    onClick = { endCall(context) },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFB3261E)),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("কল কাটুন", color = Color.White) }
            }
        }
    }

    if (phase == CallPhase.Ended) {
        OutcomeSheet(
            notes = notes,
            onSubmit = { outcome, finalNotes, connected ->
                LiveCallLauncher.activeLeadId?.let { lead ->
                    CallSyncQueue.queueOutcome(
                        context = context.applicationContext,
                        leadId = lead,
                        outcome = outcome,
                        notes = finalNotes,
                        connected = connected,
                    )
                }
                LiveCallLauncher.clear()
            },
            onDismiss = { LiveCallLauncher.clear() },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OutcomeSheet(
    notes: String,
    onSubmit: (String, String, Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var text by remember { mutableStateOf(notes) }
    var connected by remember { mutableStateOf(true) }

    val options = listOf(
        "interested" to "আগ্রহী",
        "follow_up" to "পরে যোগাযোগ",
        "not_interested" to "আগ্রহী নয়",
        "wrong_number" to "ভুল নম্বর",
        "no_answer" to "ধরেনি",
    )

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet) {
        Column(Modifier.padding(20.dp)) {
            Text("কলের ফলাফল", fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                label = { Text("নোট") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
            )
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = connected, onCheckedChange = { connected = it })
                Text("কথা হয়েছে")
            }
            Spacer(Modifier.height(8.dp))
            options.forEach { (value, label) ->
                Button(
                    onClick = { onSubmit(value, text, connected) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                ) { Text(label) }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

private fun formatDuration(seconds: Long): String {
    val m = seconds / 60
    val s = seconds % 60
    return "%02d:%02d".format(m, s)
}

@Suppress("MissingPermission")
private fun endCall(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return
    if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.ANSWER_PHONE_CALLS)
        != android.content.pm.PackageManager.PERMISSION_GRANTED
    ) return
    runCatching { endCallApi28(context) }
}

@RequiresApi(Build.VERSION_CODES.P)
@Suppress("MissingPermission")
private fun endCallApi28(context: Context) {
    val telecom = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
    telecom.endCall()
}
