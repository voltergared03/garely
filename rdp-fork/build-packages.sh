#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.rustup/toolchains/1.89.0-aarch64-apple-darwin/bin:$PATH"
ROOT="$HOME/Desktop/garely-rdp-spike/IronRDP/web-client"

echo "===== iron-remote-desktop: npm install ====="
cd "$ROOT/iron-remote-desktop"
npm install --no-audit --no-fund
echo "===== iron-remote-desktop: build ====="
npm run build
echo "--- desktop dist ---"; ls -la dist/

echo "===== iron-remote-desktop-rdp: npm install ====="
cd "$ROOT/iron-remote-desktop-rdp"
npm install --no-audit --no-fund
echo "===== iron-remote-desktop-rdp: build-alone (vite only, skip pre-build/svelte) ====="
npm run build-alone
echo "--- rdp dist ---"; ls -la dist/

echo "PKG_BUILD_DONE"
