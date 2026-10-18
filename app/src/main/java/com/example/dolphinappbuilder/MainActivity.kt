package com.example.dolphinappbuilder

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.content.ContentValues
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import java.io.File
import android.webkit.*
import android.widget.Toast

class MainActivity : Activity() {
    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val fileRequest = 77

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), 78)
        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = false
        web.settings.allowContentAccess = true
        web.addJavascriptInterface(NativeBridge(), "DolphinNative")
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView?, callback: ValueCallback<Array<Uri>>?, params: FileChooserParams?): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/zip", "application/x-zip-compressed", "application/octet-stream"))
                }
                return try { startActivityForResult(intent, fileRequest); true }
                catch (e: Exception) { fileCallback?.onReceiveValue(null); fileCallback = null; false }
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                return !request?.url.toString().startsWith("file:///android_asset/")
            }
        }
        setContentView(web)
        web.loadUrl("file:///android_asset/index.html")
    }

    @Deprecated("Deprecated Android callback retained for compatibility")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == fileRequest) {
            if (resultCode == RESULT_OK && data?.data != null) fileCallback?.onReceiveValue(arrayOf(data.data!!))
            else fileCallback?.onReceiveValue(null)
            fileCallback = null
        }
    }


    /** Bridge for the bundled page: background-work service and saving build results to Downloads. */
    inner class NativeBridge {
        @JavascriptInterface
        fun startBackgroundWork() {
            try {
                val intent = Intent(this@MainActivity, BuildForegroundService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent) else startService(intent)
            } catch (e: Exception) {
                runOnUiThread { Toast.makeText(this@MainActivity, "Could not start background mode: ${e.message}", Toast.LENGTH_LONG).show() }
            }
        }

        @JavascriptInterface
        fun stopBackgroundWork() {
            try { stopService(Intent(this@MainActivity, BuildForegroundService::class.java)) } catch (_: Exception) {}
        }

        @JavascriptInterface
        fun copyText(text: String): Boolean {
            return try {
                val cm = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                cm.setPrimaryClip(android.content.ClipData.newPlainText("Dolphin build logs", text))
                true
            } catch (e: Exception) { false }
        }

        @JavascriptInterface
        fun saveFile(name: String, base64: String): String? {
            return try {
                val safe = name.replace(Regex("[^A-Za-z0-9._-]"), "_")
                val bytes = Base64.decode(base64, Base64.DEFAULT)
                if (Build.VERSION.SDK_INT >= 29) {
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, safe)
                        put(MediaStore.Downloads.MIME_TYPE, if (safe.endsWith(".apk")) "application/vnd.android.package-archive" else "application/zip")
                        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return null
                    contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: return null
                    "Downloads/$safe"
                } else {
                    val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: return null
                    dir.mkdirs()
                    val f = File(dir, safe)
                    f.writeBytes(bytes)
                    f.absolutePath
                }
            } catch (e: Exception) {
                runOnUiThread { Toast.makeText(this@MainActivity, "Save failed: ${e.message}", Toast.LENGTH_LONG).show() }
                null
            }
        }
    }

    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() { web.stopLoading(); web.destroy(); super.onDestroy() }
}
