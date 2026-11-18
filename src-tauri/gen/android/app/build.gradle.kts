import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

// Release signing (Google Play upload key).
// Values come from src-tauri/gen/android/keystore.properties, which is
// gitignored, or from environment variables for CI. The key must be the one
// Play already accepted (alias `messandanger`, SHA1 5E:1B:A8:21:…:90:E4) —
// any other key is rejected with "app bundle is signed with the wrong key".
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}

val uploadStorePath: String? = System.getenv("ANDROID_KEYSTORE_PATH")
    ?: keystoreProperties.getProperty("storeFile")
val uploadStorePassword: String? = System.getenv("ANDROID_KEYSTORE_PASSWORD")
    ?: keystoreProperties.getProperty("storePassword")
val uploadKeyAlias: String? = System.getenv("ANDROID_KEY_ALIAS")
    ?: keystoreProperties.getProperty("keyAlias")
val uploadKeyPassword: String? = System.getenv("ANDROID_KEY_PASSWORD")
    ?: keystoreProperties.getProperty("keyPassword")

val uploadKeyFile: File? = uploadStorePath?.let { pathString ->
    val candidate = File(pathString)
    if (candidate.isAbsolute) candidate else rootProject.file(pathString)
}
val hasUploadKey = uploadKeyFile != null && uploadKeyFile.exists() &&
    !uploadStorePassword.isNullOrBlank() && !uploadKeyAlias.isNullOrBlank()

if (!hasUploadKey) {
    logger.warn("No Android upload key found — release bundles will be UNSIGNED and rejected by Google Play. Point keystore.properties (storeFile/keyAlias) at the Play upload key play-upload-key.jks, alias `messandanger`.")
}

android {
    compileSdk = 37
    namespace = "com.messanger.e2e"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.messanger.e2e"
        minSdk = 24
        targetSdk = 37
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        if (hasUploadKey) {
            create("upload") {
                storeFile = uploadKeyFile
                storePassword = uploadStorePassword
                keyAlias = uploadKeyAlias
                keyPassword = uploadKeyPassword ?: uploadStorePassword
                enableV1Signing = true
                enableV2Signing = true
            }
        }
    }
    buildTypes {
        getByName("debug") {
            applicationIdSuffix = ".debug"
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            if (hasUploadKey) {
                signingConfig = signingConfigs.getByName("upload")
            }
            optimization {
               enable = true
            }
            proguardFiles(
                *fileTree(".") {
                  include("**/*.pro")
                  exclude("build/**")
                }.files.toTypedArray()
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = file("tauri.build.gradle.kts"))
