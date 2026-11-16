package com.messanger.e2e

import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // Status/navigation bar strips inherit the window background.
    window.setBackgroundDrawable(ColorDrawable(Color.parseColor("#090A0E")))

    // The app canvas is always dark, so system bar icons must stay light even
    // when the device itself is set to a light theme.
    WindowInsetsControllerCompat(window, window.decorView).apply {
      isAppearanceLightStatusBars = false
      isAppearanceLightNavigationBars = false
    }

    // Keep the webview out from under the status bar, cutout and gesture bar.
    // Chrome WebViews before 140 report zero for env(safe-area-inset-*), so the
    // shell applies the same insets natively and the CSS side zeroes its own
    // safe-area variables (see native-safe-insets in index.css).
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      val cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
      view.setPadding(
        maxOf(bars.left, cutout.left),
        maxOf(bars.top, cutout.top),
        maxOf(bars.right, cutout.right),
        maxOf(bars.bottom, cutout.bottom),
      )
      insets
    }
    content.requestApplyInsets()
  }
}
