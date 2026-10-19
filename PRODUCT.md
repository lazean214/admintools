# Real Estate Web Tools

## Platform
web

## Stack
Existing Nuxt 4 / Vue application with Tailwind, PDF.js, and Rust/WASM workers.

## Product purpose
The existing application provides real estate document forms and local PDF and
image tools. The user requested a PDF editor for text, images and additional
editing operations, and explicitly requires exported text to remain selectable
and editable. Do not flatten editor pages to images.

## Operating context
The user's browser uses IDM. Internal template loading must avoid requests that
download managers treat as a completed PDF download. Existing EJARI uses JSON
transport for its source template and a separately generated completed file.

## Constraints
Keep privileged authentication and database access on the server. Keep document
editing local to the browser. Preserve the established navigation, typography
and teal controls. General embedded-font support, scanned-text OCR and complex
PDF content structures must not be claimed without implementation and tests.
