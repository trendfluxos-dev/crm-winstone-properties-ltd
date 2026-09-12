package com.winstone.connect.data.remote

import android.util.Base64
import com.winstone.connect.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
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
    private val INGEST_SECRET = BuildConfig.INGEST_SECRET // see README step 2

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
            .header("x-ingest-secret", INGEST_SECRET)
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
    ): JSONObject = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            leadId?.let { put("lead_id", it) }
            if (phoneNumber.isNotBlank()) put("phone_number", phoneNumber)
            agentId?.let { put("agent_id", it) }
            put("employee_id", employeeId)
            leadName?.let { put("lead_name", it) }
            put("audio_base64", Base64.encodeToString(file.readBytes(), Base64.NO_WRAP))
            put("file_extension", file.extension.ifBlank { "m4a" })
            put("duration_seconds", durationSeconds)
            put("call_direction", if (incoming) "incoming_callback" else "outgoing")
            put("is_two_sided", twoSided)
        }
        post("/api/public/ingest/recording", payload)
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
    ): JSONObject = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("employee_id", employeeId)
            put("presence", presence)
            callStartedAt?.let { put("call_started_at", it) }
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

    private fun post(path: String, payload: JSONObject): JSONObject {
        val req = Request.Builder()
            .url(BASE_URL + path)
            .header("x-ingest-secret", INGEST_SECRET)
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
