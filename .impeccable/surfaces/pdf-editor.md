# PDF editor

Mode: Operate. Extend the existing application's visual system.

Task: open a PDF, edit supported existing text, add selectable text and images,
annotate, organize pages, undo changes, and download a PDF without flattening.

Composition: compact document header and export action; tool row above a neutral
page canvas; page navigation beside the canvas; an inspector for selected text,
image, or annotation. On mobile, controls wrap and the inspector follows the
canvas. Keep the document's readable area dominant. Empty state explains upload,
privacy and supported editing rather than showing invented document content.

Incumbent evidence: app/assets/css/tailwind.css and AppTopNav.vue. Manrope body,
Space Grotesk headings, teal #0f766e actions, slate text, existing module surfaces.
No replacement visual world or global token changes are authorized.

Important states: loading, invalid/encrypted PDF, unsupported original font,
empty/scanned text, selected layer, dirty changes, undo/redo, export in progress,
cancelled export and completed download. Keyboard and touch must be usable.
