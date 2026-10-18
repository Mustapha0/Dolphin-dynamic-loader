package com.example.generatedapp

import android.app.Activity
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse

class MainActivity : Activity() {
  private var web: WebView? = null
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val assetLoader = WebViewAssetLoader.Builder()
      .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
      .build()
    val web = WebView(this)
    this.web = web
    web.settings.javaScriptEnabled = true
    web.settings.domStorageEnabled = true
    web.settings.allowFileAccess = false
    web.settings.allowContentAccess = true
    web.webViewClient = object : WebViewClientCompat() {
      override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
        assetLoader.shouldInterceptRequest(request.url)
    }
    web.webChromeClient = WebChromeClient()
    setContentView(web)
    web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")
  }

  override fun onBackPressed() {
    val w = web
    if (w != null && w.canGoBack()) w.goBack() else super.onBackPressed()
  }
}
