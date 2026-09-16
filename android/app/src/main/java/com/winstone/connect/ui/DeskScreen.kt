package com.winstone.connect.ui

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.foundation.border
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.winstone.connect.data.CallRow
import com.winstone.connect.data.DailyPerformance
import com.winstone.connect.data.Lead
import com.winstone.connect.data.shortTime
import com.winstone.connect.data.statusLabel
import com.winstone.connect.data.remote.WinstoneApi
import androidx.compose.ui.platform.LocalContext
import com.winstone.connect.data.AgentSession
import com.winstone.connect.telephony.LiveCallLauncher
import com.winstone.connect.data.remote.UpdateChecker
import com.winstone.connect.telephony.RecordingCapabilityCheck
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import com.winstone.connect.ui.theme.WinAmber
import com.winstone.connect.ui.theme.WinBorder
import com.winstone.connect.ui.theme.WinGreen
import com.winstone.connect.ui.theme.WinGreenSoft
import com.winstone.connect.ui.theme.WinInkMuted
import com.winstone.connect.ui.theme.WinRed

/** Mirrors the web CRM /desk screen: stats, lead queue, call log, device/sync status, AI copilot. */
@Composable
fun DeskScreen(
    activity: Activity,
    vm: DeskViewModel,
    reportPending: Boolean = false,
    onReportSubmitted: () -> Unit = {},
) {
    val state by vm.state.collectAsStateSafe()
    val snackbar = remember { SnackbarHostState() }
    var tab by remember { mutableStateOf(0) }
    val callScope = rememberCoroutineScope()
    var callBlocked by remember { mutableStateOf<String?>(null) }
    var showPendingReport by remember { mutableStateOf(false) }
    var showNewLead by remember { mutableStateOf(false) }
    var whatsappLead by remember { mutableStateOf<Lead?>(null) }
    val context = LocalContext.current
    var update by remember { mutableStateOf<UpdateChecker.Available?>(null) }
    var updateDismissed by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val installed = runCatching {
            context.packageManager.getPackageInfo(context.packageName, 0).longVersionCode.toInt()
        }.getOrDefault(0)
        update = UpdateChecker.check(installed)
    }

    LaunchedEffect(state.toast) {
        state.toast?.let {
            snackbar.showSnackbar(it)
            vm.clearToast()
        }
    }
    LaunchedEffect(tab) { if (tab == 3 && state.coach == null) vm.loadCoach() }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbar) },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showNewLead = true },
                containerColor = com.winstone.connect.ui.theme.WinGold,
                contentColor = com.winstone.connect.ui.theme.WinOnGold,
            ) { Text("নতুন লিড") }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            DeskHeader(
                agentName = state.data?.agentName ?: "…",
                employeeId = state.employeeId.orEmpty(),
                onRefresh = { vm.refresh() },
                onSignOut = { vm.signOut() },
            )

            update?.takeIf { !updateDismissed || it.mandatory }?.let { available ->
                UpdateBanner(
                    available = available,
                    onInstall = {
                        runCatching {
                            context.startActivity(
                                android.content.Intent(
                                    android.content.Intent.ACTION_VIEW,
                                    android.net.Uri.parse(available.downloadUrl),
                                ).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK),
                            )
                        }
                    },
                    onDismiss = { updateDismissed = true },
                )
            }

            state.error?.let {
                Text(
                    "সমস্যা: $it",
                    color = WinRed,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }

            // মূল ব্যানার: আগের কলের রিপোর্ট বাকি — এক ট্যাপে শিট খোলে
            if (reportPending || callBlocked != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        callBlocked ?: "আগের কলের রিপোর্ট জমা বাকি",
                        color = WinRed,
                        fontSize = 15.sp,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = { showPendingReport = true }) {
                        Text("এখনই জমা দিন", color = WinRed, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    }
                }
            }

            StatsRow(state)

            TabRow(selectedTabIndex = tab, containerColor = MaterialTheme.colorScheme.background) {
                listOf("লিড", "কল লগ", "স্টেটাস", "AI কোচ").forEachIndexed { i, label ->
                    Tab(selected = tab == i, onClick = { tab = i }, text = { Text(label, fontSize = 15.sp) })
                }
            }

            if (state.loading && state.data == null) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            } else {
                val data = state.data
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    when (tab) {
                        0 -> {
                            val leads = data?.leads.orEmpty()
                            if (leads.isEmpty()) item { EmptyNote("এখনও কোনো লিড অ্যাসাইন হয়নি।") }
                            items(leads) { lead ->
                                LeadCard(
                                    lead = lead,
                                    recordingMode = state.recordingMode,
                                    recordingReason = state.recordingReason,
                                    onWhatsApp = { whatsappLead = lead },
                                    onCall = {
                                        // The server decides: an unfinished post-call
                                        // report blocks the next outbound call.
                                        callScope.launch {
                                            val gate = runCatching { WinstoneApi.startCall(lead.id) }.getOrNull()
                                            val blocked = gate?.optBoolean("blocked", false) == true
                                            if (blocked) {
                                                callBlocked = gate?.optString("reason")
                                                    ?: "আগের কলের রিপোর্ট জমা দিন"
                                            } else {
                                                LiveCallLauncher.call(activity, lead.id, lead.phone, data?.agentId, lead.name)
                                            }
                                        }
                                    },
                                )
                            }
                        }
                        1 -> {
                            val calls = data?.calls.orEmpty()
                            if (calls.isEmpty()) item { EmptyNote("আজ কোনো কল রেকর্ড নেই।") }
                            items(calls) { CallCard(it, data?.leads.orEmpty()) }
                        }
                        2 -> {
                            item { StatusCards(state) }
                        }
                        else -> {
                            if (state.coachLoading) item { EmptyNote("AI কোচ তৈরি হচ্ছে…") }
                            state.coach?.let { coach ->
                                item { CoachCard("সারসংক্ষেপ", listOf(coach.summary)) }
                                if (coach.strengths.isNotEmpty()) item { CoachCard("শক্তি", coach.strengths) }
                                if (coach.risks.isNotEmpty()) item { CoachCard("ঝুঁকি", coach.risks) }
                                if (coach.nextSteps.isNotEmpty()) item { CoachCard("পরবর্তী ধাপ", coach.nextSteps) }
                            }
                        }
                    }
                    item { Spacer(Modifier.height(72.dp)) }
                }
            }
        }
    }

    if (showNewLead) {
        NewLeadDialog(
            onDismiss = { showNewLead = false },
            onSubmit = { name, phone, company, notes ->
                vm.submitLead(name, phone, company, notes)
                showNewLead = false
            },
        )
    }

    whatsappLead?.let { lead ->
        WhatsAppDialog(
            lead = lead,
            onDismiss = { whatsappLead = null },
            onSend = { text ->
                vm.sendWhatsApp(lead.id, lead.phone, text)
                whatsappLead = null
            },
        )
    }

    // অ্যাপ চালু হওয়ার পরই পেন্ডিং রিপোর্ট থাকলে নিজে খুলে যায়; জমা না দিলে বন্ধ হয় না।
    if (reportPending || showPendingReport) {
        ReportSheet(
            notes = "",
            onSubmitted = {
                showPendingReport = false
                callBlocked = null
                onReportSubmitted()
                vm.refresh()
            },
        )
    }
}

/**
 * Message composer for the lead's WhatsApp. Sending opens WhatsApp on this phone
 * and syncs the same text to the CRM lead timeline.
 */
@Composable
private fun WhatsAppDialog(lead: Lead, onDismiss: () -> Unit, onSend: (String) -> Unit) {
    var text by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("হোয়াটসঅ্যাপ · ${lead.name}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(lead.phone, fontSize = 15.sp, color = WinInkMuted)
                OutlinedTextField(text, { text = it }, label = { Text("মেসেজ") })
                Text(
                    "পাঠালে হোয়াটসঅ্যাপ খুলবে এবং একই লেখা লিডের টাইমলাইনে জমা হবে।",
                    fontSize = 14.sp,
                    color = WinInkMuted,
                )
            }
        },
        confirmButton = {
            TextButton(enabled = text.isNotBlank(), onClick = { onSend(text.trim()) }) {
                Text("পাঠান")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("বাতিল") } },
    )
}

@Composable
private fun DeskHeader(agentName: String, employeeId: String, onRefresh: () -> Unit, onSignOut: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text("এজেন্ট ডেস্ক", fontWeight = FontWeight.Bold, fontSize = 20.sp)
            Text("$agentName · $employeeId", color = WinInkMuted, fontSize = 15.sp)
        }
        OutlinedButton(onClick = onRefresh) { Text("রিফ্রেশ") }
        Spacer(Modifier.width(8.dp))
        TextButton(onClick = onSignOut) { Text("সাইন আউট") }
    }
}

@Composable
private fun StatsRow(state: DeskUiState) {
    val calls = state.data?.calls.orEmpty()
    val talkMinutes = calls.sumOf { it.durationSeconds } / 60
    val pending = state.data?.leads.orEmpty().count { it.status == "pending" }
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        StatChip("কল", calls.size.toString(), Modifier.weight(1f))
        StatChip("কথা (মিনিট)", talkMinutes.toString(), Modifier.weight(1f))
        StatChip("অপেক্ষমাণ লিড", pending.toString(), Modifier.weight(1f))
        StatChip("ফলো-আপ", state.data?.leads.orEmpty().count { it.status == "follow_up" }.toString(), Modifier.weight(1f))
    }
}

@Composable
private fun StatChip(label: String, value: String, modifier: Modifier = Modifier) {
    Box(
        modifier
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(12.dp))
            .border(1.dp, WinBorder, RoundedCornerShape(12.dp))
            .padding(vertical = 12.dp, horizontal = 10.dp),
    ) {
        Column {
            Text(
                value,
                fontWeight = FontWeight.Bold,
                fontSize = 28.sp,
                color = com.winstone.connect.ui.theme.WinGold,
            )
            Text(label, fontSize = 14.sp, color = WinInkMuted)
        }
    }
}

@Composable
private fun WinCard(content: @Composable () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, WinBorder),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(14.dp)) { content() }
    }
}

@Composable
private fun LeadCard(
    lead: Lead,
    recordingMode: String?,
    recordingReason: String?,
    onCall: () -> Unit,
    onWhatsApp: () -> Unit,
) {
    // Honest per-lead recording state, straight from this phone's own probe.
    val blocked = recordingMode == "unavailable"
    val recordingLine = when (recordingMode) {
        "two_sided" -> "রেকর্ডিং: দুই পাশের কথা জমা হবে"
        "mic_only" -> "রেকর্ডিং: শুধু এজেন্টের পাশ জমা হবে"
        "unavailable" -> "এই ফোনে রেকর্ডিং সম্ভব নয় — রেকর্ড কল বন্ধ"
        else -> "রেকর্ডিং ক্ষমতা যাচাই হচ্ছে…"
    }
    val recordingColor = when (recordingMode) {
        "two_sided" -> WinGreen
        "mic_only" -> WinAmber
        "unavailable" -> WinAmber
        else -> WinInkMuted
    }
    WinCard {
        Text(lead.name, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        Text(
            listOfNotNull(lead.phone, lead.company).joinToString(" · "),
            color = WinInkMuted,
            fontSize = 15.sp,
        )
        Text(
            "${statusLabel(lead.status)} · চেষ্টা ${lead.attempts}",
            color = if (lead.status == "pending") WinAmber else WinGreen,
            fontSize = 15.sp,
        )
        lead.notes?.let { Text(it, fontSize = 15.sp, color = WinInkMuted) }
        Spacer(Modifier.height(6.dp))
        Text(recordingLine, fontSize = 15.sp, color = recordingColor)
        if (blocked) {
            recordingReason?.let { Text(it, fontSize = 15.sp, color = WinInkMuted) }
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            androidx.compose.material3.Button(
                onClick = onCall,
                modifier = Modifier.weight(1f),
            ) { Text(if (blocked) "কল করুন (রেকর্ডিং ছাড়া)" else "কল করুন") }
            OutlinedButton(
                onClick = onWhatsApp,
                modifier = Modifier.weight(1f),
            ) { Text("হোয়াটসঅ্যাপ") }
        }
    }
}

@Composable
private fun CallCard(call: CallRow, leads: List<Lead>) {
    val leadName = leads.firstOrNull { it.id == call.leadId }?.name ?: call.phone
    WinCard {
        Text(leadName, fontWeight = FontWeight.SemiBold)
        Text(
            "${call.durationSeconds} সেকেন্ড · ${shortTime(call.createdAt)}",
            fontSize = 15.sp,
            color = WinInkMuted,
        )
        Text(
            when (call.syncStatus) {
                "failed" -> "সার্ভারে ওঠেনি"
                "verified" -> "যাচাই হয়েছে"
                else -> "আপলোড হয়েছে"
            },
            fontSize = 15.sp,
            color = if (call.syncStatus == "failed") WinRed else WinGreen,
        )
        call.summary?.let { Text(it, fontSize = 15.sp) }
        call.sentiment?.let { Text("AI মনোভাব: $it", fontSize = 15.sp, color = WinInkMuted) }
    }
}

@Composable
private fun CoachCard(title: String, lines: List<String>) {
    WinCard {
        Text(title, fontWeight = FontWeight.Bold)
        lines.forEach { Text("• $it", fontSize = 15.sp) }
    }
}

@Composable
private fun EmptyNote(text: String) {
    Text(text, color = WinInkMuted, fontSize = 15.sp)
}

@Composable
private fun NewLeadDialog(onDismiss: () -> Unit, onSubmit: (String, String, String, String) -> Unit) {
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var company by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("নতুন লিড জমা দিন") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("নাম") })
                OutlinedTextField(phone, { phone = it }, label = { Text("মোবাইল (01XXXXXXXXX)") })
                OutlinedTextField(company, { company = it }, label = { Text("প্রতিষ্ঠান (ঐচ্ছিক)") })
                OutlinedTextField(notes, { notes = it }, label = { Text("নোট (ঐচ্ছিক)") })
            }
        },
        confirmButton = {
            TextButton(
                enabled = name.isNotBlank() && phone.length >= 11,
                onClick = { onSubmit(name.trim(), phone.trim(), company.trim(), notes.trim()) },
            ) { Text("জমা দিন") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("বাতিল") } },
    )
}

/**
 * Device + sync status, so an agent can see at a glance whether this phone is
 * bound, whether recording works on it, and whether anything is still waiting
 * to reach the CRM.
 */
@Composable
private fun StatusCards(state: DeskUiState) {
    val context = LocalContext.current
    var capability by remember { mutableStateOf(RecordingCapabilityCheck.cachedOrNull()) }
    LaunchedEffect(Unit) {
        if (capability == null) capability = RecordingCapabilityCheck.check(context)
    }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        WinCard {
            Text("ডিভাইস", fontWeight = FontWeight.Bold)
            Text("এজেন্ট: ${state.data?.agentName ?: "—"}", fontSize = 15.sp)
            Text("Employee ID: ${state.employeeId ?: "—"}", fontSize = 15.sp, color = WinInkMuted)
            Text(
                "ডিভাইস আইডি: ${AgentSession.deviceId ?: "—"}",
                fontSize = 15.sp,
                color = WinInkMuted,
            )
            Text(
                if (AgentSession.deviceToken != null) "এই ফোনটি CRM-এ যুক্ত আছে"
                else "এই ফোনটি এখনও যুক্ত হয়নি — আবার সাইন ইন করুন",
                fontSize = 15.sp,
                color = if (AgentSession.deviceToken != null) WinGreen else WinRed,
            )
        }

        WinCard {
            Text("ফোনের তথ্য", fontWeight = FontWeight.Bold)
            Text(
                "অ্যাপ ভার্সন: ${com.winstone.connect.BuildConfig.VERSION_NAME}",
                fontSize = 15.sp,
                color = WinInkMuted,
            )
            Text(
                "ফোন: ${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}",
                fontSize = 15.sp,
                color = WinInkMuted,
            )
            Text(
                "অ্যান্ড্রয়েড: ${android.os.Build.VERSION.RELEASE}",
                fontSize = 15.sp,
                color = WinInkMuted,
            )
            Text(
                state.recordingStatus?.let { "CRM-এ জানানো হয়েছে: $it" }
                    ?: "রেকর্ডিং ক্ষমতা CRM-এ পাঠানোর অপেক্ষায়",
                fontSize = 15.sp,
                color = if (state.recordingStatus != null) WinGreen else WinInkMuted,
            )
        }

        WinCard {
            Text("সিঙ্ক", fontWeight = FontWeight.Bold)
            Text(
                if (state.error == null) "সার্ভারের সাথে সংযোগ ঠিক আছে"
                else "সংযোগে সমস্যা: ${state.error}",
                fontSize = 15.sp,
                color = if (state.error == null) WinGreen else WinRed,
            )
            Text(
                "শেষ আপডেট: ${state.lastSyncedAt ?: "—"}",
                fontSize = 15.sp,
                color = WinInkMuted,
            )
            Text(
                "পাঠানোর অপেক্ষায়: ${state.sync.pending} · ব্যর্থ: ${state.sync.failed}",
                fontSize = 15.sp,
                color = if (state.sync.failed > 0) WinRed else WinInkMuted,
            )
            state.sync.lastError?.let {
                Text("শেষ সমস্যা: $it", fontSize = 14.sp, color = WinRed)
            }
            Text(
                "ইন্টারনেট না থাকলে কল, রেকর্ডিং ও রিপোর্ট ফোনে জমা থাকে এবং নেটওয়ার্ক ফিরলে নিজে থেকেই পাঠানো হয়।",
                fontSize = 15.sp,
                color = WinInkMuted,
            )
        }

        WinCard {
            Text("কল রেকর্ডিং", fontWeight = FontWeight.Bold)
            Text(
                capability?.label ?: "পরীক্ষা করা হচ্ছে…",
                fontSize = 15.sp,
                color = if (capability?.available == false) WinRed else WinGreen,
            )
            capability?.reason?.let {
                Text(it, fontSize = 14.sp, color = WinInkMuted)
            }
            Text(
                "রেকর্ডিং সম্ভব না হলেও কলের তথ্য ও বাধ্যতামূলক রিপোর্ট আগের মতোই CRM-এ যাবে।",
                fontSize = 15.sp,
                color = WinInkMuted,
            )
        }
    }
}


/**
 * New-version banner. A mandatory release cannot be dismissed, but installing is
 * still an explicit agent action followed by Android's own install confirmation.
 */
@Composable
private fun UpdateBanner(
    available: UpdateChecker.Available,
    onInstall: () -> Unit,
    onDismiss: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        colors = CardDefaults.cardColors(containerColor = WinGreenSoft),
        shape = RoundedCornerShape(14.dp),
    ) {
        Column(Modifier.padding(12.dp)) {
            Text(
                if (available.mandatory) "নতুন ভার্সন বাধ্যতামূলক: ${available.versionName}"
                else "নতুন ভার্সন এসেছে: ${available.versionName}",
                fontWeight = FontWeight.SemiBold,
                fontSize = 15.sp,
            )
            available.notes?.let {
                Text(it, fontSize = 15.sp, color = WinInkMuted, modifier = Modifier.padding(top = 2.dp))
            }
            Text(
                "ডাউনলোড শেষে ইনস্টল করার অনুমতি ফোন নিজেই চাইবে।",
                fontSize = 14.sp,
                color = WinInkMuted,
                modifier = Modifier.padding(top = 4.dp),
            )
            Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onInstall) { Text("ডাউনলোড ও ইনস্টল") }
                if (!available.mandatory) {
                    TextButton(onClick = onDismiss) { Text("পরে") }
                }
            }
        }
    }
}
