package com.winstone.connect.data

import org.json.JSONArray
import org.json.JSONObject

data class Lead(
    val id: String,
    val name: String,
    val phone: String,
    val company: String?,
    val status: String,
    val attempts: Int,
    val notes: String?,
)

data class CallRow(
    val id: String,
    val leadId: String?,
    val phone: String,
    val durationSeconds: Int,
    val direction: String,
    val syncStatus: String,
    val summary: String?,
    val sentiment: String?,
    val createdAt: String,
)

data class MessageRow(
    val id: String,
    val leadId: String?,
    val senderType: String,
    val content: String,
    val createdAt: String,
)

/**
 * Today's numbers as counted by the server for the Dhaka day. `siteVisits` is
 * null because the CRM records no site-visit entity — the card says so rather
 * than showing a made-up figure.
 */
data class DailyPerformance(
    val callsMade: Int,
    val connected: Int,
    val interested: Int,
    val followUpsDue: Int,
    val reportsSubmitted: Int,
    val talkSeconds: Int,
    val siteVisits: Int?,
)

data class DeskData(
    val agentId: String,
    val agentName: String,
    val leads: List<Lead>,
    val calls: List<CallRow>,
    val messages: List<MessageRow>,
    val daily: DailyPerformance? = null,
)

fun parseDaily(o: JSONObject?): DailyPerformance? {
    if (o == null) return null
    return DailyPerformance(
        callsMade = o.optInt("callsMade"),
        connected = o.optInt("connected"),
        interested = o.optInt("interested"),
        followUpsDue = o.optInt("followUpsDue"),
        reportsSubmitted = o.optInt("reportsSubmitted"),
        talkSeconds = o.optInt("talkSeconds"),
        siteVisits = if (o.isNull("siteVisits")) null else o.optInt("siteVisits"),
    )
}

private fun JSONObject.str(key: String): String? = optString(key).takeIf { it.isNotBlank() && it != "null" }

fun parseLeads(arr: JSONArray): List<Lead> = (0 until arr.length()).map { i ->
    val o = arr.getJSONObject(i)
    Lead(
        id = o.optString("id"),
        name = o.optString("name"),
        phone = o.optString("phone_number"),
        company = o.str("company"),
        status = o.optString("status", "pending"),
        attempts = o.optInt("call_attempts"),
        notes = o.str("notes"),
    )
}

fun parseCalls(arr: JSONArray): List<CallRow> = (0 until arr.length()).map { i ->
    val o = arr.getJSONObject(i)
    CallRow(
        id = o.optString("id"),
        leadId = o.str("lead_id"),
        phone = o.optString("phone_number"),
        durationSeconds = o.optInt("duration_seconds"),
        direction = o.optString("call_direction", "outgoing"),
        syncStatus = o.optString("sync_status", "uploaded"),
        summary = o.str("ai_summary"),
        sentiment = o.str("sentiment"),
        createdAt = o.optString("created_at"),
    )
}

fun parseMessages(arr: JSONArray): List<MessageRow> = (0 until arr.length()).map { i ->
    val o = arr.getJSONObject(i)
    MessageRow(
        id = o.optString("id"),
        leadId = o.str("lead_id"),
        senderType = o.optString("sender_type", "agent"),
        content = o.str("message_content") ?: "(মিডিয়া)",
        createdAt = o.optString("created_at"),
    )
}

fun statusLabel(status: String): String = when (status) {
    "pending" -> "অপেক্ষমাণ"
    "contacted" -> "যোগাযোগ হয়েছে"
    "follow_up" -> "ফলো-আপ"
    "closed" -> "সম্পন্ন"
    else -> status
}

fun shortTime(iso: String): String =
    iso.replace("T", " ").take(16)
