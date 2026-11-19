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
    use android_keystore::AndroidKeyStore;
    use jni::JNIEnv;
    use jni::objects::{JObject};
    use jni::sys::JavaVM;
    use std::sync::OnceLock;

    const SERVICE: &str = "nova-dark-messenger";

    // Globals initialized once from Tauri setup on Android.
    // The JavaVM pointer and the application Context (global JNI ref) are
    // stored here so keychain_get/set/remove can attach to the VM and
    // obtain a JNIEnv on any thread.
    static JAVA_VM: OnceLock<*mut JavaVM> = OnceLock::new();
    static ANDROID_CONTEXT: OnceLock<JObject> = OnceLock::new();

    /// Initialize the Android keystore backing. Called from Tauri setup with
    // the JavaVM pointer and the application Context (as a global JNI ref).
    pub fn init_android(vm: *mut JavaVM, context: JObject) {
        let _ = JAVA_VM.set(vm);
        let _ = ANDROID_CONTEXT.set(context);
    }

    /// Attach the current thread to the Java VM and run `f` with a JNIEnv.
    fn with_env<F, R>(f: F) -> Result<R, String>
    where
        F: FnOnce(&mut JNIEnv) -> Result<R, String>,
    {
        let vm = JAVA_VM.get().ok_or("Android VM not initialized")?;
        // Safety: the VM pointer came from a valid JNI invocation in setup.
        let mut env =
            unsafe { (*vm).attach_current_thread_as_daemon().map_err(|e| e.to_string())? };
        f(&mut env)
    }

    fn keystore<'a>(env: &'a mut JNIEnv) -> Result<AndroidKeyStore<'a>, String> {
        let context = ANDROID_CONTEXT
            .get()
            .ok_or("Android Context not initialized")?;
        Ok(AndroidKeyStore::new(env, context))
    }

    fn alias(account: &str) -> String {
        format!("{}_{}", SERVICE, account.replace(|c: char| !c.is_alphanumeric(), "_"))
    }

    pub fn get(account: &str) -> Result<Option<String>, String> {
        with_env(|env| {
            let keystore = keystore(env)?;
            let alias = alias(account);
            match keystore.get_key(&alias) {
                Ok(Some(bytes)) => String::from_utf8(bytes)
                    .map(Some)
                    .map_err(|e| e.to_string()),
                Ok(None) => Ok(None),
                Err(e) => Err(e.to_string()),
            }
        })
    }

    pub fn set(account: &str, value: &str) -> Result<(), String> {
        with_env(|env| {
            let keystore = keystore(env)?;
            let alias = alias(account);
            // Delete any existing key first (Android Keystore does not overwrite).
            let _ = keystore.delete_key(&alias);
            keystore.generate_key(&alias, value.as_bytes())
        })
    }

    pub fn remove(account: &str) -> Result<(), String> {
        with_env(|env| {
            let keystore = keystore(env)?;
            let alias = alias(account);
            keystore.delete_key(&alias)
        })
    }
}

/// Public wrapper for `imp::init_android` so `lib.rs` can call it from the
// setup hook despite `imp` being a private module.
#[cfg(target_os = "android")]
pub fn init_android_keystore(vm_ptr: usize, context_global_ref: i64) {
    use jni::objects::JObject;
    use std::ptr::NonNull;

    let vm = NonNull::new(vm_ptr as *mut jni::sys::JavaVM)
        .expect("Null JavaVM pointer")
        .as_ptr();

    let context = unsafe { JObject::from_raw(context_global_ref as jni::sys::jobject) };

    imp::init_android(vm, context);
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
        target_os = "android",
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
