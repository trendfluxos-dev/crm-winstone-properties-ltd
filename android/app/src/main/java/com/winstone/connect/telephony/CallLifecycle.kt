package com.winstone.connect.telephony

/**
 * Honest call-state model.
 *
 * Android only exposes a very small window into what a carrier call is doing:
 * PHONE_STATE gives RINGING / OFFHOOK / IDLE and nothing else. So we map only
 * those, and everything we cannot actually observe stays UNKNOWN instead of
 * being guessed. Pressing CALL is never treated as "answered".
 *
 * `wire` is the value the CRM's call-state contract accepts; UNKNOWN has no
 * wire value on purpose — we do not send states we did not observe.
 */
enum class CallState(val wire: String?) {
    INITIATED("initiated"),
    RINGING("ringing"),
    ANSWERED("answered"),
    COMPLETED("completed"),
    /** Incoming call that was never picked up. */
    MISSED("no_answer"),
    /** Outgoing call the agent ended before the other side answered. */
    CANCELLED("no_answer"),
    FAILED("failed"),
    UNKNOWN(null),
}

object CallLifecycle {

    /** Android PHONE_STATE values, kept as constants so the mapping is testable on the JVM. */
    const val ANDROID_RINGING = "RINGING"
    const val ANDROID_OFFHOOK = "OFFHOOK"
    const val ANDROID_IDLE = "IDLE"

    /**
     * Company policy for the first release: only a genuine two-sided carrier
     * recording is uploaded. A microphone-only capture is NOT a call recording,
     * so it is reported as unavailable rather than uploaded as if it were one.
     */
    const val REQUIRE_TWO_SIDED = true

    /**
     * One stable id per call attempt. Every state update and the recording
     * upload carry it, so a retry can never create a second call row.
     */
    fun newCallUid(leadId: String?, nowMillis: Long = System.currentTimeMillis()): String {
        val tail = leadId?.replace("-", "")?.takeLast(10)?.takeIf { it.isNotBlank() } ?: "unknown"
        return "and-$tail-$nowMillis"
    }

    /** Outgoing call: Android never reports "ringing" for the number we dialled. */
    fun outgoingState(androidState: String, wasOffHook: Boolean): CallState = when (androidState) {
        ANDROID_OFFHOOK -> CallState.ANSWERED
        ANDROID_IDLE -> if (wasOffHook) CallState.COMPLETED else CallState.CANCELLED
        else -> CallState.UNKNOWN
    }

    /** Incoming call: ringing is observable here. */
    fun incomingState(androidState: String, wasOffHook: Boolean): CallState = when (androidState) {
        ANDROID_RINGING -> CallState.RINGING
        ANDROID_OFFHOOK -> CallState.ANSWERED
        ANDROID_IDLE -> if (wasOffHook) CallState.COMPLETED else CallState.MISSED
        else -> CallState.UNKNOWN
    }

    /**
     * True only when a real audio file exists AND it is the kind of recording we
     * are allowed to store. Everything else must be reported as not available.
     */
    fun uploadable(support: RecordingSupport, captured: Boolean): Boolean =
        captured && (!REQUIRE_TWO_SIDED || support == RecordingSupport.TWO_SIDED)
}
