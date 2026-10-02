# GazeCore frontend

A Bun workspace with a Next.js App Router application and a shared UI package.
Tracking runs in the browser. The separate backend provides authentication and API keys.

## Run locally

```sh
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:4001`. The development command also starts or reuses the
local network-camera transport on port 4022. No tracking inference runs in that
transport. USB cameras do not need it.

For mobile HTTPS, set both `GAZE_DEV_TLS_CERT` and `GAZE_DEV_TLS_KEY` to a trusted
local certificate/key before running `bun run dev`. Keep those files out of Git.
For a phone connecting through your LAN, set `GAZE_DEV_ALLOWED_ORIGINS` to the
exact comma-separated LAN hostnames/IPs you use. Loopback origins are included
by default; development origins are not opened to every website.

## Structure

- `apps/web/src/app`: Next routes, redirects, metadata, error page, public runtime configuration.
- `apps/web/src/screens`: screen composition and workflow state.
- `apps/web/src/features/eye-tracking`: shared near-eye camera, pupil worker, manual/automatic eye models, screen calibration and optional head compensation.
- `apps/web/src/features/remote-eye-tracking`: mobile/webcam/IR remote tracking, shared calibration, reusable remote presentation components.
- `apps/web/src/features/scene-eye-tracking`: outward camera, hand/marker calibration, local profiles and recordings.
- `apps/web/src/features/tracking-ui`: shared tracker branding and Tailwind utilities organized by purpose.
- `apps/web/src/features/account`: account screen composition and auth/session orchestration.
- `apps/web/src/hooks`, `src/lib`: auth/API clients and small shared helpers.
- `apps/web/scripts`: local camera transport, model preparation and synthetic browser fixtures.
- `packages/ui/src/components`: reusable UI primitives. This package contains no tracking runtime.
- `tests`: regression, geometry, lifecycle, persistence and route tests.

Types belong in matching `.types.ts` files. Type imports and ordinary primitive
annotations remain where they are used. ESLint prevents inline object type
schemas, declared types in implementation files, nested ternaries, comma-packed
variables and unbraced control flow. Tailwind imports, design tokens and source
registration live in `packages/ui/src/styles/globals.css`; there are no handwritten
component stylesheets. Runtime canvas/overlay geometry remains computed in code.

## Routes

- `/dashboard`: account and the three trial cards.
- `/trial/screen-eye-tracking`
- `/trial/remote-eye-tracking`
- `/trial/scene-camera-eye-tracking`
- `/auth`, `/verify-email`

Tracking routes load browser-only workspaces dynamically; camera and worker code
does not execute while Next renders on the server. Old `/v2`, `/trial`, and
`/trials` links redirect to screen tracking.

## Checks and production

```sh
bun test
bun run lint
bun run typecheck
bun run build
bun run --cwd apps/web start
bun audit
```

The pinned Next.js 16.3.8 build uses Webpack for the existing worker/module-loader
integration. `typecheck` generates Next route types first, including on a fresh
checkout. `build` prepares local MediaPipe assets and generates standalone output.
`start` serves port 4001. A production network-camera setup also needs the local
transport (`bun run --cwd apps/web camera-relay`).

The frontend Dockerfile builds the Next standalone server and runs it as an
unprivileged user. Set `GAZECORE_BACKEND_URL` in the running container to the
public auth-service base URL. `NEXT_PUBLIC_GAZECORE_BACKEND_URL` is a build-time fallback; the previous
`VITE_GAZECORE_BACKEND_URL` remains a supported runtime fallback during migration.
Runtime settings take precedence over the build-time fallback. Only the public URL is sent to the browser through
`/runtime-config.js`; private backend variables stay in the backend environment.
The previous Nginx SPA container has been removed.

Dependency overrides pin compatible security fixes in transitive tooling and
auth packages. Re-run both audits, tests and builds when changing them. See
[the v3 audit](../docs/v3-codebase-audit.md) for findings and validation limits.
