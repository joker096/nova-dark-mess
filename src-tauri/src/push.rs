use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_push::{PushExt, PushToken};

/// Initialize push notifications on mobile
pub async fn init_push<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    // Register for push notifications
    let _ = app.push().register().await.map_err(|e| e.to_string())?;

    // Listen for push token registration
    let handle = app.clone();
    app.push().on_token(move |token: PushToken| {
        let token_str = match token {
            PushToken::Fcm(token) => format!("fcm:{}", token),
            PushToken::Apns(token) => format!("apns:{}", token),
        };
        // Emit to frontend
        let _ = handle.emit("push-token", token_str);
        // Store token for later use
        crate::push::store_push_token(&handle, &token_str);
    });

    // Listen for incoming push messages
    let handle = app.clone();
    app.push().on_notification(move |notification| {
        let _ = handle.emit("push-notification", notification);
    });

    Ok(())
}

/// Store push token locally
fn store_push_token<R: Runtime>(app: &AppHandle<R>, token: &str) {
    // Store in Tauri's secure storage or app data directory
    let _ = app.save_config("push_token".to_string(), token);
}

/// Tauri command: Register for push notifications and return token
#[tauri::command]
pub async fn register_push_token<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    app.push()
        .register()
        .await
        .map_err(|e| e.to_string())?;

    // Wait for token (with timeout)
    let (tx, rx) = tokio::sync::oneshot::channel();
    let handle = app.clone();
    let _unlisten = app.push().on_token(move |token: PushToken| {
        let token_str = match token {
            PushToken::Fcm(token) => format!("fcm:{}", token),
            PushToken::Apns(token) => format!("apns:{}", token),
        };
        let _ = tx.send(token_str);
    });

    match tokio::time::timeout(std::time::Duration::from_secs(10), rx).await {
        Ok(Ok(token)) => {
            store_push_token(&app, &token);
            Ok(token)
        }
        Ok(Err(_)) => Err("Channel closed".to_string()),
        Err(_) => Err("Timeout waiting for push token".to_string()),
    }
}

/// Tauri command: Unregister from push notifications
#[tauri::command]
pub async fn unregister_push_token<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    app.push()
        .unregister()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Tauri command: Get stored push token
#[tauri::command]
pub async fn get_push_token<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    // Try to load from config
    if let Ok(Some(token)) = app.load_config::<String>("push_token") {
        Ok(Some(token))
    } else {
        Ok(None)
    }
}