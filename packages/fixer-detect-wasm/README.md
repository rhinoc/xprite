# @xprite/fixer-detect-wasm

**Fixer Rust AC+RL consensus detector** compiled to WebAssembly.

## Prebuilt binaries

This package ships prebuilt WASM binaries so CI can build without rustc:

- `pixelfixer_detect_bg.wasm` (~447 KB)
- `pixelfixer_detect.js` (glue)
- `pixelfixer_detect.d.ts` (types)

## API

```ts
import init, { detectFastAcRl } from '@xprite/fixer-detect-wasm';

await init();

const result = detectFastAcRl(rgba, width, height);
// result: { cols, rows, step_x, step_y, consensus: "fast:ac+rl(S)" | "null" }
```

Returns consensus `"fast:ac+rl(S)"` when AC and RL agree within tolerance and both scores ≥ 0.30.
Otherwise returns `"null"` with AC fallback grid.

## Rebuild from source

**Prerequisites:**
- Rust stable (tested: 1.99.1)
- `wasm32-unknown-unknown` target
- `wasm-bindgen-cli`

```bash
cd packages/fixer-detect-wasm
./rebuild.sh
```

The rebuild script:
1. Builds `rust-src/` to `wasm32-unknown-unknown`
2. Runs `wasm-bindgen` to generate JS glue
3. Replaces prebuilt binaries in package root

## Source provenance

Detector sources derived from [pixel-art-fixer](https://github.com/example/pixel-art-fixer) Rust crates:
- `acf` — banded unbiased autocorrelation with comb scoring
- `autocorr` — multi-tiling local step detection
- `runlengths` — perpendicular edge gradient run-length pooling
- `gray` — alpha-folded luminance
- `sigproc` — median filter, boxfilter, peak interpolation

Modifications for browser:
- Rayon replaced with sequential joins (ordered semantics preserved)
- No `image` crate dependency (RGBA in)
- `cdylib` + `wasm-bindgen` API

## Golden validation

Native smoke test of same sources vs Python `core.detect(mode="fast")` on 8 Fixer golden cases: **8/8** match.

See `rust-src/GOLDEN_SMOKE.txt` for box probe results (2026-10-29).
