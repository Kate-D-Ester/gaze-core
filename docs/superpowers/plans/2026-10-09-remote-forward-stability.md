# Remote tracking forward stability implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. Do not commit, push, create branches or worktrees.

**Goal:** Improve the newer remote tracking path, using origin/v3 as a benchmark rather than reverting to it.

**Architecture:** Restore the newer nine-dot calibration, optional center motion hold, saved profiles and single-face processing. Fit spatial mappings from robust fixation centers, but choose mapping complexity using held-out frame errors so median-only fits cannot hide noise amplification. Preserve source-version checks, bounded frame age, camera recovery, full-screen targets and independent accuracy reporting.

**Stack:** Existing TypeScript, React/Next, Bun; no new dependencies.

**Spec:** User's correction in the current conversation: improve beyond the committed version; do not roll back. Existing implementation constraints: current v3 branch, no commits, no pupil/auth changes, mirror .types.ts files, no nested ternaries.

## Review focus

- Existing newer profiles must load without forcing recalibration; incompatible profiles still fail existing validation.
- A failed optional motion hold must preserve the completed grid, offsets and mapping.
- Actual frame noise must influence model complexity without sacrificing identifiable nonlinear edge correction.
- Blinks, sparse mobile frames and finite off-screen gaze must retain bounded source age and never clamp into a smaller box.
- Synthetic and historical replay evidence must not be reported as current wearer accuracy or validated metric 3D compensation.

## Tasks

- [x] Restore newer route/defaults with integration tests covering nine dots plus a center hold, profile restoration, model-bound offsets and single-face processing. Keep meaningful 29-feature fixtures.
- [x] Reproduce median-only mapping selection amplifying noise; add a failing regression test. Score whole-target held-out frame groups robustly, retaining median-center training and simpler-model preference within fold uncertainty. Verify nonlinear and outlier cases.
- [x] Compare before/after fitting on the existing private recording using aggregate metrics only. Keep biometric data outside the repository. Mark the rollback plan superseded and document measured limitations.
- [x] Run focused/full tests, TypeScript, lint, production build and one independent review. Leave changes uncommitted.


## Execution ledger

- Restored the newer route, center-only retry, adaptive display and single-face smoothing. Updated integration fixtures to use the actual 29-column RGB bank, preserving model-bound offsets and rejected/canceled head-hold behavior.
- Removed the rollback-only profile policy and simple-display profile instead of keeping redundant production paths. Shared strict profile validation and model-context checks continue to protect loading.
- Red: newer-profile restore and single-face configuration tests failed against the rollback; the restored integration flow failed all seven camera cases against the rollback route.
- Green: restored flows and profile/configuration cases passed; the noisy curved mapping regression failed at RMS 0.28373 and passed at 0.27116 after frame-aware selection. Existing nonlinear/outlier edge cases passed.
- Historical replay retained all 91 predictions; newer spatial RMS 141.43 px and jitter 64.60 px versus origin/v3 feature RMS 266.50 px and jitter 83.70 px. This older recording does not demonstrate the latest wearer regression or physical head compensation.
- First final suite: 1,009 tests passed, zero failures; TypeScript, lint and production build passed. Independent review: no material defect; 74 focused tests passed. Corrected stale single-face comments identified in review.
- Served-code audit caught mixed stale development modules. Route invalidation served the new flow/fitter, but the obsolete profile policy stayed cached; removing that redundant module also removes its activation path. Final served-code and suite checks follow below.

- Final served dev bundle confirms adaptive capture, center head hold and frame-aware fitter, with no rollback-only display/profile policy present.
- Final test rerun after cleanup: 1,009 passed, zero failures, 51,127 assertions, 106 files (47.29 s). TypeScript and lint passed. Final production rebuild passed; final served-code check passed after the build.
- Ruling: preserve the current newer head model as an optional local trial, not a claim of metric 3D compensation. Removing an unqualified experimental estimator entirely is not evidence of improvement; broader compensation needs independent physical measurements.
