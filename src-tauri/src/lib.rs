mod anon_net;
mod keychain;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
        anon_net::anon_socks_request,
        anon_net::anon_tor_check,
        keychain::keychain_available,
        keychain::keychain_get,
        keychain::keychain_set,
        keychain::keychain_remove
    ])
    .on_permission_request(|_, kind| match kind {
      tauri::webview::PermissionKind::Camera
      | tauri::webview::PermissionKind::Microphone => {
        tauri::webview::PermissionResponse::Allow
      }
      tauri::webview::PermissionKind::Geolocation => {
        tauri::webview::PermissionResponse::Allow
      }
      _ => tauri::webview::PermissionResponse::Default,
    })
    .plugin(tauri_plugin_deep_link::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Desktop deep links (`nova://chat/<id>`) are only registered by the
      // installed bundle, so register the configured schemes during dev too.
      #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
      {
        use tauri_plugin_deep_link::DeepLinkExt;
        if let Err(err) = app.deep_link().register_all() {
          log::warn!("deep link registration failed: {err}");
        }
      }

      // Android: Keystore-backed keychain via JNI (AndroidKeyStore).
      // Grab the JavaVM and app Context from the WebView's JNI handle. This is
      // the supported way to reach the Android JVM in Tauri 2; there is no
      // public `android::activity()`.
      #[cfg(target_os = "android")]
      {
        use tauri::Manager;
        match app.get_webview_window("main") {
          Some(window) => {
            if let Err(err) = window.with_webview(|webview| {
              webview.jni_handle().exec(|env, context, _webview| {
                match env.get_java_vm() {
                  Ok(vm) => {
                    // Keep a global ref to the app Context so the keychain can
                    // reach getFilesDir() for its encrypted blob storage.
                    match env.new_global_ref(&context) {
                      Ok(ctx_ref) => crate::keychain::init_android(vm, ctx_ref),
                      Err(ref_err) => {
                        log::warn!("android keystore: context ref failed: {ref_err}")
                      }
                    }
                  }
                  Err(err) => log::warn!("android keystore: JavaVM unavailable: {err}"),
                }
              });
            }) {
              log::warn!("android keystore: with_webview failed: {err}");
            }
          }
          None => log::warn!("android keystore: main window not found"),
        }
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
