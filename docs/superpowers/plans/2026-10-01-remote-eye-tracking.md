# Remote Eye Tracking Implementation Plan

> Historical snapshot. Later implementation supersedes parts of this document,
> including full-face IR glint requirements and the original UI. Before integrating,
> read [the current V3 UI and merge handoff](../../remote-eye-tracking-v3-handoff.md).

> For agentic workers: apply test-driven development; native implementation with independent RGB/IR algorithm tasks and one final fresh review. User explicitly instructed us to start immediately; no approval handoff.

**Goal:** Three working remote camera flows with pose-aware calibration and local mobile processing.
**Architecture:** Shared camera/session and calibration contracts; camera-specific worker processors; responsive guided UI and independent validation.
**Tech Stack:** Bun, React/Vite/TypeScript, MediaPipe Tasks Vision, TensorFlow.js for local appearance inference, OpenCV.js where useful.
**Spec:** ../specs/2026-10-01-remote-eye-tracking-design.md

## Global Constraints

- All new files live inside the isolated Desktop/Codex-projects worktree.
- Existing /trial and /v2 behavior stays compatible; /trials aliases /trial.
- Each calibration record stores simultaneous head pose and feature, never collapse pose-varying targets into one input.
- No stale/closed-eye/unsupported-pose gaze, no anatomical vector accuracy claim.
- Models/assets local, explicit source/license provenance.

## Review Focus

- Camera permission resolves after mode change or unmount: release tracks and suppress late startup.
- Phone rotation/viewport resize invalidates screen calibration; same-frame ownership persists.
- Head motion differs by target: keep per-frame pose and heldout-target validation.
- Iris/face or IR reflection loss: fresh null sample, no last-point masquerading as live.
- Worker/model/network errors: stop or recover with visible retry, no silent landmark fallback advertised as CNN.

### Task 1: Calibration and session contract

Files: remote-eye-tracking/types.ts, calibration.ts, session.ts; tests/remote-eye-tracking/calibration.test.ts, session.test.ts.
Interfaces: RemoteObservation with features, pose and timestamp; CalibrationSample holds observation and target. `fitRemoteCalibration`, `predictRemoteGaze`, `evaluateRemoteValidation`.

- [x] Write independent varying-pose regression, unseen target, invalid/rank-deficient/support tests; run RED.
- [x] Implement standardized regularized regression, target-group CV, head-support envelope and fresh-frame acceptance.
- [x] Run meaningful numerical tests GREEN.

### Task 2: RGB and IR processors

Files: rgb-processor.ts/rgb-features.ts; ir-processor.ts/ir-features.ts; remote.worker.ts; model assets/notices.
Interfaces: `createRgbProcessor(mode)` / `createIrProcessor()` → RemoteProcessor, `process(ImageBitmap,timestamp,settings)` → RemoteObservation, dispose().

- [x] Write detector/feature rejection and mode-specific feature tests; run RED.
- [x] Implement distinct processors, local assets and worker ownership.
- [x] Run processor tests GREEN; validate asset loading in real browser.

### Task 3: Capture and guided responsive flow

Files: use-remote-tracker.ts, remote-calibration-overlay.tsx, preview.tsx, remote-eye-tracking-page.tsx/.css, App.tsx.
Interfaces: consumes observations, calibration and processor messages; owns media tracks, stop/start/capture lifecycles.

- [x] Write lifecycle stale permission/stop/unmount tests; run RED.
- [x] Implement three cards, camera/position/calibrate/validate/results, head coverage and recalibration, exports and routes.
- [x] Run lifecycle tests GREEN; render phone/desktop/IR layout and error recovery.

### Task 4: Verify and review

- [x] Run Bun suite/typecheck/lint/build; fix real failures.
- [x] Fresh whole-branch review, fix important findings with regression tests.
- [x] Document runtime, research references, weights restrictions and physical-validation limitations.
- [x] Commit final branch and open working preview.
