#!/usr/bin/env bash
set -euo pipefail

echo "=== Rebuilding @xprite/fixer-detect-wasm from Rust sources ==="

cd "$(dirname "$0")"

# Check prerequisites
if ! command -v cargo &> /dev/null; then
    echo "ERROR: cargo not found. Install Rust: https://rustup.rs"
    exit 1
fi

if ! rustup target list --installed | grep -q wasm32-unknown-unknown; then
    echo "Installing wasm32-unknown-unknown target..."
    rustup target add wasm32-unknown-unknown
fi

if ! command -v wasm-bindgen &> /dev/null; then
    echo "ERROR: wasm-bindgen not found. Install with:"
    echo "  cargo install wasm-bindgen-cli"
    exit 1
fi

echo "Building WASM binary..."
cd rust-src
cargo build --release --target wasm32-unknown-unknown --lib

echo "Generating JS glue with wasm-bindgen..."
wasm-bindgen target/wasm32-unknown-unknown/release/pixelfixer_detect.wasm \
    --out-dir ../tmp-wasm-bindgen-output \
    --target web \
    --no-typescript false

echo "Replacing prebuilt binaries..."
cd ..
mv tmp-wasm-bindgen-output/pixelfixer_detect_bg.wasm .
mv tmp-wasm-bindgen-output/pixelfixer_detect_bg.wasm.d.ts .
mv tmp-wasm-bindgen-output/pixelfixer_detect.js .
mv tmp-wasm-bindgen-output/pixelfixer_detect.d.ts .
rm -rf tmp-wasm-bindgen-output

WASM_SIZE=$(du -h pixelfixer_detect_bg.wasm | cut -f1)
echo "Done! WASM size: $WASM_SIZE"
echo "Prebuilt binaries updated in packages/fixer-detect-wasm/"
