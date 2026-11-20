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
    use jni::JNIEnv;
    use jni::objects::{JByteArray, JObject, JValue};
    use std::sync::OnceLock;

    static JAVA_VM: OnceLock<jni::JavaVM> = OnceLock::new();

    /// Called from Tauri `setup` via `run_on_android_context` to store the JVM.
    pub(crate) fn init_android(vm: jni::JavaVM) {
        let _ = JAVA_VM.set(vm);
    }

    fn env() -> Result<jni::AttachGuard<'static>, String> {
        let vm = JAVA_VM.get().ok_or("Android JVM not initialized")?;
        vm.attach_current_thread().map_err(|e| e.to_string())
    }

    fn keystore<'env, 'local>(
        env: &'env mut JNIEnv<'local>,
    ) -> Result<JObject<'local>, String> {
        // KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        let ks_class = env
            .find_class("java/security/KeyStore")
            .map_err(|e| e.to_string())?;
        let ks_val = env.call_static_method(
            ks_class,
            "getInstance",
            "(Ljava/lang/String;)Ljava/security/KeyStore;",
            &[JValue::Object(
                &env.new_string("AndroidKeyStore")
                    .map_err(|e| e.to_string())?.into(),
            )],
        ).map_err(|e| e.to_string())?;
        let ks = ks_val.l().map_err(|e| e.to_string())?;

        // keyStore.load(null);
        env.call_method(
            &ks,
            "load",
            "(Ljava/security/KeyStore$LoadStoreParameter;)V",
            &[JValue::Object(&JObject::null())],
        ).map_err(|e| e.to_string())?;

        Ok(ks)
    }

    pub fn get(account: &str) -> Result<Option<String>, String> {
        let mut env = env()?;
        let ks = keystore(&mut env)?;

        // KeyStore.Entry entry = keyStore.getEntry(account, null);
        let j_account = env.new_string(account).map_err(|e| e.to_string())?;
        let entry_val = env.call_method(
            &ks,
            "getEntry",
            "(Ljava/lang/String;Ljava/security/KeyStore$ProtectionParameter;)Ljava/security/KeyStore$Entry;",
            &[
                JValue::Object(&j_account.into()),
                JValue::Object(&JObject::null()),
            ],
        ).map_err(|e| e.to_string())?;
        let entry = entry_val.l().map_err(|e| e.to_string())?;

        if entry.is_null() {
            return Ok(None);
        }

        // if (!(entry instanceof KeyStore.SecretKeyEntry)) return null;
        let ske_class = env
            .find_class("java/security/KeyStore$SecretKeyEntry")
            .map_err(|e| e.to_string())?;
        if !env.is_instance_of(&entry, ske_class).map_err(|e| e.to_string())? {
            return Ok(None);
        }

        // SecretKey key = ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        let key_val = env.call_method(
            entry,
            "getSecretKey",
            "()Ljavax/crypto/SecretKey;",
            &[],
        ).map_err(|e| e.to_string())?;
        let secret_key = key_val.l().map_err(|e| e.to_string())?;

        // byte[] encoded = key.getEncoded();
        let encoded_val = env.call_method(
            secret_key,
            "getEncoded",
            "()[B",
            &[],
        ).map_err(|e| e.to_string())?;
        let encoded = encoded_val.l().map_err(|e| e.to_string())?;

        let byte_array: JByteArray = encoded.into();
        let len = env.get_array_length(&byte_array).map_err(|e| e.to_string())?;
        let mut buf = vec![0i8; len as usize];
        env.get_byte_array_region(&byte_array, 0, &mut buf)
            .map_err(|e| e.to_string())?;
        let bytes: Vec<u8> = buf.into_iter().map(|b| b as u8).collect();

        Ok(String::from_utf8(bytes).ok())
    }

    pub fn set(account: &str, value: &str) -> Result<(), String> {
        let mut env = env()?;
        let ks = keystore(&mut env)?;

        // SecretKeySpec secretKey = new SecretKeySpec(value.getBytes("UTF-8"), "AES");
        let sks_class = env
            .find_class("javax/crypto/spec/SecretKeySpec")
            .map_err(|e| e.to_string())?;
        let value_bytes = env
            .byte_array_from_slice(value.as_bytes())
            .map_err(|e| e.to_string())?;
        let j_algorithm = env.new_string("AES").map_err(|e| e.to_string())?;
        let secret_key = env.new_object(
            sks_class,
            "([BLjava/lang/String;)V",
            &[
                JValue::Object(&value_bytes.into()),
                JValue::Object(&j_algorithm.into()),
            ],
        ).map_err(|e| e.to_string())?;

        // KeyStore.Entry entry = new KeyStore.SecretKeyEntry(secretKey);
        let ske_class = env
            .find_class("java/security/KeyStore$SecretKeyEntry")
            .map_err(|e| e.to_string())?;
        let entry = env.new_object(
            ske_class,
            "(Ljavax/crypto/SecretKey;)V",
            &[JValue::Object(&secret_key)],
        ).map_err(|e| e.to_string())?;

        // keyStore.setEntry(account, entry, null);
        let j_account = env.new_string(account).map_err(|e| e.to_string())?;
        env.call_method(
            &ks,
            "setEntry",
            "(Ljava/lang/String;Ljava/security/KeyStore$Entry;Ljava/security/KeyStore$ProtectionParameter;)V",
            &[
                JValue::Object(&j_account.into()),
                JValue::Object(&entry),
                JValue::Object(&JObject::null()),
            ],
        ).map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn remove(account: &str) -> Result<(), String> {
        let mut env = env()?;
        let ks = keystore(&mut env)?;

        // keyStore.deleteEntry(account);
        let j_account = env.new_string(account).map_err(|e| e.to_string())?;
        env.call_method(
            &ks,
            "deleteEntry",
            "(Ljava/lang/String;)V",
            &[JValue::Object(&j_account.into())],
        ).map_err(|e| e.to_string())?;

        Ok(())
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
