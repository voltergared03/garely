# Garely §15 — IronRDP Browser-RDP SPIKE (step 0)

Goal (from roadmap §15.10 step 0): in 3–5 days prove our stack can run IronRDP web-client + a
Rust gateway with **display + keyboard + mouse**, **own in-app fullscreen with correct mouse
coords**, **bidirectional text clipboard**, and **one file both ways** via a throwaway relay.
Decide the **adopt-vs-fork** gate and the **files-via-relay-vs-RDPDR** gate. Kill-criterion: if
display+input+clipboard don't come up clean in 5 days → re-open engine choice.

Throwaway target (user-approved 2026-06-08): **local `xrdp` Linux container in Colima** — NO real
EAM servers, NO real RDP creds. One-time local login only.

## Environment (this Mac)
- macOS, Apple Silicon (arm64). Node 25 ✓, git ✓, Homebrew ✓, ~86 GB free.
- Installed for spike via brew: `rustup` (keg-only @ /opt/homebrew/opt/rustup/bin), `colima`,
  `docker` (CLI), `docker-compose`, `wasm-pack`.
- Rust: default stable 1.94.1 + wasm32-unknown-unknown ✓. Repo pins **1.89.0** via
  rust-toolchain.toml → install that toolchain + add wasm32 to it.
- PATH for rust this session: `export PATH="/opt/homebrew/opt/rustup/bin:$HOME/.cargo/bin:$PATH"`.

## IronRDP repo (cloned ~/Desktop/garely-rdp-spike/IronRDP, shallow)
- `crates/ironrdp-web` — the WASM module (built with wasm-pack).
- `web-client/iron-remote-desktop` — framework-agnostic web component (protocol-agnostic core).
- `web-client/iron-remote-desktop-rdp` — RDP bindings for the web component.
- `web-client/iron-svelte-client` — standalone SvelteKit demo client (`cargo xtask web run`).
- `xtask web install|build|run` — official pipeline (wasm-pack build --target web; npm dev).

## KEY FINDING #1 — adopt-vs-fork (strong call: ADOPT Devolutions Gateway)
The web client is NOT a generic WS→TCP proxy client. It speaks a custom RDP extension
**"RDCleanPath"** over WebSocket; the **Devolutions Gateway (DGW)** is the middleware that
implements it (inspects the RDP handshake, does the server-side TLS upgrade, avoids TLS-in-TLS).
The standalone svelte client REQUIRES: (1) a running DGW reachable over the network, (2) a token
signed by the DGW "provisioner" RSA key (gen via `tokengen` or PowerShell module).
→ Therefore `garely-rdp-gw` = **adopt DGW** (open-source, free since gateway v2024.1.0 ships the
  webapp too) wrapped with our NextAuth-issued connection token + vault + access + file-relay + logs.
  Forking the client to plain WS→TCP would mean reimplementing RDCleanPath — not worth it.
  (Spike still needs to confirm DGW runs cleanly on our stack + that token issuance is wrap-able.)

## Spike build order (refined from the RDCleanPath finding)
1. [tool] rust 1.89.0 + wasm32 for it; node deps for the 3 web-client packages.   ← in progress
2. [target] Colima up; run an xrdp container → RDP target on 127.0.0.1:3389 (throwaway creds).
3. [gateway] Get Devolutions Gateway running locally (container or build); provisioner keypair;
   listener; generate an ASSOCIATION token (tokengen) for the xrdp target.
4. [client] `wasm-pack build` ironrdp-web; `npm install` + run iron-svelte-client dev server;
   point VITE at the local DGW + token server.
5. [connect] Open client in a browser → through DGW → xrdp. Verify display + keyboard + mouse.
6. [clipboard] text both ways; [fullscreen] own in-app fullscreen keeps mouse coords correct.
7. [files] one file both ways via a throwaway SFTP relay (decoupled, per §15.6) — or note RDPDR.

## Open gates to close in the spike
- adopt-vs-fork: leaning ADOPT DGW (Finding #1). Confirm DGW wraps cleanly.
- files: relay (SFTP) vs RDPDR — §15.6 already prefers decoupled relay; confirm during step 7.
- DGW licensing + arm64 availability for our compose — verify when acquiring it.

## VERDICT (2026-06-08) — SPIKE PASSED ✅  (kill-criterion NOT triggered; engine = IronRDP + DGW locked)
Validated LIVE, browser → IronRDP WASM → Devolutions Gateway (RDCleanPath) → TLS → xrdp:
- **Display**: clean Xfce desktop rendered in the browser canvas (screenshot shots/12).
- **Keyboard**: typed the password into the xrdp greeter + Enter → authenticated → Xfce session launched (logged in as `spike`).
- **Mouse**: click focused the session field (coords mapping correct).
- **Clipboard ROUND-TRIP — BOTH WAYS ✅** (not just the channel): browser→server (`navigator.clipboard.writeText` → xclip on the session read it exactly) AND server→browser (xclip set → `navigator.clipboard.readText` got it exactly). CLIPRDR negotiated + channel initialized. WARN `CB_CAN_LOCK_CLIPDATA not negotiated` → reinforces §15.6: do FILES via a separate relay, not clipboard/RDPDR.
- **File transfer BOTH WAYS ✅** via the DECOUPLED **SFTP relay** (§15.6), independent of the RDP stream: upload machine→target landed in the **per-user** dir `/home/spike` (the win over Guacamole's shared `/drive`), download target→machine returned the exact bytes. (Spike used key-auth SFTP to the target's sshd on :2222.)
- **Mouse coordinates correct ✅**: a precise click at the canvas top-left in fullscreen opened the exact xfce "Applications" menu → the coordinate pipeline is sound (the Guacamole-1.6 fullscreen pain prerequisite). NB: the web component's own "Full" button likely uses the browser Fullscreen API — we will build our OWN CSS in-app fullscreen per §15.7; coords pipeline underneath is proven.
- **adopt-vs-fork → ADOPT Devolutions Gateway** as `garely-rdp-gw`. DGW is Apache+MIT; it implements RDCleanPath which the IronRDP web client requires. Forking the client to plain WS→TCP is not worth it.
- The IronRDP web component already ships the UX scaffolding we need: a toolbar with Fit / Real / **Full** (fullscreen) / Ctrl+Alt+Del / **Meta** / Toggle cursor kind / **Unicode keyboard mode** / Terminate, and a clipboard-enable flag.

### ALL step-0 gates now GREEN (validated 2026-06-08, second pass)
- Clipboard text round-trip host↔browser — ✅ PASS both ways.
- One file both ways via SFTP relay (§15.6) — ✅ PASS both ways (per-user dir).
- Mouse coords correct — ✅ precise fullscreen click hit the exact target.
- ONLY remaining = pillar BUILD work, not a spike risk: implement our OWN CSS in-app fullscreen (replace the web component's browser-Fullscreen-API "Full" button); wire the Mac ⌘C/⌘V→Ctrl layer (§15.7); productionize the SFTP relay (chunked/resumable/progress/audit per §15.6).

### Working recipe (reproduce the spike)
- Tooling (brew): rustup, colima, docker, docker-compose, wasm-pack. Rust default stable + `wasm32-unknown-unknown`; repo pins 1.89.0 (IronRDP) / 1.90.0 (DGW) — rustup auto-fetches.
- RDP target: `~/Desktop/garely-rdp-spike/rdp-target/` Dockerfile (ubuntu22 + xrdp + xfce4, user `spike`/`spikepass123`); `docker run -d --name rdp-target -p 3389:3389 garely-rdp-spike-target`. (Colima vz: publish to `0.0.0.0` i.e. `-p 3389:3389`; `127.0.0.1:`-bind in guest is NOT forwarded to host. Verify with `nc`, not bash /dev/tcp.)
- Gateway: `cd DGW && cargo build -p devolutions-gateway`. Config: `--config-init-only` to seed `gateway.json`, then set ProvisionerPublicKeyFile, TLS cert/key, `TlsVerifyStrict:false` (xrdp snakeoil cert), listeners `tcp://*:8181` + `http://*:7171`. **Gotcha: on macOS you MUST set `DGATEWAY_WEBAPP_PATH=<any dir>`** even with webapp disabled, and do NOT include a `WebApp` block unless you also set `Authentication`. Run: `DGATEWAY_CONFIG_PATH=dgw-config DGATEWAY_WEBAPP_PATH=dgw-config/webapp-static ./target/debug/devolutions-gateway`.
- Token: `tools/tokengen/target/debug/tokengen sign --provisioner-key dgw-config/provisioner.key --validity-duration 8h forward --dst-hst 127.0.0.1:3389 --jet-ap rdp`.
- Client: `cd web-client/iron-svelte-client && npm run dev-no-wasm` → http://localhost:5173/. **Gotcha: a manually `wasm-pack --dev` build needs the vite `?url` fixup** that `cargo xtask web build` does — prepend `import wasmUrl from './ironrdp_web_bg.wasm?url'` to `crates/ironrdp-web/pkg/ironrdp_web.js` and replace `new URL('ironrdp_web_bg.wasm', import.meta.url)` → `wasmUrl`; else the dev bundle inlines a broken `data:...wasm` URL.
- Connect form: Hostname `127.0.0.1:3389`, Username `spike`, Password `spikepass123`, Gateway `ws://localhost:7171/jet/rdp`, AuthToken = the token. Login → live session.
- Repro automation: `connect.cjs` (display) + `input-test.cjs` (keyboard/mouse login) run via `NODE_PATH=~/Desktop/eam-meet/app/node_modules node <script>` (Playwright from eam-meet). Screenshots in `shots/`.

## Log
- 2026-06-08: env probed, toolchain installed, IronRDP+DGW cloned, RDCleanPath/DGW finding recorded.
- 2026-06-08: built xrdp target + DGW gateway + tokengen + IronRDP wasm/web client; stood up the full local stack; LIVE connect validated display+keyboard+mouse+clipboard-channel. SPIKE PASSED. adopt=DGW.
