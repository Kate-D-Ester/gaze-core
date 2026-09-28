# Frontend-Only Eye Tracker Cleanup Design

## Goal

Make `/v2` the single eye-tracking experience and keep all camera-frame processing in the browser. Remove the legacy test widgets and tracking backend while preserving Better Auth, API-key management, and their database storage. Restructure the active V2 frontend so each module has a clear responsibility and is straightforward to read.

## Current State

- `/v2` renders `V2Page`, whose processing runs in the frontend worker. USB camera capture and tracking are local, but network MJPEG input currently depends on a relay in both `use-tracker.ts` and the Vite server configuration.
- `/test` redirects to `/v1/eye-tracker`; that page and `/v2/eye-tracker` use legacy shared widgets, session issuance, gaze WebSockets, or the backend camera relay.
- The backend contains Better Auth and API-key configuration alongside test UUID, gaze token, gaze WebSocket, MQTT, user-profile, and MJPEG relay routes.
- The auth database schema currently contains Better Auth tables plus the API-key table. No separate eye-tracking data table is present.
- The old widgets contain very large `index.ts` hooks. The active V2 implementation is already separated into feature files, but its page, tracking hook, and preview renderer carry multiple responsibilities and should be split at clear UI/source boundaries.

## Approaches Considered

1. Keep the camera relay while removing the gaze WebSocket services. This preserves broad network-camera compatibility, but eye tracking would still depend on backend code and conflicts with the requested boundary.
2. Remove tracking backend services and read USB and network sources directly in the browser. This is the selected approach. Network streams must be browser-playable and permit CORS; a stream that does not meet those browser rules cannot be processed client-side.
3. Remove the backend entirely. This removes the unwanted services, but also breaks the auth and API-key setup the user explicitly wants retained.

## Route and Product Scope

- Keep `/v2` as the only eye-tracking route. Remove the `/test`, `/v1/eye-tracker`, and `/v2/eye-tracker` route entries and their legacy page components.
- Change dashboard tracker navigation to a single action for `/v2`. Keep dashboard authentication and API-key management.
- Preserve the active V2 source choices. USB capture stays on `getUserMedia`; network video and MJPEG are read directly by browser APIs. Surface a clear error when browser CORS or media support prevents reading a stream.
- Treat the user's phrase “normal eye tracking websocket” as the existing `/v2` website experience; no eye-tracking WebSocket will remain.

## Frontend Boundary and Structure

- Keep the V2 OpenCV engine, worker, pupil detection, calibration, model fitting, preview, and ROI code in the frontend. Do not send camera frames, pupil data, calibration data, or gaze results to the backend.
- Remove the Vite development/preview MJPEG relay and its import of backend code. Remove the active tracker hook's backend URL dependency.
- Remove legacy widget, token, demo-session, and test-storage modules that are no longer used. Preserve shared UI primitives and the eye-detection code imported by the active V2 tracker.
- Split the V2 page, tracking hook, and preview renderer into focused modules for page composition, source lifecycle, and individual preview views. Keep existing algorithm behavior unchanged while moving code.
- Move named frontend types out of implementation files into colocated sibling files ending in `.types.ts`. Shared eye-tracking and gaze-core model types remain in clearly named type-only modules with the same suffix.
- Remove nested ternary expressions. Replace compressed branches and long compound expressions with named conditions, helpers, or ordinary `if` blocks. Keep meaningful constants named; this rule targets hard-to-read code, not every literal string.
- Keep auth/API clients isolated from the eye-tracking feature. Auth may continue using `getBackendBaseUrl`; tracker modules must not import it or any backend/API client.

## Backend Boundary

- Keep the Elysia server, Better Auth routes/configuration, the API-key plugin/configuration, CORS, email verification, auth validation, health endpoint, and auth OpenAPI documentation.
- Keep the `user`, `session`, `account`, `verification`, and `apikey` schema entries. Do not apply database migrations or drop database data as part of this source cleanup.
- Remove custom user-profile routes that have no frontend consumer, as well as gaze/test UUID, token, WebSocket, session-store, fusion, MQTT, and camera relay routes and services.
- Remove their unused dependencies, types, test files, Swagger documentation, and configuration. Preserve the auth-origin loopback fix already present in the checkout.
- The backend remains available for auth and API-key management only. Eye tracking can run when the auth backend is unavailable.

## Documentation and Verification

- Update active README and eye-tracking documentation to describe `/v2` as browser-only and explain the CORS requirement for network sources.
- Keep historical research and implementation-plan documents as history; remove stale route references from active setup documentation.
- Remove tests that exist only for deleted widgets and backend tracking services. Keep tests for the active V2 algorithms, tracking lifecycle, auth, and API keys.
- Verify frontend unit tests, typecheck, lint, and production build. Verify backend tests, typecheck, and build. Search active source for removed routes, gaze WebSockets, MQTT, and camera-relay references. Confirm the V2 hook does not call auth/backend APIs, while auth and API-key flows remain wired.

## Non-Goals

- Do not change Better Auth behavior, API-key behavior, the retained schema, or existing V2 eye-detection algorithms.
- Do not promise support for cross-origin camera streams that the browser cannot read.
- Do not alter actual database contents or secrets in local environment files.
