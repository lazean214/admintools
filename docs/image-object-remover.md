# Image Object Remover

The editor lives at `/image-object-remover`; `/watermark-remover` redirects there.
Photos and masks stay in a dedicated browser worker. No image upload is used.

Smart removal runs LaMa through `onnxruntime-web`, trying WebGPU with WASM
operator fallback, then WASM if GPU initialization or inference fails. Texture
repair retains the existing Rust/WASM synthesis without downloading a model.

The first AI edit downloads approximately 208 MB from Hugging Face. Cache Storage
is used when available; browser eviction or unavailable storage can require another
download. Runtime assets are copied from the installed ONNX Runtime package into
`public/onnx` by the existing predev/prebuild asset preparation step.

Model: [edgetools/lama](https://huggingface.co/edgetools/lama), revision
`d3f22ee032d32d9a68ac06dd3da40aba1f831f1d`. This mirrors Carve's big-lama ONNX export;
the model card attributes the original LaMa weights and Apache-2.0 license.

AI uses a context crop resized to the model's fixed 512 × 512 input. Only selected
RGB pixels are copied back; original alpha and unselected pixels are preserved.
Large objects may lose fine detail. Existing selection limits apply: 250,000
selected pixels and a selection bounding area of 1,000,000 pixels. Edit one object
at a time. Undo retains original image snapshots within the existing memory budget.
Cancel terminates the worker, including active inference and model loading.

Validation:

- `npm run test:processing`
- `npm run typecheck:processing`
- `npm run typecheck:app`
- `npm run build`
- Optional real inference: `node scripts/check-object-model.mjs path/to/lama_fp32.onnx`

The real-model smoke test checks WASM inference dimensions, finite RGB values,
and output scaling. GPU behavior and subjective image quality require browser
testing on the target device.
