# Changelog

## Unreleased

### Security and production

- Added an empty `.env.example`, broader credential/data/build-artifact ignore rules, and redacted working-tree/index/history and release-bundle secret checks.
- Updated Nuxt/Vue and transitive dependencies, moved build/test tools into development dependencies, upgraded PDF.js to 6.4.299 and adapted its document cleanup/viewport API usage.
- Updated vulnerable selector-parser dependencies. Production npm dependencies have no reported advisories; two unpatched build-tool advisories remain documented in `SECURITY.md`.
- Disabled Nuxt DevTools and production source maps; added response security headers and private response cache controls.
- Blocked OAuth return paths that escape the origin through backslashes or control characters; stopped returning raw database errors.
- Added SQL migration `202610190001_server_only_tables.sql` to enable RLS and revoke direct public access to the app's user, session and guide tables.
- Added atomic shared production login/registration limits, Vercel-aware client address handling, fail-closed errors, and SQL migration `202610190002_shared_auth_limits.sql`.
- Added isolated database permission/rate-budget tests, full Vue/server type checks, read-only GitHub Actions release checks and Dependabot configuration.
- Reworked README setup, Vercel deployment, OCR limitations and credential handling guidance.

### Deployment requirement

Apply **both SQL migrations before deploying the new authentication code**. Existing Vercel environment variables remain in Vercel; do not copy them into the repository. Use Node 24.x (24.15+) and `npm ci --include=dev` for builds. Deploy with the Nuxt preset and automatic output handling.

## 2026-10-19

### PDF editor and OCR

- Added supported original-text replacement and selectable text export, images, visual signatures, shapes, annotations, external links and page organization.
- Added local English OCR with confidence scores and editable review lines. Conversion reconstructs one scanned page as actual PDF text, with approximate layout and Helvetica/WinAnsi output; it removes that page's original scan/graphics/forms and supports undo.
- Added blank, vector-text and image-only sample PDFs, cancellation and transactional preview/history updates. Committed edits invalidate older completed downloads.
- Added Rust/WASM PDF editing/export and local self-hosted OCR assets prepared by normal development/build commands.
- Added end-to-end recognition/export/reopen/re-edit tests, shared-resource isolation checks and independent PDF text-extraction/render verification.

### Existing processing work

- Added Rust/WASM image processing, worker cancellation, bounded memory/input checks and PDF export helpers.
- Added download-manager-safe EJARI template transport and preserved explicit completed-PDF downloads.
- Added bounded authentication JSON parsing, input validation and asynchronous password derivation.

## 2026-05-07

See [the EJARI feature update log](changes-2026-05-07-ejari.md) for the earlier form/template integration and layout calibration.
