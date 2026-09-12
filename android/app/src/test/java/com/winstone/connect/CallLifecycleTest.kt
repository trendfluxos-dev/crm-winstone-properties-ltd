package com.winstone.connect

import com.winstone.connect.telephony.CallLifecycle
import com.winstone.connect.telephony.CallState
import com.winstone.connect.telephony.RecordingSupport
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** JVM tests for the call-state and recording-policy rules (no device needed). */
class CallLifecycleTest {

    @Test
    fun `pressing call never counts as answered`() {
        // Only OFFHOOK maps to answered; nothing else may.
        assertEquals(CallState.UNKNOWN, CallLifecycle.outgoingState("DIALING", false))
        assertEquals(CallState.UNKNOWN, CallLifecycle.outgoingState(CallLifecycle.ANDROID_RINGING, false))
        assertEquals(CallState.ANSWERED, CallLifecycle.outgoingState(CallLifecycle.ANDROID_OFFHOOK, false))
    }

    @Test
    fun `outgoing call ended before answer is not completed`() {
        assertEquals(CallState.CANCELLED, CallLifecycle.outgoingState(CallLifecycle.ANDROID_IDLE, false))
        assertEquals(CallState.COMPLETED, CallLifecycle.outgoingState(CallLifecycle.ANDROID_IDLE, true))
    }

    @Test
    fun `incoming call states map ringing and missed`() {
        assertEquals(CallState.RINGING, CallLifecycle.incomingState(CallLifecycle.ANDROID_RINGING, false))
        assertEquals(CallState.MISSED, CallLifecycle.incomingState(CallLifecycle.ANDROID_IDLE, false))
        assertEquals(CallState.COMPLETED, CallLifecycle.incomingState(CallLifecycle.ANDROID_IDLE, true))
    }

    @Test
    fun `unknown state is never sent to the CRM`() {
        assertNull(CallState.UNKNOWN.wire)
        assertEquals("no_answer", CallState.MISSED.wire)
        assertEquals("no_answer", CallState.CANCELLED.wire)
        assertEquals("completed", CallState.COMPLETED.wire)
    }

    @Test
    fun `call id is stable per attempt and unique across attempts`() {
        val lead = "31074173-2709-4261-9348-cc515c0b9a1c"
        val first = CallLifecycle.newCallUid(lead, nowMillis = 1_000L)
        assertEquals(first, CallLifecycle.newCallUid(lead, nowMillis = 1_000L))
        assertNotEquals(first, CallLifecycle.newCallUid(lead, nowMillis = 2_000L))
        assertTrue(first.length in 6..120)
    }

    @Test
    fun `only a real two sided recording may be uploaded`() {
        assertTrue(CallLifecycle.uploadable(RecordingSupport.TWO_SIDED, captured = true))
        assertFalse(CallLifecycle.uploadable(RecordingSupport.TWO_SIDED, captured = false))
        // Microphone-only capture is not a call recording.
        assertFalse(CallLifecycle.uploadable(RecordingSupport.AGENT_SIDE_ONLY, captured = true))
        assertFalse(CallLifecycle.uploadable(RecordingSupport.UNAVAILABLE, captured = true))
    }
}
