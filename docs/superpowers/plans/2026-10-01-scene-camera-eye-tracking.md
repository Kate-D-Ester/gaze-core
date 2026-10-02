# Scene-camera eye tracking implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add `/trial/scene-camera-eye-tracking` with two cameras, fingertip calibration, live scene gaze, local recording, coordinate logs, and heatmaps.

**Architecture:** Reuse v2's eye setup and locked gaze model. A separate scene-camera controller supplies timestamped native-aspect frames to a hand worker and a raw recording canvas. Pure calibration/measurement modules own quality gates; React components own the workflow and feedback.

**Tech stack:** React 19, TypeScript, Bun, Vite, existing OpenCV pupil worker, pinned MediaPipe Tasks Vision, MediaRecorder, Canvas.

**Spec:** `docs/superpowers/specs/2026-10-01-scene-camera-eye-tracking-design.md` (approved 2026-10-01).

## Global constraints

- Work only in `/Users/kate/Desktop/Codex-projects/worktree-v4`, branch `codex/worktree-v4`, based on `v2` at `6ba620f`.
- Preserve v2 steps 1–3 and both manual/automatic tracker formats; retain `/trial` and its public behavior.
- Process cameras and store recordings locally without a backend.
- Accept USB and browser-readable HTTP(S) video/MJPEG, including IP/mDNS URLs, using existing network parsing and diagnostics.
- Calibrate physical fingertip fixation; window size must not define coordinates or invalidate calibration.
- Use bounded timestamp histories, worker backpressure, explicit cancellation, and cleanup.
- Report actual scene-pixel/normalized error; do not claim all-depth calibration or object-registered heatmaps.

## Review focus

- Concurrent camera requests and device disconnection must dispose obsolete streams without stopping the other camera (Task 2 lifecycle tests).
- A duplicate or stale pupil frame must not count as a new calibration pair or a valid current gaze (Task 1 pairing tests).
- Looking at a moving fingertip or losing hand/pupil evidence must reset the incomplete hold (Task 1 collector tests).
- Network stalls and worker late replies must suppress overlays and preserve completed recordings (Tasks 2–4 lifecycle tests).
- Browser codec/canvas limitations must leave useful coordinate exports and a readable recording error (Task 4 recording tests).

## File responsibilities

Under `frontend/apps/web/src/features/scene-eye-tracking/`:

- `scene.types.ts`: timestamped scene/hand/pair/calibration/session contracts.
- `calibration.ts`: nearest-time pairing, unique-frame quality gates, stable holds, coverage, fitting, validation.
- `use-scene-camera.ts`: independent USB/video/MJPEG lifecycle, raw canvas, fresh frame notifications.
- `hand.worker.ts` and `use-hand-tracker.ts`: pinned detector, one in-flight frame, generation handling, load/retry, transferred-image ownership.
- `session.ts`, `recording.ts`, `heatmap.ts`: bounded logs, CSV/JSON exports, codec selection and recorder lifecycle, dwell density.
- `scene-preview.tsx`, `scene-controls.tsx`: scene overlays and scene/calibration/live controls.
- `use-scene-session.ts`: orchestrate pairing, calibration, validation, gaze, and recording without copying v2's pupil controller.

Modified files:

- `pages/v2-page.tsx`: reuse existing eye setup by adding an explicit scene mode and handing steps 4 onward to focused scene components.
- `App.tsx`: public route selects scene mode before the account app.
- `pages/v2.css` and a scoped `scene.css`: familiar responsive two-camera workspace.
- `apps/web/package.json`, `frontend/bun.lock`, and build asset preparation: pinned MediaPipe and local WASM/model distribution.
- `README.md`, `docs/scene-camera-eye-tracking.md`: route and usage/research guide.

Tests under `frontend/tests/scene-eye-tracking/`; a route regression test extends the existing shell suite.

### Task 1: Calibration and timestamped measurement contracts

**Interfaces:** `EyeObservation = { id, timestamp, feature, confidence, valid }`; `SceneObservation = { id, timestamp, width, height }`; `HandObservation = { scene, landmarks, worldLandmarks, handedness }`. `pairObservation(eyes, hand, delayMs, now): CalibrationPair | null`; `createCollector(mode): Collector`; `collectPair(collector, pair): CollectionResult`; `fitSceneCalibration(holds): SceneCalibration | null`; `mapSceneGaze(calibration, feature): Point | null`; `validateSceneCalibration(calibration, holds): ValidationResult | null`.

- [x] Write `calibration.test.ts`: fresh nearest-time matching accepts a pair within 100 ms after delay adjustment; rejects eye/scene data older than 250 ms, nonfinite values, confidence below 0.7, untracked gaze, ambiguous hands, and duplicate frame IDs.
- [x] Run `bun test tests/scene-eye-tracking/calibration.test.ts`; confirm missing-module failure.
- [x] Implement pairing and collector. Use nine 3×3 scene regions, a 300 ms settling period, at least 20 unique pairs over at least 800 ms per hold, target drift <=0.025 normalized units, and a bounded 3-second eye history. Reset incomplete holds on invalid evidence or excessive movement. Validation gathers five fresh holds. Save raw accepted pairs and robust hold aggregates.
- [x] Test that movement/blink/stale data reset a hold, revisiting completed regions does not inflate coverage, and all regions plus scene extent are required. Test collapsed/collinear/nonfinite feature distributions and spatially inadequate coverage fail.
- [x] Implement affine and second-order fits with centered/scaled QR; use whole-hold leave-one-out validation. Choose quadratic only when its RMS improves affine by at least 10%; reject RMS above 0.08 normalized scene units. Preserve unclamped coordinates and calibration coverage bounds. Test synthetic affine/quadratic recovery and noisy/degenerate rejection.
- [x] Run Task 1 tests; commit `feat: add scene calibration quality gates`.

### Task 2: Independent scene capture and hand inference

**Interfaces:** `useSceneCamera(): SceneCameraController` exposes `source`, `busy`, `error`, `devices`, `rawCanvas`, `latest`, `startCamera(deviceId)`, `startNetworkStream(url)`, `stop()`, and a frame subscription. `useHandTracker(scene, enabled): HandTrackerController` exposes `status`, `error`, `latest`, `retry()`; results use Task 1 contracts.

- [x] Write `scene-camera.test.tsx` with fake devices/video/MJPEG: start two roles independently, ignore late permission responses, cancel pending requests, retain native dimensions, detect a stalled stream, handle resolution changes, and release all owned resources on unmount.
- [x] Run tests and confirm failure; implement scene controller using existing `openNetworkSource`/video utilities. Keep scene canvas independent of the pupil worker. Use generation IDs, abort signals, track-ended handlers, a fresh-frame timeout, and one retained MJPEG bitmap.
- [x] Pin MediaPipe Tasks Vision and distribute matching WASM plus model assets. Follow Google's module-worker sample and explicitly verify installed package worker-loader compatibility. Record source/version/license attribution for distributed assets. Configure VIDEO mode, two-hand detection for ambiguity checks, confidence thresholds 0.7, and CPU fallback if worker GPU initialization fails.
- [x] Write hand-controller tests for one in-flight frame, unique scene IDs, stale generation messages, load failure/retry, missing browser support, and bitmap closure. Run failing tests, implement worker/controller, and run passing tests.
- [x] Run Tasks 1–2 tests plus `bun run build`; commit `feat: add independent scene camera and hand worker`.

### Task 3: Public route and guided calibration/live scene flow

**Interfaces:** `V2Page({ sceneMode?: boolean })` keeps default behavior. `SceneWorkspace({ tracker, onInvalidateEyeSetup })` contains scene steps and Task 1/2 controllers. `ScenePreview({ scene, hand, gaze, trace, coverage, heatmap })` renders native-aspect unmirrored coordinates. `useSceneSession(tracker, scene, hands)` owns the current mapping, fresh validation, measurement records, and notices.

- [x] Add route tests for `/trial/scene-camera-eye-tracking`, public access, six setup stages, both formats, and preserved `/trial`. Run tests to establish failure.
- [x] Extend the existing v2 shell with an explicit scene-mode branch; share the existing first-three-step UI, corner controls, lock readiness, and pupil pipeline. Add scene-specific step names/copy and scene workspace components; do not duplicate the full eye setup page.
- [x] Add source controls with known-device conflict checks and explicit delay adjustment; full-hand skeleton and highlighted landmark 8; nine-region progress and physical-fingertip guidance; start/cancel/retry calibration and five-hold independent validation; live gaze/trace with pupil/scene loss and extrapolation feedback.
- [x] Test calibration invalidation for eye settings/format/source, scene source/resolution, and delay changes; resizing leaves mapping valid. Test absent hands after calibration do not stop gaze and stale pupil/scene data do stop gaze. Stop recording before changes that invalidate a session.
- [x] Add scoped responsive styles and accessible labels/status. Run route/lifecycle tests and all prior tests; commit `feat: add fingertip calibrated scene gaze route`.

### Task 4: Recording, coordinate exports, and heatmaps

**Interfaces:** `createSceneRecording(canvas, options): RecordingController` with `start`, `stop(): Promise<RecordingResult>`, `dispose`; `appendMeasurement(session, measurement)` bounds logging; `exportSessionCsv(session): string`; `exportSessionJson(session): string`; `buildHeatmap(measurements, width, height): Heatmap`; downloads use supported MIME/extension and shared timing metadata.

- [x] Write `session.test.ts`, `recording.test.ts`, and `heatmap.test.ts`: invalid/out-of-frame gaze excluded from density, timestamps and null/loss reasons preserved in CSV/JSON, dwell time excludes dropout gaps, MIME selected from browser support, recorder errors/stop races finalize once, and cleanup preserves completed blobs.
- [x] Run tests and confirm failure; implement separate overlay-free raw scene capture (USB track where available; canvas re-encode for network/MJPEG), optional overlay-free eye canvas recording, and documented recording timing offsets. Bound sessions to 10 minutes/128 MiB, stop at limits, and preserve partial results on source failure. Validate actual recorder MIME before naming downloads.
- [x] Add record/stop, elapsed-time feedback, video download, CSV/JSON download, and heatmap PNG controls. Include calibration/settings/source/timestamp metadata and optional hand observations. Keep unannotated video separate from overlays. Provide a readable unsupported-recording state while retaining data exports.
- [x] Test source failure/change/unmount, recorder failure, object-URL cleanup, unsupported captureStream, and replacement of a completed session. Run all frontend tests and build; commit `feat: record scene gaze and export session artifacts`.

### Task 5: Verification and delivery

- [x] Add `docs/scene-camera-eye-tracking.md` with setup, physical-finger instructions, IP/mDNS examples, CORS/mixed-content guidance, delay adjustment, validation, local export formats, parallax, camera-image heatmaps, and hardware-validation checklist. Link research sources and document MediaPipe asset versions/licenses.
- [x] Run `bun test`, `bun run typecheck`, `bun run lint`, and `bun run build` from the worktree frontend. Investigate failures before claiming completion. Baseline: 148 tests pass and production build passes; existing OpenCV Node-module externalization warnings are present.
- [x] Inspect the real browser route at desktop/narrow widths; exercise loading/error/retry states and deterministic hand/pupil fixtures. Verify the built worker/model assets load from the production preview. Record unavailable hardware checks honestly.
- [x] Run an independent whole-branch review, address actionable findings, and rerun relevant checks after changes. Review timing, raw-video separation, validity gaps, resource cleanup, and preservation of `/trial` in particular.
- [x] Commit the completed change and report route, branch/worktree, test/build results, artifact formats, and remaining hardware accuracy checks. Keep worktree available for Kate; do not merge or publish without a request.
