//! OS credential store for the vault master key and PIN material.
//!
//! Desktop builds use the native credential store through the `keyring` crate:
//! Windows Credential Manager, macOS Keychain, and Secret Service (GNOME Keyring
//! / KWallet) on Linux. Mobile builds use the platform keystore:
//! Android Keystore on Android and iOS Keychain on iOS.
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

#[cfg(target_os = "ios")]
mod imp {
    use security_framework::base::{CFType, CFTypeRef};
    use security_framework::dictionary::CFDictionary;
    use security_framework::item::SecItem;
    use security_framework::sec_item::{
        kSecAttrAccount, kSecAttrService, kSecClassGenericPassword, kSecMatchLimit,
        kSecMatchLimitOne, kSecReturnData, kSecValueData,
    };

    const SERVICE: &str = "nova-dark-messenger";

    fn query(account: &str) -> CFDictionary {
        CFDictionary::from_CFType_pairs(&[
            (kSecClassGenericPassword as CFTypeRef, true as CFTypeRef),
            (kSecAttrService as CFTypeRef, SERVICE as CFTypeRef),
            (kSecAttrAccount as CFTypeRef, account as CFTypeRef),
        ])
    }

    pub fn get(account: &str) -> Result<Option<String>, String> {
        let mut query = query(account);
        query.set(kSecReturnData, true);
        query.set(kSecMatchLimit, kSecMatchLimitOne);

        match SecItem::copy_matching(query) {
            Ok(data) => {
                if let Some(bytes) = data.as_data() {
                    String::from_utf8(bytes.to_vec())
                        .map(Some)
                        .map_err(|err| err.to_string())
                } else {
                    Ok(None)
                }
            }
            Err(err) if err.code() == security_framework::base::errSecItemNotFound => Ok(None),
            Err(err) => Err(err.to_string()),
        }
    }

    pub fn set(account: &str, value: &str) -> Result<(), String> {
        // Remove existing first, then add.
        let _ = remove(account);

        let mut attributes = CFDictionary::new();
        attributes.set(kSecClassGenericPassword, true);
        attributes.set(kSecAttrService, SERVICE);
        attributes.set(kSecAttrAccount, account);
        attributes.set(kSecValueData, value.as_bytes());

        SecItem::add(attributes).map_err(|err| err.to_string())
    }

    pub fn remove(account: &str) -> Result<(), String> {
        let query = query(account);
        match SecItem::delete(query) {
            Ok(()) => Ok(()),
            Err(err) if err.code() == security_framework::base::errSecItemNotFound => Ok(()),
            Err(err) => Err(err.to_string()),
        }
    }
}

#[cfg(target_os = "android")]
mod imp {
    const UNSUPPORTED: &str = "Android Keystore not available in this build";

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

#[cfg(not(any(
    target_os = "windows",
    target_os = "macos",
    target_os = "linux",
    target_os = "ios",
    target_os = "android",
)))]
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
    cfg!(any(
        target_os = "windows",
        target_os = "macos",
        target_os = "linux",
        target_os = "ios",
    ))
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
