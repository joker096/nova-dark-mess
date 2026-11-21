# Self-hosted relay + TURN on a free VPS

## Deployed instance (VPS 130.49.175.224)

- Relay health: `https://130.49.175.224.nip.io/api/health`
- Signaling: `wss://130.49.175.224.nip.io/api/signaling`
- Web app: `https://app.130.49.175.224.nip.io`
- TURN: `turn:130.49.175.224.nip.io:3478` (username `nova`; password stored in `DEPLOYMENT.local.md`, not committed)
- Northflank fallback: `https://p01--profound-hill--97yk4ph4sg85.code.run`

This guide deploys the Nova Dark Messenger relay (`server.js`) and a TURN server
(coturn) on one small VPS. Northflank stays as a fallback.

## 1. VPS preparation (Ubuntu 22/24)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg ufw git

# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

# Caddy (HTTPS + WebSocket proxy)
sudo apt install -y caddy

# Firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 5349/udp
sudo ufw allow 49152:50000/udp
sudo ufw enable
```

## 2. Relay (Docker, recommended)

```bash
git clone -b andromity/bots-phase-b2 https://github.com/joker096/nova-dark-mess.git
cd nova-dark-mess
docker build -t nova-relay .

sudo mkdir -p /opt/nova-relay/data
docker run -d --name nova-relay --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v /opt/nova-relay/data:/data \
  -e NODE_ENV=production \
  -e ANON_STATE_DB_PATH=/data/anon-state.sqlite \
  nova-relay
```

Check:

```bash
curl -sS http://127.0.0.1:8080/api/health
```

## 3. HTTPS + WebSocket via Caddy

`/etc/caddy/Caddyfile`:

```caddy
relay.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

```bash
sudo systemctl reload caddy
curl -sS https://relay.example.com/api/health
```

Signaling endpoint becomes `wss://relay.example.com/api/signaling`.

## 4. TURN server (coturn)

```bash
sudo mkdir -p /opt/coturn
cat >/opt/coturn/turnserver.conf <<'EOF'
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
user=nova:CHANGE_ME_STRONG_PASSWORD
realm=relay.example.com
no-multicast-peers
no-cli
min-port=49152
max-port=50000
EOF

docker run -d --name coturn --restart unless-stopped --network host \
  -v /opt/coturn/turnserver.conf:/etc/coturn/turnserver.conf:ro \
  coturn/coturn -c /etc/coturn/turnserver.conf
```

## 5. Client build

`.env`:

```env
VITE_ANON_RELAY_URL="https://relay.example.com"
VITE_TURN_URLS="turn:relay.example.com:3478"
VITE_TURN_USERNAME="nova"
VITE_TURN_CREDENTIAL="CHANGE_ME_STRONG_PASSWORD"
```

```bash
npm run build
```

Deploy `dist/` to any static host or the same VPS.

## 6. Northflank as fallback

Keep `profound-hill` running. If the VPS is down, switch the client env to:

```env
VITE_ANON_RELAY_URL="https://p01--profound-hill--97yk4ph4sg85.code.run"
```

and rebuild/redeploy the client.

## 7. Updating the relay

```bash
cd nova-dark-messenger
git pull
docker build -t nova-relay .
docker stop nova-relay && docker rm nova-relay
docker run -d --name nova-relay --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v /opt/nova-relay/data:/data \
  -e NODE_ENV=production \
  -e ANON_STATE_DB_PATH=/data/anon-state.sqlite \
  nova-relay
```

Queue state persists in `/opt/nova-relay/data/anon-state.sqlite`.

## 8. Optional next steps

- Global incoming ring even when the chat is closed: client-side change, no server needed.
- Call quality indicators in `VideoCallOverlay`.
- Signed signaling messages for stronger identity binding.
- Short-lived TURN credentials instead of a static password.