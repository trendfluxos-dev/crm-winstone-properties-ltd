package com.winstone.connect.data.remote

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Asks the CRM whether a newer signed APK has been published for the company
 * phones. Nothing is installed silently: the desk screen only shows a banner
 * that opens the download page, and Android's own installer asks the agent to
 * confirm. A network failure is never reported as "up to date" — it returns
 * null so the UI stays quiet instead of claiming something it cannot verify.
 */
object UpdateChecker {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    data class Available(
        val versionName: String,
        val versionCode: Int,
        val mandatory: Boolean,
        val notes: String?,
        val downloadUrl: String,
    )

    /** Returns the newer release, or null when up to date / unreachable. */
    suspend fun check(currentVersionCode: Int): Available? = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url("${WinstoneApi.BASE_URL}/api/public/agent/version?version_code=$currentVersionCode")
            .get()
            .build()
        runCatching {
            client.newCall(req).execute().use { res ->
                if (!res.isSuccessful) return@use null
                val body = JSONObject(res.body?.string().orEmpty())
                if (!body.optBoolean("update_available")) return@use null
                val latest = body.optJSONObject("latest") ?: return@use null
                Available(
                    versionName = latest.optString("version_name", "?"),
                    versionCode = latest.optInt("version_code"),
                    mandatory = body.optBoolean("mandatory"),
                    notes = latest.optString("release_notes").takeIf {
                        it.isNotBlank() && it != "null"
                    },
                    downloadUrl = WinstoneApi.BASE_URL +
                        body.optString("download_url", "/api/public/download/apk"),
                )
            }
        }.getOrNull()
    }
}
