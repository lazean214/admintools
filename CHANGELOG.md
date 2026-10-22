# Changelog

Entries are listed newest first. Historical milestones are based on repository history. Unreleased entries describe local changes and do not imply deployment.

## Unreleased

### 2026-10-22 - Image Object Remover

- Replaced Watermark Remover with Image Object Remover at `/image-object-remover`; redirected the former route and updated dashboard/navigation labels.
- Added local LaMa AI inpainting through ONNX Runtime Web with WebGPU where supported and WASM fallback; retained Rust/WASM texture repair as a separate option.
- Added a pinned model download (approximately 208 MB on first use) and optional browser caching. Photos and selections remain on the device.
- Added selection erasing and continuous brush strokes alongside rectangle selection. Preserved undo, cancellation, original dimensions, alpha, unselected pixels and clean PNG export.
- Prepared self-hosted ONNX runtime assets through normal development/build commands and added an optional real-model WASM smoke test.
- Removed technical runtime/model details from the processing preview and editor helper text, using simple progress messages instead.
- Updated README features, routes, setup and object removal guidance; expanded historical changelog coverage.
- Validation: 31 processing tests, app/processing type checks, a production build and real LaMa WASM inference passed. Browser visual verification and WebGPU execution remain unconfirmed on a target device.

### Security and production

- Added an empty `.env.example`, broader credential/data/build-artifact ignore rules, and redacted working-tree/index/history and release-bundle secret checks.
- Updated Nuxt/Vue and transitive dependencies, moved build/test tools into development dependencies, upgraded PDF.js to 6.4.299 and adapted its document cleanup/viewport API usage.
- Updated vulnerable selector-parser dependencies. Earlier security checks documented a clean production audit and two remaining build-tool advisories. The latest dependency installation reported 14 high-severity findings across the full graph; re-run the production audit before deployment.
- Disabled Nuxt DevTools and production source maps; added response security headers and private response cache controls.
- Blocked OAuth return paths that escape the origin through backslashes or control characters; stopped returning raw database errors.
- Added SQL migration `202610190001_server_only_tables.sql` to enable RLS and revoke direct public access to the app's user, session and guide tables.
- Added atomic shared production login/registration limits, Vercel-aware client address handling, fail-closed errors, and SQL migration `202610190002_shared_auth_limits.sql`.
- Added isolated database permission/rate-budget tests, full Vue/server type checks, read-only GitHub Actions release checks and Dependabot configuration.
- Reworked README setup, Vercel deployment, OCR limitations and credential handling guidance.

### Deployment requirement

Apply **both SQL migrations before deploying the new authentication code**. Existing Vercel environment variables remain in Vercel; do not copy them into the repository. Use Node 24.x (24.15+) and `npm ci --include=dev` for builds. Deploy with the Nuxt preset and automatic output handling.

## 2026-10-20

### PDF compression, image resizing and dashboard

- Added local PDF compression with lossless or JPEG image compression, selectable text preserved, file-size comparisons and dedicated tests.
- Expanded image resizing with crop/fit, rotation and flipping, saved browser presets, output quality and target file-size controls.
- Updated the homepage tool layout and navigation for the expanded image and PDF utilities.

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

## 2026-05-14

### PDF template layout

- Adjusted signature-name positioning and updated the PDF template filler.

## 2026-05-07

See [the EJARI feature update log](changes-2026-05-07-ejari.md) for the earlier form/template integration and layout calibration.

- Added EJARI navigation and template-based PDF export, calibrated form coordinates and removed template alignment inputs.
- Added a PayPal support link and fixed a TypeScript issue.

## 2026-04-11

### Forms and navigation

- Updated Form I, top navigation and the mobile menu.
- Refined data prefetching.

## 2026-04-10

### Application tools and accounts

- Updated PDF generation, Form I, Listing NOC, object removal and the contact page.
- Added the real estate guide, database-backed content and authentication; switched database storage from SQLite to Supabase.
- Added Google sign-in and refined caching, data fetching, hydration, homepage tool listings and SEO metadata.

## 2026-04-09

### Initial project

- Created the application and introduced the Agent-to-Agent form workflow.
