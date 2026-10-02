# Remote eye tracking V3

> Historical snapshot. Later implementation supersedes parts of this document,
> including full-face IR glint requirements and the original UI. Before integrating,
> read [the current V3 UI and merge handoff](../../remote-eye-tracking-v3-handoff.md).

User explicitly requested immediate implementation, three camera-specific cards and local mobile selfie processing. The later head-tracking requirement is binding: every calibration sample retains its concurrent head/reference pose; calibration supports different poses across and within targets, and live output uses pose continuously.

## Product

Public `/trials/remote-eye-tracking`, linked from `/trials` (alias of existing `/trial`). Three cards: Mobile eye tracker, Webcam-based eye tracker, IR webcam-based eye tracker. Flow: Choose tracker → Camera → Position → Calibrate → Validate → Results. Responsive portrait phone layout, inline video with `playsInline`, user-initiated camera permission, local processing. Calibration overlay uses the actual viewport, account-free.

## Algorithms

RGB modes use a local MediaPipe face/iris/head-pose model and pretrained appearance gaze inference where supported, augmented with binocular landmarks. Mobile emphasizes phone geometry and device pose; desktop uses more explicit pose interactions. No fabricated metric 3D gaze ray or claimed paper accuracy. IR uses dedicated pupil/corneal-reflection (PCCR) features, with reflection/eye reference position and size retained for motion compensation; requires visible glints, rejects invalid pupils, and explicitly reports that the reference is not full-face 6DOF pose.

Shared calibration consumes per-frame feature/target/head pairs. Fit regularized, standardized regression with leave-one-target-out validation (not random adjacent frame splitting), selectable regularization, robust sample rejection and distinct heldout targets. Do not require stable head pose during collection. Capture only after fixation settling, cap per-target samples, skip blinks/loss/stale frames. Guided extended calibration revisits targets to gather varied head poses, while ordinary calibration accepts pose differences. Pose support/envelope suppresses extrapolation outside calibrated conditions and guides recalibration using known targets. No passive training on unlabeled gaze.

## Runtime

A worker owns each algorithm, one transferred frame in flight, monotonic capture timestamps, no frame queue, deterministic release and generation gating. No permission on page load. Stop tracks/workers on mode changes/unmount/page hide, revoke download URLs, display initialization/permission/model/inference errors with retry. RGB models/WASM are served from local public assets; first model load may require network while serving source assets. Physical phone access uses HTTPS or trusted secure context; a LAN HTTP page cannot request camera.

## Verification

Test heldout-target calibration with varying head pose, rank/NaN rejection, out-of-support poses, IR pupil/glint association/loss, mobile constraints and asynchronous camera release. Run existing Bun suite, typecheck, lint, production build. Render desktop and phone viewport; verify all three flows and errors. Actual gaze accuracy, IR hardware, iOS camera throughput and thermal performance require real-person hardware sessions; report this limitation explicitly.

## Isolation

Branch codex/v3-webcam-gaze, worktree ~/Desktop/Codex-projects/gaze-core-v3, base 6ba620f. Keep v2 behavior intact. Track model source hashes, upstream license and training-data usage constraints in a research notice; no commercial-weight-clearance claim.
