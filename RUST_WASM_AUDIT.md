# Rust/WASM migration audit

Date: 2026-10-19

## Scope and conclusion

Source review of the Nuxt configuration, dependencies, Vue processing modules, authentication utilities/routes, and database schema. No browser benchmarks, production database inspection, deployment security verification, or compiled Rust proof of concept were performed. Findings below distinguish source observations from proposed work.

Keep Nuxt/Vue for forms, routing, previews, pointer interactions, and downloads. Introduce Rust/WASM for computational kernels behind a dedicated Web Worker. Keep authentication, authorization, secrets, and database access on the server. A full Rust frontend rewrite is a separate project with little direct benefit to these processing algorithms.

No Cargo manifest, Rust sources, WASM integration, or test scripts were found in the reviewed application. `cargo`, `rustc`, and `wasm-pack` were not discoverable on the current shell PATH; installation status outside PATH is unknown.

## Module migration map

| Module | Current processing | Rust/WASM recommendation | Priority |
| --- | --- | --- | --- |
| WatermarkRemoverModule.vue | Custom FMM inpainting and randomized patch synthesis over typed arrays | Port both algorithms as pure Rust functions; execute in a worker | First |
| ImageResizeModule.vue | Browser image decoding, Canvas drawImage resizing, Canvas encoding, JSZip | Benchmark Rust resampling against Canvas; retain browser codecs initially | Second, conditional |
| WatermarkModule.vue | Canvas positioning/compositing, PNG output, JSZip | Share a Rust compositor if batch benchmarks justify it; keep interactive preview in Canvas | Second, conditional |
| PdfImageExtractorModule.vue | PDF.js worker parses PDFs; Vue converts pixel buffers and exports images | Retain PDF.js initially; optionally move pixel conversion and packaging into processing worker | Later |
| AgentToAgentFormModule.vue | Draws a full document on Canvas; embeds its PNG in a new pdf-lib document | Separate layout model from rendering before choosing a Rust PDF implementation | Later |
| PdfTemplateFillerModule.vue | Draws Listing NOC on Canvas; embeds PNG in a new pdf-lib document | Same layout/render separation as Form I | Later |
| EjariFormModule.vue | Loads template PDF; overlays text and marks using pdf-lib | Retain initially; require template/font compatibility proof before replacing | Later |
| ESignatureModule.vue | Pointer events, Canvas strokes, PNG export | Keep in Vue/Canvas; Rust only if adding substantive image cleanup | Low |
| WikiPageModule.vue | Markdown rendering and article editing | Keep in TypeScript | No migration needed |
| Login, registration, profiles, navigation, contact | UI and API orchestration | Keep in Vue | No migration needed |
| server/api and server/utils | Sessions, roles, OAuth, Supabase service role access | Keep server side; native Rust backend would be a separate migration | Never move privileged logic to browser WASM |

The README describes template coordinate mapping for Form I and Listing NOC, but their current generation functions create raster documents rather than loading those PDF templates. Do not plan the migration from the README alone.

## Findings to address before or during migration

### High: processing remains on the UI thread

`WatermarkRemoverModule.vue:289` implements synchronous FMM; `:447` implements patch synthesis; `:681` orchestrates both. The timeout around FMM delays execution but still runs the algorithm on the main thread. Patch synthesis yields intermittently, but its calculations still occupy that thread. A synchronous WASM call on the same thread would preserve this responsiveness problem. Move the computation into a worker first and compare worker-JavaScript against worker-WASM to distinguish scheduling gains from algorithm gains.

### High: large full-image allocations

The remover retains image data, a clean source copy, a full RGBA mask readback, mask flags, undo snapshots, and four full-size Float32 accumulation arrays (`:627`). At 12 million pixels, RGBA is 48 MB and the four accumulators alone total 192 MB (decimal units), before other arrays, browser image/canvas storage, and WASM copies. Restrict dimensions and memory budgets; use mask bounding regions plus necessary source-search padding; budget undo by bytes. WASM does not automatically reduce this footprint.

### Medium: removal failures can leave processing active

`applyWatermarkRemoval` sets processing to true but has no encompassing try/catch/finally. Canvas readback, allocation, encoding, or decoding failures can bypass reset and leave the controls disabled. Add structured error handling and reset processing in finally. Worker errors and WASM traps need the same treatment.

### Medium: resize filenames can disagree with output bytes

`ImageResizeModule.vue:137` derives the original extension from the uploaded filename. Unknown extensions fall back to PNG MIME, but the output name retains the unknown extension. A successfully decoded BMP, for example, can be exported as PNG bytes named `.bmp`. Resolve the output format once and use it for both MIME and extension; verify the returned Blob type when browser encoding falls back.

### Medium: PDF extraction coverage and cleanup need fixtures

`PdfImageExtractorModule.vue:198` consumes PDF.js operator lists and object stores through loosely typed data. The inline-image and inline-image-group branches pass the same argument shape to conversion; grouped operations need dedicated compatibility fixtures before claiming full extraction support. Pixel conversion infers channel layout from byte length rather than explicit image kind. The extraction path does not explicitly destroy its document in finally. Failed partial extraction can leave locally collected preview object URLs unreleased. Handle document lifetime and partial results explicitly.

The PDF.js worker is loaded from unpkg (`:211`), introducing an external runtime dependency. Bundle or self-host the matching installed worker for reproducible offline behavior and simpler deployment policy.

### Medium: PDF output parity is more than successful serialization

Form I and Listing NOC embed a raster page (`AgentToAgentFormModule.vue:752`, `PdfTemplateFillerModule.vue:544`), so their drawn text is not selectable PDF text. EJARI uses StandardFonts.Helvetica (`EjariFormModule.vue:191`); Unicode/Arabic coverage must be tested and an appropriate embedded-font/shaping strategy defined if required. A Rust port must preserve page size, coordinate mapping, logos, stamps, line wrapping, and multilingual output. Do not combine an unmeasured engine replacement with silent document-layout changes.

### High verification item: database access policy

`supabase/schema.sql` defines users containing password hashes and sessions containing bearer tokens, but does not enable RLS or restrict table grants. This does not prove that the deployed database is publicly accessible: actual grants, exposed schemas, and applied policies were not inspected. Verify anonymous/authenticated roles cannot read or mutate these tables directly. The app correctly places its service role client in `server/utils/supabase-admin.ts`; keep that key out of browser code and compiled WASM.

### Medium: authentication work can block the server

`server/utils/auth-db.ts` uses scryptSync for registration and password verification. The reviewed login/register handlers contain no rate limiting, and request TypeScript types provide no runtime validation. Add runtime schemas, input size limits, and abuse controls; use asynchronous password hashing or a managed authentication service as appropriate. Deployment-level protections were not inspected. Browser WASM cannot enforce trusted authentication or authorization.

## Proposed integration

Suggested boundaries (these files do not yet exist):

```text
crates/processing-core/        Pure Rust algorithms and native unit tests
crates/processing-wasm/        wasm-bindgen interface and validation
app/workers/processing.worker.ts
app/composables/useProcessing.ts
```

Use wasm-bindgen and wasm-pack with an explicitly initialized web target. Lazy-load the worker and WASM only when a processing tool is used. Initialize one instance per worker and reuse it. Instantiate browser workers only on the client; preserve Nuxt SSR for the existing pages. Verify dev and production asset URLs, deployment base paths, MIME types, and CSP in a small integration spike before choosing generated-asset placement.

Define a typed worker protocol with job ID, operation, dimensions, options, and transferable pixel/mask buffers. Responses carry the job ID plus result, progress, or a structured error. Validate dimensions, checked width*height arithmetic, buffer lengths, and maximum work before allocating in Rust. Ignore stale responses after a new upload or navigation. For a first synchronous Rust kernel, cancellation can terminate and recreate its worker; cooperative cancellation requires a chunked algorithm or a deliberately designed shared flag.

Transfer ordinary ArrayBuffers between the UI and worker to avoid structured-clone copies. Transfer detaches the sender's buffer; preserve the source/undo state deliberately. This does not make JS-to-WASM marshaling zero-copy: measure and budget those copies separately. Return an owned output buffer rather than exposing a view that becomes invalid after memory growth or later calls.

Start with one worker and single-threaded WASM. Add SIMD or WASM threads only after measurements justify their compatibility and deployment complexity. Progress callbacks must be coarse-grained. Seed randomized patch synthesis for repeatable regression cases. Preserve Uint8ClampedArray rounding/clamping semantics deliberately when converting floating-point results to Rust bytes.

Keep browser image decode/encode initially. A Rust codec replacement needs its own compatibility matrix, output quality checks, and bundle-size review. Likewise, retain pdf-lib, PDF.js, and JSZip until actual timing and compatibility evidence supports replacing each one.

## Migration sequence and acceptance gates

1. Record baselines: small, 12 MP, and large images; small/large masks; transparent inputs; repeated operations; multi-file batches. Measure cold load, warm total latency, kernel time, UI responsiveness, peak memory, and output size on desktop and mobile browsers.
2. Extract existing remover algorithms into a pure TypeScript module and worker without changing results. Add malformed-input handling, recovery, cancellation, deterministic seeds, and memory limits.
3. Port those kernels to Rust with unit tests for empty/full masks, edge masks, tiny images, invalid lengths, alpha handling, and known-pixel preservation. Compare seeded outputs with explicit tolerances rather than assuming exact floating-point parity.
4. Integrate lazy-loaded WASM and retain the existing engine behind a temporary development comparison switch. Benchmark end-to-end paths including decode, copies, worker messaging, encoding, and download preparation.
5. Ship the remover after measurable responsiveness and/or latency gains, acceptable visual quality, stable repeated-use memory, cancellation recovery, and successful Nuxt production build/browser smoke tests.
6. Evaluate resize/compositing separately. Test PDF replacement only after building fixtures for templates, grouped/inline images, transparency, embedded fonts, and required scripts. Pin any selected Rust libraries after a WASM-target compatibility proof; no replacement PDF crate was validated in this audit.

## References

- wasm-bindgen explicit web initialization and build target: https://wasm-bindgen.github.io/wasm-bindgen/examples/without-a-bundler.html
- Worker transferable ownership and detached buffers: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects
- WASM linear memory: https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory

This document records the initial audit, before implementation. Subsequent migration work and verification are documented in README.md; the historical findings and line references above describe the original code. No unmeasured performance improvement is claimed.
