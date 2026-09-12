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
        val employeeId = AgentSession.employeeId ?: return
        val app = context.applicationContext

        when (state) {
            TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                if (lastState == TelephonyManager.EXTRA_STATE_OFFHOOK) return
                lastState = state
                recorder(app).start(LiveCallLauncher.activeLeadId)
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
                val captured = rec.stopAndGetFile()

                if (wasOnCall && captured != null) {
                    CallSyncQueue.queueRecording(
                        context = app,
                        leadId = LiveCallLauncher.activeLeadId,
                        phoneNumber = LiveCallLauncher.activePhone.orEmpty(),
                        file = captured.first,
                        durationSeconds = captured.second,
                        twoSided = twoSided,
                    )
                }
                scope.launch {
                    runCatching { WinstoneApi.postPresence(employeeId, "idle", leadId = endedLeadId) }
                }
                LiveCallLauncher.clear()
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
