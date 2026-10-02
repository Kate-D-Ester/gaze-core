# V3 backend audit

The backend remains an authentication/API service. It mounts Better Auth under `/api/auth`, including Google OAuth, verified email/password sessions and API-key management. Root, health and Swagger endpoints remain available. Browser tracking and the independent local `vision_assistant/` directory are outside this service.

## Cleanup

- Moved auth and middleware types from `src/types/` into matching `src/lib/auth.types.ts` and `src/lib/middleware.types.ts`; the OpenAPI schema annotation now lives in `src/app.types.ts`.
- Pinned every direct dependency. Initially pinned existing lock resolutions, then upgraded Better Auth and its API-key plugin together to 1.6.33 and Elysia to 1.4.29 for the confirmed advisories below. Added the test script and corrected the manifest module entry to the existing TypeScript entry point.
- Removed generated-comment boilerplate from `tsconfig.json` while preserving its active compiler options. Expanded shutdown callback bodies for readability.
- Removed the empty tracked root `packages/ui/src/lib/gaze-core.ts`. Repository searches found consumers of the real implementation under `frontend/packages/ui`, but no consumers of the root duplicate. The live frontend implementation remains present.
- Preserved middleware, database schema, auth handlers, email delivery, session settings and API-key behavior. Session derivation currently has no custom route consumer, but was retained as part of the auth plugin surface.

## Auth and isolation review

- Development origin handling retains `localhost` and `127.0.0.1` on port 4001, the existing 4013 fallback, and the configured frontend origin. Deployed origins do not gain local aliases. CORS remains credentialed and origin restricted.
- Explicit sign-in 404 and duplicate signup 409 responses expose whether an account exists. These existing product semantics were preserved; changing them requires a coordinated frontend/auth decision.
- Verification email logs include the recipient address. Deployment log access and retention should account for this personal information. No environment values or private media were printed or modified during this audit.
- Production cookies retain secure `SameSite=None` settings. OAuth, email verification, DNS MX checks and PostgreSQL writes require real integration validation.
- `vision_assistant/` exists locally; `git ls-files vision_assistant` returns no tracked files. It was not inspected internally or changed. The only tracked Python source found is `research/Orlosky3DEyeTracker.py`, also untouched.
- Pinning ensures repeatable direct versions; this audit does not assert that the dependency graph is free of current advisories. The container base image remains the existing `oven/bun:1.2-alpine` tag.

## Verification

Executed with Bun 1.3.14:

- `bun test` in backend: 5 passed, 0 failed, including session/health availability, missing legacy tracking routes and frontend-origin behavior.
- `bun run typecheck`: passed.
- `bun run build`: passed, 1127 modules bundled.
- `bun install --frozen-lockfile --lockfile-only --ignore-scripts`: passed, final lockfile.
- `git diff --check -- backend packages`: passed.

The unauthenticated session check passed without proving authenticated database sessions. Signup, email delivery, Google OAuth and database-dependent account/API-key operations were not exercised against live external services. No commits, pushes or worktrees were created.

## Evidence-backed dependency security updates

- Better Auth 1.5.5 met the configuration conditions in [GHSA-g38m-r43w-p2q7](https://github.com/better-auth/better-auth/security/advisories/GHSA-g38m-r43w-p2q7): password auth, Google OAuth and default implicit linking. Required email verification does not mitigate this pre-account hijacking issue. Upgraded core and API-key plugin together to stable 1.6.33 within the existing compatible 1.6 account schema line. The patch rejects implicit linking to a locally unverified email account; valid verified-account linking remains supported.
- Elysia 1.4.28 fell within [GHSA-9643-4qgh-g8mx](https://github.com/elysiajs/elysia/security/advisories/GHSA-9643-4qgh-g8mx), a multipart normalization CPU denial of service. Upgraded to the smallest fixed stable version, 1.4.29. No custom multipart endpoint is registered here; actual exposure through mounted handlers was not exploit-tested.
- The September 30 [Magic Link/OAuth state advisory](https://github.com/better-auth/better-auth/security/advisories/GHSA-965c-763c-88jm) includes these older version ranges, but requires the Magic Link plugin, which this service does not enable. Its configuration preconditions do not match this service. This focused review is not a complete dependency advisory scan or security guarantee.
- Backend does not set autoSignInAfterVerification. Installed Better Auth only issues a new verification session when that option is truthy. Frontend verification must use an existing auth cookie or prompt normal sign-in; it does not need to persist or replay a password.

After the dependency updates, the same five tests, typecheck and build passed again. Live OAuth, authenticated database sessions and email delivery remain unverified.

## Full registry audit follow-up

The complete backend audit initially reported nine findings beyond the focused configuration review. Final direct versions are Better Auth/API-key 1.6.33, Drizzle ORM 0.45.3, Drizzle Kit 0.31.11, Elysia 1.4.29 and Resend 6.32.0. Registry metadata verified these stable releases. Resend remains on major 6; its updated dependency graph removes the old Svix/UUID chain, avoiding a forced UUID major override.

Pinned overrides select defu 6.1.7, nanoid 5.1.16 and esbuild 0.25.12. They address [prototype pollution](https://github.com/advisories/GHSA-737v-mqg7-c878), [generator overflow](https://github.com/advisories/GHSA-xwg4-73v4-xw9w) and [development server exposure](https://github.com/advisories/GHSA-67mh-4wv8-2f99). The esbuild override applies to the older transitive ESM-loader dependency; this is development tooling and its CLI was smoke-checked without contacting or changing the database. ORM updates fix [identifier escaping](https://github.com/advisories/GHSA-gpj5-g38j-94v9). No schema migration or auth configuration was introduced.

Fresh final results: registry-backed bun audit exits 0 with No vulnerabilities found; five tests pass; TypeScript check and build pass; drizzle-kit --version reports 0.31.11 and ORM 0.45.3. Frozen lockfile validation passes. This reports the registry advisory state at verification time, not a guarantee against unknown vulnerabilities or deployment misconfiguration.
