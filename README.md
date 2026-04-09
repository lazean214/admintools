# WebTools - Real Estate PDF and Image Utilities

Nuxt 4 application for real estate document workflows, including template-based PDF filling, Form I generation, and image/PDF utility tools.

## Main Features

- Form I / Agent-to-Agent PDF generator using fixed legacy coordinate mapping.
- Listing Agreement PDF filler for `noc_listing_form.pdf` using legacy coordinate logic.
- Header injection in listing agreement PDF: logo (left), establishment name (center), ORN (right).
- Optional signature upload with preview before PDF generation.
- Profile settings module to store company defaults locally:
	- Logo
	- Stamp
	- Establishment Name
	- Office Address
	- Office Phone
	- Office Email
	- ORN
	- DED License
	- PO Box
- Local registration/login flow (browser local storage).
- Module navigation for PDF extractor, image resize, e-signature, watermark tools.
- Contact module for bug reports and feature requests via WhatsApp.

## Local Storage and Privacy

- Authentication and profile data are stored in browser local storage.
- Data is device/browser-specific and is not sent to a backend in this project.
- Clearing browser storage or switching browser/device removes access to saved data.

## Templates Used

- `public/agent-to-agent.pdf`
- `public/noc_listing_form.pdf`

## Routes

- `/` Home
- `/agent-to-agent-form` Form I generator
- `/pdf-template-filler` Listing agreement template filler
- `/pdf-image-extractor` PDF image extractor
- `/image-resize` Image resizer
- `/e-signature` E-signature tool
- `/watermark` Watermark tool
- `/watermark-remover` Watermark remover
- `/contact` Contact and requests module (WhatsApp: +971506422370)
- `/profile-settings` Protected profile settings
- `/login` Login
- `/register` Registration

## Contact and Support

- For bug reports and feature requests, use the Contact module in the app.
- Quick contact link uses WhatsApp to: `+971506422370`.
- Project note shown in the Contact module: tools are provided for free for admins who may not have access to paid tools.

## Setup

Install dependencies:

```bash
npm install
```

## Development

Run local dev server:

```bash
npm run dev
```

## Build

Create production build:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

## Tech Stack

- Nuxt 4
- Vue 3
- TypeScript
- Tailwind CSS
- pdf-lib
- pdfjs-dist
