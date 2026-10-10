# Remote Baseline Recovery Implementation Plan

**Superseded:** This plan misinterpreted the user’s benchmark comparison as a rollback request. The user explicitly rejected that direction. See [forward stability](2026-10-09-remote-forward-stability.md); do not execute this recovery plan.

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Do not create branches, worktrees, commits or pushes.

**Goal:** Recover the accepted remote tracking defaults without discarding unrelated uncommitted changes or claiming unmeasured physical accuracy.

**Architecture:** Route remote calibration through the existing full-grid collector and committed feature regression. Keep experimental estimators available in their standalone modules, outside the default route. Restore the simple display filter with bounded source-age handling for low frame rates and brief blinks.

**Tech Stack:** TypeScript, React, Next.js, Bun tests.

**Spec:** The user's current request: compare against origin/v3 (48e2263), correct degraded stability, preserve current-branch changes, and do not require a new wearer calibration export for diagnosis.

## Global Constraints

- No commits, pushes, branches or worktrees.
- Preserve auth, pupil extraction, camera input parity and unrelated UI fixes.
- Keep named types in mirror .types.ts files; no nested ternaries.
- Do not hide finite estimates solely because they leave the calibration pose or screen.
- Do not claim wearer accuracy from synthetic fixtures or the older export.

## Review Focus

- Loaded experimental profiles must remain stored without silently driving the baseline route.
- Canceled or failed recalibration must keep the previous model, offset and alignment.
- Optional head calibration must label the whole screen under changed poses; one center hold is insufficient.
- Low frame rates and blinks must not repeatedly restart the display filter or revive stale readings.
- Validation and full-screen target positions must retain their existing independent measurements.

## Execution Rulings

- Restore the committed two-face landmark configuration as well. The single-face trial changes MediaPipe's internal temporal processing and the ability to reject multiple people; its partial feature probe did not establish improved live gaze. Keep crop parity, backend checks and bounded blink history, whose regression tests exercise their narrower behavior.
- Retain source-version checks when restoring feature fitting. Feature coefficients still depend on the neural input even though the default no longer uses the two-coordinate fitter.

### Task 1: Recover calibration routing and profile loading

**Files:** remote-eye-tracking-page.tsx/.types.ts; tracking-calibration/use-calibration-profiles.ts/.types.ts; a small remote calibration-policy module and tests; remote-eye-tracking/flow.test.tsx; tracking-calibration hook tests.

**Interfaces:** The route uses fitRemoteCalibration(mode, samples), RemoteCalibrationOverlay and a profile load eligibility callback. Full recalibration is transactional; successful replacement resets old adjustments, cancellation or failure preserves them.

- [x] Write and run failing tests for default feature calibration, full-grid head samples and experimental-profile exclusion.
- [x] Restore default routing, preserve existing collection recovery, and add profile eligibility before selection or callbacks.
- [x] Run focused flow and profile tests, including cancellation, failure and successful replacement.

### Task 2: Recover simple remote display smoothing

**Files:** gaze-bubble/gaze-bubble.ts/.types.ts; screens/remote-eye-tracking-page.tsx; gaze-bubble tests.

**Interfaces:** remote-simple uses the existing exponential display filter with no fixation lock, a maximum source age of 1000 ms and filter continuity through brief missing readings. remote-adaptive remains an explicit experimental option.

- [x] Write and run failing tests for simple-filter output, sparse observations and blink expiry.
- [x] Use remote-simple on the default remote route.
- [x] Verify raw coordinates remain unchanged, off-screen output remains explicit and stale samples stay hidden.

### Task 3: Verify and document practical limits

- [x] Run the full Bun suite, TypeScript checks, lint and production build.
- [x] Review the default path for experimental imports, profile bypasses and regressions.
- [x] Record the restoration and the limitations of old-export/synthetic evidence in the existing research documentation.
- [x] Report the precise changes and checks without asserting measured head-compensation accuracy.
