package com.winstone.connect.telephony

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.winstone.connect.data.sync.CallSyncQueue
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Real "Call" and "WhatsApp" buttons.
 *
 * call()     places the call over the SIM. CallStateReceiver picks it up from
 *            there: OFFHOOK starts the recorder and marks the agent on-call,
 *            IDLE stops it and queues the upload to the CRM.
 * whatsApp() opens WhatsApp *and* queues the message into the lead timeline,
 *            so the web CRM shows the touch even if the network drops.
 *
 * The phase flow drives the in-call overlay (LiveCallScreen).
 */
enum class CallPhase { Idle, Dialing, Connected, Ended }

object LiveCallLauncher {
    const val REQ_CALL = 4411

    /** Remember which lead we are dialling so the post-call upload can attach it. */
    @Volatile var activeLeadId: String? = null
    @Volatile var activePhone: String? = null
    @Volatile var activeAgentId: String? = null
    @Volatile var activeLeadName: String? = null

    /** When the call went off-hook (millis), for the live timer. */
    @Volatile var connectedAt: Long = 0L
    @Volatile var recording: Boolean = false

    private val _phase = MutableStateFlow(CallPhase.Idle)
    val phase: StateFlow<CallPhase> = _phase.asStateFlow()

    fun setPhase(next: CallPhase) {
        if (next == CallPhase.Connected && _phase.value != CallPhase.Connected) {
            connectedAt = System.currentTimeMillis()
        }
        _phase.value = next
    }

    fun call(
        activity: Activity,
        leadId: String,
        phone: String,
        agentId: String?,
        leadName: String? = null,
    ) {
        val clean = phone.replace(Regex("[^\\d+]"), "")
        activeLeadId = leadId; activePhone = clean; activeAgentId = agentId
        activeLeadName = leadName

        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.CALL_PHONE)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.CALL_PHONE), REQ_CALL)
            return
        }
        connectedAt = 0L
        setPhase(CallPhase.Dialing)
        activity.startActivity(Intent(Intent.ACTION_CALL, Uri.parse("tel:$clean")))
    }

    /** Opens WhatsApp with the text and logs the same text against the lead. */
    fun whatsApp(activity: Activity, leadId: String?, phone: String, text: String) {
        CallSyncQueue.queueWhatsApp(activity.applicationContext, leadId, phone, text)
        val msisdn = normalizeBdMsisdn(phone) ?: return
        // wa.me is the supported external deep link: Android hands it to the
        // installed WhatsApp app, and falls back to the browser otherwise.
        val uri = Uri.parse("https://wa.me/$msisdn?text=" + Uri.encode(text))
        val intent = Intent(Intent.ACTION_VIEW, uri).apply {
            setPackage("com.whatsapp")
        }
        try {
            activity.startActivity(intent)
        } catch (_: Exception) {
            activity.startActivity(Intent(Intent.ACTION_VIEW, uri))
        }
    }

    /**
     * Bangladesh-first msisdn normalisation: 01XXXXXXXXX / +8801XXXXXXXXX /
     * 008801XXXXXXXXX / 8801XXXXXXXXX all become 8801XXXXXXXXX. Returns null
     * for malformed input and never duplicates the country code.
     */
    fun normalizeBdMsisdn(raw: String?): String? {
        var value = (raw ?: "").replace(Regex("[^\\d]"), "")
        if (value.isEmpty()) return null
        while (value.startsWith("00")) value = value.substring(2)
        value = when {
            value.startsWith("880") -> "880" + value.substring(3).trimStart('0')
            value.startsWith("0") -> "880" + value.substring(1)
            Regex("^1[3-9]\\d{8}$").matches(value) -> "880$value"
            else -> value
        }
        if (Regex("^8801[3-9]\\d{8}$").matches(value)) return value
        if (Regex("^[1-9]\\d{7,14}$").matches(value) && !value.startsWith("880")) return value
        return null
    }

    /** Called after the outcome sheet is submitted or dismissed. */
    fun clear() {
        activeLeadId = null; activePhone = null; activeAgentId = null; activeLeadName = null
        connectedAt = 0L; recording = false
        _phase.value = CallPhase.Idle
    }
}
