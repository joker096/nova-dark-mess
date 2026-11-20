//! OS credential store for the vault master key and PIN material.
//!
//! Desktop builds use the native credential store through the `keyring` crate:
//! Windows Credential Manager, macOS Keychain, and Secret Service (GNOME Keyring
//! / KWallet) on Linux. Mobile builds use the platform keystore:
//! Android Keystore on Android and iOS Keychain on iOS.
//!
//! The service name is fixed: the frontend passes one for API symmetry, but a
//! secret never leaves the app's own namespace.

// Used by the desktop (keyring) and iOS backends; Android stores its alias
// inside the Keystore itself, so the service name is unused there.
#[cfg_attr(target_os = "android", allow(dead_code))]
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

// Used by the desktop (keyring) and iOS backends; Android stores its alias
// inside the Keystore itself, so the service name is unused there.
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
pub fn init_android(vm: jni::JavaVM, context: jni::objects::GlobalRef) {
    imp::init_android(vm, context);
}

/// Android backend: a hardware-backed AES-256 key is generated inside
/// AndroidKeyStore (the key material never leaves the TEE), and the secret
/// value is stored only as an AES/GCM ciphertext in the app's private
/// files directory. The Keystore itself is not used to hold arbitrary
/// secrets — `setEntry` with a `SecretKeySpec` fails in practice — so the
/// key wraps, the blob stores.
#[cfg(target_os = "android")]
mod imp {
    use jni::objects::{GlobalRef, JByteArray, JObject, JValue};
    use jni::sys::jint;
    use jni::JNIEnv;
    use std::path::PathBuf;
    use std::sync::OnceLock;

    /// Magic prefix for the on-disk blob (defense against wrong-file reads).
    const BLOB_MAGIC: &[u8; 4] = b"NVKS";
    /// Cipher.ENCRYPT_MODE
    const CIPHER_ENCRYPT: jint = 1;
    /// Cipher.DECRYPT_MODE
    const CIPHER_DECRYPT: jint = 2;
    /// KeyProperties.PURPOSE_ENCRYPT | PURPOSE_DECRYPT
    const KEY_PURPOSES: jint = 1 | 2;
    /// GCM auth tag length in bits.
    const GCM_TAG_BITS: jint = 128;

    struct AndroidHandles {
        vm: jni::JavaVM,
        /// Global ref to the app Context, used for `getFilesDir()`.
        context: GlobalRef,
    }

    static HANDLES: OnceLock<AndroidHandles> = OnceLock::new();

    /// Called from Tauri `setup` via the WebView JNI handle. Captures both the
    /// JVM and a global ref to the app Context.
    pub fn init_android(vm: jni::JavaVM, context: GlobalRef) {
        let _ = HANDLES.set(AndroidHandles { vm, context });
    }

    /// True once the JVM + Context handles from the Android WebView were captured.
    pub fn is_initialized() -> bool {
        HANDLES.get().is_some()
    }

    fn env() -> Result<jni::AttachGuard<'static>, String> {
        let handles = HANDLES.get().ok_or("Android JVM not initialized")?;
        handles.vm.attach_current_thread().map_err(|e| e.to_string())
    }

    fn new_jstring<'local>(env: &mut JNIEnv<'local>, s: &str) -> Result<jni::objects::JString<'local>, String> {
        env.new_string(s).map_err(|e| e.to_string())
    }

    fn jbytearray_to_vec(env: &mut JNIEnv<'_>, arr: &JByteArray<'_>) -> Result<Vec<u8>, String> {
        let len = env.get_array_length(arr).map_err(|e| e.to_string())?;
        let mut buf = vec![0i8; len as usize];
        env.get_byte_array_region(arr, 0, &mut buf)
            .map_err(|e| e.to_string())?;
        Ok(buf.into_iter().map(|b| b as u8).collect())
    }

    fn jobject_to_vec(env: &mut JNIEnv<'_>, obj: JObject<'_>) -> Result<Vec<u8>, String> {
        let arr: JByteArray = obj.into();
        jbytearray_to_vec(env, &arr)
    }

    /// KeyStore "AndroidKeyStore", already loaded.
    fn load_keystore<'local>(env: &mut JNIEnv<'local>) -> Result<JObject<'local>, String> {
        let ks_class = env.find_class("java/security/KeyStore").map_err(|e| e.to_string())?;
        let provider: JObject = new_jstring(env, "AndroidKeyStore")?.into();
        let ks_val = env
            .call_static_method(
                ks_class,
                "getInstance",
                "(Ljava/lang/String;)Ljava/security/KeyStore;",
                &[JValue::Object(&provider)],
            )
            .and_then(|v| v.l())
            .map_err(|e| e.to_string())?;
        env.call_method(
            &ks_val,
            "load",
            "(Ljava/security/KeyStore$LoadStoreParameter;)V",
            &[JValue::Object(&JObject::null())],
        )
        .map_err(|e| e.to_string())?;
        Ok(ks_val)
    }

    /// App-private blob path: <filesDir>/keystore/<sanitized-account>.bin
    fn blob_path(env: &mut JNIEnv<'_>, account: &str) -> Result<PathBuf, String> {
        let handles = HANDLES.get().ok_or("Android JVM not initialized")?;
        let context = handles.context.as_obj();
        let files_dir = env
            .call_method(context, "getFilesDir", "()Ljava/io/File;", &[])
            .and_then(|v| v.l())
            .map_err(|e| e.to_string())?;
        let abs = env
            .call_method(&files_dir, "getAbsolutePath", "()Ljava/lang/String;", &[])
            .and_then(|v| v.l())
            .map_err(|e| e.to_string())?;
        let path_str: String = env
            .get_string((&abs).into())
            .map_err(|e| e.to_string())?
            .into();
        // Hex-encode the account so different accounts can never collide on a
        // sanitized filename, and no account value can escape the directory.
        let safe: String = account
            .bytes()
            .map(|b| format!("{b:02x}"))
            .collect();
        Ok(PathBuf::from(path_str).join("keystore").join(format!("{safe}.bin")))
    }

    /// Fetch — or lazily generate — the hardware-backed AES-256 key for the
    /// account alias. The generated key never leaves the TEE: only encrypt and
    /// decrypt operations are permitted, and only in GCM mode.
    fn keystore_aes_key<'local>(
        env: &mut JNIEnv<'local>,
        account: &str,
        create: bool,
    ) -> Result<JObject<'local>, String> {
        let ks = load_keystore(env)?;
        let j_alias: JObject = new_jstring(env, account)?.into();

        let contains = env
            .call_method(
                &ks,
                "containsAlias",
                "(Ljava/lang/String;)Z",
                &[JValue::Object(&j_alias)],
            )
            .and_then(|v| v.z())
            .map_err(|e| e.to_string())?;

        if contains {
            // key = ((KeyStore.SecretKeyEntry) ks.getEntry(alias, null)).getSecretKey()
            let entry = env
                .call_method(
                    &ks,
                    "getEntry",
                    "(Ljava/lang/String;Ljava/security/KeyStore$ProtectionParameter;)Ljava/security/KeyStore$Entry;",
                    &[JValue::Object(&j_alias), JValue::Object(&JObject::null())],
                )
                .and_then(|v| v.l())
                .map_err(|e| e.to_string())?;
            return env
                .call_method(&entry, "getSecretKey", "()Ljavax/crypto/SecretKey;", &[])
                .and_then(|v| v.l())
                .map_err(|e| e.to_string());
        }

        if !create {
            return Err(format!("Android keystore key missing for account {account}"));
        }

        // KeyGenerator kg = KeyGenerator.getInstance("AES", "AndroidKeyStore");
        let kg_class = env.find_class("javax/crypto/KeyGenerator").map_err(|e| e.to_string())?;
        let algorithm: JObject = new_jstring(env, "AES")?.into();
        let provider: JObject = new_jstring(env, "AndroidKeyStore")?.into();
        let kg = env
            .call_static_method(
                kg_class,
                "getInstance",
                "(Ljava/lang/String;Ljava/lang/String;)Ljavax/crypto/KeyGenerator;",
                &[JValue::Object(&algorithm), JValue::Object(&provider)],
            )
            .and_then(|v| v.l())
            .map_err(|e| e.to_string())?;

        // new KeyGenParameterSpec.Builder(alias, PURPOSE_ENCRYPT | PURPOSE_DECRYPT)
        let builder_class = env
            .find_class("android/security/keystore/KeyGenParameterSpec$Builder")
            .map_err(|e| e.to_string())?;
        let builder = env
            .new_object(
                builder_class,
                "(Ljava/lang/String;I)V",
                &[JValue::Object(&j_alias), JValue::Int(KEY_PURPOSES)],
            )
            .map_err(|e| e.to_string())?;

        let builder = builder_string_array(
            env,
            &builder,
            "setBlockModes",
            &["GCM"],
        )?;
        let builder = builder_string_array(
            env,
            &builder,
            "setEncryptionPaddings",
            &["NONE"],
        )?;
        let builder = env
            .call_method(
                &builder,
                "setKeySize",
                "(I)Landroid/security/keystore/KeyGenParameterSpec$Builder;",
                &[JValue::Int(256)],
            )
            .and_then(|v| v.l())
            .map_err(|e| e.to_string())?;
        let spec = env
            .call_method(&builder, "build", "()Landroid/security/keystore/KeyGenParameterSpec;", &[])
            .and_then(|v| v.l())
            .map_err(|e| e.to_string())?;

        env.call_method(
            &kg,
            "init",
            "(Ljava/security/spec/AlgorithmParameterSpec;)V",
            &[JValue::Object(&spec)],
        )
        .map_err(|e| e.to_string())?;
        env.call_method(&kg, "generateKey", "()Ljavax/crypto/SecretKey;", &[])
            .and_then(|v| v.l())
            .map_err(|e| e.to_string())
    }

    /// Helper: builder.setX([String...]) → Builder (the returned object).
    fn builder_string_array<'local>(
        env: &mut JNIEnv<'local>,
        builder: &JObject<'local>,
        method: &str,
        values: &[&str],
    ) -> Result<JObject<'local>, String> {
        let first = new_jstring(env, values[0])?;
        let arr = env
            .new_object_array(values.len() as i32, "java/lang/String", first)
            .map_err(|e| e.to_string())?;
        for (i, v) in values.iter().enumerate().skip(1) {
            let element = new_jstring(env, v)?;
            env.set_object_array_element(&arr, i as i32, element)
                .map_err(|e| e.to_string())?;
        }
        let arr_obj: JObject = arr.into();
        env.call_method(
            builder,
            method,
            "([Ljava/lang/String;)Landroid/security/keystore/KeyGenParameterSpec$Builder;",
            &[JValue::Object(&arr_obj)],
        )
        .and_then(|v| v.l())
        .map_err(|e| e.to_string())
    }

    /// Cipher.getInstance("AES/GCM/NoPadding"), fresh instance per operation.
    fn get_cipher<'local>(env: &mut JNIEnv<'local>) -> Result<JObject<'local>, String> {
        let cipher_class = env.find_class("javax/crypto/Cipher").map_err(|e| e.to_string())?;
        let transformation: JObject = new_jstring(env, "AES/GCM/NoPadding")?.into();
        env.call_static_method(
            cipher_class,
            "getInstance",
            "(Ljava/lang/String;)Ljavax/crypto/Cipher;",
            &[JValue::Object(&transformation)],
        )
        .and_then(|v| v.l())
        .map_err(|e| e.to_string())
    }

    /// Encrypt plaintext under the hardware key; returns (ciphertext, iv).
    fn aes_gcm_encrypt(env: &mut JNIEnv<'_>, key: &JObject<'_>, plaintext: &[u8]) -> Result<(Vec<u8>, Vec<u8>), String> {
        let cipher = get_cipher(env)?;
        env.call_method(
            &cipher,
            "init",
            "(ILjava/security/Key;)V",
            &[JValue::Int(CIPHER_ENCRYPT), JValue::Object(key)],
        )
        .map_err(|e| e.to_string())?;
        // Each Cipher.init with ENCRYPT_MODE generates a fresh random IV.
        let iv_obj = env
            .call_method(&cipher, "getIV", "()[B", &[])
            .and_then(|v| v.l())
            .map_err(|e| e.to_string())?;
        let iv = jobject_to_vec(env, iv_obj)?;
        let pt_arr = env.byte_array_from_slice(plaintext).map_err(|e| e.to_string())?;
        let ct_obj = env
            .call_method(
                &cipher,
                "doFinal",
                "([B)[B",
                &[JValue::Object(&pt_arr.into())],
            )
            .and_then(|v| v.l())
            .map_err(|e| e.to_string())?;
        let ct = jobject_to_vec(env, ct_obj)?;
        Ok((ct, iv))
    }

    /// Decrypt ciphertext with the hardware key.
    fn aes_gcm_decrypt(env: &mut JNIEnv<'_>, key: &JObject<'_>, ct: &[u8], iv: &[u8]) -> Result<Vec<u8>, String> {
        let cipher = get_cipher(env)?;
        let spec_class = env
            .find_class("javax/crypto/spec/GCMParameterSpec")
            .map_err(|e| e.to_string())?;
        let iv_arr = env.byte_array_from_slice(iv).map_err(|e| e.to_string())?;
        let spec = env
            .new_object(
                spec_class,
                "(I[B)V",
                &[JValue::Int(GCM_TAG_BITS), JValue::Object(&iv_arr.into())],
            )
            .map_err(|e| e.to_string())?;
        env.call_method(
            &cipher,
            "init",
            "(ILjava/security/Key;Ljava/security/spec/AlgorithmParameterSpec;)V",
            &[JValue::Int(CIPHER_DECRYPT), JValue::Object(key), JValue::Object(&spec)],
        )
        .map_err(|e| e.to_string())?;
        let ct_arr = env.byte_array_from_slice(ct).map_err(|e| e.to_string())?;
        let pt_obj = env
            .call_method(&cipher, "doFinal", "([B)[B", &[JValue::Object(&ct_arr.into())])
            .and_then(|v| v.l())
            .map_err(|e| e.to_string())?;
        jobject_to_vec(env, pt_obj)
    }

    /// Blob layout: MAGIC | u32 BE iv_len | iv | ciphertext.
    fn build_blob(iv: &[u8], ct: &[u8]) -> Vec<u8> {
        let mut blob = Vec::with_capacity(4 + 4 + iv.len() + ct.len());
        blob.extend_from_slice(BLOB_MAGIC);
        blob.extend_from_slice(&(iv.len() as u32).to_be_bytes());
        blob.extend_from_slice(iv);
        blob.extend_from_slice(ct);
        blob
    }

    fn parse_blob(blob: &[u8]) -> Option<(Vec<u8>, Vec<u8>)> {
        if blob.len() < 8 || &blob[0..4] != BLOB_MAGIC {
            return None;
        }
        let iv_len = u32::from_be_bytes([blob[4], blob[5], blob[6], blob[7]]) as usize;
        // 12 bytes is the GCM standard nonce; allow a small sane range only.
        if !(12..=32).contains(&iv_len) || blob.len() < 8 + iv_len + 16 {
            return None;
        }
        let iv = blob[8..8 + iv_len].to_vec();
        let ct = blob[8 + iv_len..].to_vec();
        Some((iv, ct))
    }

    pub fn get(account: &str) -> Result<Option<String>, String> {
        let mut env = env()?;
        let path = blob_path(&mut env, account)?;
        let blob = match std::fs::read(&path) {
            Ok(b) => b,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            // A permissions/IO error is not "no secret": reporting it as absent
            // would make the app mint a fresh passphrase and orphan stored data.
            Err(err) => return Err(format!("keychain read failed: {err}")),
        };
        let (iv, ct) = parse_blob(&blob).ok_or("keychain blob corrupted")?;
        let key = keystore_aes_key(&mut env, account, false)?;
        let plaintext = aes_gcm_decrypt(&mut env, &key, &ct, &iv)?;
        String::from_utf8(plaintext).map(Some).map_err(|e| e.to_string())
    }

    pub fn set(account: &str, value: &str) -> Result<(), String> {
        let mut env = env()?;
        let key = keystore_aes_key(&mut env, account, true)?;
        let (ct, iv) = aes_gcm_encrypt(&mut env, &key, value.as_bytes())?;
        let blob = build_blob(&iv, &ct);
        let path = blob_path(&mut env, account)?;
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        // Write-then-rename so a crash mid-write cannot leave a truncated blob
        // that would look like a corrupt secret on next launch.
        let tmp = path.with_extension("tmp");
        std::fs::write(&tmp, &blob).map_err(|e| e.to_string())?;
        if let Err(err) = std::fs::rename(&tmp, &path) {
            let _ = std::fs::remove_file(&tmp);
            return Err(format!("keychain write failed: {err}"));
        }
        Ok(())
    }

    pub fn remove(account: &str) -> Result<(), String> {
        let mut env = env()?;
        // Drop the blob first; a failure here must not leave plaintext material.
        let path = blob_path(&mut env, account)?;
        let _ = std::fs::remove_file(&path);
        // Also delete the keystore alias so stale hardware keys do not accumulate.
        let ks = load_keystore(&mut env)?;
        let j_alias: JObject = new_jstring(&mut env, account)?.into();
        let contains = env
            .call_method(&ks, "containsAlias", "(Ljava/lang/String;)Z", &[JValue::Object(&j_alias)])
            .and_then(|v| v.z())
            .map_err(|e| e.to_string())?;
        if contains {
            env.call_method(&ks, "deleteEntry", "(Ljava/lang/String;)V", &[JValue::Object(&j_alias)])
                .map_err(|e| e.to_string())?;
        }
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
    // Android only counts as available once the WebView handed us the JVM;
    // otherwise the UI should fall back instead of promising secure storage.
    #[cfg(target_os = "android")]
    {
        return imp::is_initialized();
    }
    #[cfg(not(target_os = "android"))]
    {
        cfg!(any(
            target_os = "windows",
            target_os = "macos",
            target_os = "linux",
            target_os = "ios",
        ))
    }
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
