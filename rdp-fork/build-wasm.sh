#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.rustup/toolchains/1.89.0-aarch64-apple-darwin/bin:$PATH"
cd "$HOME/Desktop/garely-rdp-spike/IronRDP"

echo "=== toolchain ==="
cargo --version
wasm-pack --version

echo "=== building ironrdp-web WASM (release, simd128+bulk-memory) ==="
cd crates/ironrdp-web
RUSTFLAGS='-Ctarget-feature=+simd128,+bulk-memory --cfg getrandom_backend="wasm_js"' \
  wasm-pack build --target web

echo "=== applying JS URL fixup (xtask web.rs parity) ==="
node -e '
const fs=require("fs");
const p="pkg/ironrdp_web.js";
let c=fs.readFileSync(p,"utf8");
if(!c.startsWith("import wasmUrl")){
  c="import wasmUrl from \x27./ironrdp_web_bg.wasm?url\x27;\n\n"+c;
}
c=c.replace("new URL(\x27ironrdp_web_bg.wasm\x27, import.meta.url)","wasmUrl");
fs.writeFileSync(p,c);
console.log("fixup applied; starts with:", c.slice(0,60));
'
echo "=== pkg contents ==="
ls -la pkg/
echo "WASM_BUILD_DONE"
