# Three-camera viewer Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement inline. The user explicitly requested immediate implementation without additional approval gates.

**Goal:** Provide three independent camera previews with local voice/typed commands, static selection, transforms, and manual PNG capture.

**Architecture:** Reuse the existing scene camera transport and transform UI. Add a camera-viewer feature with isolated command, selection, photo, speech, and presentation modules. Load it through the existing client-only trial routing pattern.

**Tech Stack:** Existing Bun, TypeScript, React, Next.js, Tailwind; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-03-three-camera-viewer-design.md`

## Global Constraints

- All work in `/Users/kate/Desktop/Codex-projects/gaze-three-camera-viewer`, branch `codex/three-camera-viewer` from `v3`.
- Types in matching `.types.ts` files; follow existing ESLint and Tailwind rules.
- No camera auto-start, backend frame/transcript uploads, credentials persistence, or remote speech fallback.
- Static visual selection only; no tracking, matching, hardware outputs, or firing commands.

## Review Focus

- Permission denial/disconnection must preserve the other camera feeds.
- Concurrent default-device connection attempts must not reuse a camera silently.
- Transform/source changes must invalidate old visual selection.
- Late speech startup after disposal must not start the microphone.
- Stale or failed PNG capture must report failure instead of downloading invalid data.

### Task 1: Independent camera configuration

**Files:** `camera-transform.types.ts`, `camera-transform.ts`, `scene-camera.types.ts`, `scene-camera.ts`, `use-scene-camera.ts`; existing camera tests.

**Interfaces:** `SceneCamera(options?: SceneCameraOptions)` with `transformRole`, `label`; `startCamera(deviceId: string, excluded?: string | readonly string[])`.

- [x] Write regression tests for independent orientation keys and duplicate USB exclusion; observe failures.
- [x] Add configurable transform key/label while preserving defaults; expose options through `useSceneCamera`.
- [x] Run camera tests and the existing suite.

### Task 2: Viewer commands, selection, capture, and local voice

**Files:** `features/camera-viewer/{commands,selection,photo,local-voice}.{ts,types.ts}`; `tests/camera-viewer/*.test.ts`.

**Interfaces:** `parseViewerCommand(text)` returns a whitelisted `ViewerCommand | null`; selection validation requires a matching live frame/source/generation; `captureCameraPhoto(camera, now)` returns `Promise<Blob>`; `LocalVoiceController` exposes subscription, start/install/stop/dispose, and a final-command handler.

- [x] Write tests for exact command matching, provenance/stale selection, failed photos, local-only voice and late-start cancellation; observe failures.
- [x] Implement the focused modules with visible failure paths.
- [x] Run new tests and the existing suite.

### Task 3: Three-feed workspace and integration

**Files:** `features/camera-viewer/{camera-panel,camera-preview,command-bar,viewer-workspace}.tsx` and matching types; client routing; dashboard link; user guide.

**Interfaces:** Three independently configured scene cameras; a connection guard prevents concurrent USB allocation. Command handler updates only active preview selection or captures a photo.

- [x] Test rendered controls, typed command dispatch, and disconnected/stale-feed selection behavior.
- [x] Implement responsive workspace and the public route; add dashboard discovery and usage documentation.
- [x] Run full frontend tests, lint, typecheck, and production build.
- [x] Inspect desktop/mobile route and interact with controls; review the complete diff.

## Completed verification

676 frontend tests passed. Lint, typecheck, production build, and dependency audit passed. Browser checks covered active-feed switching, disconnected selection rejection, independent transforms, network source controls, and desktop/mobile layout with no horizontal overflow. Three independent code-review findings were reproduced and fixed with regression tests. Physical cameras, microphone recognition accuracy, and actual download completion require hardware validation.
