# AdminTools - Real Estate Web Tools

[Live application](https://admintools.vercel.app/) · [GitHub repository](https://github.com/lazean214/admintools) · [Changelog](CHANGELOG.md) · [Security](SECURITY.md)

Nuxt 4 tools for real estate documents, PDF editing, local OCR, images and a role-based article guide. Rust/WASM handles document and image processing in browser workers; authentication and stored content use server-side Supabase access.

## Features

- Form I / Agent-to-Agent, Listing NOC and EJARI template workflows.
- PDF editor: supported original text replacement, selectable added text, images, visual signatures, shapes, highlights, links, page rotation/reordering/deletion and undo/redo.
- English OCR: review and correct recognized lines, then reconstruct the current scanned page as actual editable PDF text.
- PDF compression with selectable text preserved, PDF image extraction, image resizing, watermark placement, AI object removal and e-signature images.
- Saved company profile defaults and a Markdown real estate guide.
- Viewer, editor and administrator roles; password and optional Google sign-in.

## Local setup

Use **Node.js 24.15 or newer within the 24.x release line**, npm and Git.

```sh
npm ci --include=dev
```

Copy `.env.example` to `.env` for local development. Fill in your own values; never commit `.env`. The existing Vercel environment variables can remain configured in Vercel.

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL, used by the server |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only database key; never expose through `NUXT_PUBLIC_*`, browser code or screenshots |
| `GOOGLE_CLIENT_ID` | Optional Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Optional server-only Google OAuth secret |
| `AUTH_TRUSTED_PROXY_IPS` | Optional exact trusted proxy addresses for a self-hosted reverse proxy; not required for Vercel's own IP header |

### Database setup and upgrades

Run `supabase/schema.sql` in the Supabase SQL Editor, followed by **both migration files in order**:

1. `supabase/migrations/202610190001_server_only_tables.sql`
2. `supabase/migrations/202610190002_shared_auth_limits.sql`

For an existing installation, apply both migrations before deploying the new authentication code. They do not delete application data. Production login/registration fails closed with HTTP 503 if the shared limiter is unavailable.

The app uses custom cookie sessions and authorizes database operations in Nitro. These tables are server-only: RLS is enabled, public/anonymous/authenticated database grants are revoked, and the service role retains the required access. Public guide reads still go through the app API. Do not add broad public database policies to resolve configuration errors.

New accounts are viewers. Promote a reviewed account through trusted database administration or an existing app administrator. There is no default administrator password.

For Google sign-in, register these exact callback paths against your chosen domains:

- Local: `http://localhost:3000/api/auth/google/callback`
- Production: `https://admintools.vercel.app/api/auth/google/callback`

```sh
npm run dev
```

The normal development/build commands prepare the pinned EJARI JSON transport, self-hosted OCR assets and ONNX runtime assets. ONNX runtime files are generated in ignored `public/onnx/`; the object removal model downloads separately on first use. Generated OCR worker/core/model files live in ignored `public/ocr/v7/`; install dependencies before running `node scripts/prepare-assets.mjs` directly.

## Production and Vercel

Use Vercel's **Nuxt** framework preset, **Node 24.x**, install command `npm ci --include=dev`, and build command `npm run build`. Leave the output directory on the framework default so SSR and API routes are included. Keep production secrets in Vercel environment settings. Rust compilation is not required for a normal deployment because generated WASM files are versioned.

Before deployment, apply the SQL migrations above and run:

```sh
npm run security:secrets
npm run audit:production
npm test
npm run typecheck:app
npm run typecheck:server
npm run typecheck:processing
npm run build
npm run security:bundle
```

For a local production smoke test:

```sh
npm start
```

After deployment, verify anonymous admin API requests return 401, signed-in users have the correct role, Google callbacks use the correct domain, and a sample PDF can render, be edited and exported. Test account-dependent flows with your own test account; the public-site checks alone do not verify authenticated database operations or confirm that migrations have been applied remotely.

GitHub Actions runs the repository checks with read-only permissions and pinned action revisions. Dependabot monitors npm, Cargo and GitHub Actions dependencies. The workflow does not receive production credentials or deploy the app.

## PDF editing and OCR

Open `/pdf-editor` from Tools. Choose a document, start a blank PDF, or try the normal/scanned samples. Select supported original text to replace it using its original font. Added text uses Helvetica and stays selectable in exported PDFs. Select added layers to edit, move, resize or delete them. Use **Apply changes**, then **Download PDF**.

For a scan, choose **OCR / Editable page**, review/correct/exclude the recognized lines, then **Convert to editable page**. This creates real editable text objects rather than a hidden searchable overlay. Conversion replaces the selected page's scan, graphics, forms/annotations and added layers with text on a clean background. Undo restores the previous page; other pages remain intact.

OCR currently supports printed English, one page at a time. Layout and font matching are approximate, output uses Helvetica/WinAnsi, and unsupported characters must be corrected or excluded. Images, original fonts and complex paragraph layout are not reconstructed. Recognition runs locally with pinned Tesseract.js 7.0.0 and English data 1.0.0; PDF export uses Rust/WASM. There is no external OCR upload or Word export.

Original PDF text editing depends on its font encoding and available glyphs. Nested Form XObject text, outlined text and scans cannot be edited directly. Encrypted PDFs and PDFs containing signature fields are rejected. Whiteout is a visual cover, and signature images are visual signatures; neither is secure redaction or cryptographic signing. Review exported documents before relying on their content.

### Processing limits

| Operation | Limits |
| --- | --- |
| Editor input | 32 MB, 100 pages, 100000 PDF objects |
| Page content | 4 MiB decompressed, 100000 operations |
| Edits/export | 400 edits, 500 low-level operations, 128 MB completed PDF |
| Editor images | 8 MB/file, 12 megapixels; 16 retained assets / 64 MB |
| OCR | 12 megapixels, 8192 pixels per side, 400 lines, 150-second worker timeout |
| Image object removal | 12 megapixels; 250000 selected pixels within a 1-megapixel bounding box; 64 MiB undo budget |

Browser workers are terminated on cancellation, and document sessions release their resources. PDFs and images used by these local processing tools stay in the browser. Saved profiles and guide content are intentionally sent to the application server and Supabase.

The EJARI source uses generated JSON/base64 transport to avoid download managers intercepting an internal PDF request. Completed exports use explicit download links. Run `scripts/generate-ejari-template-data.mjs` after intentionally changing the pinned template and update the corresponding fixture checks.

## Image Object Remover

Open `/image-object-remover`, choose an image, and paint over an unwanted object and its shadow or select a rectangle. Choose **Smart select** and click an object to select it automatically, or use the manual tools. Use **Erase selection** to refine the marked area, then **Remove object**. Undo restores the previous image; **Download Result** exports a PNG without the selection overlay. The former `/watermark-remover` URL redirects to the new editor.

**Smart removal** runs LaMa AI in a browser worker through ONNX Runtime Web, trying WebGPU with WASM fallback. **Texture repair** uses the existing Rust/WASM algorithm without a model download. Photos and selections stay on the device in both modes.

The first smart edit downloads approximately **208 MB** of model weights from Hugging Face and may take several minutes. The browser caches the model when storage is available; clearing or evicting browser storage requires another download. Internet access is required for that download. Progress messages use plain language without runtime or model details.

AI processes a surrounding crop at 512 by 512 resolution and copies only selected RGB pixels back, preserving unselected pixels and original alpha. Large objects and fine details can produce imperfect results; remove one object at a time and review the result. Input is limited to 32 MB and 12 megapixels, with the selection and undo limits listed above.

See [object remover implementation notes](docs/image-object-remover.md) for the pinned model revision, attribution and runtime setup. For an optional real-model WASM smoke test using an already downloaded model:

```sh
node scripts/check-object-model.mjs path/to/lama_fp32.onnx
```

The initial removal integration passed processing tests, app/processing type checks, a production build and a real LaMa WASM inference check. Smart selection has also been verified in the browser using WASM. WebGPU execution remains unverified on a target device.

## Document Field Extractor

Open `/document-field-extractor` to read a PDF page, PNG, JPG or WebP, or paste document text. Choose automatic recognition or select the document type. PDFs use embedded text when available; scans and images use local English OCR. Choose **Read as a scan** when a PDF's embedded text is unusable.

| Document | Supported suggestions |
| --- | --- |
| Passport | Names, passport number, nationality, issuing country, birth/expiry dates and standard machine-readable text |
| Emirates ID | Neutral holder name, Emirates ID number, nationality, printed dates and supported card text |
| NOC / authorization letter | References, subject, company/property details and supported named-author/passport-number clauses |
| Property / tenancy document | Explicit owner/lessor/tenant details, property identifiers, contract dates, rent and deposit |
| Other document | Supported common labels and manually added fields with source excerpts |

1. Read one document/page or paste its text, then inspect the suggestions beside their source excerpts.
2. Correct values and mark only checked fields **Reviewed and ready to use**. Add missing supported fields manually with a source excerpt.
3. Download reviewed fields as JSON, or choose the person's role and use matching fields in EJARI. EJARI asks you to apply the import and fills only empty fields.

Identity names remain neutral until you explicitly choose **tenant**, **lessor** or **owner**. Passport numbers never fill Emirates ID fields. Nationality, birth dates, passport/card numbers and other unmatched details are available in the download; owner IDs have no separate EJARI field. Conflicting values block transfer.

Use clear, upright images. Reading supports printed English; Arabic-only text requires manual entry. Machine-readable text checks detect some transcription errors and do not establish document authenticity. Two-digit years require a full date entered as YYYY-MM-DD. Enter amounts without currency or commas. Unsupported layouts, unclear text and missing labels may need manual correction.

Limits: **32 MB/file**, PDFs up to **100 pages**, images up to **12 megapixels** and **16,384 pixels per side**, **100,000 text characters** and **300 characters per field**. Reading one file/page at a time keeps documents separate; choosing another file clears the previous suggestions and role. Temporary imports are lost on reload.

Document reading and smart selection are **free**, require no paid API, API key or account, and process document/image contents locally. Smart selection downloads a separate free model on first use. Document extraction uses OCR, label matching and document-specific parsing. See [local AI tool notes](docs/local-ai-tools.md) for implementation details and model attribution.

Focused document checks:

```sh
node --experimental-strip-types --import ./scripts/register-types.mjs --test tests/document-fields.test.mjs tests/document-identity-ocr.test.mjs
```

The checks cover passport/card parsing, Emirates ID recognition, NOC clauses, explicit role mapping and local OCR on clearly marked synthetic images. Browser checks confirmed role selection is required and only the matching name/Emirates ID fields transfer to EJARI. App/processing type checks and the production build also passed. These checks do not guarantee every real-world document layout is readable.

## Image resizing

The resize tool supports crop/fit, rotation, flipping, saved browser presets, output quality and target file sizes. Canvas is the standard processing path; Rust Lanczos is available as an optional quality choice. A requested file-size target may be unattainable for the chosen image and format.

## Rust/WASM development

Generated bindings and WASM in `app/wasm/` are versioned. To change Rust algorithms, install Rust with a working linker, add the WASM target and use the matching binding generator:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.114 --locked
npm run build:wasm
npm test
```

`npm run build:wasm:ejari` rebuilds only the EJARI/editor crate. The build helper recognizes ignored project-local tools under `.cache/` as well as system tools.

See [Rust/WASM audit](RUST_WASM_AUDIT.md), [resize benchmarks](RESIZE_BENCHMARK.md), and [the earlier EJARI update log](changes-2026-05-07-ejari.md) for implementation history. Canvas remains the standard image resize path; the optional Rust Lanczos filter is a quality choice, not a blanket performance claim.

## Security and dependency status

Read [SECURITY.md](SECURITY.md) before publishing or deploying. The secret check scans the working tree, index and reachable Git history and prints locations/rule names without secret values. It is a heuristic, not proof that every credential or personal detail has been identified. Manually review PDFs, screenshots and other binary assets before publishing them.

`npm run audit:production` checks the current production dependency graph. Run it before each deployment; earlier clean audit results do not describe the updated dependencies. The latest ONNX Runtime installation reported 14 high-severity findings across the full dependency graph, without separating production from development findings. Consult the current audit output and [SECURITY.md](SECURITY.md) when assessing deployment readiness. Do not use `npm audit fix --force` to downgrade the framework indiscriminately.

The shared production limiter enforces 30 login attempts per 15 minutes and 10 registration attempts per hour per hashed client address across instances. Local development retains bounded in-process throttling. Vercel's overwritten client-IP header is trusted only in Vercel's runtime; self-hosted proxies require an explicit trust list. Database failures fail closed. This is not a substitute for an edge firewall against volumetric abuse.

## Main routes

`/agent-to-agent-form`, `/listing-noc-form`, `/ejari-form`, `/pdf-editor`, `/pdf-compression`, `/pdf-image-extractor`, `/document-field-extractor`, `/image-resize`, `/e-signature`, `/watermark`, `/image-object-remover`, `/real-estate-guide`, `/profile-settings`, `/login`, `/register`, `/contact`.

Protected operations are enforced by API authorization, not only page middleware. Sessions use HttpOnly, SameSite=Lax cookies with Secure enabled in production. Authentication JSON bodies have a 32 KiB limit and a 10-second read deadline.
