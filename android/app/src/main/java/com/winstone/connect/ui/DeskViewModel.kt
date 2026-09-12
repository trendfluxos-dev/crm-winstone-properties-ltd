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
    /** Honest recording capability of this phone, as reported to the CRM. */
    val recordingStatus: String? = null,
    /** two_sided / mic_only / unavailable — drives the per-lead recording badge. */
    val recordingMode: String? = null,
    /** Technical reason behind the verdict, shown when recording is blocked. */
    val recordingReason: String? = null,
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

    /**
     * Probes this phone's recorder and posts the honest verdict to the CRM.
     * Re-probes at most every 10 minutes, and only reports when the verdict
     * changed or the last report is older than 10 minutes — so IT always sees a
     * live state without hammering the server.
     */
    private var lastCapability: String? = null
    private var lastCapabilityAt = 0L

    private suspend fun reportRecordingCapability() {
        val staleMs = 10 * 60_000L
        val stale = System.currentTimeMillis() - lastCapabilityAt > staleMs
        val capability = com.winstone.connect.telephony.RecordingCapabilityCheck
            .check(app, force = stale)
        val mode = when (capability.support) {
            com.winstone.connect.telephony.RecordingSupport.TWO_SIDED -> "two_sided"
            com.winstone.connect.telephony.RecordingSupport.AGENT_SIDE_ONLY -> "mic_only"
            com.winstone.connect.telephony.RecordingSupport.UNAVAILABLE -> "unavailable"
        }
        // The lead list must show the real verdict even when the CRM is offline,
        // so the local state is updated before the report is attempted.
        _state.value = _state.value.copy(
            recordingMode = mode,
            recordingReason = capability.reason,
        )
        if (mode == lastCapability && !stale) return
        runCatching { WinstoneAgentApi.reportRecordingCapability(mode, capability.reason) }
            .onSuccess {
                lastCapability = mode
                lastCapabilityAt = System.currentTimeMillis()
                _state.value = _state.value.copy(recordingStatus = capability.label)
            }
    }

    /** Lets the agent re-check recording support by hand from the status screen. */
    fun recheckRecording() {
        viewModelScope.launch {
            lastCapabilityAt = 0L
            reportRecordingCapability()
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
