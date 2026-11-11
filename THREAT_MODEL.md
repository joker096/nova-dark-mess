# Nova Dark Messenger — Threat Model

## Assets
- User identity (X25519/Ed25519 keys, BIP-39 mnemonic)
- Message contents (plaintext and ratchet state)
- Local database (IndexedDB, encrypted)
- Backup files (.nova-backup)
- PIN and TOTP secrets

## Threat Actors
1. **Physical device access** — stolen/lost phone, unlocked device
2. **Malware on device** — keylogger, storage reader, memory scraper
3. **Network attacker** — MITM on signaling (if server used), DNS spoofing
4. **Malicious peer** — impersonation, replay, message injection

## Threats & Mitigations

| Threat | Severity | Mitigation |
|--------|----------|------------|
| Device theft, unlocked app | High | PIN lock, auto-lock, `clearLocalEmergencyData()` wipes identity + DB |
| Device theft, locked app | Medium | PIN hash (PBKDF2, 600k iterations) stored in localStorage; brute-force costly |
| Malware reads IndexedDB | High | All DB records encrypted with AES-256-GCM; master key not stored on disk |
| Malware reads localStorage | Medium | PIN hash and device-secret in localStorage; no plaintext keys |
| Backup file intercepted | High | .nova-backup encrypted with user passphrase (PBKDF2 + AES-256-GCM) |
| Seed phrase phished | Critical | User education: never share; Nova never asks for it |
| Message replay | Medium | Sequence numbers + skipped-message-keys buffer prevent replay |
| MITM on signaling | Medium | X3DH signed prekeys prevent impersonation (if server used) |
| XSS via message content | Medium | escapeHtml on all user-generated content; sanitizeHtml allowlist |
| TOTP secret stolen | Medium | Stored encrypted in IndexedDB; 30s window limits reuse |

## Out of Scope (No Server)
- No signaling server, no REST API, no user accounts in cloud
- No push notifications server-side
- No message history on server
- P2P relay/NAT traversal not implemented (client-only, local network / WebRTC simulation)

## Assumptions
- User's device is not compromised at boot (trusted OS)
- Web Crypto API is secure in the host browser/WebView
- User safeguards their 24-word seed phrase offline
