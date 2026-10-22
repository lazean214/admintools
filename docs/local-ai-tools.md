# Free local smart selection and document extraction

These tools require no paid API, API key or user account. Image pixels and
document contents are processed on the device. Model files are downloaded as
static assets; inference requests are not sent to a hosted AI service.

## Smart selection

At `/image-object-remover`, choose **Smart select** and click an object. Each
click replaces the previous mask; brush/eraser controls refine it. Enter on the
focused canvas selects the image center. Removal remains an explicit action.

The worker runs the Apache-2.0 model
[Xenova/slimsam-77-uniform](https://huggingface.co/Xenova/slimsam-77-uniform), pinned
to revision `41cefaebe8f8880948ea21fc3ef641419b6a3ab3`, using quantized weights and
Transformers.js with WASM. Existing LaMa removal can separately use WebGPU/WASM.
The model downloads on first use and uses browser caching when available.
Storage eviction can require another download. The image is reduced to at most
1024 pixels per side for selection. The highest-scoring mask containing the
clicked point is restored to original dimensions and checked against the existing
removal limits before replacing the current selection.

Cancel terminates the selection worker, including initialization. Failures leave
the prior image/mask intact and allow manual selection. Model weights remain in
the worker for subsequent selections; per-selection tensors are disposed.

Transformers.js pins a different ONNX runtime from LaMa. Asset preparation copies
its matching binaries into `public/onnx-selection/`, kept separate from
`public/onnx/` to avoid incompatible runtime binaries.

## Document field extraction

At `/document-field-extractor`, read a PDF page or PNG/JPG/WebP, or paste text.
PDFs use their embedded text when present. Scans and images use the existing local
English Tesseract OCR. **Read as a scan** forces OCR for PDFs with unusable text.

This is OCR plus conservative label matching and document-specific parsing, not a
hosted generative model. Select automatic recognition or a passport, Emirates ID,
NOC, property or other-document profile. Identity details remain neutral until a
user chooses whether that person is the tenant, lessor or owner. A new file clears
suggestions and the identity role; documents are read one file/page at a time.

Passports support labeled visual details and standard TD3 machine-readable text.
TD1 card text is also parsed, keeping card numbers distinct from Emirates ID
numbers. Names, issuer/nationality codes, sex, document numbers and raw dates
retain their source lines. Transcription check digits follow
[ICAO Doc 9303](https://www.icao.int/sites/default/files/publications/DocSeries/9303_p5_cons_en.pdf).
Failed checks are shown as review warnings, never as authentication results.
Two-digit MRZ years are kept as the source's YYMMDD until a user enters the full
calendar date; no century is guessed. Extended document-number formats and
unreadable/nonstandard machine-readable lines require manual correction.

Emirates ID recognition checks the 15-digit 784-prefixed number's shape and
normalizes spacing/hyphens. It does not authenticate the ID or infer birth dates
from its digits. See the [UAE identity authority's explanation](https://www.wam.ae/en/article/hszjujia-emirates-id-the-number-may-not-amended-and-does).
NOCs support labeled references, subjects, company/property details and a
conservative named-author/passport-number clause. Unfamiliar prose is left for
manual review. Other documents can use supported common labels or manually added
fields with source excerpts. English OCR remains the supported reading language;
Arabic-only text requires manual entry. Use clear, upright images.

Suggestions retain source snippets, start unselected, and can be edited. Editing
a value clears its review checkbox. Conflicting selected values block transfer.
Dates must be real calendar dates in YYYY-MM-DD format; amounts must contain only
digits and an optional decimal fraction of up to two digits. Users explicitly
normalize ambiguous dates and amounts instead of relying on automatic guesses.

Reviewed values can be downloaded as JSON. Only matching fields are handed to
EJARI: neutral full names require an explicit role, and neutral Emirates IDs map
only to tenant/lessor Emirates ID fields. Passport numbers are never placed in
Emirates ID fields; nationality, birth dates, passport/card numbers and other
unmatched details are download-only. Owner IDs have no separate EJARI destination.
Conflicts with explicitly labeled tenant/lessor/owner fields block transfer.
The handoff uses temporary in-memory application state. EJARI offers Apply/Discard and only fills empty
fields. Importing does not generate or submit a contract. Source documents and
reviewed fields are not stored in localStorage or sent to the application API.
Reloading discards the temporary handoff.

Limits: 32 MB/file, PDFs up to 100 pages, one page per read, images up to
12 megapixels/16,384 pixels per side, text up to 100,000 characters, and extracted
values up to 300 characters. OCR raster resolution is bounded. Cancel/unmount
stops OCR, PDF loading and rendering, and stale results cannot replace new work.

## Verification

```sh
node --experimental-strip-types --import ./scripts/register-types.mjs --test tests/document-fields.test.mjs tests/document-identity-ocr.test.mjs tests/smart-selection.test.mjs
npm run typecheck:processing
npm run typecheck:app
npm run build
```

Optional native-CPU model smoke test, including the first model download:

```sh
node --experimental-strip-types scripts/check-smart-selection.mjs
```

The native check verifies the pinned model's processor/output contract and object
mask selection. Browser WASM execution is checked separately in the live editor.
