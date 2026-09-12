package com.winstone.connect.telephony

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import android.telecom.TelecomManager
import java.io.File

/**
 * Records the running call to an .m4a file in the app's private cache.
 *
 * Two-sided capture: VOICE_COMMUNICATION is the source Android still allows on
 * modern devices. On phones where the OEM blocks call audio the file will hold
 * the agent side only — the CRM marks that recording `is_two_sided = false`,
 * which is why uploadRecording() passes the flag through instead of assuming.
 */
class CallRecorder(private val context: Context) {

    private var recorder: MediaRecorder? = null
    private var output: File? = null
    private var startedAt: Long = 0L
    var twoSided: Boolean = true; private set

    /** voice_call = call audio source accepted, mic = OEM refused and we fell back. */
    var recorderSource: String = "unknown"; private set

    /** Why recording could not start on this device (null when it did start). */
    var unavailableReason: String? = null; private set

    val isRecording: Boolean get() = recorder != null

    fun start(leadId: String?): Boolean {
        stopQuietly()
        unavailableReason = null
        val capability = RecordingCapabilityCheck.check(context)
        if (!capability.available) {
            // Never fabricate a recording: report the technical reason instead.
            unavailableReason = capability.reason
            recorderSource = "unavailable"
            return false
        }
        val dir = File(context.cacheDir, "calls").apply { mkdirs() }
        val file = File(dir, "call_${leadId ?: "unknown"}_${System.currentTimeMillis()}.m4a")

        val rec = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else @Suppress("DEPRECATION") MediaRecorder()
        return try {
            rec.setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
            twoSided = true
            recorderSource = "voice_call"
            rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            rec.setAudioSamplingRate(44_100)
            rec.setAudioEncodingBitRate(96_000)
            rec.setOutputFile(file.absolutePath)
            rec.prepare()
            rec.start()
            recorder = rec
            output = file
            startedAt = System.currentTimeMillis()
            true
        } catch (first: Exception) {
            // Device refused call audio — fall back to the microphone so the
            // agent side is still captured and audited.
            runCatching { rec.reset() }
            return try {
                rec.setAudioSource(MediaRecorder.AudioSource.MIC)
                twoSided = false
                recorderSource = "mic"
                rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                rec.setOutputFile(file.absolutePath)
                rec.prepare()
                rec.start()
                recorder = rec
                output = file
                startedAt = System.currentTimeMillis()
                true
            } catch (second: Exception) {
                unavailableReason = second.message ?: second.javaClass.simpleName
                recorderSource = "unavailable"
                runCatching { rec.release() }
                recorder = null
                output = null
                false
            }
        }
    }

    /** Stops recording and returns the file plus its length in seconds. */
    fun stopAndGetFile(): Pair<File, Int>? {
        val rec = recorder ?: return null
        val file = output
        recorder = null
        output = null
        runCatching { rec.stop() }
        runCatching { rec.release() }
        if (file == null || !file.exists() || file.length() < 1_024) {
            file?.delete()
            return null
        }
        val seconds = ((System.currentTimeMillis() - startedAt) / 1000L).toInt().coerceAtLeast(1)
        return file to seconds
    }

    fun stopQuietly() {
        recorder?.let { runCatching { it.stop() }; runCatching { it.release() } }
        recorder = null
        output = null
    }

    /** Ends the live call (API 28+, needs ANSWER_PHONE_CALLS). */
    @Suppress("MissingPermission")
    fun hangUp() {
        if (Build.VERSION.SDK_INT < 28) return
        val telecom = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager ?: return
        runCatching { telecom.endCall() }
    }
}
