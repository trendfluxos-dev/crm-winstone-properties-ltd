package com.winstone.connect.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.winstone.connect.data.AgentSession
import com.winstone.connect.data.DeskData
import com.winstone.connect.data.parseCalls
import com.winstone.connect.data.parseLeads
import com.winstone.connect.data.parseMessages
import com.winstone.connect.data.remote.WinstoneAgentApi
import com.winstone.connect.data.remote.WinstoneApi
import com.winstone.connect.data.sync.SyncStatus
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class DeskUiState(
    val employeeId: String? = null,
    val loading: Boolean = false,
    val data: DeskData? = null,
    val error: String? = null,
    val toast: String? = null,
    val coach: WinstoneAgentApi.Coach? = null,
    val coachLoading: Boolean = false,
    /** Local time of the last successful CRM sync, for the status screen. */
    val lastSyncedAt: String? = null,
    /** Items still waiting on this phone / given up on, plus the last error. */
    val sync: SyncStatus.Snapshot = SyncStatus.Snapshot(),
    /** Set when the CRM refused this phone (device access removed by IT). */
    val deviceRevoked: Boolean = false,
    /** Lead whose Twilio cloud call is being set up right now. */
    val twilioCallingLeadId: String? = null,
)

class DeskViewModel(private val app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(DeskUiState(employeeId = AgentSession.employeeId))
    val state: StateFlow<DeskUiState> = _state

    init {
        viewModelScope.launch {
            AgentSession.load(app)
            SyncStatus.load(app)
            _state.value = _state.value.copy(employeeId = AgentSession.employeeId)
            if (AgentSession.isSignedIn()) {
                refresh()
                reportRecordingCapability()
            }
            while (true) {
                delay(20_000)
                if (AgentSession.isSignedIn()) {
                    refresh(silent = true)
                    reportRecordingCapability()
                }
            }
        }
        // Live pending / failed / last-error counters for the status screen.
        viewModelScope.launch {
            SyncStatus.state.collect { snap -> _state.value = _state.value.copy(sync = snap) }
        }
    }

    fun signIn(phone: String, password: String) {
        val digits = phone.filter { it.isDigit() }
        if (digits.length < 6 || password.length < 6) {
            _state.value = _state.value.copy(error = "সঠিক ফোন নম্বর ও পাসওয়ার্ড দিন")
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            runCatching { WinstoneAgentApi.signIn(phone.trim(), password) }
                .onSuccess { me ->
                    AgentSession.saveDevice(app, me.deviceToken, me.deviceId)
                    AgentSession.saveEmployeeId(app, me.employeeId)
                    AgentSession.cacheAgent(app, me.agentId, me.name)
                    _state.value = _state.value.copy(employeeId = me.employeeId, error = null)
                    refresh()
                }
                .onFailure { e ->
                    _state.value = _state.value.copy(
                        loading = false,
                        error = e.message ?: "সাইন ইন করা যায়নি",
                    )
                }
        }
    }

    fun signOut() {
        viewModelScope.launch {
            AgentSession.clear(app)
            _state.value = DeskUiState()
        }
    }

    fun refresh(silent: Boolean = false) {
        val employeeId = AgentSession.employeeId ?: return
        viewModelScope.launch {
            if (!silent) _state.value = _state.value.copy(loading = true, error = null)
            runCatching { WinstoneApi.fetchWorkspace(employeeId) }
                .onSuccess { ws ->
                    AgentSession.cacheAgent(app, ws.agentId, ws.agentName)
                    _state.value = _state.value.copy(
                        loading = false,
                        error = null,
                        lastSyncedAt = java.text.SimpleDateFormat("dd MMM, hh:mm a", java.util.Locale.getDefault())
                            .format(java.util.Date()),
                        data = DeskData(
                            agentId = ws.agentId,
                            agentName = ws.agentName,
                            leads = parseLeads(ws.leads),
                            calls = parseCalls(ws.calls),
                            messages = parseMessages(ws.whatsapp),
                        ),
                    )
                }
                .onFailure { e ->
                    val message = e.message.orEmpty()
                    // IT removed this phone's access: stop using the stored token
                    // and send the agent back to sign-in with a clear reason.
                    val revoked = message.contains("Unauthorized", ignoreCase = true) ||
                        message.contains("device", ignoreCase = true) && message.contains("revoke", ignoreCase = true)
                    if (revoked) {
                        AgentSession.clear(app)
                        _state.value = DeskUiState(
                            deviceRevoked = true,
                            error = "এই ফোনের অনুমতি বাতিল করা হয়েছে — আবার সাইন ইন করুন",
                        )
                    } else {
                        _state.value = _state.value.copy(
                            loading = false,
                            error = message.ifBlank { "সার্ভারে সংযোগ করা যাচ্ছে না" },
                        )
                    }
                }
        }
    }

    fun loadCoach() {
        val employeeId = AgentSession.employeeId ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(coachLoading = true)
            runCatching { WinstoneAgentApi.fetchCoach(employeeId) }
                .onSuccess { _state.value = _state.value.copy(coachLoading = false, coach = it) }
                .onFailure {
                    _state.value = _state.value.copy(
                        coachLoading = false,
                        toast = it.message ?: "AI কোচ আনা যায়নি",
                    )
                }
        }
    }

    fun submitLead(name: String, phone: String, company: String, notes: String) {
        viewModelScope.launch {
            runCatching {
                WinstoneAgentApi.submitLead(name, phone, company, notes, AgentSession.agentId)
            }
                .onSuccess {
                    _state.value = _state.value.copy(toast = "লিড জমা হয়েছে")
                    refresh(silent = true)
                }
                .onFailure { _state.value = _state.value.copy(toast = it.message ?: "লিড জমা হয়নি") }
        }
    }

    /**
     * Twilio cloud call. The phone only asks; Twilio rings this agent back and
     * bridges the customer, so the call and recording reach the CRM on their own.
     */
    fun twilioCall(leadId: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(twilioCallingLeadId = leadId)
            runCatching { WinstoneAgentApi.twilioCall(leadId) }
                .onSuccess { body ->
                    _state.value = _state.value.copy(
                        twilioCallingLeadId = null,
                        toast = body.optString("message").ifBlank { "Twilio কল শুরু হয়েছে" },
                    )
                    refresh(silent = true)
                }
                .onFailure {
                    _state.value = _state.value.copy(
                        twilioCallingLeadId = null,
                        toast = it.message ?: "Twilio কল শুরু করা যায়নি",
                    )
                }
        }
    }

    fun clearToast() {
        _state.value = _state.value.copy(toast = null)
    }
}
