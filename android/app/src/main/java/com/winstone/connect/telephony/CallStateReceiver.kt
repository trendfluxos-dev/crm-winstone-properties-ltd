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

        when (state) {
            TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                if (lastState == TelephonyManager.EXTRA_STATE_OFFHOOK) return
                lastState = state
                CallRecordingService.start(app)
                recorder(app).start(LiveCallLauncher.activeLeadId)
                LiveCallLauncher.recording = true
                LiveCallLauncher.setPhase(CallPhase.Connected)
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
                val captured = rec.stopAndGetFile()
                CallRecordingService.stop(app)

                if (wasOnCall && captured != null) {
                    CallSyncQueue.queueRecording(
                        context = app,
                        leadId = LiveCallLauncher.activeLeadId,
                        phoneNumber = LiveCallLauncher.activePhone.orEmpty(),
                        file = captured.first,
                        durationSeconds = captured.second,
                        twoSided = twoSided,
                        recorderSource = recorderSource,
                    )
                }

                // Every finished call becomes reportable, even when recording
                // failed entirely — the report is opened server-side and queued
                // so a dead network cannot swallow it.
                if (wasOnCall && endedLeadId != null) {
                    CallSyncQueue.queueReportOpen(
                        context = app,
                        leadId = endedLeadId,
                        phoneNumber = LiveCallLauncher.activePhone.orEmpty(),
                        durationSeconds = captured?.second ?: 0,
                        connected = captured != null,
                    )
                }
                scope.launch {
                    runCatching { WinstoneApi.postPresence(employeeId, "idle", leadId = endedLeadId) }
                }
                LiveCallLauncher.recording = false
                // The overlay collects the outcome, then calls LiveCallLauncher.clear().
                if (wasOnCall) LiveCallLauncher.setPhase(CallPhase.Ended) else LiveCallLauncher.clear()
            }

            else -> lastState = state
        }
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
