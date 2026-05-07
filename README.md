# AdminTools - Real Estate Web Tools

Nuxt 4 application for real estate admin workflows, including template-based PDF generation, EJARI export, guide/article management, and document/image utilities.

## Features

- Form I / Agent-to-Agent PDF generation using template coordinate mapping.
- Listing NOC PDF filling using the listing NOC template.
- EJARI form workflow with template-based PDF export (preview + download).
- Profile settings for reusable company defaults:
  - Logo and stamp
  - Establishment and office details
  - ORN, DED License, and PO Box
- Real Estate Guide module:
  - Markdown editor with live preview
  - Cover image and inline markdown image support
  - Heading-based table of contents
  - Role-based create, edit, and delete permissions
- Utility modules:
  - PDF image extractor
  - Image resizer
  - E-signature creator
  - Watermark tool
  - Watermark remover
- Contact module for bug reports and feature requests via WhatsApp.

## Authentication and Roles

- Cookie-based session authentication.
- Database-backed users and roles.
- Role levels:
  - admin: user and role management, full guide access
  - editor: create, edit, and delete guide articles
  - viewer: read-only guide access

## Data and Storage

- Supabase Postgres stores users, sessions, roles, profiles, and guide articles.
- Apply the database schema from supabase/schema.sql before first run.
- Session cookies use HttpOnly and SameSite=Lax.
- Profile and guide images are stored as data URLs.

## Templates and Assets

- public/agent-to-agent.pdf
- public/noc_listing_form.pdf
- public/ejari-template.pdf

## Routes

- /: Home dashboard
- /agent-to-agent-form: Form I / Agent-to-Agent form
- /listing-noc-form: Listing NOC form
- /ejari-form: EJARI form and PDF export
- /real-estate-guide: Guide/article module
- /pdf-image-extractor: PDF image extraction tool
- /image-resize: Image resize tool
- /e-signature: E-signature tool
- /watermark: Watermark tool
- /watermark-remover: Watermark remover tool
- /contact: Contact and requests
- /profile-settings: Protected profile settings
- /login: Login
- /register: Register
- /pdf-template-filler: Legacy redirect to /listing-noc-form
- /wiki: Legacy redirect to /real-estate-guide

## API Overview

Nuxt Nitro serves API routes in the same application process.

Common endpoints:

- /api/auth/login
- /api/auth/me
- /api/auth/users (admin)
- /api/guide-articles

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a .env file with:

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
```

3. Run the SQL in supabase/schema.sql in your Supabase project.

4. Configure Google OAuth redirect URIs:

- Local: http://localhost:3000/api/auth/google/callback
- Production: https://your-domain.com/api/auth/google/callback

## Development and Build

Run dev server:

```bash
npm run dev
```

Run dev server on network:

```bash
npm run dev -- --host
```

Create production build:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

Generate static output (if needed):

```bash
npm run generate
```

## Tech Stack

- Nuxt 4
- Vue 3
- TypeScript
- Tailwind CSS
- Supabase
- pdf-lib
- pdfjs-dist
- markdown-it
- markdown-it-anchor
- jszip
