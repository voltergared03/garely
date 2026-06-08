#!/usr/bin/env bash
# Generate the keypairs the Garely RDP gateway (Devolutions Gateway) needs, and
# print the matching app env vars. Run once, then paste the output into .env and
# start the gateway with `docker compose --profile rdp up -d garely-rdp-gw`.
#
#   provisioner: app SIGNS connection tokens (PKCS8 private) ; gateway VERIFIES (SPKI public)
#   delegation : gateway DECRYPTS the credential JWE (private); app ENCRYPTS to it (SPKI public)
#   tls        : the gateway listener's own cert (self-signed; Caddy terminates public TLS)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p config
cd config

if [ -f provisioner.key ]; then
  echo "config/ already has keys — refusing to overwrite. Delete them first to regenerate." >&2
  exit 1
fi

# Provisioner keypair (RS256 token signing)
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out provisioner.key
openssl pkey -in provisioner.key -pubout -out provisioner.pem
# Delegation keypair (RSA-OAEP-256 credential JWE)
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out delegation.key
openssl pkey -in delegation.key -pubout -out delegation.pem
# Self-signed TLS for the gateway listener
openssl req -x509 -newkey rsa:2048 -keyout tls.key -out tls.crt -days 1825 -nodes -subj "/CN=garely-rdp-gw" >/dev/null 2>&1
chmod 600 ./*.key

# Stamp a real UUID into gateway.json (DGW requires a valid Id)
if command -v uuidgen >/dev/null 2>&1; then
  uuid=$(uuidgen | tr 'A-Z' 'a-z')
  sed -i.bak "s/00000000-0000-0000-0000-000000000000/${uuid}/" ../gateway.json && rm -f ../gateway.json.bak
fi

esc() { awk 'BEGIN{ORS="\\n"}1' "$1"; }
cat <<EOF

✅ Keys written to rdp-gateway/config/ (gitignored). The gateway uses
   provisioner.pem + delegation.key + tls.*; the APP needs these in .env:

RDP_GW_URL=wss://<your-domain>/jet/rdp
RDP_GW_PROVISIONER_KEY="$(esc provisioner.key)"
RDP_GW_DELEGATION_PUBKEY="$(esc delegation.pem)"

Then:  docker compose --profile rdp up -d garely-rdp-gw
        docker compose up -d eam-meet   # restart the app to pick up the env
EOF
