package com.winstone.connect.telephony

/**
 * The incoming half of a call day.
 *
 * An outgoing call always knows its lead, because the agent tapped it in the
 * app. An incoming call knows only a number, so we keep the number plus one
 * stable id per ringing call here, and the CRM resolves (or creates) the lead
 * from that number. That is what makes a customer's callback a real lead
 * instead of a call nobody logged.
 *
 * Process-wide and volatile on purpose: an incoming call can cold-start the app
 * process through the PHONE_STATE broadcast, and RINGING / OFFHOOK / IDLE may
 * each arrive on a different broadcast.
 */
object IncomingCallTracker {

    @Volatile
    var callUid: String? = null
        private set

    @Volatile
    var number: String? = null
        private set

    val active: Boolean get() = callUid != null

    /** Starts tracking a ringing call; keeps the existing id on repeat broadcasts. */
    fun begin(incomingNumber: String?): String {
        val existing = callUid
        if (existing != null) {
            if (number.isNullOrBlank() && !incomingNumber.isNullOrBlank()) number = incomingNumber
            return existing
        }
        number = incomingNumber?.takeIf { it.isNotBlank() }
        val uid = "in-" + (number?.filter(Char::isDigit)?.takeLast(9) ?: "unknown") +
            "-" + System.currentTimeMillis()
        callUid = uid
        return uid
    }

    /**
     * OFFHOOK can also be the very first state we see (call answered before the
     * app process woke up), so answering starts tracking when nothing is tracked.
     */
    fun ensure(incomingNumber: String? = null): String = begin(incomingNumber)

    fun clear() {
        callUid = null
        number = null
    }
}
