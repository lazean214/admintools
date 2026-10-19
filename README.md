# AdminTools - Real Estate Web Tools

Nuxt 4 application for real estate admin workflows, including template-based PDF generation, EJARI export, guide/article management, and document/image utilities.

## Features

- Form I / Agent-to-Agent PDF generation using template coordinate mapping.
- Listing NOC PDF filling using the listing NOC template.
- EJARI form workflow with template-based PDF export (preview + download).
- Profile settings for reusable company defaults:
  - Logo and stamp
  - Establishment and office details
  - ORN, DED License, and PO Box
- Real Estate Guide module:
  - Markdown editor with live preview
  - Cover image and inline markdown image support
  - Heading-based table of contents
  - Role-based create, edit, and delete permissions
- Utility modules:
  - PDF image extractor
  - Image resizer
  - E-signature creator
  - Watermark tool
  - Watermark remover
- Contact module for bug reports and feature requests via WhatsApp.

## Authentication and Roles

- Cookie-based session authentication.
- Database-backed users and roles.
- Role levels:
  - admin: user and role management, full guide access
  - editor: create, edit, and delete guide articles
  - viewer: read-only guide access

## Data and Storage

- Supabase Postgres stores users, sessions, roles, profiles, and guide articles.
- Apply the database schema from supabase/schema.sql before first run.
- Session cookies use HttpOnly and SameSite=Lax.
- Profile and guide images are stored as data URLs.

## Templates and Assets

- public/agent-to-agent.pdf
- public/noc_listing_form.pdf
- public/ejari-template.pdf

## Routes

- /: Home dashboard
- /agent-to-agent-form: Form I / Agent-to-Agent form
- /listing-noc-form: Listing NOC form
- /ejari-form: EJARI form and PDF export
- /real-estate-guide: Guide/article module
- /pdf-image-extractor: PDF image extraction tool
- /image-resize: Image resize tool
- /e-signature: E-signature tool
- /watermark: Watermark tool
- /watermark-remover: Watermark remover tool
- /contact: Contact and requests
- /profile-settings: Protected profile settings
- /login: Login
- /register: Register
- /pdf-template-filler: Legacy redirect to /listing-noc-form
- /wiki: Legacy redirect to /real-estate-guide

## API Overview

Nuxt Nitro serves API routes in the same application process.

Common endpoints:

- /api/auth/login
- /api/auth/me
- /api/auth/users (admin)
- /api/guide-articles

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a .env file with:

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
```

3. Run the SQL in supabase/schema.sql in your Supabase project.

4. Configure Google OAuth redirect URIs:

- Local: http://localhost:3000/api/auth/google/callback
- Production: https://your-domain.com/api/auth/google/callback

## Development and Build

Run dev server:

```bash
npm run dev
```

Run dev server on network:

```bash
npm run dev -- --host
```

Create production build:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

Generate static output (if needed):

```bash
npm run generate
```

## Tech Stack

- Nuxt 4
- Vue 3
- TypeScript
- Tailwind CSS
- Supabase
- pdf-lib
- pdfjs-dist
- markdown-it
- markdown-it-anchor
- jszip

## Rust/WASM watermark removal

The watermark remover runs its FMM base fill and seeded texture synthesis in
Rust/WASM inside a dedicated Web Worker. Vue keeps the image preview, mask
editing, undo, and PNG downloads. The worker and WASM load on the first removal
request. Cancel terminates the worker; the next request starts a fresh instance.
Failures preserve the current source image and selection.

Limits: 12 megapixels, 16384 pixels per side, 32 MB input files, 250000 selected
pixels, and a 1-megapixel selection bounding box. Larger selections can be
processed in stages. Undo snapshots share a 64 MiB budget. Computation uses a
crop around the selection with surrounding search context; Rust accumulation
buffers cover only the selection bounds. Download exports the clean source
without the red selection overlay.

Rust source is in `crates/processing-wasm/`. Generated JavaScript bindings,
TypeScript declarations, and the WASM binary in `app/wasm/processing/` are
versioned so normal Nuxt builds do not require Rust.

To change the algorithms, install Rust with a working native linker, add the
WASM target, and install the matching binding generator:

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.114 --locked
npm run build:wasm
npm run test:processing
npm run typecheck:processing
npm run build
```

The binding-generator version must match the pinned wasm-bindgen dependency.
Commit the regenerated assets together with Rust source changes. The build
script also recognizes the project-local tools under the ignored `.cache/`
directory, used during this implementation without changing the system PATH.
Rust 1.99.1 was used for verification. Processing tests use Node 22.18+ or 24+.

Regression tests instantiate the real WASM binary and cover input limits,
reconstruction, transparency, known-pixel preservation, deterministic texture
synthesis, crop restoration, worker errors/retry/cancellation, and undo budgeting.
Browser smoke testing should cover upload, brush/rectangle selection, removal,
cancel/retry, undo, and download after drawing a fresh selection.

## Resize filters and PDF extraction

Image resizing keeps the existing Canvas implementation as the **Standard**
default. The **Lanczos** option uses Rust/WASM in the processing worker with
alpha-aware filtering. This is an explicit filter choice, not a speed claim:
the measured full pipeline was slower than Canvas on the synthetic desktop
fixtures. See [RESIZE_BENCHMARK.md](RESIZE_BENCHMARK.md) for timings, limitations,
and the local `npm run benchmark:resize` workflow.

Resizing supports cancellation before download and processes previews and exports
sequentially. Input and output sizes are limited to 12 megapixels and 16384 pixels
per side. Batches allow up to 32 files, 32 MB each and 128 MB total; outputs are
also capped at 128 MB. Extreme Lanczos aspect-ratio changes are rejected to bound
intermediate allocation. ZIP names are unique even when source basenames repeat.

PDF extraction retains PDF.js and bundles its matching worker locally. It handles
packed monochrome, RGB, RGBA, and bitmap images, and crops grouped inline atlas
regions into individual exports. Documents/pages and partial preview URLs are
cleaned up on completion, errors, and navigation. Limits are 64 MB per PDF,
12 megapixels per decoded image, 500 exports and 128 MB of encoded results.
This tool extracts decoded images; it does not preserve their original PDF stream
encoding or apply page placement transforms to the exported pixels.

Run `node scripts/create-processing-fixtures.mjs` to generate synthetic browser
fixtures under `.cache/tools/`. The PDF contains twelve inline color images and
one packed monochrome image; extraction should produce thirteen previews.

## Watermark background export

Watermarking supports **Background** and **Standard** export modes. Supporting
browsers default to Background: a worker decodes each input, Rust performs
straight-alpha source-over composition, and OffscreenCanvas encodes the PNG.
Canvas still renders the text/image stamp using the browser's fonts and scaling.
Standard uses Canvas composition on the page and is available for unsupported
browser decoders or worker APIs. No export speed improvement is claimed.

Preview and both export modes share stamp layout and integer placement. Browser
font loading completes before export. Alpha composition may differ slightly from
Canvas's internal premultiplied-byte rounding: the six synthetic browser cases
passed a tolerance of one alpha level and three premultiplied color levels out
of 255. Outputs should not be expected to be byte-identical across modes/browsers.

Batch watermarking now prevents duplicate starts, snapshots settings, supports
cancel/retry, and retains every image when input basenames repeat. Thumbnail
object URLs and worker resources are released on replacement/navigation. Limits
match resizing: 32 images, 32 MB each, 128 MB per batch/output, and 12 megapixels
per image/stamp. Cancellation discards the batch before download; completed
output remains a ZIP of PNGs.

To reproduce the production-worker check without uploading any files:

```sh
npm run build:wasm
npm run build
npm run benchmark:resize
```

Open `http://127.0.0.1:3210/watermark` and click **Run verification**. It uses the
built worker at its production asset path, synthetic text/image stamps, PNG
encoding, Canvas comparison, and cancellation/retry cases. The server is local
to this machine. The existing resize benchmark remains at `/`.

## Rust PDF packaging for Form I and Listing NOC

Form I and Listing NOC keep their Canvas layouts and now send the completed
RGBA raster to the processing worker. Rust flattens transparency onto white,
compresses RGB samples with pinned miniz_oxide 0.8.9, and writes a single-page
PDF 1.4 with an image XObject and classic cross-reference table. These routes
no longer encode a PNG only to decode it again through pdf-lib. Text remains
rasterized, matching the established form output. EJARI uses the separate Rust
template exporter described below.

Each export snapshots the form, selected assets, and theme. Cancellation or
navigation prevents the completed file from opening/downloading. Worker
compression can be terminated immediately; browser layout/drawing and an asset
load already in progress finish before their cancellation check. Rendering
canvases are released in finally blocks. Input is limited to 12 megapixels and
16384 pixels per side, with page sizes between 1 and 14400 PDF points.

Verification covers PDF structure/xref offsets, independent pdf-lib parsing,
lossless RGB decompression, white alpha flattening, page limits, and worker
transport/cancellation. Browser-generated Form I and Listing NOC samples were
reopened with pypdf and rendered with Poppler at 144 dpi: each was one A4 page
(595.275591 × 841.889764 points). Each render was pixel-identical to pdf-lib
packaging of the same source raster. This verifies packaging/orientation, not a
new layout engine, editable fields, PDF/A conformance, or template support.

`npm run typecheck:processing` now checks the two PDF forms as well as the image
tools. It reports authentication/server diagnostics pulled in through Nuxt's
generated globals separately; it does not claim the entire repository type-checks.

Implementation references:
- [PDF 1.7 / ISO 32000-1 reference](https://developer.adobe.com/document-services/docs/assets/35e4369068f86065372c18787171a17e/PDF_ISO_32000-1.pdf), image XObjects and file structure.
- [miniz_oxide 0.8.9](https://docs.rs/crate/miniz_oxide/0.8.9), zlib-wrapped compression.

## Rust EJARI template export

`crates/ejari-pdf-wasm` uses pinned lopdf 0.44.0 in a separate lazy worker.
The UI uses a compatibility export: PDF.js renders the three-page US Letter
template (612 × 792 points) at 144 dpi, Canvas draws the captured values onto
those same pages, and Rust packages the resulting RGB images losslessly into
a new three-page PDF 1.4. Values and artwork are part of one page image, so
readers do not need to render an appended text layer. Exported text is no
longer selectable. Existing template artwork remains visually rendered, rather
than preserved as its original PDF objects. The 743313-byte WASM module loads
only when exporting EJARI, independently of the image worker. PDF.js is also
loaded lazily, with its matching self-hosted worker.
The component no longer imports pdf-lib. Helvetica/WinAnsi metrics generated
from MIT-licensed @pdf-lib/standard-fonts 1.0.0 preserve existing truncation,
kerning measurements, dates, amounts, coordinates, and usage checkmarks.
Browser text uses Arial/Helvetica. The prior vector exporter remains available
to regression tests, with hexadecimal text encoding and isolated graphics state.

The exporter accepts only the checked-in template's SHA-256 and rejects
changed templates before parsing. Template input is limited to 2 MB; the vector
reference limits eager stream decompression to 32 MiB per stream. Its overlays
are limited to 64 fields, 1024
bytes per field, and 64 KiB total, with finite bounded coordinates. Unsupported
characters produce a field-specific error. Existing Arabic artwork remains
intact; entering Arabic values requires a future embedded-font/shaping change.
Compatibility packaging accepts exactly three 1224 × 1584 RGBA pages (about
23.3 MB), converts alpha to white, and compresses one page at a time. Browser
rendering is sequential, with the canvas released and PDF.js task destroyed
after rendering or cancellation. Export snapshots values, guards duplicate starts, aborts template fetching on
cancellation, terminates worker processing, and prevents downloads after
cancellation/navigation. Retrying creates a fresh worker. The completed result
shows its `ejari-filled-...pdf` filename with explicit preview/download links.
Its object URL stays valid until the next successful export or navigation;
the blank source template is not the completed download. Preview opens only
when its link is clicked, avoiding an asynchronous automatic popup.

```sh
npm run build:wasm:ejari
npm run test:ejari
python scripts/verify-ejari-render.py --poppler-dir /path/to/poppler/bin
```

The test writes `.cache/ejari-proof/roundtrip.pdf` for the render comparison.
Eight tests cover all three pages, geometry/rotation, resource references,
existing stream bytes, WinAnsi encoding, text fitting, malformed overlays,
template rejection, and worker transport/cancellation/retry. Poppler renders
were pixel-identical at 144 dpi for the blank roundtrip and filled reference
outputs for Residential, Commercial and Industrial (12 page comparisons,
1224 × 1584 pixels each). Fixtures include accented Latin text, long names,
dates, amounts, and all five additional terms. The raster packaging test checks
all three page images, ordering, dimensions, white flattening and invalid input.
No speed improvement is claimed.

To verify the built worker in a browser, run `npm run build` followed by
`npm run benchmark:resize`, open `http://127.0.0.1:3210/ejari`, and click
**Run verification**. Four production-worker checks passed: PDF export,
modified-template rejection, cancellation, and fresh-worker retry. This local
harness uses synthetic values and the public template. The processing type
check includes EJARI and both workers; existing authentication/server type
diagnostics are reported separately. `npm run build:wasm` rebuilds both crates;
`build:wasm:ejari` rebuilds only the template engine.

The application loads its source template as base64 JSON from
`/ejari-template-data.json`, then decodes and verifies it locally. It makes no
request to `/ejari-template.pdf` during export. This prevents PDF download
extensions such as IDM from capturing the blank source request before values
are added. The original PDF stays available as a source asset. Regenerate the
JSON with `node scripts/generate-ejari-template-data.mjs` after replacing that
asset; npm's prebuild/predev/pregenerate scripts also regenerate it. A regression
test verifies byte-for-byte equivalence, the non-PDF request path, cancellation
signal forwarding, and malformed/failed responses. The final filled PDF still
downloads from its locally generated Blob URL.

Click **Run compatibility verification** on the same harness to test the UI's
rendering helper and production raster worker without opening a PDF preview.
Seven checks passed: three pages; every pixel of all three pages survived PDF
packaging and PDF.js decoding; the owner, tenant and page-three term regions
contained visible changes from the blank template. This verifies the generated
PDF bytes and rendered values, independent of the download filename.

## Authentication processing and input validation

Password hashing and verification now use asynchronous Node scrypt, keeping
CPU work off the event loop. Parameters, salt representation and stored hex
format match the previous scryptSync implementation: existing accounts remain
compatible without a password reset. OAuth-created accounts use the same async
helper. Timing-safe hash comparison remains in place; unknown email addresses
also perform a derivation before returning the same invalid-credentials error.
This does not claim constant-time database queries.

Login/registration services validate unknown payloads before database access.
They require an object with string credentials, normalize email casing/outer
whitespace, reject malformed email addresses, cap email at 320 characters,
registration name at 200 characters, and password at 4096 UTF-8 bytes. Password
whitespace and Unicode bytes remain unchanged. Registration keeps its existing
six-character minimum. These field limits run after the bounded JSON reader
described below.

`npm run test:auth` checks legacy hash compatibility, random salts, wrong
passwords, malformed stored credentials, identity normalization, Unicode byte
limits and service validation before database access. Tests use synthetic
credentials and make no database calls. `npm run typecheck:server` checks the
full server against Nuxt's generated configuration (run Nuxt prepare/build first).
The shared Supabase cache now captures its configured factory's concrete type,
avoiding erased generic defaults that previously made table writes type `never`.

Login and registration now apply per-process rate limits before reading the
body or accessing the database: 30 login attempts per 15 minutes and 10
registration attempts per hour, per client address. All attempts count,
including malformed requests and successes. Exhausted budgets return HTTP 429,
`Retry-After` in seconds and `Cache-Control: no-store`. Login and registration
have separate budgets; expiry restores access without background timers.

The limiter holds at most 10000 hashed address/scope keys and periodically
removes expired entries. It rejects new identities when full instead of evicting
active budgets, so filling the map cannot reset an existing caller's limit.
No passwords or email addresses are retained by the limiter.

By default the limiter uses the server-observed client address and ignores
`X-Forwarded-For`. Behind a reverse proxy, configure `AUTH_TRUSTED_PROXY_IPS`
with a comma-separated list of exact proxy addresses that you control. The
server walks the forwarded chain from right to left through trusted hops and
stops at the first untrusted address. Do not list arbitrary client addresses.
The proxy must replace/append the actual connecting address correctly. Without
this configuration, requests through one proxy share its address budget.

Limits are local to one running process and reset on restart; multiple instances
need a shared limiter or gateway policy. This bounds local authentication work
but is not distributed brute-force protection. Tests cover exact admission
budgets, expiry, scope/client isolation, capacity exhaustion, IPv4-mapped peers,
and spoofed/malformed forwarded chains.

The Node-server login and registration routes accept only `application/json`
with no content compression. Before parsing JSON, a shared reader rejects
declared bodies larger than 32 KiB and counts actual bytes as they arrive, so
chunked bodies have the same cap. Oversized uploads return HTTP 413, unsupported
content types/encodings return 415, malformed JSON/UTF-8 returns 400, and an
incomplete body returns 408 after a 10-second absolute deadline. Error responses
close rejected upload connections after the response is flushed. The reader
releases its buffer references, listeners and deadline timer on completion,
failure or client abort. Rate limits still run first.

`npm run test:auth` includes real local HTTP tests for exact-limit bodies,
chunked and declared oversized uploads, UTF-8 credential preservation,
unsupported media types/compression, timeouts, aborted connections and recovery.
These reader limits target the configured Node server; deployments should also
apply their gateway's request-size/time limits before data reaches the app.
