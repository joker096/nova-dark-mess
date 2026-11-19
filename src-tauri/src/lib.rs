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

      // Android: the Keystore-backed keychain is a stub in this build
      // (the `android_keystore` crate is not published on crates.io), so
      // setup defers to the default and keychain operations degrade to
      // frontend localStorage on Android.
      #[cfg(target_os = "android")]
      {
        let _ = app;
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
