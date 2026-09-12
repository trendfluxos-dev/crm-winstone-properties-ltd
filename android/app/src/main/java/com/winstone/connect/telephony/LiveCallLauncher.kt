package com.winstone.connect.telephony

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.winstone.connect.data.sync.CallSyncQueue

/**
 * Real "Call" and "WhatsApp" buttons.
 *
 * call()     places the call over the SIM. CallStateReceiver picks it up from
 *            there: OFFHOOK starts the recorder and marks the agent on-call,
 *            IDLE stops it and queues the upload to the CRM.
 * whatsApp() opens WhatsApp *and* queues the message into the lead timeline,
 *            so the web CRM shows the touch even if the network drops.
 *
 * Manifest: <uses-permission android:name="android.permission.CALL_PHONE" />
 */
object LiveCallLauncher {
    const val REQ_CALL = 4411

    /** Remember which lead we are dialling so the post-call upload can attach it. */
    @Volatile var activeLeadId: String? = null
    @Volatile var activePhone: String? = null
    @Volatile var activeAgentId: String? = null

    fun call(activity: Activity, leadId: String, phone: String, agentId: String?) {
        val clean = phone.replace(Regex("[^\\d+]"), "")
        activeLeadId = leadId; activePhone = clean; activeAgentId = agentId

        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.CALL_PHONE)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.CALL_PHONE), REQ_CALL)
            return
        }
        activity.startActivity(Intent(Intent.ACTION_CALL, Uri.parse("tel:$clean")))
    }

    /** Opens WhatsApp with the text and logs the same text against the lead. */
    fun whatsApp(activity: Activity, leadId: String?, phone: String, text: String) {
        CallSyncQueue.queueWhatsApp(activity.applicationContext, leadId, phone, text)
        val clean = phone.replace(Regex("[^\\d]"), "").let { if (it.startsWith("0")) "88$it" else it }
        activity.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse("https://api.whatsapp.com/send?phone=$clean&text=${Uri.encode(text)}"))
        )
    }

    fun clear() {
        activeLeadId = null; activePhone = null; activeAgentId = null
    }
}
