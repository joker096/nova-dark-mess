# Nova Dark Messenger — Hybrid Post-Quantum Handshake

**Status:** implemented in code (`src/lib/crypto/postQuantum.ts`, `src/lib/crypto/identity.ts`,
`src/lib/crypto/ratchet.ts`). This document describes the scheme; it does not
change the implementation.

## 0. Why a hybrid

A pure X25519 handshake is safe against classical attackers but not against a
cryptographically relevant quantum computer (harvest-now-decrypt-later). A pure
ML-KEM-768 handshake is newer and has less field history. Nova uses **both**:
the session root key is bound to the X25519 Diffie-Hellman secret **and** the
ML-KEM-768 encapsulated secret, so a session stays confidential if *either*
primitive survives.

## 1. Handshake flow (X3DH-v2 + ML-KEM-768)

The handshake is an adaptation of Signal's PQXDH to Nova's X3DH-v2:

1. **Prekey bundle.** Each identity publishes an X3DH prekey bundle that may
   carry an ML-KEM-768 encapsulation key (`pqKem` field, base64). Identities
   created before the PQ rollout have no `pqKem` field.
2. **Initiator.** When starting a session, the initiator:
   - generates an ephemeral X25519 key pair,
   - performs the X3DH DH combination with the peer's identity key and signed
     prekey,
   - if the peer's bundle has `pqKem`, encapsulates an ML-KEM-768 shared secret
     against the peer's PQ public key (protocol version `3`), otherwise uses
     `pq:0` honestly,
   - derives the root key as `HKDF(X25519-DH-chain || ML-KEM-secret, info)`,
   - initializes the Double Ratchet from that root key.
3. **Responder.** Decapsulates the PQ ciphertext with its stored ML-KEM secret
   key, derives the same root key, and initializes its side of the Double Ratchet.
4. **Fail-closed.** A PQ-capable peer rejects classical-only headers when
   `PROTOCOL_VERSION_PQ` negotiation requires it; there is no silent rollback to
   a pre-PQ handshake with a PQ-capable peer.

## 2. Files

| File | Role |
|------|------|
| `src/lib/crypto/postQuantum.ts` | ML-KEM-768 key generation, encapsulation, decapsulation, protocol version `3`. |
| `src/lib/crypto/identity.ts` | `pqKem` field on the identity bundle; `pqkem768.` prefixed secret storage. |
| `src/lib/crypto/ratchet.ts` | Double Ratchet over the hybrid root key (per-message keys, forward secrecy). |

## 3. Sizes (FIPS 203)

| Item | Bytes |
|------|-------|
| ML-KEM-768 public key | 1184 |
| ML-KEM-768 ciphertext | 1088 |
| Shared secret | 32 |

## 4. Backward compatibility

Pre-PQ identities negotiate `pq:0` and derive the classical-only secret. The
protocol version is part of the handshake header, so peers can detect and
reject mismatched expectations instead of silently downgrading.

## 5. What this document is not

It does not cover Sender Keys groups (`src/lib/crypto/senderKeys.ts`),
the anonymous queue layer (`src/lib/anon/`), or the `.nova-backup` Argon2id/PBKDF2
key derivation. Those are specified separately.
