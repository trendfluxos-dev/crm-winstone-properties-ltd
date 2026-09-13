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
import com.winstone.connect.data.remote.WinstoneApi
import com.winstone.connect.telephony.CallPhase
import com.winstone.connect.telephony.LiveCallLauncher
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope

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

            LiveCallLauncher.recordingIssue?.let { issue ->
                Spacer(Modifier.height(8.dp))
                Text(
                    "$issue — কলের তথ্য ও রিপোর্ট ঠিকই CRM-এ যাবে",
                    fontSize = 12.sp,
                    color = Color(0xFFB3261E),
                )
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
        ReportSheet(notes = notes)
    }
}

/**
 * বাধ্যতামূলক পোস্ট-কল রিপোর্ট।
 *
 * কল শেষ হলে এই শিটটি বন্ধ করা যায় না: ক্যাটাগরি ও তার আবশ্যক ঘর পূরণ করে
 * জমা না দিলে পরের কল শুরু করা যায় না — নিয়মটি সার্ভারেই বসানো, তাই অ্যাপ
 * বন্ধ করে দিলেও রিপোর্টটি বাকি থেকে যায়।
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportSheet(notes: String, onSubmitted: () -> Unit = {}) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var reportId by remember { mutableStateOf<String?>(null) }
    var leadLabel by remember { mutableStateOf<String?>(null) }
    var category by remember { mutableStateOf("") }
    var summary by remember { mutableStateOf("") }
    var note by remember { mutableStateOf(notes) }
    var reason by remember { mutableStateOf("") }
    var date by remember { mutableStateOf("") }
    var time by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var aiSummary by remember { mutableStateOf<String?>(null) }
    var aiCategory by remember { mutableStateOf<String?>(null) }

    // Wait for the server-side report (opened by the sync worker when the call ended).
    LaunchedEffect(Unit) {
        while (reportId == null) {
            runCatching { WinstoneApi.pendingReport() }.getOrNull()?.let { body ->
                body.optJSONObject("pending")?.let { pending ->
                    reportId = pending.optString("id").takeIf { it.isNotBlank() }
                    pending.optJSONObject("lead")?.let { lead ->
                        leadLabel = listOfNotNull(
                            lead.optString("name").takeIf { it.isNotBlank() && it != "null" },
                            lead.optString("phone_number").takeIf { it.isNotBlank() && it != "null" },
                        ).joinToString(" · ").takeIf { it.isNotBlank() }
                    }
                    pending.optJSONObject("recording")?.let { rec ->
                        aiSummary = rec.optString("ai_summary").takeIf { it.isNotBlank() && it != "null" }
                    }
                    pending.optJSONObject("ai_suggestion")?.let { suggestion ->
                        aiCategory = suggestion.optString("suggestedCategory").takeIf { it.isNotBlank() }
                    }
                }
            }
            if (reportId == null) delay(3_000)
        }
    }

    // প্রতিটি কলে: ক্যাটাগরি + সারাংশ + নোট + ফলো-আপ তারিখ — সবই বাধ্যতামূলক
    val needsReason = category == "not_interested" || category == "wrong_number"
    val ready = category.isNotBlank() &&
        date.length == 10 && time.length == 5 &&
        summary.trim().length > 1 &&
        note.trim().length > 1 &&
        (!needsReason || reason.trim().length > 1)

    ModalBottomSheet(onDismissRequest = { /* বাধ্যতামূলক — বন্ধ করা যাবে না */ }, sheetState = sheet) {
        Column(Modifier.padding(20.dp)) {
            Text("কল রিপোর্ট (বাধ্যতামূলক)", fontSize = 18.sp, fontWeight = FontWeight.Bold)
            leadLabel?.let {
                Spacer(Modifier.height(4.dp))
                Text(it, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
            }
            Spacer(Modifier.height(4.dp))
            Text(
                if (reportId == null) "রিপোর্ট তৈরি হচ্ছে…" else "ক্যাটাগরি বেছে নিয়ে জমা দিন — জমা না দিলে পরের কল হবে না",
                fontSize = 12.sp,
            )
            aiSummary?.let {
                Spacer(Modifier.height(8.dp))
                Text("AI সারসংক্ষেপ: $it", fontSize = 12.sp)
            }
            aiCategory?.let {
                Spacer(Modifier.height(4.dp))
                Text("AI পরামর্শ: $it (চূড়ান্ত সিদ্ধান্ত আপনারই)", fontSize = 12.sp)
            }

            Spacer(Modifier.height(12.dp))
            CATEGORIES.forEach { (value, label) ->
                OutlinedButton(
                    onClick = { category = value },
                    modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                ) { Text(if (category == value) "✓ $label" else label) }
            }

            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = summary,
                onValueChange = { summary = it },
                label = { Text("কলের সারাংশ (বাধ্যতামূলক)") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = date,
                onValueChange = { date = it },
                label = { Text("ফলো-আপ তারিখ (2026-05-20) — বাধ্যতামূলক") },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = time,
                onValueChange = { time = it },
                label = { Text("সময় (14:30) — বাধ্যতামূলক") },
                modifier = Modifier.fillMaxWidth(),
            )
            if (needsReason) {
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it },
                    label = { Text("কারণ (বাধ্যতামূলক)") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = note,
                onValueChange = { note = it },
                label = { Text("নোট (বাধ্যতামূলক)") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
            )

            error?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = Color(0xFFB3261E), fontSize = 12.sp)
            }

            Spacer(Modifier.height(12.dp))
            Button(
                enabled = ready && reportId != null && !busy,
                onClick = {
                    val id = reportId ?: return@Button
                    busy = true; error = null
                    scope.launch {
                    val followUp = "${date}T${time}:00+06:00"
                    val result = runCatching {
                            WinstoneApi.submitReport(
                                reportId = id,
                                category = category,
                                summary = summary,
                                note = note,
                                reason = reason,
                                followUpAtIso = followUp,
                                aiDecision = if (aiCategory != null && aiCategory == category) "accepted" else "edited",
                            )
                        }
                        busy = false
                        result.onSuccess { LiveCallLauncher.clear(); onSubmitted() }
                            .onFailure { error = it.message ?: "রিপোর্ট জমা হয়নি" }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (busy) "জমা হচ্ছে…" else "রিপোর্ট জমা দিন") }
            Spacer(Modifier.height(24.dp))
        }
    }
}

private val CATEGORIES = listOf(
    "hot_lead" to "HOT LEAD — খুব সম্ভাবনাময়",
    "follow_up" to "FOLLOW UP — পরে যোগাযোগ",
    "interested" to "INTERESTED — আগ্রহী",
    "not_interested" to "NOT INTERESTED — আগ্রহী নয়",
    "callback" to "CALLBACK — কলব্যাক চেয়েছেন",
    "no_answer" to "NO ANSWER — ধরেনি",
    "wrong_number" to "WRONG NUMBER — ভুল নম্বর",
    "closed_converted" to "CLOSED / CONVERTED — বিক্রি হয়েছে",
)

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
