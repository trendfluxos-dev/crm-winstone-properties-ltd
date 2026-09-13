package com.winstone.connect.telephony

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import com.winstone.connect.data.AgentSession
import com.winstone.connect.data.remote.WinstoneApi
import com.winstone.connect.data.sync.CallSyncQueue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * The piece that makes a real phone call end up in the CRM.
 *
 * OFFHOOK  -> start recording + tell HQ the agent is on-call
 * IDLE     -> stop recording, queue the upload, set the agent back to idle
 *
 * Register in the manifest:
 * <receiver android:name=".telephony.CallStateReceiver" android:exported="true">
 *   <intent-filter><action android:name="android.intent.action.PHONE_STATE" /></intent-filter>
 * </receiver>
 */
class CallStateReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
        val app = context.applicationContext
        // Cold start (incoming call wakes the process): read the synchronous mirror.
        val employeeId = AgentSession.employeeIdNow(app) ?: return

        val outgoing = LiveCallLauncher.activeCallUid != null
        when (state) {
            TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                if (lastState == TelephonyManager.EXTRA_STATE_OFFHOOK) return
                lastState = state
                CallRecordingService.start(app)
                val rec = recorder(app)
                val started = rec.start(LiveCallLauncher.activeLeadId)
                LiveCallLauncher.recording = started
                if (!started) {
                    val capability = RecordingCapabilityCheck.cachedOrNull()
                    LiveCallLauncher.recordingIssue =
                        capability?.label ?: "এই ফোনে কল রেকর্ডিং সম্ভব নয়"
                    android.util.Log.w(
                        "WinstoneRecording",
                        "recording unavailable: " + (rec.unavailableReason ?: "unknown"),
                    )
                    CallRecordingService.stop(app)
                }
                LiveCallLauncher.setPhase(CallPhase.Connected)
                // Answered is the first moment Android actually tells us the call
                // is up — we never infer it from the agent pressing CALL.
                if (outgoing) {
                    reportState(app, CallLifecycle.outgoingState(CallLifecycle.ANDROID_OFFHOOK, false))
                } else if (DialerCallTracker.callUid != null) {
                    // Dialled from the phone's own dialer: outgoing, no lead id yet.
                    reportDialer(app, CallLifecycle.outgoingState(CallLifecycle.ANDROID_OFFHOOK, false))
                } else {
                    IncomingCallTracker.ensure(intent.incomingNumber())
                    reportIncoming(app, CallLifecycle.incomingState(CallLifecycle.ANDROID_OFFHOOK, false))
                }
                scope.launch {
                    runCatching { WinstoneApi.postPresence(employeeId, "on_call", leadId = LiveCallLauncher.activeLeadId) }
                }
            }

            TelephonyManager.EXTRA_STATE_IDLE -> {
                val wasOnCall = lastState == TelephonyManager.EXTRA_STATE_OFFHOOK
                lastState = state
                val endedLeadId = LiveCallLauncher.activeLeadId
                val rec = recorder(app)
                val twoSided = rec.twoSided
                val recorderSource = rec.recorderSource
                val support = RecordingCapabilityCheck.cachedOrNull()?.support ?: RecordingSupport.UNAVAILABLE
                val captured = rec.stopAndGetFile()
                CallRecordingService.stop(app)

                // Policy: only a real two-sided carrier recording is uploaded. A
                // microphone-only file is not a call recording, so it is deleted
                // and the call is reported as recording-unavailable instead.
                val uploadable = CallLifecycle.uploadable(support, captured != null)
                if (wasOnCall && captured != null && uploadable) {
                    CallSyncQueue.queueRecording(
                        context = app,
                        leadId = if (outgoing) LiveCallLauncher.activeLeadId else null,
                        phoneNumber =
                            if (outgoing) LiveCallLauncher.activePhone.orEmpty()
                            else IncomingCallTracker.number.orEmpty(),
                        file = captured.first,
                        durationSeconds = captured.second,
                        twoSided = twoSided,
                        incoming = !outgoing,
                        recorderSource = recorderSource,
                    )
                } else if (captured != null) {
                    captured.first.delete()
                }

                val duration = captured?.second ?: 0
                val ended =
                    if (outgoing) CallLifecycle.outgoingState(CallLifecycle.ANDROID_IDLE, wasOnCall)
                    else CallLifecycle.incomingState(CallLifecycle.ANDROID_IDLE, wasOnCall)
                if (outgoing) {
                    reportState(app, ended, duration, uploadable)
                } else if (DialerCallTracker.callUid != null) {
                    reportDialer(
                        app,
                        CallLifecycle.outgoingState(CallLifecycle.ANDROID_IDLE, wasOnCall),
                        duration,
                        uploadable,
                    )
                    DialerCallTracker.clear()
                } else {
                    // Callback finished: the CRM resolves or creates the lead from
                    // the caller's number and opens the same mandatory report.
                    reportIncoming(app, ended, duration, uploadable)
                    IncomingCallTracker.clear()
                }

                // Every finished call becomes reportable, even when recording
                // failed entirely — the report is opened server-side and queued
                // so a dead network cannot swallow it.
                if (wasOnCall && endedLeadId != null) {
                    CallSyncQueue.queueReportOpen(
                        context = app,
                        leadId = endedLeadId,
                        phoneNumber = LiveCallLauncher.activePhone.orEmpty(),
                        durationSeconds = duration,
                        // Connected means Android saw the call go off-hook, not
                        // that we managed to record it.
                        connected = wasOnCall,
                    )
                }
                scope.launch {
                    runCatching { WinstoneApi.postPresence(employeeId, "idle", leadId = endedLeadId) }
                }
                LiveCallLauncher.recording = false
                // The overlay collects the outcome, then calls LiveCallLauncher.clear().
                if (wasOnCall) LiveCallLauncher.setPhase(CallPhase.Ended) else LiveCallLauncher.clear()
            }


            TelephonyManager.EXTRA_STATE_RINGING -> {
                lastState = state
                // Only a call the app did not dial is an incoming call.
                if (!outgoing && DialerCallTracker.callUid == null) {
                    IncomingCallTracker.begin(intent.incomingNumber())
                    reportIncoming(app, CallLifecycle.incomingState(CallLifecycle.ANDROID_RINGING, false))
                }
            }

            else -> lastState = state
        }
    }

    /** The caller's number, when Android is willing to tell us (needs READ_CALL_LOG). */
    private fun Intent.incomingNumber(): String? =
        getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)?.trim()?.takeIf { it.isNotBlank() }

    /**
     * Queues one observed state of an incoming call. There is no lead id yet —
     * the CRM resolves the lead from the caller's number, and creates it when the
     * number is new, so a callback is never lost.
     */
    private fun reportIncoming(
        app: Context,
        callState: CallState,
        durationSeconds: Int = 0,
        recordingCaptured: Boolean? = null,
    ) {
        val wire = callState.wire ?: return
        val callUid = IncomingCallTracker.callUid ?: return
        val number = IncomingCallTracker.number ?: return
        CallSyncQueue.queueIncomingCall(
            context = app,
            callUid = callUid,
            phoneNumber = number,
            state = wire,
            durationSeconds = durationSeconds,
            recordingSupported = recordingCaptured,
            recordingNote = RecordingCapabilityCheck.cachedOrNull()?.reason,
        )
    }

    /**
     * Queues one observed state of a call dialled outside the app. The CRM
     * matches the number to a lead (creating it when new) and opens the same
     * mandatory report, so work done from the phone dialer is never missing.
     */
    private fun reportDialer(
        app: Context,
        callState: CallState,
        durationSeconds: Int = 0,
        recordingCaptured: Boolean? = null,
    ) {
        val wire = callState.wire ?: return
        val callUid = DialerCallTracker.callUid ?: return
        val number = DialerCallTracker.number ?: return
        CallSyncQueue.queueIncomingCall(
            context = app,
            callUid = callUid,
            phoneNumber = number,
            state = wire,
            durationSeconds = durationSeconds,
            recordingSupported = recordingCaptured,
            recordingNote = RecordingCapabilityCheck.cachedOrNull()?.reason,
            direction = "outgoing",
        )
    }

    /**
     * Queues one observed call state. States we cannot observe are dropped, and
     * a call that was never started from the app has no id to report against.
     */
    private fun reportState(
        app: Context,
        callState: CallState,
        durationSeconds: Int = 0,
        recordingCaptured: Boolean? = null,
    ) {
        val wire = callState.wire ?: return
        val callUid = LiveCallLauncher.activeCallUid ?: return
        val leadId = LiveCallLauncher.activeLeadId ?: return
        CallSyncQueue.queueCallState(
            context = app,
            callUid = callUid,
            leadId = leadId,
            state = wire,
            durationSeconds = durationSeconds,
            phoneNumber = LiveCallLauncher.activePhone,
            recordingSupported = recordingCaptured,
            recordingNote = RecordingCapabilityCheck.cachedOrNull()?.reason,
        )
    }

    companion object {
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        private var lastState: String? = null
        private var shared: CallRecorder? = null

        /** One recorder per process so OFFHOOK and IDLE talk to the same instance. */
        fun recorder(context: Context): CallRecorder =
            shared ?: CallRecorder(context.applicationContext).also { shared = it }
    }
}
