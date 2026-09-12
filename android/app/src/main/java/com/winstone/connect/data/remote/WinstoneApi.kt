package com.winstone.connect.data.remote

import com.winstone.connect.data.AgentSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Live bridge to the Winstone Connect Web CRM.
 * Drop into app/src/main/java/com/winstone/connect/data/remote/
 *
 * Every write carries the agent's employee id (WIN26xx), so the CRM attributes
 * the call recording / WhatsApp log to the right person even when the phone has
 * not fetched the workspace yet, and creates the lead when the agent dialled a
 * number that is not in the CRM.
 */
object WinstoneApi {
    const val BASE_URL = "https://webcrm.winstonebd.com"
    /**
     * The phone authenticates with its own device token (issued at sign-in and
     * bound to this agent profile). No shared privileged secret ships in the APK.
     */
    private fun authToken(): String = AgentSession.deviceToken.orEmpty()

    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(180, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)
        .build()
    private val JSON = "application/json; charset=utf-8".toMediaType()

    data class Workspace(
        val agentId: String,
        val agentName: String,
        val leads: JSONArray,
        val calls: JSONArray,
        val whatsapp: JSONArray,
        val roster: JSONArray,
    )

    /** Agent Workspace: this agent's own leads + call / WhatsApp logs. */
    suspend fun fetchWorkspace(employeeId: String): Workspace = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url("$BASE_URL/api/public/agent/workspace?employee_id=$employeeId")
            .header("x-device-token", authToken())
            .get()
            .build()
        client.newCall(req).execute().use { res ->
            val body = JSONObject(res.body?.string() ?: "{}")
            if (!res.isSuccessful) error(body.optString("error", "HTTP ${res.code}"))
            val agent = body.getJSONObject("agent")
            Workspace(
                agentId = agent.getString("id"),
                agentName = agent.getString("name"),
                leads = body.optJSONArray("leads") ?: JSONArray(),
                calls = body.optJSONArray("calls") ?: JSONArray(),
                whatsapp = body.optJSONArray("whatsapp") ?: JSONArray(),
                roster = body.optJSONArray("roster") ?: JSONArray(),
            )
        }
    }

    /** Upload a finished call recording; the CRM transcribes + audits it. */
    suspend fun uploadRecording(
        leadId: String?,
        phoneNumber: String,
        employeeId: String,
        agentId: String? = null,
        file: File,
        durationSeconds: Int,
        twoSided: Boolean = true,
        incoming: Boolean = false,
        leadName: String? = null,
        clientUploadId: String? = null,
        recorderSource: String = "unknown",
    ): JSONObject = withContext(Dispatchers.IO) {
        // Multipart: the audio streams straight up, no base64 bloat in memory.
        val ext = file.extension.ifBlank { "m4a" }
        val body = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .apply {
                leadId?.let { addFormDataPart("lead_id", it) }
                if (phoneNumber.isNotBlank()) addFormDataPart("phone_number", phoneNumber)
                agentId?.let { addFormDataPart("agent_id", it) }
                addFormDataPart("employee_id", employeeId)
                leadName?.let { addFormDataPart("lead_name", it) }
                addFormDataPart("file_extension", ext)
                addFormDataPart("duration_seconds", durationSeconds.toString())
                addFormDataPart("call_direction", if (incoming) "incoming_callback" else "outgoing")
                addFormDataPart("is_two_sided", twoSided.toString())
                // Idempotency: a WorkManager retry can never create a second row.
                addFormDataPart("client_upload_id", clientUploadId ?: file.name)
                addFormDataPart("recorder_source", recorderSource)
                AgentSession.deviceId?.let { addFormDataPart("device_id", it) }
                addFormDataPart(
                    "file",
                    file.name,
                    file.asRequestBody(mimeFor(ext).toMediaType()),
                )
            }
            .build()

        val req = Request.Builder()
            .url("$BASE_URL/api/public/ingest/recording")
            .header("x-device-token", authToken())
            .post(body)
            .build()

        client.newCall(req).execute().use { res ->
            val json = JSONObject(res.body?.string() ?: "{}")
            if (!res.isSuccessful) error(json.optString("error", "HTTP ${res.code}"))
            json
        }
    }

    private fun mimeFor(ext: String): String = when (ext.lowercase()) {
        "wav" -> "audio/wav"
        "m4a", "mp4" -> "audio/mp4"
        "ogg" -> "audio/ogg"
        "amr" -> "audio/amr"
        else -> "audio/mpeg"
    }

    /** Log a WhatsApp touch (sent from the app's WhatsApp button). */
    suspend fun logWhatsApp(
        leadId: String?,
        phoneNumber: String,
        employeeId: String,
        agentId: String? = null,
        text: String,
        senderType: String = "agent",
        leadName: String? = null,
    ): JSONObject = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            leadId?.let { put("lead_id", it) }
            if (phoneNumber.isNotBlank()) put("phone_number", phoneNumber)
            agentId?.let { put("agent_id", it) }
            put("employee_id", employeeId)
            leadName?.let { put("lead_name", it) }
            put("sender_type", senderType)
            put("message_type", "text")
            put("message_content", text)
        }
        post("/api/public/ingest/message", payload)
    }

    /** Live presence beacon so Executive HQ shows this agent on-call in real time. */
    suspend fun postPresence(
        employeeId: String,
        presence: String,                      // on_call | idle | offline
        callStartedAt: String? = null,         // ISO-8601, defaults to now server-side
        leadId: String? = null,                // stamps the lead timeline (Started / Ended)
    ): JSONObject = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("employee_id", employeeId)
            put("presence", presence)
            callStartedAt?.let { put("call_started_at", it) }
            leadId?.let { put("lead_id", it) }
        }
        post("/api/public/agent/presence", payload)
    }

    /** Post-call outcome from the live call screen: stage + in-call notes. */
    suspend fun postCallOutcome(
        leadId: String,
        agentId: String?,
        outcome: String,                       // interested | follow_up | not_interested | wrong_number | no_answer
        notes: String,
        connected: Boolean,
    ): JSONObject = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("lead_id", leadId)
            agentId?.let { put("agent_id", it) }
            put("outcome", outcome)
            if (notes.isNotBlank()) put("notes", notes)
            put("connected", connected)
        }
        post("/api/public/ingest/outcome", payload)
    }

    /** Asks the CRM whether this agent may start a call (409 = report pending). */
    suspend fun startCall(leadId: String): JSONObject = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url("$BASE_URL/api/public/agent/call-start")
            .header("x-device-token", authToken())
            .header("Content-Type", "application/json")
            .post(JSONObject().put("lead_id", leadId).toString().toRequestBody(JSON))
            .build()
        client.newCall(req).execute().use { res ->
            val body = runCatching { JSONObject(res.body?.string().orEmpty()) }.getOrElse { JSONObject() }
            body.put("http_status", res.code)
        }
    }

    /** Opens the mandatory post-call report the moment a call ends. */
    suspend fun openReport(
        leadId: String,
        recordingId: String?,
        phoneNumber: String?,
        durationSeconds: Int,
        connected: Boolean,
    ): JSONObject = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("action", "open")
            put("lead_id", leadId)
            recordingId?.let { put("recording_id", it) }
            phoneNumber?.let { if (it.isNotBlank()) put("phone_number", it) }
            put("duration_seconds", durationSeconds)
            put("connected", connected)
        }
        post("/api/public/agent/report", payload)
    }

    /** The agent's own open report, so the app can never skip it. */
    suspend fun pendingReport(): JSONObject = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url("$BASE_URL/api/public/agent/report")
            .header("x-device-token", authToken())
            .get()
            .build()
        client.newCall(req).execute().use { res ->
            runCatching { JSONObject(res.body?.string().orEmpty()) }.getOrElse { JSONObject() }
        }
    }

    /** Submits the report: category + its required fields. */
    suspend fun submitReport(
        reportId: String,
        category: String,
        summary: String?,
        note: String?,
        reason: String?,
        followUpAtIso: String?,
        aiDecision: String?,
    ): JSONObject = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("action", "submit")
            put("report_id", reportId)
            put("category", category)
            summary?.let { if (it.isNotBlank()) put("summary", it) }
            note?.let { if (it.isNotBlank()) put("note", it) }
            reason?.let { if (it.isNotBlank()) put("reason", it) }
            followUpAtIso?.let { put("follow_up_at", it) }
            aiDecision?.let { put("ai_decision", it) }
        }
        post("/api/public/agent/report", payload)
    }

    /**
     * Reports an observed call state to the CRM's Phase-1 call-state contract.
     * `callUid` is stable per call attempt, so a retry updates the same call row
     * instead of creating a new one.
     */
    suspend fun postCallState(
        callUid: String,
        leadId: String,
        state: String,                         // initiated | ringing | answered | completed | failed | no_answer
        durationSeconds: Int? = null,
        agentPhone: String? = null,
        recordingSupported: Boolean? = null,
        recordingNote: String? = null,
    ): JSONObject = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("call_uid", callUid)
            put("lead_id", leadId)
            put("state", state)
            durationSeconds?.let { put("duration_seconds", it) }
            agentPhone?.let { if (it.isNotBlank()) put("agent_phone", it) }
            recordingSupported?.let { put("recording_supported", it) }
            recordingNote?.let { if (it.isNotBlank()) put("recording_note", it.take(300)) }
        }
        post("/api/public/agent/call-state", payload)
    }

    private fun post(path: String, payload: JSONObject): JSONObject {
        val req = Request.Builder()
            .url(BASE_URL + path)
            .header("x-device-token", authToken())
            .header("Content-Type", "application/json")
            .post(payload.toString().toRequestBody(JSON))
            .build()
        client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            val body = runCatching { JSONObject(text) }.getOrElse { JSONObject() }
            if (!res.isSuccessful) error(body.optString("error", "HTTP ${res.code}"))
            return body
        }
    }
}
