# WebTools - Real Estate PDF and Image Utilities

Nuxt 4 application for real estate document workflows, including template-based PDF filling, Form I generation, guide/article management, and image/PDF utility tools.

## Main Features

- Form I / Agent-to-Agent PDF generator using fixed legacy coordinate mapping.
- Listing NOC PDF filler for `noc_listing_form.pdf` using legacy coordinate logic.
- Header injection in listing agreement PDF: logo (left), establishment name (center), ORN (right).
- Optional signature upload with preview before PDF generation.
- Profile settings module to store company defaults per account:
	- Logo
	- Stamp
	- Establishment Name
	- Office Address
	- Office Phone
	- Office Email
	- ORN
	- DED License
	- PO Box
- Real Estate Guide module (shared articles):
	- Markdown editor + live preview
	- Cover image upload
	- Inline image upload into markdown
	- Table of contents from headings
	- Create/edit/delete with role-based permissions
- Authentication with database-backed users and cookie sessions.
- User roles:
	- `admin`: manage users + roles, full article access
	- `editor`: create/edit/delete articles
	- `viewer`: read-only article access
- Module navigation for PDF extractor, image resize, e-signature, watermark tools.
- Contact module for bug reports and feature requests via WhatsApp.

## Data Storage

- SQLite databases are created in `.data/`:
	- `.data/auth.sqlite` for users, roles, sessions
	- `.data/guide.sqlite` for guide articles
- Session auth is cookie-based (`HttpOnly`, `SameSite=Lax`).
- Uploaded images in profile/guide are stored as data URLs in the database.

## Templates Used

- `public/agent-to-agent.pdf`
- `public/noc_listing_form.pdf`

## Routes

- `/` Home
- `/agent-to-agent-form` Form I generator
- `/listing-noc-form` Listing NOC form filler
- `/pdf-template-filler` Legacy route redirect to `/listing-noc-form`
- `/real-estate-guide` Guide/article module (authenticated)
- `/pdf-image-extractor` PDF image extractor
- `/image-resize` Image resizer
- `/e-signature` E-signature tool
- `/watermark` Watermark tool
- `/watermark-remover` Watermark remover
- `/contact` Contact and requests module (WhatsApp: +971506422370)
- `/profile-settings` Protected profile settings
- `/login` Login
- `/register` Registration

## API Notes

- API is served by Nuxt Nitro inside the same app process (no separate backend process needed).
- Example endpoints:
	- `/api/auth/login`
	- `/api/auth/me`
	- `/api/auth/users` (admin)
	- `/api/guide-articles`

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

Expose on network (optional):

```bash
npm run dev -- --host
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

Run production server directly:

```bash
node .output/server/index.mjs
```

## Tech Stack

- Nuxt 4
- Vue 3
- TypeScript
- Tailwind CSS
- better-sqlite3
- markdown-it
- markdown-it-anchor
- pdf-lib
- pdfjs-dist
