package com.example.dolphinappbuilder

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

/** Keeps the device CPU awake and shows an ongoing notification while the WebView build flow runs. */
class BuildForegroundService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null
    private val channelId = "dolphin_build_progress"
    private val notificationId = 4701

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, "Build progress", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Keeps Dolphin App Builder active during uploads and remote builds"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
        val notification: Notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, channelId)
                .setContentTitle("Dolphin App Builder")
                .setContentText("Build running in the background")
                .setSmallIcon(android.R.drawable.stat_sys_upload)
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_PROGRESS)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setContentTitle("Dolphin App Builder")
                .setContentText("Build running in the background")
                .setSmallIcon(android.R.drawable.stat_sys_upload)
                .setOngoing(true)
                .build()
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(notificationId, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(notificationId, notification)
        }
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "DolphinAppBuilder:BuildWakeLock").apply {
            setReferenceCounted(false)
            acquire(6 * 60 * 60 * 1000L) // Safety timeout; Android also limits data-sync foreground services.
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY

    override fun onDestroy() {
        try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Exception) {}
        wakeLock = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
