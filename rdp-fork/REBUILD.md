# Garely RDP fork — backup & rebuild recipe

This 15 MB folder is the **complete, irreplaceable source** of the Garely IronRDP
fork (the custom WASM perf patches). The 8 GB `~/Desktop/garely-rdp-spike` build
workspace can be deleted — everything needed to rebuild is here or re-cloneable.

## What's here
- `IronRDP-garely-forks.bundle` — a self-contained git bundle ("complete history",
  verified clonable) with the 3 fork branches:
  - `garely-stridefix` (tip `860eb2a4`) — the SHIPPED branch: bulk compression,
    batched canvas drawing, slow-path guard, ClearType, desktopScaleFactor.
  - `garely-1251` (`4234c7c1`) — PR #1252 tear fix.
  - `garely-rfx32` (`8373e1b5`) — color_depth 16→32 + remotefx:on.
- `build-wasm.sh`, `build-packages.sh` — the WASM/npm-pack pipeline.
- `SPIKE-NOTES.md` — the original spike write-up (adopt-vs-fork, RDCleanPath, etc.).

DGW was a pristine clone of `github.com/Devolutions/devolutions-gateway` (no local
changes) — nothing to back up; re-clone if ever needed.

## To rebuild the vendored WASM later
1. Toolchain (Apple Silicon): `brew install rustup wasm-pack`; `rustup toolchain install 1.89.0`;
   `rustup target add wasm32-unknown-unknown --toolchain 1.89.0`.
2. Restore the fork:  `git clone --branch garely-stridefix IronRDP-garely-forks.bundle IronRDP`
   (all 3 branches come with it; `git branch -a` to see them).
3. Build:  edit the `cd` path in `build-wasm.sh` to the restored `IronRDP`, run it →
   produces `crates/ironrdp-web/pkg/`. Then `build-packages.sh` → `npm pack` the two
   `web-client` packages → `.tgz`.
4. Vendor: copy the `.tgz` files into `app/vendor/` of the Garely app
   (`~/Documents/Garely/app/vendor/`), `npm install`, `tsc`, deploy.

See memory `garely-rdp.md` for the full fork-build pipeline + vendoring traps.
