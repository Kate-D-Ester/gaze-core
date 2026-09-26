# Eye Tracking V2 Implementation Plan

**Goal:** Deliver both tracker formats and a visual pipeline under `/v2`.
**Architecture:** Pure tested math modules, a worker for per-frame detection, React capture/session hooks and a compact visual workspace. Existing tracker code is reused for format 1.
**Stack:** Bun, TypeScript, React, OpenCV.js, Vite.
**Spec:** ../specs/2026-09-26-eye-tracking-v2-design.md

## Constraints
Preserve existing APIs; all added files live in this Desktop checkout; local-only processing; invalid data returns no gaze; source/method/ROI changes reset dependent state; semiaxes/radians internally; +x right/+y down/+z away camera.

## Review focus
Source startup/cancellation and camera-track disposal; coordinate transforms under crop/resize; blink or missing frames; degenerate model/calibration inputs; worker errors and asynchronous stale results.

## Tasks
- [x] Math and model: add `frontend/apps/web/src/features/eye-tracking/{types,geometry,eye-model,calibration}.ts` with Bun tests; prove known geometry, rotated minor-axis lines, rank rejection, robust intersections and held-out calibration.
- [x] Detection: add OpenCV loader and detector, with tests of real synthetic grayscale images and no-eye cases. Preserve source license and record changes from the reference.
- [x] Runtime: worker protocol and processing, legacy adapter, camera/video/sample lifecycle, immutable frame identity and dependent-state invalidation.
- [x] UI: V2 page, step controls, canvas overlays, three threshold previews, sphere view, nine-point calibration and validation. Link from existing dashboard/test. Add public local-only route without weakening authenticated routes.
- [x] Verify: full suite, typecheck, lint, build; browser walkthrough desktop/mobile with sample and error cases; fresh review; run commands and limitations in documentation.

## Evidence / decisions
- Reference inspected: creator's full transcript and MIT Python source. Video ends at 5:47 and explicitly defers calibration. Screen calibration is an addition.
- Native worktree tool cannot honor the required Desktop destination; git worktree created `codex/eye-tracking-v2` there.
- Implementation proceeds within Kate's explicit request to complete the upgrade; no deployment or external publication.

## Completion evidence
- 23 tests pass with 100 assertions, including real OpenCV image processing and React source-lifecycle regression coverage.
- Frontend typecheck, production build, scoped V2 ESLint and whitespace checks pass. Existing unrelated full-repository lint errors are documented in the usage guide.
- Independent review findings on pending source startup, source dimensions and expired eye-model support were reproduced with failing tests and fixed.
- Production browser walkthrough completed both formats through calibration; Tracker 2 also completed five-point validation and gaze-view keyboard exit. Desktop and 390 px mobile layouts were inspected. Resize recovery returns to calibration; model parameter edits preserve access to the model step.
- Camera hardware accuracy was not measured. Synthetic results are labeled throughout.
- See ../../eye-tracking-v2.md for commands, equations, reference differences and model assumptions.
