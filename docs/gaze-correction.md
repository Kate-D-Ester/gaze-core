# Gaze correction and calibration

These changes run locally in the browser. They do not change authentication, add a backend, upload camera frames, or persist new screen/remote calibration data.

## Shared click correction

Use the crosshair beside **Gaze offset**, or in the live preview. Look steadily at the intended target, then click it. Both axes update together. Escape cancels; the reset icon clears both axes.

For a scene camera, look at the **physical object** and click its location in the camera image. Looking at the preview itself is a different fixation. Position the pointer before looking at the physical target.

`features/gaze-correction` owns the coordinate conversion, short raw-sample history and overlay interaction. The sampler uses a median of distinct recent frames, rejects unstable or stale evidence and keeps off-screen measurements available for recovery. Scene clicks exclude letterboxing and use the already transformed image dimensions, so rotation and mirroring are not applied twice.

The result changes the actual normalized offset used by screen gaze, remote gaze, scene measurements and scene recording/export. It does not move only the display bubble. Screen/remote offsets last for the current calibration. Scene offsets can be saved with the existing local profile. A changed offset makes previous accuracy results inapplicable until a fresh validation checks it; resetting to the exact previously tested offset restores that result where the existing validation state supports this.

One click corrects translation. It cannot identify scale, rotation, nonlinear distortion, depth, or the true target without the user's correspondence. No accuracy claim is inferred from clicking.

## Remote webcam, mobile and full-face IR

All three paths append the same perspective basis to their calibrated feature vector. Under weak perspective, visible eye spacing varies approximately as `cos(yaw) / distance`. The shared features couple its inverse with both measured eye offsets, head position and head orientation. Existing model normalization and pretrained inputs remain unchanged.

This is a learned relative perspective correction, **not metric binocular triangulation or a complete parallax solution**. It needs calibration examples at the distances and poses in use. Extended calibration now explicitly asks for gentle nearer/farther movement; existing pose-support checks reject observations outside calibration support. Tiny/invalid scale and severe foreshortening are rejected. Eye-only IR/PCCR has no reliable face depth and receives no invented distance estimate.

Seeing two eyes does not by itself identify the screen plane, camera intrinsics, visual-axis offsets or real-world fixation depth. Exact geometric ray/screen intersection needs those measurements. The controlled tests establish that the new feature basis represents distance-dependent error that the old webcam basis could not; they do not establish human accuracy.

## Single near-eye camera: screen and scene

`eye-slippage.ts` estimates small image-plane translation using the projected center implied by diverse pupil-ellipse minor axes. It requires fully observed high-confidence ellipses, 2D movement, independent axis directions, strong fit support and agreeing independent windows. Translation is bounded by the ROI and locked model size. Accepted translation is subtracted before classic/manual and spatial/auto gaze projection. The pupil detector, measured ellipse and locked model are unchanged.

Weak evidence, fixation, blinks or frame drops do not invalidate calibration; they retain the last accepted correction. Resets happen when the source, ROI, model context or image dimensions change. Telemetry distinguishes collecting, stable, compensated and limited evidence. It does not mean calibration accuracy has been verified.

This approximation cannot recover camera rotation, depth changes, arbitrary six-degree-of-freedom headset slippage or corneal refraction. After reload there is no previous runtime reference to recover; loading a scene profile still requires a fresh accuracy check. New uncertainty must not be interpreted as proof that the old mapping remains aligned.

## Calibration error and the bubble

For the screen eye-only path, a regularized quadratic mapping is considered after nine distinct targets. It is selected only when holding out each complete target improves normalized RMS by at least 20% and 0.005. Direction-reversing fits are rejected; nonlinear extrapolation is bounded. Affine fitting remains the fallback, and partial calibration and physical head compensation retain their previous paths.

Scene calibration already compares multiple mapping families using held-out fixations. Its existing consistent-bias recovery remains available and requires fresh validation after applying the proposed correction. Small near-eye slippage and explicit click corrections now affect its input/mapped coordinates as well.

Live screen/remote views no longer use the bubble's fixation lock. The display can still filter jitter, but its center follows the measured mapping. A capped ring is an error visualization, not a correction or confidence guarantee. Measurements and exported coordinates never come from the bubble processor.

## Verification and remaining hardware checks

Automated regressions cover withheld distances for RGB/mobile/full-face IR, invalid scale, held-out nonlinear screen mapping, affine/head-model fallback, translated raster pupil images through OpenCV, insufficient slippage evidence, source resets, fresh click sampling, off-screen recovery, rotated image containment, cancellation, actual offset routing and recording/profile behavior.

Before making accuracy claims, collect independent physical fixations on the intended hardware: first at the calibrated pose/distance, then nearer/farther, with head turns, after small headset translations, and after camera interruptions. Compare unfiltered normalized/pixel errors, not apparent bubble stability. Validate loaded profiles again. Keep camera rotation/depth shifts out of the supported slippage claim until calibrated 3D geometry is available.

## Research basis

- [Świrski and Dodgson, 3D Eye Model Fitting](https://www.cl.cam.ac.uk/research/rainbow/projects/eyemodelfit/) describes eye-model geometry from monocular pupil observations. This implementation uses projected-center geometry, not their complete 3D fitter.
- [Google Research, MediaPipe Iris](https://research.google/blog/mediapipe-iris-real-time-iris-tracking-depth-estimation/) explains depth-from-iris prerequisites, including focal length and physical iris size, and explicitly distinguishes iris tracking from gaze estimation.
- [MediaPipe Face Mesh geometry](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/face_mesh.md) documents weak-perspective landmarks and the separate metric geometry model.
- [Zhang et al., Revisiting Data Normalization for Appearance-Based Gaze Estimation](https://www.mpi-inf.mpg.de/departments/computer-vision-and-machine-learning/research/gaze-based-human-computer-interaction/revisiting-data-normalization-for-appearance-based-gaze-estimation/) motivates respecting camera geometry and normalization when learning gaze.
