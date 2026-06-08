# Garely RDP Gateway (`garely-rdp-gw`)

The browser-RDP pillar (§15) uses an **adopted [Devolutions Gateway][dgw]** as the
WebSocket↔RDP relay. The browser speaks the RDP **RDCleanPath** extension over a
WebSocket; the gateway performs the server-side TLS upgrade and forwards to the
target. We own everything around it (auth, the credential vault, access control,
the in-app client, logs); the gateway is just the protocol relay.

This was validated end-to-end in the spike (`~/Desktop/garely-rdp-spike/SPIKE-NOTES.md`):
display + keyboard + mouse + bidirectional clipboard all came up clean.

## How it fits together

```
browser (IronRDP WASM client)
   │  wss://<domain>/jet/rdp   + short-lived connection token (from /api/servers/[id]/connect)
   ▼
Caddy  handle /jet/*  ──►  garely-rdp-gw:7171  ──►  RDP target (host:port)
```

- The **app** holds the provisioner **private** key and signs each connection
  token (RS256). Target credentials are read from the encrypted vault, injected
  into the token, and the whole token is **JWE-encrypted** to the gateway's
  **delegation** public key — so the browser receives an opaque blob and never
  sees the credentials. The gateway decrypts with its delegation private key and
  injects the credentials into the RDP session.

## Enable it (opt-in)

```bash
./rdp-gateway/setup-keys.sh          # generates config/{provisioner,delegation,tls}.*  + a UUID
# paste the printed RDP_GW_* lines into .env
docker compose --profile rdp up -d garely-rdp-gw
docker compose up -d eam-meet        # restart the app to read the new env
```

Without this, the Servers section still works for management; the live **Connect**
button shows a "gateway pending" placeholder.

## Notes / TODO before production

- **Pin the image.** `docker-compose.yml` currently uses
  `devolutions/devolutions-gateway:latest` — pin a tested version (verify the
  exact published tag/ref).
- **Egress.** Restrict this service's outbound network to the allowed RDP target
  subnets only.
- **Keys never commit.** `config/` is gitignored. Back up the keys out-of-band.
- `gateway.json` listeners: `http://*:7171` (the WS endpoint Caddy proxies) +
  `tcp://*:8181`. `TlsVerifyStrict:false` lets the gateway connect to targets
  with self-signed RDP certs (typical for internal Windows hosts).

[dgw]: https://github.com/Devolutions/devolutions-gateway
