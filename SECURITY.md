# Security

## Credentials and repository hygiene

Keep service-role keys, OAuth secrets, deployment tokens, private keys and database dumps outside Git. `.env.example` contains empty values only. Configure actual secrets locally in ignored `.env` files or in Vercel environment settings. Never put server credentials in `NUXT_PUBLIC_*`, client code, issue descriptions, screenshots or build artifacts.

The ignore rules cover local environment files, credential/certificate formats, deployment account state, database dumps, generated documents, caches and local review captures. Ignore rules do not remove files already committed or prevent someone using `git add --force`.

Run `npm run security:secrets` before publication and `npm run security:bundle` after a production build. The first checks the working tree, index and reachable history; the second also checks published static assets and the server dependency manifest. Findings contain paths and rule names, not matched secret values. These checks are heuristic. Binary assets, encoded secrets and unrecognized credential formats require manual review.

If a real credential was committed, revoke/rotate it at its provider immediately, update deployment configuration, then assess history cleanup and cached copies. Deleting a file or force-pushing a branch does not revoke a credential. Coordinate any history rewrite with collaborators and preserve work before moving branch pointers.

## Application safeguards

- Supabase service access stays under `server/`; browser tools do not receive the service key.
- Custom app roles and sessions are checked in API handlers. Public registration always creates a viewer.
- Apply both SQL migrations in `supabase/migrations/` before deploying this release. They enable RLS/revoke public grants and install the shared production authentication limiter. The SQL tests exercise denied anonymous/authenticated access and allowed service-role access in an isolated PostgreSQL-compatible engine; this does not confirm the live project's settings.
- Production authentication uses an atomic database budget across instances and fails closed if its limiter is unavailable. Vercel's overwritten IP header is trusted only when running on Vercel. Use an explicitly configured trust list elsewhere.
- Passwords use salted asynchronous scrypt. Session cookies are HttpOnly, SameSite=Lax and Secure in production.
- OAuth return paths are constrained to the same origin, including backslash/control-character cases.
- Authentication bodies are bounded in size and read duration; database errors returned to clients use generic messages.
- Production responses set anti-sniffing, same-origin framing, referrer and permissions headers. The CSP restricts framing, objects and base URLs; it is not a nonce-based script policy. API responses and profile pages are marked `no-store`.
- DevTools and production source maps are disabled. Local PDF/image processing uses bounded workers and explicit cancellation.

## Dependency monitoring

The release checks fail on high/critical production npm advisories. GitHub Actions has read-only repository permissions, uses pinned action revisions and does not receive production secrets. Dependabot checks npm, both Cargo crates and Actions weekly. Regenerate committed WASM when Rust dependencies or source change; reviewing source alone does not verify a binary's provenance.

As of 2026-10-19, the production npm audit reports zero advisories. The full development audit still reports these two unpatched upstream issues, with additional parent packages inheriting their audit status:

| Dependency | Context | Advisory |
| --- | --- | --- |
| `braces` 3.0.3 | Build/watch glob processing in the Nuxt/Tailwind toolchain; do not process untrusted glob configuration | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) |
| `node-forge` 1.4.0 | Development server certificate tooling through `listhen`; the app does not use it to verify uploaded signatures | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) |

These packages must remain absent from the generated server dependency manifest. This is a scoped runtime check, not a claim that build tooling has no risks. Build only trusted source/configuration, keep CI isolated from production secrets and recheck the complete audit when upstream publishes fixes.

## Reporting an issue

Use GitHub's private vulnerability reporting for this repository if enabled, or contact the maintainer privately. Send reproduction steps and affected versions without live credentials, personal documents or session cookies. Do not post an exploitable vulnerability or secret in a public issue.
