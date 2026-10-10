# Remote appearance personalization implementation plan

## Follow-up: observed gain and motion regression (2026-10-09)

The supplied webcam result exposed a high-gain 29-feature spatial readout trained
under almost constant head pose. Its separate residual correction was rejected,
so a completed head hold did not provide live compensation. The remedy is a
joint regularized readout using the accepted nine gaze holds and the existing
center head hold. This does not introduce another calibration sequence.

1. Reproduce target-correlated incidental head motion with synthetic webcam,
   mobile and IR observations. Require fixed-gaze motion cancellation and
   preserved perimeter response on unseen target/pose combinations.
2. Fit candidate readouts using whole-target spatial folds and four contiguous
   motion folds. Exclude every center label in the center spatial fold. Require
   improved motion predictions and usable spatial coverage; choose stronger
   regularization within one estimated standard error of the best joint loss.
3. Persist strict motion-fit metadata with the readout, distinguish the joint
   fit from an additive correction, and preserve a working calibration after a
   stationary or unhelpful retry. Keep old profiles readable.
4. Use a 10 px remote cursor without changing raw coordinates, uncertainty
   metrics, filtering or off-screen warnings. Keep DOM and recording renderers
   consistent; other trackers retain their existing uncertainty presentation.
5. Replay the private export without using accuracy-check samples for training,
   then run synthetic regressions, full tests, types, lint, production build and
   an independent review. Leave all changes uncommitted on the current branch.

Review focus: compatibility of unversioned observations after representation
changes; temporal/target leakage; model collapse toward center; head-only retries
with an already compensated model; profile restoration; honest uncertainty and
before/after readouts; rendering/recording parity. Private observations stay out
of the repository.

### Regression-repair review ledger

- Final: fixed apparent compensation from horizontal appearance-noise shrinkage
  — `horizontal appearance noise cannot qualify by contracting one screen axis`
  RED→GREEN. Require calibrated response gain ≥0.9 on both screen axes.
- Final: fixed effective legacy correction being replaced after identical or
  partial motion — `an identical head hold cannot replace an effective correction
  or invalidate its accuracy check` and `a partial-axis retry cannot discard a
  working six-axis correction` RED→GREEN. Score replacements against active gaze
  and preserve previously observed axes.
- Final: extended the same axis-preservation repair to joint-model retries —
  `a joint retry cannot improve yaw by forgetting the other learned motion axes`
  RED→GREEN.
- Final: Ruling: unrelated pre-existing dirty-tree changes and canvas status
  differences were outside this review's scope. Preserve them; the entire suite
  still checks integration, and the new DOM/canvas test checks cursor geometry,
  uncertainty retention and outside-screen behavior. Cost if wrong: an unrelated
  pre-existing display issue remains; no inference about it being fixed is made.
- Final verification after the fix pass: `bun test --timeout 20000` → 1051 pass,
  0 fail (113 files); `bun run typecheck`, `bun run lint`, `bun run build` and
  `git diff --check` passed. Chrome restored a synthetic joint-motion profile at
  1440 px and 390 px viewport widths, showing a 10 px marker, active joint
  readout, no horizontal overflow and no page errors. This is rendering and
  application verification, not measured human tracking accuracy.

**Goal:** Improve personalized webcam/mobile gaze estimation without another detector, longer calibration, or discarding existing profiles.

**Architecture:** Expose the existing BlazeGaze head-conditioned 16-value penultimate representation alongside its unchanged two-coordinate output in one shared graph. Fit a regularized personalized readout from that representation plus measured binocular and head features. Compare whole-target-held-out predictions with the existing mapping before selecting it. Live prediction and stored profiles use the exact same versioned input contract.

**Tech stack:** Existing TypeScript, TensorFlow.js, Bun, React; no new dependencies or weights.

**Spec:** Latest user request and the source audit in `docs/remote-eye-tracking-v3.md` (research notes to append with implementation evidence).

## Constraints

- Current branch/checkout only; no commits, pushes or worktrees.
- Preserve legacy feature/output contracts and saved calibrations.
- Do not modify the near-eye pupil detector or pretend RGB iris landmarks measure metric depth.
- All new types in `.types.ts`; keep UI guidance concise and existing styling.
- Do not infer fixation labels from cursor stability or silently retrain on unlabeled live gaze.
- No import of EyeMU GPL code or non-commercial model weights; use the existing bundled model.

## Review focus

- Shared graph must produce identical base predictions, run the encoder once, and dispose every temporary tensor.
- Missing, malformed or incompatible appearance values must never be interpreted by a different model.
- A weak/noisy appearance candidate must preserve the existing mapping and profile compatibility.
- Head hold and target samples must remain separate from independent accuracy-check labels.
- A short blink must not invalidate calibration or cause a false claim about physical obstruction.

## Tasks

1. Model readout (`rgb-processor.ts`, a focused `rgb-appearance.ts/.types.ts`, model tests): write failing actual-weight tests for latent output, parity and memory; expose penultimate values from the same encoder forward pass; retain two-coordinate helper compatibility and benchmark the production path.
2. Personalization (`appearance-features.ts`, calibration/adaptive/profile modules and tests): define the versioned input, add input selection at the single prediction boundary, fit with the existing regularized solver; choose only for a meaningful held-out improvement. Exercise missing input, noisy candidate, held-out pose/edge simulations, and save/load parity.
3. Visibility guidance (`observation-status.ts` and relevant callers/tests): audit rejected states, distinguish a closed/covered eye from small/out-of-frame eyes, preserve all completed calibration holds and profiles. Avoid adding persistent instructional UI.
4. Verification: targeted tests, full frontend test suite, typecheck, lint, production build; inspect served runtime and browser behavior; independent code review. Document what was measured and what still requires real-user camera validation. Leave changes uncommitted.

## Research decisions

- EyeMU supports frozen appearance features plus a personal regressor; this implementation is independent and uses our existing weights.
- EyeTrax demonstrates landmark normalization and personalized regression, not calibration-free physical gaze.
- JEO's prototype uses an assumed sphere and legacy MediaPipe iris depth; drawing those rays is not evidence of accurate screen intersections.
- RGBDGaze requires depth; HiFiGaze requires usable screen reflections. Ordinary RGB webcam/phone frames cannot silently supply either sensor signal.
- A personalized appearance mapping is still an estimate. No claim of universal Tobii-level accuracy or metric parallax compensation is made.

## Execution record

- Model readout: actual-weight RED → GREEN. The first graph-wrapper implementation revealed shared variable disposal; replaced it with borrowed layers owned by the original model. The encoder runs once, Dense16 is reused for Dense2, one 18-value tensor is read back. Baseline output parity and stable tensor counts pass.
- Personalized mapping: RED → GREEN for formerly unusable generic output, incompatible input rejection, and head-only IR false fits. Full save/read/predict parity is exercised. Normalization and regression are shared with existing calibration code.
- Geometry: independent projected head-plane fixtures cover combined yaw/pitch/roll. New candidate features undo the distortion without changing legacy inputs or pretrained geometry. IR source pupils remain pixel measurements.
- Selection: candidates must improve aggregate held-out RMS by 20%, and pass per-target error/jitter guards on identical frames. These are engineering guardrails, not published accuracy guarantees. Tests protect a damaged corner and noisy candidate.
- UI: existing vector display stays explicit about face 3D versus measured eye 2D. Updated short visibility/pose guidance; no new panels or calibration steps.
- Independent reviewer found no actionable defect. Added missing tests for different held-out pose phases, IR fitting/selection, and boundary targets. No physical wearer accuracy claim follows from synthetic labels.
- No commits, pushes, worktrees, new packages or external model weights.
- Final checks: 1,030 frontend tests pass (51,779 assertions, 111 files); typecheck, lint and production build pass. Real production worker verified in Chrome at 1440px and 390px layouts using a synthetic local camera: 16 finite appearance values, three vector overlays, no page errors or horizontal overflow. Mac processing median after startup was approximately 30ms; this is not a phone benchmark or human gaze accuracy measurement.
# Follow-up: bounded RGB iris refinement

User authorized useful reference techniques without extra setup or commits. Work stays in this checkout.

1. Test a small, deterministic iris boundary fitter on independently rendered eye images: displaced seeds, ellipse/roll, eyelid occlusion, glints, noise, low contrast and undersized crops. Reuse existing crop pixels; no added network, model, OpenCV load, full-frame readback or temporal lag.
2. Keep the pretrained inputs and existing profile features unchanged. Expose bounded, confidence-weighted iris offsets as a separate versioned observation. Invalid/unclear boundaries return the original offsets in that representation.
3. Compare an appearance-plus-refined-iris candidate with the current calibration using the same held-out targets. Require lower error without harming individual corners or increasing jitter. Also test the candidate when refinement falls back to landmarks. No additional user calibration rounds.
4. Verify saved-profile compatibility, real model parity, full tests, types, lint, production build and actual browser worker timing. Obtain independent final review. Document that synthetic localization and held-out calibration checks are not a claim of universal physical gaze accuracy.

Research: HiFiGaze section 3.2 (https://arxiv.org/html/2603.19588v1) refines MediaPipe iris localization with segmentation and robust boundary fitting. Its Python preprocessing costs do not suit our mobile budget. We independently use a bounded radial edge search and robust ellipse-prior fit instead; this is not a reproduction of its learned screen-reflection system. RGBDGaze requires measured depth, unavailable in ordinary webcam streams.

Follow-up completed: image-localization tests first failed with an empty implementation; refinement and integration now pass. A separate versioned candidate preserves legacy input contracts. Fresh review reproduced dropout-state jitter that the first uniform fallback guard missed; the new mixed-state test failed before repair and passes afterward. Final suite: 1,040 passing tests; typecheck, lint, build and diff whitespace checks pass. Actual production-worker/browser checks confirm the new observation/timing contract; synthetic accepted-boundary and fallback timing are documented in `docs/remote-eye-tracking-v3.md`. No commit, branch or additional calibration step. The existing development server was found serving a stale worker and restarted so current-source checks can use port 4001.

The final browser run on the restarted port 4001 verified `rgb-iris-boundary-v1` observations in both 1440px and 390px layouts with no runtime errors. The temporary production-test server was stopped; the normal development app remains running.

## Follow-up: uncertainty, perimeter and rotation

Spec: Kate requested keeping the error bubble, a larger shrinking calibration pill,
closer perimeter targets, and stronger rotation compensation for remote IR and
near-eye screen tracking. Work stays uncommitted on v3. Current private export (2)
has a base-point calibration, no accepted head model, 162 gaze frames and 98 motion
frames. Baseline independent check RMS is 156.9px; upward mean bias is about128px.
All current motion candidates worsen the last held-out motion block, so relaxing
the acceptance test would knowingly regress part of the user's measured hold.

- [x] Restore the remote uncertainty region alongside a small center cursor; retain
  raw coordinates, measured error, blink behavior and matching recording geometry.
- [x] Enlarge the shared pill at acquisition and shrink it to the existing focus
  size during capture. Move screen/remote setup targets to 4%/96%, with a responsive
  pill and accessible cancel button that do not obscure edge targets. Keep labels
  identical to rendered positions and avoid global gain changes.
- [x] Test an IR rotation-aware candidate using independently generated head/eye
  projection. Preserve old profile representations and use the existing whole-target,
  temporal-block and gaze-response gates. No extra inference or calibration holds.
- [x] Audit the near-eye ray/plane projection with independent combined rotations
  at perimeter targets. Do not replace validated geometry with assumed physical
  measurements. Document what available hardware can and cannot establish.
- [x] Run focused then full tests, types, lint, build, inspect mobile and desktop UI,
  and request one fresh final review. Preserve all earlier working changes.

Review focus: old saved profiles; close-up IR without head pose; corner focus and
cancel controls on small screens; no cursor suppression or artificial gain; noise
must not qualify as compensation. Ruling: user explicitly authorized implementation
and asked for no commits/branches; proceed inline without another approval gate.

Follow-up execution record:

- Bubble/cursor flow, shrinking pill, perimeter collection and the new camera-plane
  IR representation were tested RED→GREEN. Added DOM/canvas uncertainty-and-center
  recording parity. Legacy cursor-only presentation remains available.
- Ruling: the first broad test run's old setup fixtures still captured .06/.94,
  so they no longer matched the new default grid. Updated those setup fixtures to
  .04/.96; kept older accepted .1/.9 near-eye seed fixtures unchanged to exercise
  backward compatibility. No gain or fit threshold was changed.
- Ruling: preserve near-eye ray/plane arithmetic — independent combined rotations,
  translation and peripheral targets pass, and no current physical near-eye export
  establishes a formula defect. Cost if wrong: real-device pose/registration error
  remains; fixtures cannot qualify wearer accuracy.
- Ruling: keep the newest webcam export's mapping — all motion candidates worsen
  its final temporal holdout. Do not force acceptance to make the status look good.
  The new camera-plane bank is IR-only; webcam/mobile predictions are preserved.
- Browser RED exposed a 2px implicit-grid focal offset and a relative-position
  override displacing Cancel. Explicit stimulus/focal centering and the capture
  button's fixed override repair both. Chrome at 1440×1100 and 390×844 checks all
  nine perimeter labels, shrinking around a fixed focal point, nonoverlapping
  on-screen Cancel, visible bottom guidance, and the bubble/center marker. No page
  errors or horizontal overflow. Synthetic UI feeds do not measure human accuracy.
- Final verification: 1,057 tests pass, 0 fail (52,399 assertions, 113 files),
  typecheck, lint, production build, scoped formatting and git diff --check pass.
  The initial loopback-port test failure was sandbox access, not an app regression;
  the permitted rerun passed. Normal development app restarted on port 4001.
- One fresh read-only final review found no material defect and passed 106 focused
  tests (3,971 assertions). No additional fix pass was required. HEAD remains
  48e2263 on v3; no commit, push, branch, worktree or private-data persistence.
