# Presence privacy

How "who is online" works and what the relay can and cannot learn.

## Defaults

- **Sharing is off.** Unless you enable Settings → Privacy → *Share presence
  with relay*, the app never sends a heartbeat and never queries
  `/api/presence`. The mesh map then shows only what is known locally (your own
  GPS fix, live-location broadcasts you received, open WebRTC rooms).
- **Hashing is on** when sharing is enabled. The fingerprint never leaves the
  device in raw form; see below.
- **TTL is 2 minutes** (`normal`), with 45 s and 5 min presets.

## What is transmitted

With sharing enabled, each heartbeat (once per minute) sends:

```json
POST /api/presence
{ "fingerprint": "ph1.<32 hex chars>", "ttlMs": 120000 }
```

Nothing else — no name, no IP-derived identifier beyond the connection itself,
no message content. The server keeps an in-memory `id → { lastSeen, ttlMs }`
map and deletes entries after the TTL; it stores no history.

## Hashing

`presenceIdFor` computes `SHA-256("nova-presence:" + fingerprint)` and sends
the first 32 hex characters prefixed with `ph1.`. Consequences:

- The relay cannot map a presence id back to a fingerprint, invite link,
  relay destination address or safety number.
- Two devices that both know a fingerprint compute the same hash, so contact
  discovery on the mesh map keeps working: `resolvePresenceIds` hashes every
  locally known fingerprint and matches it against the relay's list.
- Ids of peers you do **not** know stay opaque and are dropped — the relay
  list can never introduce a new, un-hashable identity to the client.
- The hash is not a strong pseudonym: an attacker who already knows a small
  set of candidate fingerprints can test them (dictionary attack). That is why
  hashing is paired with opt-in sharing — the list only exists if you send a
  heartbeat at all.

## TTL trade-off

| Preset | Window | Effect |
|---|---|---|
| Short (45 s) | relay forgets you ~45 s after the last heartbeat | smallest exposure window, but a peer leaving the app briefly disappears from others' maps |
| Normal (2 min) | default | matches the 60 s heartbeat with slack |
| Long (5 min) | resists brief connectivity gaps | largest window in which the relay (not peers) knows you were online |

The server clamps any requested TTL into 45 s – 5 min, so a malicious client
cannot request "keep me listed forever".

## Metadata trade-off (summary)

Presence is the one feature where the relay learns *something* about timing:
that some id was online at time T, from your IP. Hashing removes the identity
link; opt-in removes the data entirely; a short TTL shrinks the window. If you
need none of that, leave sharing off — everything else in the app works
without it.
