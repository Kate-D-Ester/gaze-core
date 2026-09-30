# Scene-camera eye tracking

Date: 2026-10-01
Status: Proposed design; research and workspace preparation complete, implementation awaiting design review.
Route: `/trial/scene-camera-eye-tracking`
Workspace: `/Users/kate/Desktop/Codex-projects/worktree-v4`
Branch: `codex/worktree-v4`
Base: `v2` at `6ba620f5744ff9095bf088aef8a066054eb7d634`, after fetching and pulling `origin/v2` with `--ff-only`.

## Intent and success criteria

Use an eye camera and an outward-facing scene camera mounted together on a headset. Preserve v2 steps 1–3, including manual and automatic pupil tracking and eye-model setup. Step 4 selects the scene camera. Replace viewport-dot calibration with the user's physical index fingertip, detected through MediaPipe. Show the scene preview, full hand landmarks, collection progress, and then mapped gaze. Support coordinate logging, heatmaps, and downloadable raw scene video.

Both cameras must stay active independently. Both accept USB sources and browser-readable HTTP(S) network streams, including IP and mDNS hostnames such as `http://esp32cam.local:81/stream`. No backend is required for this trial route.

## Research and conclusions

1. [Bâce, Staal, and Sörös, ETRA 2018: Wearable Eye Tracker Calibration at Your Fingertips](https://vs.inf.ethz.ch/publ/papers/mbace_etra2018.pdf) directly investigates this approach; [their published implementation](https://github.com/mihaibace/fingertip-calibration) integrates it with Pupil. Users fixate their physical fingertip at different scene locations. The study used nine locations, gathered several samples per hold, fitted pupil-to-scene polynomials, and performed a separate accuracy test. Its main limits were calibration coverage and depth-dependent parallax. This supports fingertip calibration but does not establish accuracy for our hardware or algorithm.
2. [Pupil Capture documentation](https://docs.pupil-labs.com/core/software/pupil-capture/#gaze-mapping-and-accuracy) distinguishes calibration from independent accuracy testing. It recommends sampling throughout the scene field of view and warns that monocular mappings depend on target depth. Its camera-intrinsics workflow is additional calibration, which would be required for a reliable geometric 3D solution.
3. [Google's MediaPipe Hand Landmarker web guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js) provides 21 image landmarks and hand-relative world landmarks. Inference is synchronous; Google recommends a worker to avoid UI blocking. The world coordinates describe the hand relative to its own center and do not supply the camera-to-hand distance needed to remove parallax.

Implementation choices below are engineering decisions derived from these sources and the current v2 code; numerical quality thresholds are initial guardrails to validate with real hardware, not published accuracy guarantees.

## Options considered

- **Recommended: empirical eye-feature-to-scene mapping.** Reuse the locked v2 eye model and gaze-feature extraction. Fit a low-order mapping from synchronized physical-fingertip samples. This works with existing cameras without measured extrinsics and keeps the implementation small. Independent validation exposes actual mapping error.
- **Geometric 3D gaze ray.** Estimate scene intrinsics, eye-to-scene rotation/translation, and fixation depth before projecting a gaze ray into the scene. This could reduce parallax but requires new measurement workflows and information the current cameras do not provide. It is unsuitable for an honest initial implementation.

## User flow

1. Eye camera: reuse USB/network selection and current source diagnostics.
2. Eye region: reuse the ROI selection, thresholds, and pupil previews.
3. Eye model: reuse both manual corner setup and automatic sphere fitting, readiness criteria, and model locking.
4. Scene camera: select a second USB device or enter an HTTP(S) stream URL. Show its native aspect ratio and source status. Ensure it is mounted rigidly with the eye camera. Reject selecting the same known USB device for both roles.
5. Finger calibration: show the unmirrored scene feed, all 21 landmarks, and a highlighted index tip. Ask the wearer to look directly at their **physical fingertip**, move it through the camera view, and pause in nine scene regions. The preview is placement feedback; looking at the fingertip's screen image would calibrate the wrong target. Collect automatically only during stable, fresh, valid holds. Give visible progress and a brief optional audible completion cue so the wearer can keep looking at their hand.
6. Live scene gaze: draw a gaze dot and recent trace on the scene feed, independently of hand presence. Offer a fresh finger accuracy check, recalibration, session recording, coordinate export, and scene-image heatmap export.

The preview must never turn this into screen calibration. Camera-image coordinates are independent of window size; resizing the UI does not invalidate the mapping.

## Architecture and reuse

- Keep the existing public `/trial` behavior and authentication routes intact.
- Share the v2 eye setup components and, where necessary, extract a focused setup controller instead of copying the whole v2 page.
- Put scene-specific code under `features/scene-eye-tracking/` with focused units for source lifecycle, hand inference, calibration sampling, mapping, recording/export, and preview rendering.
- Reuse `openNetworkSource`, the MJPEG parser, camera error messages, and video-dimension readiness utilities. Do not open a second pupil worker for the outward camera.
- Pin `@mediapipe/tasks-vision`, the WASM runtime, and the hand model assets. Include deployment asset-loading behavior and a recoverable failure state. Load the detector when the scene-camera flow is entered; report load errors and allow retry.
- A dedicated hand worker accepts at most one in-flight scene frame, with generation IDs to discard obsolete results. Limit hand inference to a practical frame rate. Transfer image data or bitmaps without retaining unbounded frame history. Close every transferred bitmap and terminate the worker on unmount.
- Use one monotonic browser clock for eye frames, scene frames, hand results, and recordings. Bounded eye history allows nearest-time matching; reject stale or unmatched samples. Browser receipt/decode timestamps are not hardware capture synchronization. Include an explicit configurable relative camera-delay adjustment for network streams, saved in calibration/session metadata.

## Calibration collection and fitting

- Track one unambiguous hand; pause when no hand, multiple ambiguous hands, invalid landmarks, or an out-of-frame index tip is detected. Use landmark 8 as the index fingertip. Show the full skeleton for placement feedback.
- Require a locked eye model, fresh non-reacquiring pupil evidence, sufficient pupil confidence, finite gaze features, fresh scene landmarks, and a new eye/scene sample pair. Never count the same eye frame repeatedly.
- Require a settling interval and a stable fingertip/eye hold before collecting. Pause and reset the current hold on a blink, hand loss, large movement, stale frames, or identity/source changes.
- Collect approximately 20–30 valid pairs per location. Retain actual scene target coordinates; grid cells guide coverage without replacing detected fingertip coordinates. Robustly aggregate each hold so one long hold cannot dominate the fit.
- Require nine adequately spread scene regions, enough horizontal/vertical extent, and a nondegenerate eye-feature distribution. Give actionable guidance for uncovered regions or poor evidence.
- Start with v2's affine mapping and normalized gaze features. Assess a second-order model only if grouped cross-validation shows a material improvement; favor the simpler mapping otherwise. Hold out whole locations, never adjacent frames from the same hold, to avoid misleading fit scores. Reject singular or unreliable fits.
- Preserve calibration samples, model type, camera dimensions, source identity, tracker settings, delay adjustment, and grouped fit error in session metadata.
- Collect fresh holds for independent validation. Report normalized scene-image RMS error and scene-pixel RMS error, with sample counts. Do not claim visual-angle accuracy without measured intrinsics. Make validation failure visible and provide an immediate recalibration action.

## Mapping validity and recovery

- Invalidate calibration when the eye ROI/model/format/settings, either source identity, source resolution, camera orientation, or delay adjustment changes. Explicitly allow the wearer to invalidate it after headset slippage.
- Calibration is reusable while mounting, settings, and effective working distance remain stable. It is not a lifetime or all-depth calibration.
- Suppress gaze when eye data or scene frames are stale or invalid. Keep out-of-frame predictions as out-of-frame data rather than clamping them to camera edges. Mark predictions outside sampled coverage as extrapolated.
- Display connection loss, stream/CORS/mixed-content errors, camera-permission errors, model-loading errors, and unsupported recording capabilities with useful retry paths. Stop pending connections with AbortController and release cameras on disconnect/unmount.

## Recording, coordinates, and heatmaps

- Raw scene video means decoded scene-camera frames without hand/gaze/heatmap overlays. Use MediaRecorder on the scene stream where available, or on a separate raw canvas stream for MJPEG/network inputs. Browser codec selection and output extension must match actual supported MIME type.
- Keep the displayed overlay canvas separate from the raw recording surface. Also provide raw eye-video export where practical through the existing eye source canvas; identify canvas recordings as browser re-encodes, not original camera bitstreams.
- Session exports include raw scene video, optional eye video, JSON metadata/calibration/hand observations, gaze JSON/CSV, and a PNG heatmap. All timestamps share a documented origin and include video/session timing offsets.
- Each gaze row contains scene/eye frame identifiers and monotonic timestamps, elapsed recording time, normalized and pixel positions, pupil confidence, validity/loss reason, and coverage/extrapolation status. Log invalid intervals instead of silently treating missing samples as fixation.
- Use dwell-time weighting for a scene-image heatmap and exclude stale, invalid, and out-of-frame points. Clearly label it as accumulated **camera-image** gaze density: it moves with the headset and does not register physical objects across head motion.
- Keep recordings and exports local. Bound memory/recording duration, show elapsed time and limits, finalize partial recordings on source failure, and preserve completed downloads until the user clears or replaces the session. Revoke object URLs when replaced or unmounted.

## UI behavior

Reuse v2's dark camera workspace, navigation, form controls, and error presentation. Eye setup remains familiar. Once scene setup starts, the scene preview becomes the primary surface and the eye feed remains visible as a diagnostic. Show distinct scene-source, hand, pupil, calibration, validation, and recording states. Provide accessible control labels, keyboard-operable buttons, responsive preview sizing, and text feedback alongside color/progress cues.

## Validation plan and acceptance

- Run the untouched v2 frontend tests as a baseline, then the full frontend suite, type check, lint, and production build after implementation.
- Meaningful unit tests cover sample freshness and unique pairing, hold reset on loss/movement, coverage rejection, degenerate mapping, grouped validation, and coordinate/heatmap export validity.
- Lifecycle tests cover overlapping camera requests, source replacement/unmount cleanup, stale worker messages, network-stream termination, independent two-camera operation, and recorder finalization.
- Route tests establish that this trial route is public, the original `/trial` is unchanged, and both manual/auto options and the first three steps remain available.
- Inspect the browser flow at desktop and narrow widths, including initial, source-loading/error, model-loading/error, calibration progress, loss/recovery, and completed/export states with deterministic fixtures where hardware is unavailable.
- A real-headset check is still required to measure calibration accuracy, network-camera delay, simultaneous device behavior, and video/coordinate alignment. Report hardware verification separately from automated correctness; do not invent measured accuracy.

## Delivery scope

Deliver the route, dual-camera source lifecycle, MediaPipe hand preview, robust fingertip calibration and validation, live scene gaze/trace, local recording and exports, tests, and a concise usage guide with the research sources and limitations. Do not modify v2's existing pupil algorithm, introduce cloud storage, or promise depth-independent/object-registered gaze without the needed geometry.
