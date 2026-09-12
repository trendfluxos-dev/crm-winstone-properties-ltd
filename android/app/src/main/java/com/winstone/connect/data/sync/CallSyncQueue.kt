package com.winstone.connect.data.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.winstone.connect.data.AgentSession
import com.winstone.connect.data.remote.WinstoneApi
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Never lose a call log to a dead network.
 *
 * Everything the phone must push to the CRM (recording upload, post-call
 * report and outcome) is queued through WorkManager, so it survives a lost
 * signal, an app kill and a reboot, and retries with backoff until the CRM
 * confirms it. This is what makes calls and messages *actually* land in the
 * database rather than only when the agent happens to have 4G.
 */
object CallSyncQueue {

    fun queueRecording(
        context: Context,
        leadId: String?,
        phoneNumber: String,
        file: File,
        durationSeconds: Int,
        twoSided: Boolean,
        incoming: Boolean = false,
        recorderSource: String = "unknown",
    ) {
        enqueue(
            context,
            unique = "rec_${file.name}",
            data = Data.Builder()
                .putString(KEY_KIND, KIND_RECORDING)
                .putString(KEY_LEAD, leadId)
                .putString(KEY_PHONE, phoneNumber)
                .putString(KEY_FILE, file.absolutePath)
                .putInt(KEY_DURATION, durationSeconds)
                .putBoolean(KEY_TWO_SIDED, twoSided)
                .putBoolean(KEY_INCOMING, incoming)
                .putString(KEY_SOURCE, recorderSource)
                .putString(KEY_UPLOAD_ID, file.name)
                .build(),
        )
    }

    /** Opens the mandatory post-call report for a finished call. */
    fun queueReportOpen(
        context: Context,
        leadId: String,
        phoneNumber: String,
        durationSeconds: Int,
        connected: Boolean,
    ) {
        enqueue(
            context,
            unique = "report_${leadId}_${System.currentTimeMillis() / 1000}",
            data = Data.Builder()
                .putString(KEY_KIND, KIND_REPORT_OPEN)
                .putString(KEY_LEAD, leadId)
                .putString(KEY_PHONE, phoneNumber)
                .putInt(KEY_DURATION, durationSeconds)
                .putBoolean(KEY_CONNECTED, connected)
                .build(),
        )
    }

    fun queueOutcome(context: Context, leadId: String, outcome: String, notes: String, connected: Boolean) {
        enqueue(
            context,
            unique = "out_${leadId}_${System.currentTimeMillis()}",
            data = Data.Builder()
                .putString(KEY_KIND, KIND_OUTCOME)
                .putString(KEY_LEAD, leadId)
                .putString(KEY_TEXT, notes)
                .putString(KEY_OUTCOME, outcome)
                .putBoolean(KEY_CONNECTED, connected)
                .build(),
        )
    }

    /**
     * Reports one observed call state. The unique work name is
     * callUid + state, so the same transition can never be sent twice even if
     * the phone reboots mid-queue.
     */
    fun queueCallState(
        context: Context,
        callUid: String,
        leadId: String,
        state: String,
        durationSeconds: Int = 0,
        phoneNumber: String? = null,
        recordingSupported: Boolean? = null,
        recordingNote: String? = null,
    ) {
        enqueue(
            context,
            unique = "state_${callUid}_$state",
            data = Data.Builder()
                .putString(KEY_KIND, KIND_CALL_STATE)
                .putString(KEY_CALL_UID, callUid)
                .putString(KEY_LEAD, leadId)
                .putString(KEY_STATE, state)
                .putInt(KEY_DURATION, durationSeconds)
                .putString(KEY_PHONE, phoneNumber)
                .putString(KEY_REC_NOTE, recordingNote)
                .apply { recordingSupported?.let { putBoolean(KEY_REC_SUPPORTED, it) } }
                .build(),
        )
    }

    /**
     * Reports one observed state of an *incoming* call. There is no lead id: the
     * CRM matches the caller's number to a lead, and creates one when the number
     * is new, so a customer's callback becomes a real lead.
     */
    fun queueIncomingCall(
        context: Context,
        callUid: String,
        phoneNumber: String,
        state: String,
        durationSeconds: Int = 0,
        recordingSupported: Boolean? = null,
        recordingNote: String? = null,
    ) {
        enqueue(
            context,
            unique = "incoming_${callUid}_$state",
            data = Data.Builder()
                .putString(KEY_KIND, KIND_INCOMING_CALL)
                .putString(KEY_CALL_UID, callUid)
                .putString(KEY_PHONE, phoneNumber)
                .putString(KEY_STATE, state)
                .putInt(KEY_DURATION, durationSeconds)
                .putString(KEY_REC_NOTE, recordingNote)
                .apply { recordingSupported?.let { putBoolean(KEY_REC_SUPPORTED, it) } }
                .build(),
        )
    }

    private fun enqueue(context: Context, unique: String, data: Data) {
        val request = OneTimeWorkRequestBuilder<CrmSyncWorker>()
            .setInputData(data)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        SyncStatus.queued(context)
        WorkManager.getInstance(context).enqueueUniqueWork(unique, ExistingWorkPolicy.KEEP, request)
    }

    const val KEY_CALL_UID = "call_uid"
    const val KEY_STATE = "state"
    const val KEY_REC_SUPPORTED = "recording_supported"
    const val KEY_REC_NOTE = "recording_note"
    const val KIND_CALL_STATE = "call_state"
    const val KEY_KIND = "kind"
    const val KEY_LEAD = "lead_id"
    const val KEY_PHONE = "phone"
    const val KEY_FILE = "file"
    const val KEY_DURATION = "duration"
    const val KEY_TWO_SIDED = "two_sided"
    const val KEY_INCOMING = "incoming"
    const val KEY_TEXT = "text"
    const val KEY_OUTCOME = "outcome"
    const val KEY_CONNECTED = "connected"
    const val KEY_SOURCE = "recorder_source"
    const val KEY_UPLOAD_ID = "client_upload_id"

    const val KIND_RECORDING = "recording"
    const val KIND_OUTCOME = "outcome"
    const val KIND_REPORT_OPEN = "report_open"
    const val KIND_INCOMING_CALL = "incoming_call"
}

class CrmSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val employeeId = AgentSession.employeeIdNow(applicationContext) ?: return Result.retry()
        val leadId = inputData.getString(CallSyncQueue.KEY_LEAD)
        val kind = inputData.getString(CallSyncQueue.KEY_KIND)

        return try {
            when (kind) {
                CallSyncQueue.KIND_RECORDING -> {
                    val path = inputData.getString(CallSyncQueue.KEY_FILE) ?: return Result.failure()
                    val file = File(path)
                    if (!file.exists()) return Result.failure()
                    WinstoneApi.uploadRecording(
                        leadId = leadId,
                        phoneNumber = inputData.getString(CallSyncQueue.KEY_PHONE).orEmpty(),
                        employeeId = employeeId,
                        agentId = AgentSession.agentIdNow(applicationContext),
                        file = file,
                        durationSeconds = inputData.getInt(CallSyncQueue.KEY_DURATION, 0),
                        twoSided = inputData.getBoolean(CallSyncQueue.KEY_TWO_SIDED, true),
                        incoming = inputData.getBoolean(CallSyncQueue.KEY_INCOMING, false),
                        clientUploadId = inputData.getString(CallSyncQueue.KEY_UPLOAD_ID),
                        recorderSource = inputData.getString(CallSyncQueue.KEY_SOURCE) ?: "unknown",
                    )
                    file.delete()
                    Result.success()
                }

                CallSyncQueue.KIND_INCOMING_CALL -> {
                    val callUid = inputData.getString(CallSyncQueue.KEY_CALL_UID)
                    val phone = inputData.getString(CallSyncQueue.KEY_PHONE)
                    if (callUid == null || phone.isNullOrBlank()) return Result.failure()
                    WinstoneApi.postIncomingCall(
                        callUid = callUid,
                        phoneNumber = phone,
                        state = inputData.getString(CallSyncQueue.KEY_STATE).orEmpty(),
                        durationSeconds = inputData.getInt(CallSyncQueue.KEY_DURATION, 0),
                        recordingSupported =
                            if (inputData.keyValueMap.containsKey(CallSyncQueue.KEY_REC_SUPPORTED))
                                inputData.getBoolean(CallSyncQueue.KEY_REC_SUPPORTED, false)
                            else null,
                        recordingNote = inputData.getString(CallSyncQueue.KEY_REC_NOTE),
                    )
                    Result.success()
                }

                CallSyncQueue.KIND_OUTCOME -> {
                    if (leadId == null) return Result.failure()
                    WinstoneApi.postCallOutcome(
                        leadId = leadId,
                        agentId = AgentSession.agentIdNow(applicationContext),
                        outcome = inputData.getString(CallSyncQueue.KEY_OUTCOME).orEmpty(),
                        notes = inputData.getString(CallSyncQueue.KEY_TEXT).orEmpty(),
                        connected = inputData.getBoolean(CallSyncQueue.KEY_CONNECTED, false),
                    )
                    Result.success()
                }

                CallSyncQueue.KIND_REPORT_OPEN -> {
                    if (leadId == null) return Result.failure()
                    WinstoneApi.openReport(
                        leadId = leadId,
                        recordingId = null,
                        phoneNumber = inputData.getString(CallSyncQueue.KEY_PHONE),
                        durationSeconds = inputData.getInt(CallSyncQueue.KEY_DURATION, 0),
                        connected = inputData.getBoolean(CallSyncQueue.KEY_CONNECTED, false),
                    )
                    Result.success()
                }

                CallSyncQueue.KIND_CALL_STATE -> {
                    val callUid = inputData.getString(CallSyncQueue.KEY_CALL_UID)
                    if (leadId == null || callUid == null) return Result.failure()
                    WinstoneApi.postCallState(
                        callUid = callUid,
                        leadId = leadId,
                        state = inputData.getString(CallSyncQueue.KEY_STATE).orEmpty(),
                        durationSeconds = inputData.getInt(CallSyncQueue.KEY_DURATION, 0),
                        agentPhone = inputData.getString(CallSyncQueue.KEY_PHONE),
                        recordingSupported =
                            if (inputData.keyValueMap.containsKey(CallSyncQueue.KEY_REC_SUPPORTED))
                                inputData.getBoolean(CallSyncQueue.KEY_REC_SUPPORTED, false)
                            else null,
                        recordingNote = inputData.getString(CallSyncQueue.KEY_REC_NOTE),
                    )
                    Result.success()
                }

                else -> Result.failure()
            }.also { if (it is Result.Success) SyncStatus.succeeded(applicationContext) }
        } catch (error: Exception) {
            // 4xx = bad payload, retrying will not help; anything else is transient.
            val message = error.message.orEmpty()
            val giveUp = message.contains("Invalid payload") || message.contains("Unauthorized")
            // A call recording and its report are the audit trail of the call:
            // never give up on them while the failure could still be the network.
            val keepTrying = !giveUp && (
                kind == CallSyncQueue.KIND_RECORDING ||
                    kind == CallSyncQueue.KIND_REPORT_OPEN ||
                    kind == CallSyncQueue.KIND_CALL_STATE ||
                    runAttemptCount < 12
                )
            if (keepTrying) {
                SyncStatus.retrying(applicationContext, message)
                Result.retry()
            } else {
                SyncStatus.failed(applicationContext, message)
                Result.failure()
            }
        }
    }
}
