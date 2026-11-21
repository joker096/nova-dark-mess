# Remote calls: signaling and TURN

This document covers the transport for 1:1 audio/video calls. It does not cover
group calls.

## What is in place

- `server.js` exposes a WebSocket signaling endpoint at `/api/signaling` on the
  same port as the HTTP relay. It is a message bus only: a browser binds its
  connection to an identity fingerprint on the first message, and messages are
  forwarded to the sockets registered for `targetFingerprint`. Offline peers are
  not queued; calls are live.
- `P2PSignalingClient` uses that endpoint when `VITE_SIGNALING_URL` is set, or
  derives it from `VITE_ANON_RELAY_URL` (`https` → `wss`, path
  `/api/signaling`).
- Call control uses the same socket: `call_invite`, `call_accept`,
  `call_decline`, `call_end`. The callee sees an incoming-call dialog in the
  open conversation and can accept or decline. Media is WebRTC DTLS-SRTP; the
  relay never sees call audio or video.
- Calls use the peer fingerprint from the verified P2P identity, not the demo
  peer bundle. The call buttons stay hidden for demo contacts.
- TURN servers come from Settings → Privacy → WebRTC IP privacy, or from
  build-time `VITE_TURN_URLS` / `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL`.
  Relay-only mode now refuses to start without a TURN server instead of
  silently exposing direct candidates.

## Configure the client

```env
# Optional; otherwise derived from VITE_ANON_RELAY_URL
VITE_SIGNALING_URL="wss://mess.cvr.name/api/signaling"

# Comma-separated TURN URLs, e.g. turn:turn.example.org:3478?transport=udp
VITE_TURN_URLS="turn:turn.example.org:3478"
VITE_TURN_USERNAME="nova"
VITE_TURN_CREDENTIAL="change-me"
```

The client env is baked at build time. Rebuild the web client after changing it:

```bash
npm run build
```

`VITE_TURN_USERNAME`/`VITE_TURN_CREDENTIAL` are visible to every client. Use a
dedicated TURN host and short-lived credentials, or issue time-limited TURN REST
credentials from a small endpoint. The current build-time static credential is
the simplest option, not the most secure one.

## Self-host coturn

A minimal coturn configuration:

```ini
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
realm=turn.example.org
user=nova:change-me
# Restrict to your app origins where possible.
# no-multicast-peers
# denied-peer-ip=10.0.0.0-10.255.255.255
# denied-peer-ip=192.168.0.0-192.168.255.255
min-port=49152
max-port=65535
```

Open TCP/UDP 3478, TCP 5349 (if using `turns:`), and the relay port range
49152–65535 in the firewall and the provider security group. Put coturn behind
the same domain or a dedicated `turn.example.org`; use `turns:` with a valid
certificate when the client is served over HTTPS.

`turn:turn.example.org:3478` works for most networks. For restrictive networks,
add `?transport=tcp` as a second URL in `VITE_TURN_URLS`.

## Reverse proxy

WebSocket needs an HTTP/1.1 upgrade. For nginx in front of `server.js`:

```nginx
location /api/signaling {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
}
```

Without these headers the handshake fails and the client keeps retrying. The
same rule applies to Caddy/Northflank/Traefik ingress configuration.

## Verify

1. Start the relay and the web client with the same signaling configuration.
2. Open the app in two separate browsers/profiles, each with its own identity.
3. Exchange/verify contacts so both chats have a real peer fingerprint.
4. Open the same 1:1 chat in both, start a call in one, accept in the other.
5. With TURN configured and relay-only enabled, confirm the call connects while
   the peer's network blocks direct UDP (for example, use a mobile hotspot).
6. Restart one relay process during a call: signaling reconnects, but the
   in-progress call may drop. A call is not resumed automatically.

## Limitations

- Incoming calls are handled only while the conversation is open; there is no
  background/push ringing yet.
- Signaling is not authenticated beyond the self-asserted fingerprint. An
  attacker who knows a fingerprint can race to register it and attempt a
  man-in-the-middle. WebRTC DTLS protects the media path, but callers should
  still verify the peer's identity key out of band. Signed signaling envelopes
  are the next hardening step.
- The signaling server sees connection metadata (IPs, fingerprints, timing) and
  SDP/ICE payloads. It does not see media or message contents.
- Group calls are not implemented.
