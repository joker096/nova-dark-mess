# Nova Dark Messenger — Security

## Cryptography Summary
- **Identity**: X25519 (encryption) + Ed25519 (signing) derived from BIP-39 mnemonic via HKDF-SHA256
- **Session setup**: X3DH with signed prekey + optional one-time prekey
- **Message encryption**: Double Ratchet with AES-256-GCM per message
- **Key derivation**: PBKDF2-SHA256 (600k iterations) for backup/master keys; HKDF-SHA256 for ratchet keys
- **Integrity**: Ed25519 signatures on prekeys and X3DH headers; HMAC-SHA256 chain keys

## Local Storage Security
- IndexedDB `NovaDarkMessengerDB`: all object stores encrypted with AES-256-GCM
- Master key: PBKDF2(device-secret, random salt), device-secret in localStorage
- PIN: PBKDF2 hash stored in localStorage (600k iterations)
- Backup file (`.nova-backup`): JSON envelope with `magic: NOVA_BACKUP`, PBKDF2 params, salt, AES-256-GCM ciphertext

## Authentication
- **PIN**: 4+ digit passcode, PBKDF2 hash, local lock screen
- **TOTP 2FA**: RFC 6238, SHA-1, 6-digit codes, 30s period, stored encrypted in IndexedDB
- **Seed phrase**: 24-word BIP-39 mnemonic; full identity recovery; displayed in Settings → Recovery

## XSS Prevention
- `escapeHtml()` for all dynamic text rendering
- `sanitizeHtml()` with allowlist (`b`, `i`, `em`, `strong`, `u`, `br`, `p`, `span`, `a`, `code`)
- No `dangerouslySetInnerHTML` without sanitization

## Local Analytics
- Events stored in localStorage only
- Zero network transmission
- Types: app_open/close, chat_open, message_send/receive, backup_export/import, pin_set/remove, 2FA enable/disable, settings changes, folder create/delete

## Security Boundaries (What We Do NOT Do)
- No server-side user accounts
- No cloud message storage
- No push notification service
- No phone number or email registration
- No contact discovery service

## Reporting
Security issues: see `SECURITY.md` in the repository. No bug bounty program.
