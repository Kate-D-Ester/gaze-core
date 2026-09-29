# Frontend-Only Eye Tracker Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/trial` the only eye-tracking experience, run tracking entirely in the browser, retain auth/API-key services, and simplify the frontend structure.

**Architecture:** The V2 tracker will acquire USB and network sources directly in the browser and send frames only to its local worker. Remove legacy tracker routes, widgets, and backend tracking services while keeping Better Auth, API keys, health, and auth documentation. Break the active V2 view, preview, source handling, and named types into focused colocated modules; expose one “Try it out” link to `/trial` and redirect `/v2` there for compatibility.

**Tech Stack:** React 19, TypeScript, Vite, Bun, Elysia, Better Auth, Drizzle, Bun test.

**Spec:** `docs/superpowers/specs/2026-09-29-frontend-only-eye-tracker-cleanup-design.md`

## Global Constraints

- Keep `/trial` as the only eye-tracking experience; redirect `/v2` to `/trial` and retain auth and API-key setup and storage.
- Do not send frames, pupil data, calibration data, or gaze results to the backend.
- Read network streams directly in browser APIs; show an actionable error when CORS or media support blocks a stream.
- Do not change the existing V2 eye-detection algorithms, Better Auth behavior, API-key behavior, or auth schema.
- Do not apply migrations, change local environment files, or include secrets or generated modules.
- Put named frontend types in colocated sibling files ending in `.types.ts`.
- Remove nested ternaries and keep edited code readable, with one responsibility per module.
- Preserve the uncommitted OAuth-origin fix in `backend/src/lib/auth.ts`, `backend/src/lib/middleware.ts`, `backend/src/lib/frontend-origins.ts`, and `backend/src/lib/frontend-origins.test.ts`.

## Review Focus

- A cross-origin MJPEG stream without CORS headers must show an actionable browser-access error and never fall back to a server relay; cover in Task 1.
- A network video that cannot play or expose frames to canvas must produce a useful error and release its video/abort resources; cover in Task 1.
- Navigating directly to `/trial` must mount the tracker, `/v2` must redirect there, and removed legacy routes must not mount tracking UI; cover in Task 2.
- Authenticated dashboard navigation must still reach the public tracker through “Try it out”; cover in Task 2.
- Backend health and auth routes must remain registered while old gaze, camera relay, and user-profile routes are absent; cover in Task 3.

---

### Task 1: Make network source capture browser-only

**Files:**
- Create: `frontend/apps/web/src/features/eye-tracking/network-source.ts`
- Create: `frontend/apps/web/src/features/eye-tracking/network-source.types.ts`
- Modify: `frontend/apps/web/src/features/eye-tracking/use-tracker.ts`
- Modify: `frontend/apps/web/vite.config.ts`
- Test: `frontend/tests/eye-tracking/network-source.test.ts`
- Test: `frontend/tests/eye-tracking/lifecycle.test.tsx`

**Interfaces:**
- `openNetworkSource(input: string, signal: AbortSignal): Promise<NetworkSource>` validates an HTTP(S) URL and returns either a browser video element or an MJPEG frame reader. It throws user-readable errors for CORS, unsupported media, invalid MJPEG, and empty streams.
- `NetworkSource` is a discriminated union in `network-source.types.ts`; its MJPEG branch exposes an async frame iterator and its video branch exposes a ready `HTMLVideoElement`.
- `useTracker.startNetworkStream(input: string)` remains the UI-facing start method and owns cancellation, activation, and error state.

- [x] **Step 1: Add failing network-source tests** for direct URL fetch, valid MJPEG boundary/frame parsing, HTTP errors, CORS rejection, unsupported content, and abort cleanup. Assert requests target the supplied camera URL and never a `/api/camera/mjpeg` path.
- [x] **Step 2: Run `cd frontend && bun test tests/eye-tracking/network-source.test.ts`** and confirm the new tests fail because the browser-only source module does not exist.
- [x] **Step 3: Implement `openNetworkSource`** using direct Fetch for MJPEG and a CORS-enabled `HTMLVideoElement` for browser-playable video. Keep frame parsing in the frontend and translate opaque browser CORS/media failures into actionable guidance.
- [x] **Step 4: Wire `useTracker` to `openNetworkSource`** and make sure stop/restart/abort paths release streams, video elements, bitmaps, and readers.
- [x] **Step 5: Remove `installCameraRelay` and its backend import from `vite.config.ts`.** Delete the backend relay fallback from the active tracker.
- [x] **Step 6: Run `cd frontend && bun test tests/eye-tracking/network-source.test.ts tests/eye-tracking/lifecycle.test.tsx`** and confirm direct-source, cancellation, and lifecycle tests pass.
- [x] **Step 7: Commit** as `refactor: read network camera streams in browser`.

### Task 2: Keep one public tracker route and add “Try it out” navigation

**Files:**
- Modify: `frontend/apps/web/src/App.tsx`
- Modify: `frontend/apps/web/src/components/dashboard/dashboard-header.tsx`
- Modify: `frontend/apps/web/src/pages/dashboard-page.tsx`
- Delete: `frontend/apps/web/src/pages/test-page.tsx`
- Delete: `frontend/apps/web/src/pages/v2-eye-tracker-page.tsx`
- Delete: `frontend/apps/web/src/lib/gaze-core-demo-config.ts`
- Delete: `frontend/apps/web/src/lib/gaze-core-demo-session.ts`
- Delete: `frontend/apps/web/src/lib/test-eye-tracker-storage.ts`
- Delete: `frontend/apps/web/src/types/test.ts`
- Delete: `frontend/packages/ui/src/components/gaze-core-widget/`
- Delete: `frontend/packages/ui/src/hooks/use-gaze-core-setup/`
- Delete: `frontend/packages/ui/src/hooks/use-sparse-sampling-setup/`
- Delete: `frontend/packages/ui/src/lib/gaze-core-widget-backend/`
- Delete: `frontend/packages/ui/src/lib/gaze-core-widget-fullscreen.ts`
- Delete: `frontend/packages/ui/src/lib/gaze-core-widget-storage.ts`
- Delete: `frontend/packages/ui/src/lib/gaze-core-widget-types.ts`
- Delete: `frontend/packages/ui/src/lib/gaze-core-widget-utils.ts`
- Modify: `frontend/packages/ui/package.json`
- Test: `frontend/tests/eye-tracking/v2-shell.test.tsx`

**Interfaces:**
- `App` keeps `/trial` public, redirects `/v2` to `/trial`, and removes `/test`, `/v1/eye-tracker`, and `/v2/eye-tracker`.
- Dashboard header and dashboard tracker navigation each point to `/trial` with the visible label “Try it out”; dashboard auth and API-key navigation remain.
- Shared UI continues to export common primitives and `lib/gaze-core` used by active V2 code; remove only exports whose implementations are deleted.

- [x] **Step 1: Extend shell/navigation tests** to assert `/trial` mounts the active tracker, `/v2` redirects there, obsolete routes do not render legacy UI, and both dashboard entry points use “Try it out” and link to `/trial`.
- [x] **Step 2: Run `cd frontend && bun test tests/eye-tracking/v2-shell.test.tsx`** and confirm the navigation assertions fail against the current routes and labels.
- [x] **Step 3: Update routes and dashboard links** while preserving auth route guards, account pages, and the public tracker experience.
- [x] **Step 4: Remove legacy test pages, session/storage modules, widget hooks/components, and their package exports** after confirming no active imports remain. Retain common UI primitives and `lib/gaze-core` dependencies.
- [x] **Step 5: Run `cd frontend && bun test tests/eye-tracking/v2-shell.test.tsx && bun run typecheck`** and confirm tests and typecheck pass.
- [x] **Step 6: Commit** as `refactor: remove legacy tracker routes and widgets`.

### Task 3: Reduce backend to auth, API keys, health, and auth docs

**Files:**
- Create: `backend/src/app.ts`
- Modify: `backend/src/index.ts`
- Modify: `backend/package.json`
- Modify: `backend/bun.lock`
- Modify: `backend/README.md`
- Delete: `backend/src/routes/gaze-test.ts`
- Delete: `backend/src/routes/gaze.ts`
- Delete: `backend/src/routes/camera-mjpeg.ts`
- Delete: `backend/src/routes/camera-mjpeg.test.ts`
- Delete: `backend/src/routes/user.ts`
- Delete: tracking-only modules and tests under `backend/src/lib/` and `backend/src/types/` after import search.
- Delete: `backend/src/db/models.ts`, `backend/src/db/utils.ts`, `backend/src/lib/schemas.ts`, and `backend/src/types/user.ts` only if no auth/API-key import remains.
- Test: `backend/src/app.test.ts`

**Interfaces:**
- Export an Elysia app factory from `backend/src/app.ts` so route registration is testable; `backend/src/index.ts` retains process startup and shutdown only.
- The app registers the root health endpoint, Better Auth routes, CORS, and auth OpenAPI documentation. It does not register gaze, test UUID, custom profile, MQTT, WebSocket, or camera-relay routes.
- Keep Better Auth’s `user`, `session`, `account`, `verification`, and `apikey` schema entries unchanged.

- [x] **Step 1: Add failing app-route tests** that call the app factory and assert `/health` succeeds, `/api/auth/get-session` remains available, and `/api/gaze/test/validate/uuid`, `/api/camera/mjpeg`, and `/api/users/me` return not found.
- [x] **Step 2: Run `cd backend && bun test src/app.test.ts`** and confirm the removed-route assertions fail against the current server registration.
- [x] **Step 3: Extract app construction to `backend/src/app.ts`** and remove all non-auth tracking/profile route registration, tracking OpenAPI docs, MQTT lifecycle hooks, and obsolete dependencies.
- [x] **Step 4: Delete tracking-only routes/services/types/tests and schema helpers** after checking the remaining imports. Preserve the OAuth-origin fix and auth-related validation/tests.
- [x] **Step 5: Update `backend/README.md`** to describe auth, API keys, health, and auth docs only.
- [x] **Step 6: Run `cd backend && bun test && bun run typecheck && bun run build`** and confirm retained auth code and the auth-only server compile.
- [x] **Step 7: Commit** as `refactor: remove eye tracking services from backend`.

### Task 4: Split V2 page and preview into focused components

**Files:**
- Modify: `frontend/apps/web/src/pages/v2-page.tsx`
- Create: `frontend/apps/web/src/pages/v2-page.types.ts`
- Create: `frontend/apps/web/src/features/eye-tracking/components/v2-step-navigation.tsx`
- Create: `frontend/apps/web/src/features/eye-tracking/components/v2-step-panel.tsx`
- Create: `frontend/apps/web/src/features/eye-tracking/components/v2-step-panel.types.ts`
- Rename: `frontend/apps/web/src/features/eye-tracking/preview.tsx` to `components/eye-preview.tsx`
- Create: `frontend/apps/web/src/features/eye-tracking/components/pipeline-previews.tsx`
- Create: `frontend/apps/web/src/features/eye-tracking/components/sphere-preview.tsx`
- Create: matching `*.types.ts` files for named preview component props and gesture types.
- Modify: `frontend/tests/eye-tracking/v2-shell.test.tsx`
- Modify: `frontend/tests/eye-tracking/roi-preview.test.tsx`
- Modify: `frontend/tests/eye-tracking/preview-mask-policy.test.ts`
- Create: `frontend/tests/eye-tracking/v2-components.test.tsx`

**Interfaces:**
- `V2Page` remains the route component and owns tracker/calibration state and step transitions.
- `V2StepNavigation` receives `steps`, `activeStep`, `completedSteps`, and `onSelectStep`; `V2StepPanel` receives the active step and its typed controls.
- `EyePreview`, `PipelinePreviews`, and `SpherePreview` retain their current visible behavior and receive explicit typed props from their colocated `.types.ts` files.

- [x] **Step 1: Add component-level shell assertions** for active step navigation, preview toolbar/ROI editing, pipeline previews, and eye-sphere metrics before moving markup.
- [x] **Step 2: Run `cd frontend && bun test tests/eye-tracking/v2-shell.test.tsx tests/eye-tracking/roi-preview.test.tsx tests/eye-tracking/preview-mask-policy.test.ts tests/eye-tracking/v2-components.test.tsx`** and confirm any new assertions fail before extraction.
- [x] **Step 3: Extract step navigation and active-step panel** while preserving current state transitions, buttons, labels, keyboard behavior, and layout classes.
- [x] **Step 4: Split EyePreview, pipeline masks, and sphere drawing** into the listed single-purpose components; keep ROI geometry and drawing algorithms unchanged.
- [x] **Step 5: Move named types into colocated `.types.ts` modules** and update imports.
- [x] **Step 6: Run the four focused tests and `cd frontend && bun run typecheck`**; confirm UI behavior and component types pass.
- [x] **Step 7: Commit** as `refactor: split v2 tracker view components`.

### Task 5: Modularize tracker lifecycle and enforce frontend type/readability rules

**Files:**
- Modify: `frontend/apps/web/src/features/eye-tracking/use-tracker.ts`
- Create: `frontend/apps/web/src/features/eye-tracking/use-tracker.types.ts`
- Create: `frontend/apps/web/src/features/eye-tracking/use-tracker-worker.ts`
- Create: `frontend/apps/web/src/features/eye-tracking/use-tracker-worker.types.ts`
- Create: `frontend/apps/web/src/features/eye-tracking/video-source.ts`
- Create: `frontend/apps/web/src/features/eye-tracking/video-source.types.ts`
- Rename: `frontend/apps/web/src/features/eye-tracking/types.ts` to `eye-tracking.types.ts`
- Rename: `frontend/apps/web/src/types/auth.ts` to `frontend/apps/web/src/lib/auth.types.ts`
- Rename: `frontend/packages/ui/src/lib/gaze-core/types.ts` to `gaze-core.types.ts`
- Create: colocated `.types.ts` siblings for named types currently declared in `detection.ts`, `roi.ts`, `eye-model.ts`, `tracker.worker.ts`, `opencv.ts`, `backend-base-url.ts`, `auth-error.ts`, `api-key-client.ts`, `use-auth-actions.ts`, `use-api-key-actions.ts`, `auth-page.tsx`, `verify-email-page.tsx`, `dashboard-page.tsx`, `dashboard-header.tsx`, `api-keys-panel.tsx`, and `theme-provider.tsx`.
- Create: colocated `.types.ts` siblings for inline props, worker/media callbacks, geometry results, and shared UI runtime shapes; move the button variant helper to `button-variants.ts` so the button module exports only its component.
- Modify: `frontend/apps/web/eslint.config.js` and `frontend/packages/ui/eslint.config.js` to enable `no-nested-ternary`.
- Test: `frontend/tests/eye-tracking/lifecycle.test.tsx`
- Test: `frontend/tests/eye-tracking/engine.test.ts`

**Interfaces:**
- `TrackerController` and the mutable `TrackerRuntime` contract live in `use-tracker.types.ts`; `useTracker(): TrackerController` owns UI-facing source actions and React state.
- `useTrackerWorker(runtime, canvasRef, callbacks): void` owns worker setup, frame scheduling, and cleanup; worker event messages still update the same controller state.
- `video-source.ts` owns media readiness and camera/video error translation; `network-source.ts` from Task 1 owns network URL and MJPEG setup.
- Shared active model types live in `eye-tracking.types.ts` and `gaze-core.types.ts`; module-specific named types live in same-directory `<module>.types.ts` files.

- [x] **Step 1: Add/extend lifecycle tests** for worker cleanup on unmount, source switching during pending permission, stale worker generations, and readable camera/media errors.
- [x] **Step 2: Run `cd frontend && bun test tests/eye-tracking/lifecycle.test.tsx tests/eye-tracking/engine.test.ts`** and confirm new edge-case assertions fail before extraction.
- [x] **Step 3: Move worker creation, message handling, and frame scheduling into `use-tracker-worker.ts`** using the explicit runtime and callback types; keep the worker protocol and detection outputs unchanged.
- [x] **Step 4: Move video readiness and camera error mapping to `video-source.ts`** and make `useTracker` coordinate source state and public actions.
- [x] **Step 5: Move named type/interface declarations to mirrored `.types.ts` modules** throughout active frontend source, including shared UI code. Keep type-only files free of runtime code.
- [x] **Step 6: Replace nested ternaries with named conditions or `if` statements** and enable the ESLint `no-nested-ternary` rule so future nested expressions fail lint.
- [x] **Step 7: Run `cd frontend && bun test tests/eye-tracking/lifecycle.test.tsx tests/eye-tracking/engine.test.ts && bun run typecheck && bun run lint`** and confirm the worker lifecycle, types, and lint rules pass.
- [x] **Step 8: Commit** as `refactor: modularize tracker lifecycle and types`.

### Task 6: Update active documentation and run full verification

**Files:**
- Modify: `README.md`
- Modify: `docs/eye-tracking-v2.md`
- Modify or retire: `docs/eye-tracker-v2-process.md`

**Interfaces:**
- Setup docs describe `/trial` as browser-only, list the retained auth/API-key backend, and explain that network sources require browser CORS permission.
- Historical research and plans remain available as history; active setup docs contain no `/test`, `/v1/eye-tracker`, `/v2/eye-tracker`, gaze WebSocket, MQTT, or relay setup instructions.

- [x] **Step 1: Update active docs** with the final route, source constraints, and server scope; remove stale tracking-backend instructions without rewriting historical plan files.
- [x] **Step 2: Run all frontend checks:** `cd frontend && bun test && bun run typecheck && bun run lint && bun run build`.
- [x] **Step 3: Run all backend checks:** `cd backend && bun test && bun run typecheck && bun run build`.
- [x] **Step 4: Search active source and docs** for obsolete routes, gaze WebSockets, MQTT, relay imports, backend URL access from tracker modules, and nested ternaries; confirm only auth/API-key/backend references remain.
- [x] **Step 5: Review the diff** for secrets, generated output, schema edits, accidental algorithm changes, and unintended OAuth changes; commit docs as `docs: describe browser-only eye tracking`.
