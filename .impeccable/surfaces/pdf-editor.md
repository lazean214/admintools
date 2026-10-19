# PDF editor

Mode: Operate. Extend the existing application's visual system.

Task: open a PDF, edit supported existing text, add selectable text and images,
annotate, organize pages, undo changes, and download a PDF without flattening.

Composition: compact document header and export action; tool row above a neutral
page canvas; page navigation beside the canvas; an inspector for selected text,
image, or annotation. On mobile, controls wrap and the inspector follows the
canvas. Keep the document's readable area dominant. Empty state explains upload,
privacy and supported editing rather than showing invented document content.

User-selected workflow reference: https://www.sejda.com/pdf-editor. Follow its
document-first tools and Apply changes/Download flow, while retaining this
application's branding and local browser processing. This is a core editor,
not a claim of complete Sejda feature parity. Keep original text selectable.

Incumbent evidence: app/assets/css/tailwind.css and AppTopNav.vue. Manrope body,
Space Grotesk headings, teal #0f766e actions, slate text, existing module surfaces.
No replacement visual world or global token changes are authorized.

Important states: loading, invalid/encrypted PDF, unsupported original font,
empty/scanned text, selected layer, dirty changes, undo/redo, export in progress,
cancelled export and completed download. Keyboard and touch must be usable.

Implemented boundary: PDF.js previews pages; a lazy dedicated worker uses local
Rust/WASM (lopdf) to rewrite supported original text and export vector/text PDF
objects. Added Helvetica text remains selectable. Images and visual signatures
remain image objects. Original-text replacement retains the font, position and
size; its encoding and available glyphs limit replacement characters. Longer
replacements need overlap review. Added text supports Latin and WinAnsi symbols.

Supported controls include text, images, typed/drawn visual signatures, whiteout,
highlight, rectangles, ellipses, lines, freehand drawing, external links, page
rotation/reordering/deletion, zoom and undo/redo. Whiteout is a visual cover,
not secure redaction; a visual signature is not a digital signature.

English OCR: recognize the current page locally, then let the user review,
edit and exclude lines before choosing Convert to editable page. Reconstruction
creates real selectable/editable Helvetica/WinAnsi text at approximate positions;
it removes the converted page's scan, graphics, annotations/forms and existing
added layers. Preserve other pages, and let Undo restore the original scan.
State this consequence before conversion. This is editable PDF output, not Word
or a hidden searchable text overlay over a retained image.

Self-hosted Tesseract.js 7.0.0 uses C++ WASM and English model data 1.0.0 from
generated public/ocr/v7/ assets. Recognition is one page at a time, capped at
12 megapixels / 8192 pixels per side / 400 lines / 150 seconds. Cancellation
terminates both model initialization and recognition. Include loading/progress,
no recognized text, editable review, unsupported characters and conversion error
states. Unsupported WinAnsi lines start excluded; require correction or exclusion.

Do not imply exact OCR layout/font/graphic reconstruction, paragraph reflow,
nested Form XObject text editing, arbitrary
font replacement, complete interactive form authoring or full Sejda parity.
Encrypted PDFs and PDFs containing signature fields are rejected. Processing
stays in the browser; source PDFs, image assets and result URLs last for the
editing session. The original document is not rasterized for export.
