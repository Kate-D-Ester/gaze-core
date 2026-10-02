# Head-mounted eye tracking: research and implementation

Status: code changes on `v2`, uncommitted. This is a calibrated head-compensation implementation with automated regression checks. It has not passed physical device or commercial accuracy validation.

## Correction for persistent head-motion drift

The reported dot offset persists after the head stops, and the live view shows the head-compensation icon. This rules out an eye-only fallback for that run and makes camera delay alone insufficient to explain the observation. The exact cause in that physical recording remains unmeasured.

The fitter now evaluates two models against the same collected eye/head observations:

1. The registered 3D ray/plane model below, suitable when the pose measurements behave like a rigid camera transform.
2. A learned mapping from two eye features and six relative head-pose components directly to viewport coordinates. It learns the sign, gain, and cross-axis contribution of each measured motion instead of assuming the webcam outputs calibrated physical rotations and distances.

The second approach follows the regression principle in [Browatzki, Bülthoff & Chuang (2014)](https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2014.00200/full). That paper uses Gaussian processes; this application uses a smaller, local linear model appropriate to its short calibration sequence. [Narcizo's author description of head-rotation compensation](https://www.fabricionarcizo.com/publications/narcizo2017a/) also describes learning correction from measured 3D angles using linear regression. Their hardware and accuracy results are not claims about this webcam implementation.

For relative pose `h = [dx/depth, dy/depth, log(depth/referenceDepth), pitch, yaw, roll]`, the learned model is:

```text
screenX = b0 + b1*eyeX + b2*eyeY + sum(b3..b8 * h)
screenY = c0 + c1*eyeX + c2*eyeY + sum(c3..c8 * h)
```

The features are centered and scaled before a weighted, reorthogonalized QR fit. Every fixation has equal total weight. All nine input columns must be independent; regularization is not used to conceal missing head or eye variation. On fixed-target movement holds, the learned head contribution cancels the measured eye counter-motion. Eye changes independent of head motion continue to change the gaze position.

Both candidates must pass full-fixation cross-validation. Training RMS per coordinate remains limited to 0.03 and validation RMS target distance to 0.03. The worst held-out fixation must now also stay below 0.06. Errors are squared before averaging over observations; averaging opposing predictions first could conceal large instantaneous errors. A constructed case passed a 0.027 average error while having a 0.111 error at one movement fixation; the new maximum-error gate rejects it. The candidate with lower valid cross-validation error is retained, with its method and worst error included in the local result export.

Regression is an approximation within the measured motion range. The short center-only head pass does not establish arbitrary eye/head interactions or every combination of six-axis movement. Rigid-pose fixtures still select the geometric model, which captures those interactions. Physical acceptance still requires unseen fixed-target yaw/nod sweeps, including targets away from the center. Passing synthetic fixtures is insufficient for a commercial accuracy claim. Existing sessions must be recalibrated to fit and validate a new model; pupil detection and the eye models are unchanged.

## Earlier diagnostic investigation

The current physical setup still performs poorly. Workflow fixes and passing mathematical fixtures do not establish the cause of that device-level failure or demonstrate accurate head compensation.

Tracing the actual MediaPipe implementation establishes these measurement assumptions:

- Its [face geometry graph](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/face_geometry/face_geometry_from_landmarks_graph.cc) configures a virtual camera with a fixed 63-degree vertical field of view. The application does not calibrate that camera to the front webcam's focal length, principal point, or distortion.
- The [geometry pipeline](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/face_geometry/libs/geometry_pipeline.cc) reconstructs depth from normalized landmarks using that virtual camera and a canonical face. Its [Procrustes solver](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/face_geometry/libs/procrustes_solver.cc) produces a similarity transform containing uniform scale as well as rotation and translation. The application previously retained only the decomposed rotation and translation.
- The matrix's column-major interpretation is consistent with the [matrix serializer](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/framework/formats/matrix.cc) and the [JavaScript adapter](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/face_landmarker/face_landmarker.ts). Transposing it or reversing an axis without measured evidence is not an appropriate correction.
- [intrApose: Monocular Driver 6-DOF Head Pose Estimation Leveraging Camera Intrinsics](https://pure.tudelft.nl/ws/portalfiles/portal/163838377/intrApose_Monocular_Driver_6_DOF_Head_Pose_Estimation_Leveraging_Camera_Intrinsics.pdf) investigates why camera intrinsics matter for rotation and translation estimation. Its pose estimator is a different implementation and has not been ported into this application.

A webcam face transform cannot be assumed to have the rigid-motion accuracy of the registered optical tracking system in the cited head-mounted gaze research. Joint gaze fitting does not itself verify the incoming head measurements. The actual contribution of pose bias, mounting offset, timing, and eye-feature changes must be measured on this setup; the code facts above alone do not isolate it.

### Local diagnostic capture

Calibration and live gaze now retain a bounded numeric recording in session memory. It includes the complete fit request, accepted or rejected fit result, failure reason, original face matrix and scale, original and interpolated pose timestamps, eye features, target positions, collection rejection instructions, and unclamped screen predictions before display smoothing. Rejected camera pairs are recorded before collection gating removes them. Camera images, preview masks, source URLs, device identifiers, auth values, and network credentials are excluded from the recorder.

The existing **Export result** button includes this recording. After a failed fit, the calibration step also exposes an **Export calibration diagnostics** icon, even without a live gaze model. There are no uploads or automatic browser-storage writes. Recordings are limited to 1,500 recent readings and three fit attempts; camera, orientation, eye-model, and viewport changes clear them. The last source face matrix can accompany an averaged or interpolated pose; its separate measurement timestamp identifies it and it must not be mistaken for the derived pose's matrix.

To reproduce drift, complete one run, fixate a stationary target while moving the head slowly left/right and up/down, then export immediately. For independently known viewport targets, use five-point validation and export even if collection cannot finish. Analyze head-movement error and pairing coverage alongside the eye-only prediction rather than changing sign, gain, or model acceptance thresholds blindly.

At this earlier diagnostic-only stage, the compensation formula and pupil detector were unchanged. The later mapping and validation changes are described above. A production claim remains inappropriate until independent, real-device fixed-target head-motion measurements pass.

## Research findings

| Primary source | Relevant finding | Application and limitation here |
| --- | --- | --- |
| [Browatzki, Bülthoff & Chuang (2014), Frontiers in Human Neuroscience](https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2014.00200/full) | Joint eye-in-head, head-to-eye and planar-screen calibration can combine head-mounted eye measurements with six-degree-of-freedom head pose. Their regression comparison also shows the importance of calibration movement coverage. | Jointly fit a visual ray, eye origin and screen plane. Their optical motion-tracking hardware and reported accuracy do not transfer to a webcam. |
| [Mansouryar et al. (2016), ETRA, author paper](https://arxiv.org/abs/1601.02644) | Recovering gaze from monocular pupil features involves eye origin, ray mapping and depth-dependent geometry. Their ray loss uses known 3D target positions. | Learn origin and ray mapping instead of treating an uncalibrated eye feature as a metric ray. Our jointly estimated screen differs from their calibrated eye/scene-camera setup. |
| [Combined Head–Eye Tracking for Immersive Virtual Reality (ICAT 2004)](https://www.eecs.yorku.ca/~rallison/papers/ICAT2004final.pdf) | Eye-tracker, head-to-eye and screen/world registration are separate calibration quantities. | The face center cannot simply replace the eye origin. Their independently tracked poses and measured registration are not provided by our front webcam. |
| [Velisar & Shanidze, noise estimation for head-mounted 3D binocular eye tracking](https://pmc.ncbi.nlm.nih.gov/articles/PMC11062346/) | Eye-model error, camera slippage, depth and timing alignment must be evaluated separately. Fixed-target head movement is a useful diagnostic. | Test fixed targets during six-axis motion; retain timestamps. A stationary grid fit is insufficient evidence. |
| [Tripathi & Guenter (2016), author preprint](https://arxiv.org/abs/1612.06919) | Continuous VR calibration can associate smooth-pursuit eye/object tracklets statistically. | This does not prove attention to an uncalibrated static target. Do not retrain from unknown live gaze. |
| [Zhang, camera calibration technical report](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/tr98-71.pdf) | Diverse planar-pattern views identify camera intrinsics and distortion. | Intrinsics remain unmeasured here; a physical calibration procedure is needed for a metric camera pipeline. |

These sources support the method and its limits, not a claim that the current two-camera browser system has their accuracy.

## Why the preceding model drifted

The preceding compensation rotated `[rawX, rawY, 1]`, used the face translation as the ray origin, intersected `z=0`, and fitted an affine viewport mapping. At one pose, that affine mapping could absorb eye gain, mounting offset and screen scale. Once the head moved, angular gain and origin errors became position errors. An independent forward-generated fixture reproduced this: the old fit accepted a motionless grid, but a combined held-out head pose missed a target by about 0.065 in normalized viewport distance.

A second error source was timing: the old pairing permitted 160 ms skew. At 60 degrees/second that represents 9.6 degrees of head rotation. Changing signs or smoothing the final dot cannot repair an incorrect ray or a mismatched time pair.

## Geometric candidate

The eye detector and both eye-model implementations are unchanged. Their existing two-dimensional feature `f` is centered and scaled to `z = (zx, zy)`. The learned head-local visual ray is:

```text
q = [a0 + a1*zx + a2*zy,
     b0 + b1*zx + b2*zy,
     1  + c1*zx + c2*zy]
```

This projective map has eight free parameters and incorporates fixed mounting orientation, gain and visual-axis offsets within this model. It is a local ray model, not a reconstruction of pupil anatomy or corneal refraction.

Given head rotation `R`, translation `t`, initial face depth `d`, and fitted head-local eye origin `e`:

```text
origin = t/d + R*e
ray    = R*q
```

The fitted screen has center `C`, orthonormal horizontal/vertical axes `U,V`, normal `N`, width `w` and height `h = w / viewportAspect`. Forward ray intersection and viewport mapping are:

```text
lambda = dot(C - origin, N) / dot(ray, N)
P      = origin + lambda*ray
u      = 0.5 - dot(P - C, U)/w
v      = 0.5 - dot(P - C, V)/h
```

Normalization of `ray` is unnecessary because intersection is invariant to positive ray scale. Parallel, backward and nonfinite intersections return no gaze. The head-camera frame may be reflected by input controls; separate plane-orientation initializations cover those configurations. Preview transforms never mirror the resulting viewport point.

The total model has 18 parameters: eight ray parameters, three eye-origin coordinates, three screen-center coordinates, three screen angles and logarithmic screen width. A bounded Levenberg–Marquardt fit minimizes paired normalized-screen residuals. Finite-difference Jacobians are checked using pivoted, reorthogonalized QR. A rank-deficient solution is rejected; optimizer damping cannot establish observability. Search bounds are numerical plausibility limits in relative face-depth units, not anatomical measurements.

## Collection and validation

Eye-only mode remains nine dots. Head mode collects the same grid near the starting pose, followed by twelve center-target holds: both sides of horizontal, vertical and depth translation, then pitch, yaw and roll. The first direction of each movement may be either sign. Subsequent guidance asks for the opposite side. A stationary head cannot complete that pass. During initial collection the mounting geometry is unknown, so the UI does not pretend to compensate arbitrary motion before the fit exists.

After the center fixation, collection and fitting both use its averaged head pose as the reference. An early preview frame must not remain the collection baseline: drift while settling onto the center could otherwise make later accepted grid points fail the fitter's neutral-pose filter.

Each fixation contributes equal total weight; up to five evenly spaced paired readings represent it. Minimum pose spans must cover all six components. The geometric candidate's final Jacobian must have rank 18; the regression candidate requires nine independent design columns. The fitting RMS per normalized coordinate must be at most 0.03. Cross-validation holds out each entire grid and movement fixation, averages individual squared errors, and rejects overall RMS target distance over 0.03 or any fixation RMS over 0.06. These are consistency gates, not angular accuracy or a probability that gaze is correct. Independent five-dot validation measures viewport pixel error without selecting samples for agreement with the prediction.

A separate worker fits the model so either camera can continue processing. Cancellation, source changes, viewport changes and unmounting terminate or disregard pending fits. Live output is restricted to measured component ranges with a 15% span margin. It is not a proven safe volume for every combination of those components.

The fitting response distinguishes invalid samples, insufficient movement coverage, unobservable or inconsistent geometry, and failed held-out accuracy. Completing the collection sequence does not guarantee the head model meets those checks. When only the head fit fails, the independently validated nine-dot screen mapping is retained in explicit eye-only mode. The user can retry the twelve head holds without repeating those nine dots; changes to the eye model, camera orientation, source or viewport invalidate the retained grid. Invalid gaze grids still fail, and none of the geometric or accuracy gates are relaxed. A capture can submit its completed samples only once, including across camera-state effect restarts.

## Timing

A short eye-frame buffer waits for bracketing head poses. Translation interpolates linearly; rotations interpolate as quaternions. Brackets must be at most 80 ms, adjacent rotations at most 0.35 radians, and the eye reading at most 350 ms old. There is no head-pose extrapolation. Direct pairs are limited to 25 ms skew.

Where supported, both video adapters retain `captureTime`; otherwise they use presentation time or read time. The [video-frame callback specification](https://wicg.github.io/video-rvfc/) distinguishes these timestamps and describes capture timestamps as best effort for camera sources. Browser interpolation is not hardware synchronization. MJPEG capture/exposure delay is unknown, so a buffered ESP32 stream can still drift dynamically even with correct geometry.

## Checks and remaining acceptance work

Automated tests independently generate pupil features from an offset eye origin, a tilted screen and a nontrivial eye-feature mapping. They cover translation, depth, pitch, yaw, roll, combined held-out motion, input mirrors, small noise, stationary-data rejection, repeated-frame rejection, bad fixation rejection, pose matrix validity, timestamp interpolation and camera lifecycle. The fixture does not use the implementation's ray intersection to generate its truth. Passing those tests verifies model and integration behavior under their assumptions, not measured user gaze accuracy.

Before sale, measure the actual camera intrinsics/distortion, compare face poses to an independent six-degree-of-freedom reference, measure both cameras' exposure timing/latency, and test gaze on unseen targets and complete unseen head trajectories. Report angular bias, median/p95 error, jitter, latency and valid-output fraction across distances, lighting, users and remounts. Test prolonged use, headset slippage, camera reconnect and network buffering. A calibrated rigid marker on the head-mounted camera can provide a more verifiable pose reference than a generic face model; it is not implemented here.

The [MediaPipe face geometry documentation](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/face_mesh.md#face-transform-module) states its canonical-face and virtual-camera assumptions. The current pose source remains approximate. Joint fitting can absorb fixed model offsets, but cannot guarantee a metrically correct head transform, arbitrary head motion or commercial readiness from an uncalibrated webcam. No live gaze is silently used to change the calibration.
