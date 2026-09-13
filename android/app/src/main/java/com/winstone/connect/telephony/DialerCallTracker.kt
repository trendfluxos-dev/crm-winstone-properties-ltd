package com.winstone.connect.telephony

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Calls the agent dials from the phone's own dialer or contacts app.
 *
 * The app cannot start those calls, but Android does tell us about them
 * (ACTION_NEW_OUTGOING_CALL), so they must still reach the CRM — otherwise a
 * day's real work would be missing simply because the agent skipped the app.
 *
 * Only the number and one stable call id are kept here; the CRM matches the
 * number to a lead and creates one when it is new, exactly as it does for a
 * customer callback.
 */
object DialerCallTracker {

    @Volatile
    var number: String? = null
        private set

    @Volatile
    var callUid: String? = null
        private set

    /** A number was dialled outside the app. */
    fun begin(dialled: String?) {
        val phone = dialled?.trim()?.takeIf { it.isNotBlank() } ?: return
        number = phone
        callUid = "dial-${phone.filter { it.isDigit() }.takeLast(11)}-${System.currentTimeMillis()}"
    }

    fun clear() {
        number = null
        callUid = null
    }
}

/** Registered in the manifest for ACTION_NEW_OUTGOING_CALL. */
class OutgoingCallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_NEW_OUTGOING_CALL) return
        // A call the app itself dialled is already tracked with its lead id.
        if (LiveCallLauncher.activeCallUid != null) return
        DialerCallTracker.begin(intent.getStringExtra(Intent.EXTRA_PHONE_NUMBER))
    }
}
