package com.winstone.connect

import com.winstone.connect.telephony.LiveCallLauncher
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Bangladesh number handling used before dialling and before CRM attribution. */
class PhoneNumberTest {

    @Test
    fun `bangladesh formats all normalise to one form`() {
        val expected = "8801712345617"
        listOf("01712345617", "+8801712345617", "008801712345617", "8801712345617", "01712-345617")
            .forEach { assertEquals(expected, LiveCallLauncher.normalizeBdMsisdn(it)) }
    }

    @Test
    fun `garbage input is rejected instead of dialled`() {
        assertNull(LiveCallLauncher.normalizeBdMsisdn(""))
        assertNull(LiveCallLauncher.normalizeBdMsisdn("abc"))
        assertNull(LiveCallLauncher.normalizeBdMsisdn("0171234"))
    }
}
