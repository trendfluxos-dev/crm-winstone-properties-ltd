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
import com.winstone.connect.data.Lead
import com.winstone.connect.data.MessageRow
import com.winstone.connect.data.shortTime
import com.winstone.connect.data.statusLabel
import com.winstone.connect.data.remote.WinstoneApi
import com.winstone.connect.telephony.LiveCallLauncher
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import com.winstone.connect.ui.theme.WinAmber
import com.winstone.connect.ui.theme.WinBorder
import com.winstone.connect.ui.theme.WinGreen
import com.winstone.connect.ui.theme.WinGreenSoft
import com.winstone.connect.ui.theme.WinInkMuted
import com.winstone.connect.ui.theme.WinRed

/** Mirrors the web CRM /desk screen: stats, lead queue, call log, WhatsApp inbox, AI copilot. */
@Composable
fun DeskScreen(activity: Activity, vm: DeskViewModel) {
    val state by vm.state.collectAsStateSafe()
    val snackbar = remember { SnackbarHostState() }
    var tab by remember { mutableStateOf(0) }
    val callScope = rememberCoroutineScope()
    var callBlocked by remember { mutableStateOf<String?>(null) }
    var showNewLead by remember { mutableStateOf(false) }
    var waLead by remember { mutableStateOf<Lead?>(null) }

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
                containerColor = WinGreen,
                contentColor = androidx.compose.ui.graphics.Color.White,
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

            state.error?.let {
                Text(
                    "সমস্যা: $it",
                    color = WinRed,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }

            callBlocked?.let { message ->
                Text(
                    message,
                    color = WinRed,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                )
            }

            StatsRow(state)

            TabRow(selectedTabIndex = tab, containerColor = MaterialTheme.colorScheme.background) {
                listOf("লিড", "কল লগ", "WhatsApp", "AI কোচ").forEachIndexed { i, label ->
                    Tab(selected = tab == i, onClick = { tab = i }, text = { Text(label, fontSize = 13.sp) })
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
                                    onWhatsApp = { waLead = lead },
                                )
                            }
                        }
                        1 -> {
                            val calls = data?.calls.orEmpty()
                            if (calls.isEmpty()) item { EmptyNote("আজ কোনো কল রেকর্ড নেই।") }
                            items(calls) { CallCard(it, data?.leads.orEmpty()) }
                        }
                        2 -> {
                            val msgs = data?.messages.orEmpty()
                            if (msgs.isEmpty()) item { EmptyNote("কোনো WhatsApp বার্তা নেই।") }
                            items(msgs) { MessageCard(it, data?.leads.orEmpty()) }
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

    waLead?.let { lead ->
        WhatsAppDialog(
            lead = lead,
            onDismiss = { waLead = null },
            onSend = { text ->
                LiveCallLauncher.whatsApp(activity, lead.id, lead.phone, text)
                waLead = null
            },
        )
    }
}

@Composable
private fun DeskHeader(agentName: String, employeeId: String, onRefresh: () -> Unit, onSignOut: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text("এজেন্ট ডেস্ক", fontWeight = FontWeight.Bold, fontSize = 20.sp)
            Text("$agentName · $employeeId", color = WinInkMuted, fontSize = 13.sp)
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
        StatChip("WhatsApp", state.data?.messages.orEmpty().size.toString(), Modifier.weight(1f))
    }
}

@Composable
private fun StatChip(label: String, value: String, modifier: Modifier = Modifier) {
    Box(
        modifier
            .background(WinGreenSoft, RoundedCornerShape(12.dp))
            .padding(vertical = 10.dp, horizontal = 8.dp),
    ) {
        Column {
            Text(value, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Text(label, fontSize = 11.sp, color = WinInkMuted)
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
private fun LeadCard(lead: Lead, onCall: () -> Unit, onWhatsApp: () -> Unit) {
    WinCard {
        Text(lead.name, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        Text(
            listOfNotNull(lead.phone, lead.company).joinToString(" · "),
            color = WinInkMuted,
            fontSize = 13.sp,
        )
        Text(
            "${statusLabel(lead.status)} · চেষ্টা ${lead.attempts}",
            color = if (lead.status == "pending") WinAmber else WinGreen,
            fontSize = 12.sp,
        )
        lead.notes?.let { Text(it, fontSize = 12.sp, color = WinInkMuted) }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            androidx.compose.material3.Button(onClick = onCall) { Text("কল করুন") }
            OutlinedButton(onClick = onWhatsApp) { Text("WhatsApp") }
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
            fontSize = 12.sp,
            color = WinInkMuted,
        )
        Text(
            when (call.syncStatus) {
                "failed" -> "সার্ভারে ওঠেনি"
                "verified" -> "যাচাই হয়েছে"
                else -> "আপলোড হয়েছে"
            },
            fontSize = 12.sp,
            color = if (call.syncStatus == "failed") WinRed else WinGreen,
        )
        call.summary?.let { Text(it, fontSize = 13.sp) }
        call.sentiment?.let { Text("AI মনোভাব: $it", fontSize = 12.sp, color = WinInkMuted) }
    }
}

@Composable
private fun MessageCard(msg: MessageRow, leads: List<Lead>) {
    val leadName = leads.firstOrNull { it.id == msg.leadId }?.name ?: "অজানা লিড"
    WinCard {
        Text(leadName, fontWeight = FontWeight.SemiBold)
        Text(
            if (msg.senderType == "agent") "এজেন্ট → কাস্টমার" else "কাস্টমার → এজেন্ট",
            fontSize = 11.sp,
            color = WinInkMuted,
        )
        Text(msg.content, fontSize = 13.sp)
        Text(shortTime(msg.createdAt), fontSize = 11.sp, color = WinInkMuted)
    }
}

@Composable
private fun CoachCard(title: String, lines: List<String>) {
    WinCard {
        Text(title, fontWeight = FontWeight.Bold)
        lines.forEach { Text("• $it", fontSize = 13.sp) }
    }
}

@Composable
private fun EmptyNote(text: String) {
    Text(text, color = WinInkMuted, fontSize = 13.sp)
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

@Composable
private fun WhatsAppDialog(lead: Lead, onDismiss: () -> Unit, onSend: (String) -> Unit) {
    var text by remember { mutableStateOf("আসসালামু আলাইকুম ${lead.name}, Winstone থেকে বলছি।") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("WhatsApp বার্তা") },
        text = { OutlinedTextField(text, { text = it }, label = { Text("বার্তা") }) },
        confirmButton = {
            TextButton(enabled = text.isNotBlank(), onClick = { onSend(text.trim()) }) { Text("পাঠান") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("বাতিল") } },
    )
}
