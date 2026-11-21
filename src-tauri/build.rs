// Mini App origin allowlist (docs/bots-roadmap.md B7).
//
// `frame-src` in tauri.conf.json is `'self' blob: {{MINI_APP_ORIGINS}}`. The
// Tauri CLI expands `{{VAR}}` from an environment variable of that name at
// build time, so a *normalized* `MINI_APP_ORIGINS` (space-separated CSP source
// list) must be set in the environment before the CLI reads the config.
//
// Unlike `VITE_*` variables, which Vite inlines into the JS bundle, this one
// is read by the CLI itself, so the release/deploy scripts must normalize it
// in the shell that launches the CLI, e.g. PowerShell:
//
//   $env:MINI_APP_ORIGINS = ($env:VITE_MINI_APP_ORIGINS -split ',' |
//       ForEach-Object { $_.Trim().TrimEnd('/') } |
//       Where-Object { $_ -match '^https?://[^/@?#]+$' }) -join ' '
//   npx tauri build
//
// Unset or an invalid list leaves the placeholder empty: `frame-src` keeps
// only `'self'` and `blob:`, so every remote Mini App is refused (which is
// also what `MiniAppIframe`/`miniAppOrigins.ts` enforce at runtime).

fn main() {
  println!("cargo:rerun-if-env-changed=MINI_APP_ORIGINS");
  println!("cargo:rerun-if-env-changed=VITE_MINI_APP_ORIGINS");
  println!("cargo:rerun-if-changed=tauri.conf.json");
  tauri_build::build()
}
