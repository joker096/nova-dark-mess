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

      // Android: initialise the Keystore-backed keychain with the app Context.
      // Tauri v2 exposes the Android Context and JavaVM through the app handle;
      // the exact method name may need adjustment to the installed Tauri version.
      #[cfg(target_os = "android")]
      {
        use jni::objects::JObject;
        use jni::sys::JavaVM;
        use std::ptr::NonNull;

        // Obtain the JNIEnv for the current (main) thread and the application
        // Context. Tauri v2 on Android runs setup on the main thread which is
        // already attached to the JVM. Any failure here degrades gracefully to
        // localStorage on the frontend side.
        if let Ok(env) = app.handle().env() {
          if let Ok(vm) = env.get_java_vm() {
            if let Ok(context) = app.handle().android_context() {
              if let Ok(context_global) = env.new_global_ref(context) {
                keychain::init_android_keystore(
                  vm.as_ptr() as *mut JavaVM as usize,
                  context_global.as_raw() as i64,
                );
              }
            }
          }
        }
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
