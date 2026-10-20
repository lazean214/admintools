# AdminTools - Real Estate Web Tools

[Live application](https://admintools.vercel.app/) · [GitHub repository](https://github.com/lazean214/admintools) · [Changelog](CHANGELOG.md) · [Security](SECURITY.md)

Nuxt 4 tools for real estate documents, PDF editing, local OCR, images and a role-based article guide. Rust/WASM handles document and image processing in browser workers; authentication and stored content use server-side Supabase access.

## Features

- Form I / Agent-to-Agent, Listing NOC and EJARI template workflows.
- PDF editor: supported original text replacement, selectable added text, images, visual signatures, shapes, highlights, links, page rotation/reordering/deletion and undo/redo.
- English OCR: review and correct recognized lines, then reconstruct the current scanned page as actual editable PDF text.
- PDF image extraction, image resizing, watermark placement/removal and e-signature images.
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

The normal development/build commands prepare the pinned EJARI JSON transport and self-hosted OCR assets. Generated OCR worker/core/model files live in ignored `public/ocr/v7/`; install dependencies before running `node scripts/prepare-assets.mjs` directly.

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
| Watermark removal | 12 megapixels; 250000 selected pixels within a 1-megapixel bounding box; 64 MiB undo budget |

Browser workers are terminated on cancellation, and document sessions release their resources. PDFs and images used by these local processing tools stay in the browser. Saved profiles and guide content are intentionally sent to the application server and Supabase.

The EJARI source uses generated JSON/base64 transport to avoid download managers intercepting an internal PDF request. Completed exports use explicit download links. Run `scripts/generate-ejari-template-data.mjs` after intentionally changing the pinned template and update the corresponding fixture checks.

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

`npm run audit:production` checks production dependencies and currently reports zero advisories. The full development dependency audit still reports two unpatched upstream advisories propagated through the build tools: `braces` 3.0.3 and `node-forge` 1.4.0. Nuxt/Tailwind and type/test tools are development dependencies; the release bundle check also rejects these two packages if they appear in the deployed server dependency list. This distinction does not make the development advisories disappear. Use trusted build inputs and monitor upstream fixes; do not use `npm audit fix --force` to downgrade the framework indiscriminately.

The shared production limiter enforces 30 login attempts per 15 minutes and 10 registration attempts per hour per hashed client address across instances. Local development retains bounded in-process throttling. Vercel's overwritten client-IP header is trusted only in Vercel's runtime; self-hosted proxies require an explicit trust list. Database failures fail closed. This is not a substitute for an edge firewall against volumetric abuse.

## Main routes

`/agent-to-agent-form`, `/listing-noc-form`, `/ejari-form`, `/pdf-editor`, `/pdf-image-extractor`, `/image-resize`, `/e-signature`, `/watermark`, `/watermark-remover`, `/real-estate-guide`, `/profile-settings`, `/login`, `/register`, `/contact`.

Protected operations are enforced by API authorization, not only page middleware. Sessions use HttpOnly, SameSite=Lax cookies with Secure enabled in production. Authentication JSON bodies have a 32 KiB limit and a 10-second read deadline.
