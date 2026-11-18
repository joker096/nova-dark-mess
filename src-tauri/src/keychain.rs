//! OS credential store for the vault master key and PIN material.
//!
//! Desktop builds use the native credential store through the `keyring` crate:
//! Windows Credential Manager, macOS Keychain, and Secret Service (GNOME Keyring
//! / KWallet) on Linux. Mobile builds have no binding here and return an
//! explicit error, so the frontend can never mistake a successful call for a
//! secret that was silently written to disk.
//!
//! The service name is fixed: the frontend passes one for API symmetry, but a
//! secret never leaves the app's own namespace.

const SERVICE: &str = "nova-dark-messenger";

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
mod imp {
    use super::SERVICE;

    fn entry(account: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(SERVICE, account).map_err(|err| err.to_string())
    }

    pub fn get(account: &str) -> Result<Option<String>, String> {
        match entry(account)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(err.to_string()),
        }
    }

    pub fn set(account: &str, value: &str) -> Result<(), String> {
        entry(account)?.set_password(value).map_err(|err| err.to_string())
    }

    pub fn remove(account: &str) -> Result<(), String> {
        match entry(account)?.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(err.to_string()),
        }
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
mod imp {
    const UNSUPPORTED: &str = "OS keychain is unavailable on this platform";

    pub fn get(_account: &str) -> Result<Option<String>, String> {
        Err(UNSUPPORTED.to_string())
    }

    pub fn set(_account: &str, _value: &str) -> Result<(), String> {
        Err(UNSUPPORTED.to_string())
    }

    pub fn remove(_account: &str) -> Result<(), String> {
        Err(UNSUPPORTED.to_string())
    }
}

/// Whether this build has a native credential store. The frontend asks once and
/// only then treats the platform as OS-backed; a build without one is reported
/// honestly instead of pretending a write succeeded securely.
#[tauri::command]
pub fn keychain_available() -> bool {
    cfg!(any(target_os = "windows", target_os = "macos", target_os = "linux"))
}

#[tauri::command]
pub fn keychain_get(service: String, account: String) -> Result<Option<String>, String> {
    let _ = service;
    imp::get(&account)
}

#[tauri::command]
pub fn keychain_set(service: String, account: String, value: String) -> Result<(), String> {
    let _ = service;
    imp::set(&account, &value)
}

#[tauri::command]
pub fn keychain_remove(service: String, account: String) -> Result<(), String> {
    let _ = service;
    imp::remove(&account)
}
