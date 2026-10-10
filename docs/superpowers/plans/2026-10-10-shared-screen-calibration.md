# Shared screen calibration and shorter remote setup

Spec: Kate requested the same growing/shrinking rotating pill and progressive
directional estimation across screen-coordinate calibration, direct use of saved
personal profiles, no remote Position step, automatic accuracy dots after a new
calibration, and clickable setup breadcrumbs. Kate confirmed nine setup points:
center, bottom-left, top-middle, bottom-right, top-left, bottom-middle, top-right,
left-middle, right-middle. Work remains uncommitted on v3 in this checkout.

The center is a cooperative fixation baseline, not proof of attention. Subsequent
collection uses coarse sector checks with measured center noise and accepted
per-axis displacement references. A middle axis rejects displacement beyond 75%
of its learned center-to-edge range. Exact target attention cannot be inferred
before calibration. Independent accuracy collection must never use this gate.
Keep fit/holdout guards and old profile decoding. Camera identity, feature version,
viewport and payload validation still apply; removing compulsory human checks
does not mean trusting malformed or incompatible saved data.

Implementation, inline with one fresh final review:

1. Shared target sequence and sector guidance: add focused tracking-calibration
   modules/types; reuse the sequence in both collectors and retain older seed
   grids regardless of collection order. Regression tests first: wrong-sector
   stable looks, 75% middle-band boundaries, anisotropic scales, mirroring, noisy
   center, opposite look and invalid data. Keep pupil extraction unchanged.
2. Remote fixation collection: adapt existing observations into that guidance;
   reset incomplete dwell on wrong sector, unstable eye/head or dropped readings.
   Optional center motion holds and independent checks bypass sector/still-head
   conditions. Stationary pill when no valid collection; shared visual behavior
   for every calibration/accuracy screen. Test first and preserve low-FPS support.
3. Remote setup and profiles: camera readiness opens Calibration directly, or
   Results for a compatible saved profile. Move IR controls into Calibration;
   keep local-video inspection available, without calibration. Breadcrumbs allow
   permitted back/forward navigation without clearing a valid model or restarting
   the camera. Existing profile menu supports switch/recalibrate. Loaded accuracy
   remains unverified, but no forced check or return alignment is shown.
4. New calibrations: immediately start independent accuracy dots after fitting,
   in both remote and near-eye screen routes, without an extra Start interaction.
   Preserve cancel/failure recovery and optional later checks. Camera-specific
   fitters/head pairing remain separate. Physical scene markers retain their
   detectable ring; these are not screen-coordinate gaze targets.
5. Focused/full tests, types, lint, build, desktop/mobile browser flow checks and
   fresh final review. Record evidence and limitations. No commits or pushes.

Ruling: the user provided the implementation design and explicitly requested
execution without repeated approval in this session. Use this plan as the working
ledger and proceed inline. Do not create a branch or external worktree.

Review focus: older accepted seed grids/order, automatic-check cancellation,
profile restoration races, breadcrumb prerequisites, unstable fixation reset,
unknown camera-axis fallback, no circular validation gating, no fake verified
state on restore, no lost camera/IR controls.

Implementation ledger:

- Tasks 1–4 implemented in this checkout. Shared sequence and coarse guidance
  replace the old near-eye direction helper. Accepted older grids retain their
  order and inset during head-only recovery. All newly fitted screen models
  continue into independent accuracy dots; cancellation retains the fitted model.
- Ruling: the Choose breadcrumb exits the current tracker, matching the existing
  Back to camera choices action. It stops the camera and clears the session;
  Camera, Calibration, Check accuracy and Results preserve the model and source.
  This avoids keeping a hidden camera running on the three-card chooser.
- Ruling: source-specific minimum movement floors supplement center MAD. Explicit
  neural screen hints and camera ocular/reference signals provide orientation;
  arbitrary mixed feature arrays are never interpreted as a screen gaze signal.
- New regressions were observed failing before implementation for target order,
  wrong-sector/stability guidance, idle pill rotation, simplified navigation,
  unknown feature axes and malformed saved-grid coverage. Focused capture tests
  also cover 3/7 FPS, interrupted-hold retries and independent wrong-sector reads.
- One fresh final review found a small-span middle-band bug: the noise floor
  widened the learned 75% band. Reproduced RED, corrected, then 57 focused tests
  passed. Once a span exists, its 75% limit applies without widening.
- Before that final repair, 1,068 frontend tests, TypeScript, lint and the Next
  production build passed. The final complete verification and isolated browser
  checks are recorded below after completion. No commit, push or branch change.
- Final verification after the review repair: 1,069 frontend tests passed across
  115 files; TypeScript, lint, `git diff --check`, and the Next production build
  passed. Isolated Chrome sessions covered desktop webcam, 390px mobile and
  desktop IR using synthetic processor outputs. Each reached all nine points in
  the requested order, kept the actual pill at `rotate(0deg)` while waiting on a
  wrong sector, shrank during collection, started accuracy dots automatically,
  saved through the real profile form and restored Results/live preview without
  forced capture or verified accuracy. No page errors, horizontal overflow,
  target-center drift or cancel-button overlap were observed. Near-eye automatic
  checks and old head-grid recovery are covered by the regression suite. These
  checks verify implementation and presentation, not human gaze accuracy.
- HEAD remains `48e2263` on `v3`. All work remains uncommitted in the existing
  checkout. Pre-existing changes were preserved.

Follow-up: Kate requested a slightly looser direction estimate and a new order:
center, top-left, top-right, bottom-middle, bottom-left, top-middle, bottom-right,
left-middle, right-middle. This supersedes the original order and 75% band above.
Widen the middle-axis band to 85% and lower learned directional movement from
20% to 15%. Keep source noise floors, sample counts, dwell duration, stability,
blink checks, independent accuracy collection and pill animation unchanged.
Add failing boundary/order regressions first, including side-dot collection in
webcam, mobile and IR modes. Verify both collectors and retained older profiles.
Work remains in this checkout on `v3`, without commits or pushes.

- Follow-up verification: the new order and relaxed-boundary tests failed against
  the previous guide (7 failures), then all 87 focused tests passed after the
  change. The complete suite passed 1,073 tests across 115 files; TypeScript,
  lint, formatting of the changed TypeScript files and `git diff --check` passed.
  Side-dot collection tests cover webcam, mobile and IR, including rejection of
  full corner displacement and the opposite direction. Existing near-eye
  collection, older saved grids, low-FPS capture and independent checks passed.
  Only shared target order and direction tolerance changed in production code;
  pill animation and live gaze mapping remain unchanged by this follow-up.

Follow-up investigation: remote side-dot holds became difficult, and live gaze
was reported to have a restricted range. Two capture regressions were isolated:
the first unmeasured direction inherited the opposite side's movement threshold,
and RGB capture relied on jittery uncalibrated neural coordinates despite already
having measured binocular vectors. Fix the direction-specific floor and prefer
the named measured signal, retaining source compatibility on resumed captures.
Keep blink, head-stability, sample count and dwell guards, target order and pill
animation unchanged. Synthetic capture-to-live tests must retain perimeter
response without modifying a stored model; do not store personal exports in tests.

The supplied export reproduces a generalization bias but not a hard live-range
boundary. A stricter held-out head-range gate was evaluated and discarded: it
removed useful compensation and worsened independent replay. No gain stretching,
new representation, head-model change or saved-profile rewrite is included in
this follow-up. Add bounded in-memory live diagnostics to the existing Results
download so a future live failure can be traced through source and mapped screen
coordinates. The restricted-live symptom remains unverified until a live trace
is available. Do not claim it fixed from calibration frames alone.

- Verification: capture regressions were observed failing before the fixes.
  The full frontend suite passed 1,084 tests across 116 files. TypeScript,
  frontend lint and `git diff --check` passed. After the final diagnostic-reader
  adjustment, the real remote page/export flow, trace bounds and joint-motion
  regressions passed again; no head-fit behavior changed. The provided recordings
  and exports are not copied into repository fixtures. All changes remain
  uncommitted on `v3` at HEAD `48e2263`.
