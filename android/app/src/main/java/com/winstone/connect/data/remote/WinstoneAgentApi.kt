package com.winstone.connect.data.remote

import com.winstone.connect.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * The two calls the desk screen needs on top of WinstoneApi:
 * submitting a lead the agent found themselves, and pulling the AI Copilot
 * briefing the web CRM shows on /coach.
 */
object WinstoneAgentApi {
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()
    private val JSON = "application/json; charset=utf-8".toMediaType()

    data class AgentIdentity(
        val employeeId: String,
        val agentId: String,
        val name: String,
        val phone: String?,
    )

    /** CRM credentials sign-in: email + password, exactly like the web desk. */
    suspend fun signIn(email: String, password: String): AgentIdentity = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("email", email.trim())
            put("password", password)
        }
        val req = Request.Builder()
            .url(WinstoneApi.BASE_URL + "/api/public/agent/login")
            .header("x-ingest-secret", BuildConfig.INGEST_SECRET)
            .post(payload.toString().toRequestBody(JSON))
            .build()
        client.newCall(req).execute().use { res ->
            val body = runCatching { JSONObject(res.body?.string().orEmpty()) }.getOrElse { JSONObject() }
            if (!res.isSuccessful) error(body.optString("error", "সাইন ইন করা যায়নি (HTTP ${res.code})"))
            val agent = body.optJSONObject("agent") ?: error("সাইন ইন করা যায়নি")
            AgentIdentity(
                employeeId = agent.optString("employee_id"),
                agentId = agent.optString("id"),
                name = agent.optString("name"),
                phone = agent.optString("phone").takeIf { it.isNotBlank() && it != "null" },
            )
        }
    }

    data class Coach(
        val summary: String,
        val strengths: List<String>,
        val risks: List<String>,
        val nextSteps: List<String>,
    )

    suspend fun submitLead(
        name: String,
        phone: String,
        company: String?,
        notes: String?,
    ): JSONObject = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("name", name)
            put("phone_number", phone)
            if (!company.isNullOrBlank()) put("company", company)
            if (!notes.isNullOrBlank()) put("notes", notes)
            put("source", "agent_app")
            put("assign", true)
        }
        val req = Request.Builder()
            .url(WinstoneApi.BASE_URL + "/api/public/ingest/lead")
            .header("x-ingest-secret", BuildConfig.INGEST_SECRET)
            .post(payload.toString().toRequestBody(JSON))
            .build()
        client.newCall(req).execute().use { res ->
            val body = runCatching { JSONObject(res.body?.string().orEmpty()) }.getOrElse { JSONObject() }
            if (!res.isSuccessful) error(body.optString("error", "HTTP ${res.code}"))
            body
        }
    }

    suspend fun fetchCoach(employeeId: String): Coach = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url("${WinstoneApi.BASE_URL}/api/public/agent/coach?employee_id=$employeeId")
            .header("x-ingest-secret", BuildConfig.INGEST_SECRET)
            .get()
            .build()
        client.newCall(req).execute().use { res ->
            val body = runCatching { JSONObject(res.body?.string().orEmpty()) }.getOrElse { JSONObject() }
            if (!res.isSuccessful) error(body.optString("error", "HTTP ${res.code}"))
            val brief = body.optJSONObject("briefing") ?: body.optJSONObject("coach") ?: body
            Coach(
                summary = brief.optString("summary").ifBlank { "এখনও পর্যাপ্ত কল ডেটা নেই।" },
                strengths = brief.stringList("strengths"),
                risks = brief.stringList("risks"),
                nextSteps = brief.stringList("next_steps", "nextSteps"),
            )
        }
    }

    private fun JSONObject.stringList(vararg keys: String): List<String> {
        for (key in keys) {
            val arr = optJSONArray(key) ?: continue
            return (0 until arr.length()).mapNotNull { arr.optString(it).takeIf { s -> s.isNotBlank() } }
        }
        return emptyList()
    }
}
