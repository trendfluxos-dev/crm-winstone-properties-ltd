package com.winstone.connect.telephony

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.winstone.connect.R

/**
 * Keeps call recording alive, legitimately and visibly.
 *
 * Android only lets a microphone recording continue in the background while a
 * foreground service of type `microphone` is running, and it requires a
 * notification the user can see the whole time. So the recorder runs under this
 * service instead of being started from a receiver and silently killed when the
 * process is trimmed. Nothing is hidden from the agent: the notification stays
 * up for the entire call.
 */
class CallRecordingService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        ensureChannel(this)
        startForeground(NOTIFICATION_ID, notification(this))
        return START_STICKY
    }

    private fun notification(context: Context): Notification =
        NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("কল রেকর্ড হচ্ছে")
            .setContentText("Winstone Connect চলমান কলটি রেকর্ড করছে")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

    companion object {
        private const val CHANNEL_ID = "winstone_call_recording"
        private const val NOTIFICATION_ID = 4231

        private fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < 26) return
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            if (manager.getNotificationChannel(CHANNEL_ID) != null) return
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "কল রেকর্ডিং", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "চলমান কল রেকর্ড হওয়ার সময় দেখানো হয়"
                },
            )
        }

        fun start(context: Context) {
            val intent = Intent(context, CallRecordingService::class.java)
            runCatching {
                if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent)
                else context.startService(intent)
            }
        }

        fun stop(context: Context) {
            runCatching { context.stopService(Intent(context, CallRecordingService::class.java)) }
        }
    }
}
