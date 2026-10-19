# Resize migration decision

Measured 2026-10-19 in the local Codex in-app desktop browser. These are synthetic
fixtures, not a broad device benchmark or a visual quality comparison.

Pipeline timing includes image decode, resampling, browser pixel readback,
worker transfers/WASM marshaling where applicable, and JPEG encoding at 0.9.
The synthetic input contains gradients, texture, and partial transparency.
Three warm samples per case; results below are medians in milliseconds.

| Input → output | Canvas default | Canvas high smoothing | Rust/WASM Lanczos | WASM call only |
| --- | ---: | ---: | ---: | ---: |
| 800×600 → 400×300 | 14.0 | 16.9 | 20.5 | 4.3 |
| 4000×3000 → 1920×1440 | 205.0 | 235.7 | 355.4 | 77.4 |
| 4000×3000 → 800×600 | 151.1 | 185.6 | 263.3 | 44.3 |

The first WASM request, including worker/module startup, took 32.0 ms on the small
case. Later first-per-case timings reuse the worker and should not be called cold
starts. WASM call timing includes JavaScript-to-WASM copies and return allocation.
The browser and Rust filters differ, so the table does not establish equal output
quality or prove that one filter is intrinsically faster.

Decision: retain Canvas as the Standard default. Offer Lanczos as an explicit
filter choice implemented by Rust in the cancellable worker. It provides a
specified resampling algorithm; no speed improvement is claimed. Future default
changes require representative photo fixtures, quality review, and mobile memory
and responsiveness measurements. Do not infer a universal speed ratio from
these three cases.

These results use the final RGBA-only build (102253 bytes). An earlier build
produced longer absolute timings but the same decision; run-to-run browser
variation is another reason to avoid generalizing these timings.

The Rust implementation pins fast_image_resize 6.1.0 and uses its default alpha
multiplication/division. This build does not enable WASM SIMD or threads. It
operates on decoded 8-bit RGBA and does not perform linear-light conversion or
preserve source EXIF metadata. Browser codecs still handle input and output.
See the [library documentation](https://docs.rs/fast_image_resize/6.1.0/fast_image_resize/)
for filter, alpha, and colorspace behavior.

Reproduce after rebuilding the module:

```sh
npm run build:wasm
npm run benchmark:resize
```

Open http://127.0.0.1:3210 and click Run benchmark. The server binds only to
loopback, serves fixed local assets, and uses no user images or external APIs.
