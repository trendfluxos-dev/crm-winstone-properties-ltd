package com.winstone.connect.telephony

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import androidx.core.content.ContextCompat
import java.io.File

/**
 * Honest recording capability check.
 *
 * Automatic two-way call recording is NOT available on every Android phone:
 * from Android 10 onward Google blocks call-audio capture for normal apps, and
 * many OEMs block it entirely. So instead of assuming, we probe the device once
 * per call and report exactly what is possible, in plain Bengali, with a
 * technical reason that is logged and shown to the agent.
 *
 * No result of this check ever stops the call or the mandatory report.
 */
enum class RecordingSupport {
    /** Call audio (both sides) accepted by this device. */
    TWO_SIDED,

    /** Only the agent's microphone can be captured. */
    AGENT_SIDE_ONLY,

    /** Nothing can be recorded — permission, OS or OEM refusal. */
    UNAVAILABLE,
}

data class RecordingCapability(
    val support: RecordingSupport,
    /** Short Bengali line for the agent. */
    val label: String,
    /** Technical reason, kept for the CRM log. */
    val reason: String,
) {
    val available: Boolean get() = support != RecordingSupport.UNAVAILABLE
}

object RecordingCapabilityCheck {

    @Volatile
    private var cached: RecordingCapability? = null

    fun cachedOrNull(): RecordingCapability? = cached

    /** Probes the device by briefly preparing a recorder; result is cached. */
    fun check(context: Context, force: Boolean = false): RecordingCapability {
        cached?.takeIf { !force }?.let { return it }

        val result = when {
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED ->
                RecordingCapability(
                    RecordingSupport.UNAVAILABLE,
                    "রেকর্ডিং বন্ধ — মাইক্রোফোন অনুমতি নেই",
                    "RECORD_AUDIO permission not granted",
                )

            else -> probe(context)
        }
        cached = result
        return result
    }

    private fun probe(context: Context): RecordingCapability {
        val voice = canPrepare(context, MediaRecorder.AudioSource.VOICE_COMMUNICATION)
        if (voice == null) {
            return RecordingCapability(
                RecordingSupport.TWO_SIDED,
                "রেকর্ডিং চালু — দুই পাশের কথা",
                "VOICE_COMMUNICATION accepted (Android ${Build.VERSION.SDK_INT}, ${Build.MANUFACTURER} ${Build.MODEL})",
            )
        }
        val mic = canPrepare(context, MediaRecorder.AudioSource.MIC)
        if (mic == null) {
            return RecordingCapability(
                RecordingSupport.AGENT_SIDE_ONLY,
                "রেকর্ডিং চালু — শুধু এজেন্টের পাশ",
                "OEM blocked call audio ($voice); falling back to MIC on Android ${Build.VERSION.SDK_INT}, ${Build.MANUFACTURER} ${Build.MODEL}",
            )
        }
        return RecordingCapability(
            RecordingSupport.UNAVAILABLE,
            "এই ফোনে কল রেকর্ডিং সম্ভব নয়",
            "call audio blocked ($voice); microphone blocked ($mic) on Android ${Build.VERSION.SDK_INT}, ${Build.MANUFACTURER} ${Build.MODEL}",
        )
    }

    /** Returns null when the source works, otherwise the failure message. */
    private fun canPrepare(context: Context, source: Int): String? {
        val probeFile = File(context.cacheDir, "rec_probe.m4a")
        val recorder =
            if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context)
            else @Suppress("DEPRECATION") MediaRecorder()
        return try {
            recorder.setAudioSource(source)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            recorder.setOutputFile(probeFile.absolutePath)
            recorder.prepare()
            null
        } catch (error: Exception) {
            error.message ?: error.javaClass.simpleName
        } finally {
            runCatching { recorder.release() }
            runCatching { probeFile.delete() }
        }
    }
}
