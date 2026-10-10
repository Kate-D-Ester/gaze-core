# Head compensation: research and implementation

**Current status, 9 October 2026:** consumer head-motion accuracy is still unproven, and the reported physical drift is not solved by passing fixture tests. The [latest architecture audit](#head-compensation-architecture-audit--2026-10-09) distinguishes confirmed software repairs from the measured geometry and estimator work still required. Earlier implementation entries are history, not a production accuracy claim.

The [forward stability review](#forward-stability--2026-10-09) supersedes the
mistaken baseline rollback. The newer remote route is active; origin/v3 is a
comparison benchmark. Physical accuracy and metric distance compensation remain
unverified, and the inactive 3D prototype must not be described as deployed.

The latest [uncertainty/perimeter/rotation follow-up](remote-eye-tracking-v3.md#uncertainty-perimeter-and-rotation-follow-up--9-october-2026)
adds a measured camera-plane IR candidate while preserving accepted mappings and
the near-eye ray/plane formula. Independent combined-rotation fixtures pass, but
the newest webcam export still does not qualify a motion candidate. Neither an
error bubble nor perimeter target placement establishes physical compensation.
[Tobii's disclosure](https://patents.google.com/patent/EP3557377B1/en) describes
gaze direction, depth and camera/screen geometry; [Pupil Labs' terminology](https://docs.pupil-labs.com/core/terminology/)
distinguishes eye-camera and world-camera coordinates and camera intrinsics.
Those quantities must be measured or validated, rather than assumed from
ordinary face landmarks. No additional inference, camera or calibration stage
was introduced in this follow-up.

Current checkout: `v3`. The [8 October 2026 audit](#8-october-2026-audit-across-camera-setups) below covers near-eye and remote tracking. The audit itself changed documentation only. Subsequent authorized software changes and outstanding device measurements are recorded in the [implementation ledger](#implementation-ledger). Pupil extraction is unchanged. Nothing was committed or pushed.

The [patent review](#patent-and-product-review-8-october-2026) and [consumer calibration plan](#consumer-calibration-implementation-plan) extend that audit. The original plan and its execution status are separate: an unchecked planning item is not an accuracy claim. The plan is kept in this existing document so it remains alongside the research without creating a separate project.

The earlier sections record implementation history, including earlier reports of poor compensation. Automated geometric checks do not establish physical device or commercial accuracy.

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

At that stage, the physical setup still performed poorly. Workflow fixes and passing mathematical fixtures did not establish the cause of that device-level failure or demonstrate accurate head compensation.

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

| Primary source                                                                                                                                                         | Relevant finding                                                                                                                                                                                                                     | Application and limitation here                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Browatzki, Bülthoff & Chuang (2014), Frontiers in Human Neuroscience](https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2014.00200/full) | Joint eye-in-head, head-to-eye and planar-screen calibration can combine head-mounted eye measurements with six-degree-of-freedom head pose. Their regression comparison also shows the importance of calibration movement coverage. | Jointly fit a visual ray, eye origin and screen plane. Their optical motion-tracking hardware and reported accuracy do not transfer to a webcam.                                 |
| [Mansouryar et al. (2016), ETRA, author paper](https://arxiv.org/abs/1601.02644)                                                                                       | Recovering gaze from monocular pupil features involves eye origin, ray mapping and depth-dependent geometry. Their ray loss uses known 3D target positions.                                                                          | Learn origin and ray mapping instead of treating an uncalibrated eye feature as a metric ray. Our jointly estimated screen differs from their calibrated eye/scene-camera setup. |
| [Combined Head–Eye Tracking for Immersive Virtual Reality (ICAT 2004)](https://www.eecs.yorku.ca/~rallison/papers/ICAT2004final.pdf)                                   | Eye-tracker, head-to-eye and screen/world registration are separate calibration quantities.                                                                                                                                          | The face center cannot simply replace the eye origin. Their independently tracked poses and measured registration are not provided by our front webcam.                          |
| [Velisar & Shanidze, noise estimation for head-mounted 3D binocular eye tracking](https://pmc.ncbi.nlm.nih.gov/articles/PMC11062346/)                                  | Eye-model error, camera slippage, depth and timing alignment must be evaluated separately. Fixed-target head movement is a useful diagnostic.                                                                                        | Test fixed targets during six-axis motion; retain timestamps. A stationary grid fit is insufficient evidence.                                                                    |
| [Tripathi & Guenter (2016), author preprint](https://arxiv.org/abs/1612.06919)                                                                                         | Continuous VR calibration can associate smooth-pursuit eye/object tracklets statistically.                                                                                                                                           | This does not prove attention to an uncalibrated static target. Do not retrain from unknown live gaze.                                                                           |
| [Zhang, camera calibration technical report](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/tr98-71.pdf)                                          | Diverse planar-pattern views identify camera intrinsics and distortion.                                                                                                                                                              | Intrinsics remain unmeasured here; a physical calibration procedure is needed for a metric camera pipeline.                                                                      |

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

## 8 October 2026 audit across camera setups

### Recommendation and scope

The strongest practical direction is calibrated eye/head geometry followed by a small personal correction, evaluated during fixed-target head movement. This is an engineering synthesis of the sources below, not a paper's claim that one method is best on every device. A better display filter cannot repair a biased gaze ray, an incorrect eye origin, or a misregistered screen plane.

This pass reviewed primary papers and their author implementations, inspected both current pipelines, and ran independent mathematical probes. It did not collect a physical-camera recording or establish the cause of the user's latest drift. The existing pupil measurements and successful FPS experiments remain unchanged.

In this repository, the SCREEN route uses the near-eye pipeline with an optional separate head camera. Webcam and mobile remote tracking share the RGB remote pipeline; full-face IR uses measured binocular pupils with the shared remote calibration. They share the physical compensation principle, but their measurement adapters and current mappings differ.

| Setup                                       | Suitable approach                                                                                          | Main missing evidence or measurement                                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Head-mounted near-eye camera, screen target | Eye-to-head visual ray, independently referenced head pose, screen-plane intersection, personal residual   | Front-camera intrinsics and trustworthy head pose, eye-to-mount registration, exposure alignment, motion coverage, wearing stability |
| Remote webcam looking at the face           | Calibrated face/eye normalization and camera-frame gaze estimation, screen registration, personal residual | Camera/screen geometry, credible eye origins, independent gaze-versus-head variation                                                 |
| Remote mobile camera                        | Same remote principle with device-specific camera/screen registration and orientation handling             | Intrinsics after capture cropping/rotation, device pose if the phone moves, mobile inference budget                                  |
| Remote full-face IR camera                  | Binocular geometric or learned ocular directions; calibrated PCCR if illuminators/glints are available     | Roll-dependent ocular mapping, IR-valid face/eye measurements, camera/screen geometry; illumination geometry for PCCR                |

One visible eye can still produce a screen estimate under appropriate calibration. Seeing both eyes does not automatically provide calibrated depth, binocular vergence, or accurate compensation. A close-up IR camera with only an eye reference is also not the same measurement system as a full-face IR camera.

### Physical coordinate model

Your two-spheres analogy captures the important rotation relationship. The implementation also needs the eye's origin, head translation, camera registration and screen position. When the head rotates while fixating a stationary point, the eye rotates relative to the head; the screen-frame visual ray should continue intersecting that point.

For a near-eye camera, define eye-camera frame E, rigid head/mount frame H, and screen frame S. R_AB rotates directions from B into A, and t_AB translates origins:

```text
origin_H = R_HE * origin_E + t_HE
direction_H = R_HE * direction_E

origin_S = R_SH * origin_H + t_SH
direction_S = R_SH * direction_H

lambda = dot(screenPoint - origin_S, screenNormal)
         / dot(direction_S, screenNormal)
gaze_S = origin_S + lambda * direction_S
```

Translation changes the ray origin; rotation changes its direction and the rotated eye-origin offset. Only positive, nonparallel intersections are valid. The screen's physical axes then map the intersection to pixels. These quantities must share a coordinate convention and measurement time. Reversing a displayed mirror is not a substitute for camera registration.

For a remote estimator that already predicts a camera-frame visual ray, apply camera-to-screen registration directly. Do not apply head rotation twice. The current BlazeGaze base prediction is a two-dimensional screen estimate, not a calibrated three-dimensional eye-in-head ray; it cannot be rotated using this formula without changing the estimator contract.

For a head-mounted SCENE camera, a fixed world object changes image coordinates as the camera turns. Its gaze overlay should follow that object's image position. Holding the overlay at constant scene-image pixels would be wrong. A stable screen/world coordinate needs a registered target plane or scene geometry, in addition to eye-to-scene registration.

### Primary research and transfer limits

| Primary source                                                                                                                                                                                                      | Relevant contribution                                                                                                               | Application limit                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Browatzki, Bülthoff & Chuang, 2014](https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2014.00200/full)                                                                                | Compares jointly calibrated geometric and Gaussian-process mappings for head-mounted gaze during movement.                          | Their independent motion tracker is not an uncalibrated face webcam. Their use of “mobile” means a wearable setup, not a phone.                                                                                     |
| [Mansouryar et al., ETRA 2016](https://arxiv.org/html/1601.02644)                                                                                                                                                   | Maps monocular pupil features to rays with an estimated origin; known 3D targets at multiple depths address parallax.               | Eye and scene intrinsics were calibrated. One-plane labels do not establish a depth-independent eye-to-scene model.                                                                                                 |
| [Zhang, Sugano & Bulling, ETRA 2018](https://www.collaborative-ai.org/publications/zhang18_etra.pdf)                                                                                                                | Canonicalizes eye appearance using camera/head geometry; distinguishes scaled image warping from rotation-only gaze transformation. | Requires camera parameters, usable head geometry and matching training/inference normalization.                                                                                                                     |
| [Park et al., ETRA 2018](https://www.perceptualui.org/publications/park18_etra/)                                                                                                                                    | Uses learned eye-region landmarks for gaze estimation and model fitting beyond a pupil-center measurement.                          | Strong pupil tracking alone does not validate canthus localization, eyeball geometry or a face model on IR images.                                                                                                  |
| [Dierkes, Kassner & Bulling, ETRA 2018](https://www.collaborative-ai.org/publications/dierkes18_etra.pdf)                                                                                                           | Examines a monocular 3D eye model including corneal refraction and the systematic bias of models that omit it.                      | Refraction-aware fitting needs camera/contour evidence; it is a future eye-model option, not a reason to alter the pupil detector in this pass.                                                                     |
| [FAZE, ICCV 2019](https://openaccess.thecvf.com/content_ICCV_2019/html/Park_Few-Shot_Adaptive_Gaze_Estimation_ICCV_2019_paper.html)                                                                                 | Rotation-aware representations and meta-learning personalize gaze from a small number of labelled examples.                         | Personal adaptation does not recover missing screen registration or head translation. Its pretrained model/input pipeline is not a direct replacement for ours.                                                     |
| [Gaze360, ICCV 2019](https://gaze360.csail.mit.edu/iccv2019_gaze360.pdf)                                                                                                                                            | Learns 3D gaze and uncertainty with temporal context across a broad range of poses.                                                 | Direction estimation in unconstrained scenes is not a demonstration of precise screen pointing on our cameras.                                                                                                      |
| [Chen & Shi, WACV 2020](https://openaccess.thecvf.com/content_WACV_2020/html/Chen_Offset_Calibration_for_Appearance-Based_Gaze_Estimation_via_Gaze_Decomposition_WACV_2020_paper.html)                              | Separates a learned gaze component from personal angular bias for lightweight calibration.                                          | A constant bias corrects one error class; it cannot fix wrong ray origins or pose-dependent gains.                                                                                                                  |
| [ETH-XGaze, ECCV 2020](https://arxiv.org/abs/2007.15837)                                                                                                                                                            | Provides calibrated multi-view data and evaluation across large pose and gaze ranges.                                               | Camera-relative pose diversity is not automatically a fixed-target moving-head test; cross-dataset transfer must be measured.                                                                                       |
| [EVE, ECCV 2020, author implementation](https://github.com/swook/EVE)                                                                                                                                               | Combines binocular appearance, temporal information and screen context in video gaze estimation.                                    | The authors identify camera calibration and stable patch extraction as additional deployment requirements. Screen-context refinement cannot substitute for measured gaze accuracy.                                  |
| [Niehorster et al., 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7280360/)                                                                                                                                        | Measures how headset slippage changes actual eye-tracker accuracy.                                                                  | Head-to-world motion and headset-to-eye motion are separate disturbances. Their results concern specific devices and conditions.                                                                                    |
| [Xia et al., Sensors 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9231356/)                                                                                                                                       | Combines estimated eye/camera centers with a direction mapping and efficient recalibration after changed wearing position.          | Their reported roughly 1.3–1.4 degree errors used two eye cameras, two scene cameras, a 6D tracker and calibrated transforms; those numbers are not browser-camera accuracy predictions.                            |
| [Bao et al., CVPR 2022](https://openaccess.thecvf.com/content/CVPR2022/papers/Bao_Generalizing_Gaze_Estimation_With_Rotation_Consistency_CVPR_2022_paper.pdf)                                                       | Uses consistency between image rotation and predicted gaze rotation for domain adaptation.                                          | This is a training constraint, not evidence that rotating a live 2D gaze dot corrects physical head motion.                                                                                                         |
| [Jin, Dai & Nguyen, CVPR GAZE workshop 2023](https://openaccess.thecvf.com/content/CVPR2023W/GAZE/papers/Jin_Kappa_Angle_Regression_With_Ocular_Counter-Rolling_Awareness_for_Gaze_Estimation_CVPRW_2023_paper.pdf) | Accounts for ocular counter-roll when estimating personal visual-axis correction.                                                   | Making an eye image upright does not eliminate anatomical eye torsion. Geometric roll restoration is a necessary coordinate operation, not a complete physiological eye model.                                      |
| [UniGaze, WACV 2026, author implementation](https://github.com/ut-vision/UniGaze)                                                                                                                                   | Large-scale pre-training improves gaze generalization across datasets.                                                              | Released B/L/H models use a different PyTorch pipeline; phone-browser speed is unestablished. The repository explicitly lists a noncommercial model license, so the published weights are not a commercial drop-in. |

For remote normalization, Zhang et al. retain the image warp W = K_normal * S * R * inverse(K_camera), but transform gaze direction using R, without the depth scaling S. Inverse rotation restores the predicted direction. This does not mean removing distance terms from our screen-position regression: screen intersections still depend on origin and distance.

For IR hardware with identifiable corneal reflections, [Guestrin & Eizenman, 2006](https://pubmed.ncbi.nlm.nih.gov/16761839/) establishes calibrated PCCR observability conditions. More illuminators can supply geometric constraints, but arbitrary reflections or two visible eyes are not calibrated PCCR measurements.

An IMU can improve orientation timing if rigidly attached and registered to the tracked assembly. It does not independently measure absolute head translation. [VINS-Mono, 2018](https://arxiv.org/abs/1708.03852) illustrates the additional visual, inertial, registration and initialization requirements for metric motion estimation. A phone IMU tracks the phone, not a separately moving user's head.

### Findings in the current code

The relative paths below start at frontend/apps/web/src/.

| Confirmed code finding                                                                                     | Location                                                                         | Consequence                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Near-eye regression is additive in two eye features and six head components.                               | features/eye-tracking/head-tracking/head-pose-mapping.ts:18                      | It cannot represent eye gain varying with pose or the complete mixing of ocular axes under roll. The separate geometric candidate can represent these effects when its measurements satisfy its assumptions.                                 |
| Near-eye extra head calibration consists of twelve center holds; motion during a hold is restricted.       | features/eye-tracking/calibration-session.ts:138 and :334                        | Center compensation does not establish peripheral fixations during motion, or coverage of combined rotations and translations.                                                                                                               |
| Near-eye live support is an independent-axis box with a 15% span margin.                                   | features/eye-tracking/head-tracking/head-calibration.ts:46                       | A combination can pass although that joint pose was never observed. Numerical rank and fixation holdouts do not remove this coverage gap.                                                                                                    |
| The head worker uses MediaPipe face geometry without measured camera intrinsics.                           | features/eye-tracking/head-tracking/head.worker.ts:44                            | A valid matrix is not evidence of accurate metric 6DoF. Similarity-scale removal and column-major handling are already correct; arbitrary sign changes lack justification.                                                                   |
| Remote extended calibration repeats the grid but prompts only nearer/farther movement.                     | features/remote-eye-tracking/calibration-overlay.tsx:80 and :180                 | It can finish without observing independent yaw, pitch, roll or X/Y variation at a fixed target.                                                                                                                                             |
| Full-face IR expresses pupils in the canthus basis, then adds roll only as an independent feature.         | features/remote-eye-tracking/ir-face-features.ts:129 and :149                    | The fit lacks roll-dependent mixing of both ocular coordinates back into camera/screen axes. RGB also has incomplete explicit mixing, but its pretrained base prediction may already compensate; the IR probe does not prove an RGB failure. |
| Remote apparent distance uses cos(yaw)/faceScale.                                                          | features/remote-eye-tracking/face-perspective.ts:33                              | This is a useful weak-perspective feature, not measured Z. Off-axis perspective, eye-depth differences and facial-model error remain.                                                                                                        |
| Near-eye displayed validation averages paired predictions before computing target error.                   | features/eye-tracking/calibration.ts:154; screens/eye-tracking-workspace.tsx:304 | Its number measures fixation-centroid accuracy. It can hide jitter or opposing errors; head-fit cross-validation already squares individual errors correctly.                                                                                |
| Remote validation excludes unsupported poses and skipped predictions.                                      | features/remote-eye-tracking/calibration-overlay.tsx:119; calibration.ts:327     | Accepted-sample error needs an accompanying output/rejection rate and motion coverage. The nearest-sample support guard is useful, but does not prove compensation within its allowed margin.                                                |
| Network eye frames are timestamped at JPEG arrival; slippage correction estimates image-plane translation. | features/eye-tracking/network-camera.ts:233; eye-slippage.ts:55                  | Interpolated head poses cannot recover unknown exposure delay. Mount rotation/depth change is a separate limitation from head rotation.                                                                                                      |

These findings narrow what to investigate. They do not identify the exact contribution of each source in the user's latest physical recording.

### Independent probes

The probes used current exported feature and calibration functions in inline Bun executions; no product files were changed.

**Roll representation:** a forward-generated, first-order binocular IR fixture used a 3 by 3 target grid, rolls of -0.35, 0 and +0.35 radians, and three frames per target/roll. Canthi rotated with the head. Ocular offsets were 0.2 * Rz(-roll) * (target - 0.5), and pupil pixels were rendered in the rotated canthus axes. Depth, head translation, yaw and pitch were fixed. The existing 29-feature fit accepted 81 samples, regularization 0.01, and whole-target CV error 0.174503.

| Held-out target [0.3, 0.7] | Current normalized distance error | Equivalent pixels on a 1000 by 1000 viewport |
| -------------------------- | --------------------------------- | -------------------------------------------- |
| Roll 0                     | 0.01149                           | 11.5                                         |
| Roll +/-0.175 radians      | About 0.04977                     | 49.8                                         |
| Roll +/-0.35 radians       | About 0.09716                     | 97.2                                         |

All predictions passed current pose support. The symmetric off-center target produced the same errors. This isolates a representation limitation under the fixture assumptions; it is not measured IR-device performance and does not model corneal refraction or ocular torsion.

A second inline experiment restored both ocular axes using qx = cos(roll)*u - sin(roll)*v and qy = sin(roll)*u + cos(roll)*v. A compact 14-feature representation and an append-only 33-feature comparison both reduced held-out errors under the same acceptance gates. The compact candidate's normalized errors were 0.000008019 at zero roll, 0.000034855 at +/-0.175 radians, and 0.000068055 at +/-0.35 radians; CV error was 0.000117282. The append-only result was similar, isolating paired roll mixing rather than merely removing features.

These very small values arise from the deliberately noiseless, exactly representable linear fixture. They are feasibility evidence, not achievable user accuracy. This experiment did not modify application features, validate yaw/pitch/depth, or rotate the pretrained RGB base prediction.

**Head/gaze confounding:** a second IR fixture held every pupil/canthus offset at zero and moved head image position in proportion to each target. The fit was accepted with CV error 0.00003548 and interpolated an unseen target almost perfectly using head position alone. Whole-target CV therefore cannot distinguish true ocular compensation from target-correlated head movement. This is an identifiability problem in the collected data, not evidence that the detector fabricated pupils.

**Validation cancellation:** near-eye head predictions [0.48, 0.5] and [0.52, 0.5] for target [0.5, 0.5] report zero centroid error although per-reading RMS is 0.02, or 38.4 horizontal pixels at 1920 width. That variation is below the collector's 0.025 stability limit. Report centroid bias, per-reading error and jitter separately.

### Implementation sequence

1. **Make measurements and acceptance honest.** Extend the existing diagnostic/export and validation paths with per-reading signed error, RMS, p95, bias, jitter, valid-output fraction and rejection reasons. Preserve raw pre-filter, pre-clamp predictions. Record timestamp provenance and the slippage state. Compare compensated and eye-only predictions on the same known fixations.
2. **Collect independent gaze/head variation.** Retain normal gaze calibration, then use a few known center and peripheral fixation anchors while the user makes comfortable head movements. Record pose coverage during each labelled fixation and fixed-pose gaze variation. Reserve complete motion trajectories and later sessions for validation. A target label is valid only while the user follows that target; stability alone cannot prove attention. Preserve good samples and ask only for missing coverage rather than discarding an entire calibration.
3. **Trial a compact roll representation.** First test paired sine/cosine mixing of both measured ocular axes into verified camera coordinates. Put shared ocular transformations in the remote feature layer, leaving pupil extraction unchanged. Use ablations to avoid simply increasing the feature bank. Test RGB with informative and biased base predictions, since a pretrained 2D screen estimate must not be treated as a 3D ray.
4. **Improve pose and screen registration.** Calibrate camera intrinsics/distortion at the actual capture configuration; account for cropping, rotation and principal-point changes. Register the screen's physical plane and camera offset. A fixed calibrated front camera observing a known-size rigid marker on the near-eye mount provides a practical reference for testing face-pose bias. A calibrated PnP face model is another option, but person-specific geometry remains uncertain.
5. **Use geometry plus a small residual.** Feed synchronized eye/head measurements through one ray/plane core. Keep camera-specific extraction and normalization adapters. Fit a regularized personal angular bias or small pose-conditioned residual only where independent data demonstrate an improvement. Do not update calibration from unknown live gaze or let a residual conceal an incorrect reference frame.
6. **Measure timing and slippage independently.** Test direction reversals and slow displaced holds. Delay primarily produces motion-dependent error; an offset remaining after settling requires investigation of geometry, mapping or mounting. If the mount rotates or changes eye distance, re-estimate registration or request a short labelled correction; a constant X/Y correction cannot generally fix changed angular gain.

Reuse the existing geometry, pairing, diagnostic and calibration modules rather than adding a second tracker service. Camera adapters should supply a common timestamped pose/ray contract, with all contracts in mirrored .types.ts files. Pure numerical math, validation metrics and small residual fitting can be shared; head-pose measurement and RGB/IR model preprocessing must remain adapter-specific.

The current BlazeGaze preprocessing contract should stay intact during these experiments. A normalized-eye 3D estimator needs matching training/inference inputs and an explicit new adapter. A newer research checkpoint alone cannot supply missing calibration; a large transformer may also erase the mobile FPS gains. Profile capture, face inference, gaze inference and end-to-end delay on the Redmi Note 8 and Poco F6 before selecting any replacement.

### Physical acceptance

Use stationary known targets at the center and periphery, including points absent from calibration. Test yaw, pitch, roll, X/Y/Z motion separately, then coupled motions, occlusion, distance changes, remounting and a later session. Include both moving and settled intervals. Record every attempted observation so low error cannot be achieved by silently excluding difficult poses.

Report raw and displayed error separately, with per-pose median/p95, signed bias, jitter, valid-output fraction, end-to-end latency and recovery. Angular error requires measured eye/screen geometry; CSS-pixel error alone is not angular accuracy. An independent pose reference is needed to separate face-pose error from gaze-model error.

Successful synthetic probes and unit tests justify bounded experiments. They do not establish arbitrary-motion accuracy, a replacement for specialist hardware, or commercial readiness. No physical acceptance test was performed in this research pass.

Audit verification: six existing remote feature/calibration/collector test files passed, 50 tests and 362 assertions, using local Bun 1.3.14. The current and candidate roll probes, head-only confounding probe, and near-eye centroid-cancellation probe were rerun independently. This is targeted audit evidence, not a new full application build or a device benchmark.

## Patent and product review: 8 October 2026

### Scope and interpretation

Read selected public disclosures, their independent claims where accessible, and official product documentation. The selection concerns reusable personal calibration, head motion, eye-camera displacement, and low-effort correction. It is not an exhaustive portfolio search or a freedom-to-operate opinion. A disclosure is evidence of a proposed method, not proof that a particular retail product implements it or achieves its accuracy.

Patent rights concern claimed methods and combinations, not just copied source code. Independently writing software does not by itself avoid a patent. Before commercialization, review relevant claims, related applications, ownership and current legal status in intended sales jurisdictions, including India. Do not treat Google Patents' inferred status as clearance. The [USPTO explains the territorial right to exclude and the distinction between owning a patent and being free to practice an invention](https://www.uspto.gov/patents/basics/manage).

### Tobii disclosures

| Publication                                                                                                                                    | What was read                                                                                                                                                                                                | Engineering implication for this project                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US12250463B2 — Dynamic camera rotation calibration](https://patents.google.com/patent/US12250463B2/en)                                        | Claim 1 detects multiple glints, projects known illuminator positions, compares expected and observed angular positions, and corrects the camera model.                                                      | Camera-to-eye registration can change separately from head-to-screen pose. This particular method requires suitable known illuminators and measured glints; a normal RGB webcam or unidentified reflections do not provide that reference.                                                                                 |
| [US10867252B2 — Continuous calibration based on pupil characteristics](https://patents.google.com/patent/US10867252B2/en)                      | Claim 1 constructs pupil-center versus limbus-center offset as a function of pupil size.                                                                                                                     | Lighting-related pupil changes are another error source, distinct from head rotation. Current reliable limbus measurements are not established, so adding a pupil-size correction would be speculative and is outside the requested detector-preserving scope.                                                             |
| [US10528131B2 — Method to reliably detect correlations between gaze and stimuli](https://patents.google.com/patent/US10528131B2/en)            | Claim 1 associates eye sequences with interface events, constructs trial personal parameters using at least four interaction observations, and checks projected inliers/outliers before accepting an update. | Interaction labels need verification. An ordinary click is not reliable proof of fixation. Start with explicit correction mode and known targets; leave passive interaction-based retraining out of the initial implementation.                                                                                            |
| [US12293017B2 — Method and system for guiding a user in calibrating an eye tracking device](https://patents.google.com/patent/US12293017B2/en) | Claim 1 relates scene-camera and remote-display coordinates, places a directional marker at an estimated gaze point, and updates it with direction/distance as head or display position changes.             | This is a specific feedback and registration combination, not a general guarantee of automatic head compensation. Flag it for claim review before adding gaze-positioned directional guidance to the scene workflow. The existing fixed calibration target is a different design choice, without implying legal clearance. |

Also read [US20220137704A1 — Gaze tracking using mapping of pupil center position](https://patents.google.com/patent/US20220137704A1/en). Its description separates the calibrated pupil mapping from correction for headset relocation, including using a geometric estimate as a reference. This supports investigating separate personal and mounting states. It is an application publication; the related grant US11681366B2 was identified, but retrieval of its complete claims failed in this pass. No claim-scope conclusion is drawn from the application's description.

### Pupil Labs disclosures

| Publication                                                                                                                             | What was read                                                                                                                                                                                                                                    | Engineering implication for this project                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US12154383B2 — Methods, devices and systems for determining eye parameters](https://patents.google.com/patent/US12154383B2/en)         | Claim 1 uses known camera intrinsics and a pupil ellipse to recover a 3D circle orientation/center line, then shifts the line using an expected pupil-to-eyeball-center distance. Dependent claims address binocular constraints and refraction. | Reliable geometric adaptation needs calibrated optics and a constrained eye model. Reusing our existing ellipse output could support a later post-detector geometry experiment, but the present image-plane center estimate is not equivalent to this 3D construction.                                                  |
| [US11556741B2 — Predicting gaze-related parameters using a neural network](https://patents.google.com/patent/US11556741B2/en)           | Claim 1 captures left/right eye images with desired gaze labels, adds them to a dataset, retrains a trained network to obtain/improve a user-specific network, and transfers that network to the device or connected unit.                       | A general model plus personal adaptation can reduce consumer work, but requires appropriate training data, input hardware and model licensing. This is not a browser-ready implementation or evidence that our one-eye rig can skip calibration. Do not add image uploads or on-device network retraining in this plan. |
| [US11194161B2 — Devices, systems and methods for predicting gaze-related parameters](https://patents.google.com/patent/US11194161B2/en) | The description discusses learned gaze prediction and optional personal correction. Granted claim 1 concerns a binocular spectacles device with specified camera placement zones; dependent claims include processing details.                   | Read the actual claim, not just the abstract: this document does not simply claim every calibration-free gaze algorithm. Hardware consistency helps a general model work, but its training and mounting assumptions cannot be transferred to our cameras by changing the UI.                                            |
| [US11537202B2 — Generating calibration data for head-wearable devices](https://patents.google.com/patent/US11537202B2/en)               | Claim 1 displays an object undergoing non-translatory movement, instructs the wearer to look at it and mimic that movement, and uses scene images to obtain eye-image gaze labels.                                                               | Labelled variation can separate eye and head contributions. That effort belongs primarily in controlled development data collection, rather than asking every consumer to perform a long pose ritual. This specific collection combination is also a claim-review item, not a recipe to copy wholesale.                 |

Official documentation provides a useful distinction between product pipelines:

- [Pupil Core's pye3d explanation](https://docs.pupil-labs.com/core/developer/pye3d/) describes short-, long- and ultra-long-term eye-position models, confidence-filtered observations, spatial support and temporal forgetting. Longer-term estimates constrain shorter-term fits, allowing mounting changes to be followed without treating all eye movement as model drift. This is geometric state estimation, not merely smoothing the final dot. It depends on the underlying 3D eye model and refraction handling.
- [Neon's offset-correction documentation](https://docs.pupil-labs.com/neon/data-collection/offset-correction/) says a wearer's constant offset can be corrected and saved in that wearer profile. That supports a small reusable personal correction; it does not establish that an arbitrary one-point correction repairs rotation, scale or near-eye slippage in our system.
- [Pupil Core's best practices](https://docs.pupil-labs.com/core/best-practices/) still distinguish slippage-sensitive 2D mapping from adapting 3D mapping and recommend independent validation. Core and Neon should not be treated as the same estimator. The [pye3d repository](https://github.com/pupil-labs/pye3d-detector) is a Python implementation with LGPL-3.0 licensing; no package or code from it is added here.

### iMotions: distinguish the platform from its webcam estimator

[iMotions Lab](https://imotions.com/blog/learning/research-fundamentals/how-does-imotions-eye-tracking-software-work/) integrates tracking hardware with calibration, validation and analysis. Its [9.3.4 release notes](https://imotions.com/products/imotions-lab/release-notes/imotions-9-3-4/) describe adjustable calibration/validation target locations for Tobii and Smart Eye. This supports keeping target layout and validation explicit, while the actual measurement capabilities depend on the tracker.

iMotions also has its own webcam estimator. The public [WebET 3.0 white-paper overview](https://imotions.com/support/document-library/imotions-webet-3-0-white-paper/) describes pretrained deep models, personal nonlinear RBF regression and mapping to screen coordinates. The original download was inaccessible during the 8 October review. The authors' [full white paper](https://www.researchgate.net/publication/372236593_Webcam_Based_Eye_Tracking_-Whitepaper_v3) was read during the 9 October audit below; the published method does not supply the trained weights needed to reproduce the proprietary estimator.

The accessible [WebET validation study](https://imotions.com/wp-content/uploads/2025/03/iMotions-WebET-3.0-Validation-Study-june-2023.pdf) used 13-point calibration at the beginning and end, with inter-stimulus calibration points and separate validation locations. Its methodology therefore does not prove a three-point, calibration-once consumer flow. A small nonlinear residual is worth benchmarking against our current ridge mapping, but RBF complexity should be added only if independent recordings support it.

Read [US8986218B2 — Calibrating and normalizing eye data in emotional testing](https://patents.google.com/patent/US8986218B2/en), in the family of US20100010370A1. Independent claim 1 concerns scrambled-pixel conditioning stimuli, subsequent test stimuli, and eye-data-based emotion analysis; fixation indicators appear in dependent claims. This does not disclose a general six-degree-of-freedom head-compensation solution. The separate emotion-analysis application US20070066916A1 was also inspected; it is not evidence of the current WebET implementation. These are selected documents, not a conclusion that iMotions has no other relevant rights.

### Resulting design decisions

These are engineering recommendations inferred from the sources and the code audit, rather than statements about proprietary product internals:

1. Separate **device geometry**, **personal calibration**, and **session alignment**. Save the first two when supported; treat changed placement and mounting as new session evidence.
2. Reduce the parameters a consumer must identify. A few fixations can estimate a small bias or residual over an already valid model; they cannot identify our current unconstrained 18-parameter ray model reliably.
3. Resolve head compensation and eye-camera slippage separately. Preserve the pupil detector. Do not hide either error by enlarging the bubble or increasing smoothing.
4. Validate reuse rather than requiring routine full recalibration. Keep compatible profiles and good targets; repair only failed evidence. A temporary frame drop pauses collection, rather than erasing a profile.
5. Avoid forced extreme poses. Diverse head/gaze measurements belong in development and acceptance testing. The regular consumer flow should use comfortable targets and ordinary head posture.
6. Do not silently learn from predicted gaze or every click. Explicit correction supplies a declared label, but attention is still assumed; independent checks are needed for broader accuracy claims.

## Consumer calibration implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task in the current checkout. Steps use checkbox syntax. This is a planning deliverable; execution has not started.

**Goal:** Reuse compatible personal calibration with a brief, comfortable check and targeted repair, while improving measured head-motion accuracy without regressing mobile performance.

**Architecture:** Existing camera-specific estimators remain responsible for observations. Small shared modules handle numeric validation, compatibility, local profile envelopes and session alignment. Near-eye screen projection, scene-image projection and remote appearance/IR estimation retain distinct adapters; an uncalibrated 2D prediction is never presented as a metric 3D ray.

**Tech stack:** Existing Next.js/React, TypeScript, Tailwind, browser workers, localStorage, Bun tests and current inference runtimes. No new backend service, Python integration, transformer model or training upload.

**Spec:** The consumer requirements, code audit and patent review in this document. Product intent: saved calibration, minimal return-session effort, comfortable fixation, preserved good samples and honest accuracy feedback.

### Global constraints

- Work on the current `v3` checkout. No commits, pushes, new branches or external worktrees during these experiments.
- Preserve pupil extraction, current RGB pretrained-model preprocessing, auth/API code and successful uncommitted FPS changes.
- Types belong in mirrored `.types.ts` files. No nested ternaries, dense one-liners, duplicated solvers or tracker-wide abstraction framework.
- Profile data remains local. No images, recordings, source URLs, network credentials or auth values in calibration profile payloads.
- The smaller calibration is experimental until independent device measurements pass. Do not lower fit gates or claim commercial accuracy to make completion easier.
- Do not promise automatic metric depth, arbitrary head movement or monocular scene parallax correction from unavailable measurements.

### Review focus

1. A saved profile from another camera, orientation, feature version or output space must not load as a verified mapping (Task 3).
2. Opposing errors and rejected frames must not produce a misleadingly good validation score (Task 1).
3. A noisy or interrupted correction must not overwrite a good profile; reconnecting alone must not clear it (Tasks 3–4).
4. A user moving their head at a fixed target must not train the tracker to use head direction as gaze (Tasks 2, 5 and 7).
5. A low-FPS phone must not need more time merely because collection assumes desktop frame rates, or lose the existing inference speed gains (Tasks 4, 6 and 7).

### File boundaries and dependency order

All paths below are relative to this repository. New files are proposed future implementation files, not files created by this research pass. Each logical module has a matching `.types.ts` contract; tests live under `frontend/tests`.

| Unit                        | Location                                                                           | Responsibility                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Validation metrics          | `frontend/apps/web/src/features/tracking-calibration/validation-metrics.ts`        | Score all attempted, timestamped readings in normalized coordinates and CSS pixels.           |
| Profile envelope            | `frontend/apps/web/src/features/tracking-calibration/calibration-profiles.ts`      | Validate bounded local storage and compatibility; tracker adapters own model payloads.        |
| Session correction          | `frontend/apps/web/src/features/tracking-calibration/session-alignment.ts`         | Fit/check translation or affine alignment over mapped points without changing the base model. |
| Return-session decisions    | `frontend/apps/web/src/features/tracking-calibration/calibration-reuse.ts`         | Pure state transitions for restore, check, repair, accept and cancel.                         |
| Ocular coordinate transform | `frontend/apps/web/src/features/remote-eye-tracking/ocular-axes.ts`                | Restore both measured ocular axes into a verified frame for the IR trial.                     |
| Geometry registration       | `frontend/apps/web/src/features/eye-tracking/head-tracking/camera-registration.ts` | Validate measured camera/screen transforms for the near-eye geometric candidate.              |

Order: Task 1 establishes measurement; Task 2 tests a concrete representation defect; Tasks 3–4 provide safe reuse. Task 5 is a geometry/observability gate. Task 6 can shorten first use only after that gate and model-specific tests. Task 7 decides what is ready to enable by default.

### Task 1: Make independent accuracy and availability measurable

**Files:** Create `tracking-calibration/validation-metrics.ts` and its mirror types file; test `frontend/tests/tracking-calibration/validation-metrics.test.ts`. Modify `eye-tracking/calibration.ts`, `eye-tracking/calibration-diagnostics.types.ts`, `remote-eye-tracking/calibration.ts`, their validation types, and the two workspace validation consumers under `frontend/apps/web/src`.

**Interfaces:** `evaluateValidation(readings: ValidationReading[], viewport: ValidationViewport): ValidationMetrics`. A reading has monotonic timestamp, target ID/point, raw mapped point or null, optional displayed point, rejection reason and optional experimental condition ID. Metrics contain attempted/valid counts, valid fraction, signed bias, per-reading RMS/p95, within-fixation jitter and per-target/per-condition summaries. Frame/dimension validity is explicit; unavailable scores are null, not zero. Define these contracts in `validation-metrics.types.ts`.

- [ ] Add a failing test: predictions `[0.48, 0.5]` and `[0.52, 0.5]` at `[0.5, 0.5]` have zero signed X bias but 38.4 px RMS on a 1920-wide viewport. Add nine rejected attempts to one accurate output: validity is 10%, not 100%.
- [ ] Run `bun test tests/tracking-calibration/validation-metrics.test.ts` from `frontend`; confirm the missing implementation causes failure.
- [ ] Implement finite-value and monotonic-timestamp handling; calculate error before averaging. Keep raw unclamped scoring separate from displayed scoring. Group jitter by fixation so target changes do not count as noise.
- [ ] Connect both validators to this module and retain their existing public summaries through explicit conversion. Record unsupported poses as rejected attempts rather than dropping them before scoring.
- [ ] Run the new test and existing `tests/eye-tracking/calibration-fit.test.ts` and `tests/remote-eye-tracking/calibration.test.ts`. Expected: PASS, with regression assertions for cancellation and rejection accounting.

**Checkpoint:** Numeric evidence can expose drift and missing output; no calibration acceptance thresholds have changed.

### Task 2: Correct the measured IR roll representation as a bounded experiment

**Files:** Create `remote-eye-tracking/ocular-axes.ts` and mirror types; modify `ir-face-features.ts` and its mirror types. Add `frontend/tests/remote-eye-tracking/ocular-axes.test.ts`; extend `perspective-calibration.test.ts`.

**Interfaces:** `restoreOcularAxes(offset: OcularOffset, rollRadians: number): OcularOffset | null`, with explicit X/Y numeric components. It applies both components of `Rz(roll)`: `x = cos(r)*u - sin(r)*v`, `y = sin(r)*u + cos(r)*v`. This sign convention must match the independently rendered canthus fixture and actual camera orientation.

- [ ] Add failing tests for zero, positive/negative roll, nonfinite input, mirror/rotation transforms and independently rendered rotated canthi. Preserve a separate fixture in which ocular counter-roll differs from rigid head roll.
- [ ] Run `bun test tests/remote-eye-tracking/ocular-axes.test.ts`; confirm failure before implementing the transform.
- [ ] Implement the pure transform and trial the compact 14-feature IR bank documented in the audit: four local ocular components, four camera-restored components and six pose components. Assign a new feature-version identifier; never load old coefficients into a changed bank.
- [ ] Compare it to the unchanged 29-feature baseline on identical calibration/held-out folds. Add the head-only-confounding fixture: a model fitting head-correlated targets is not accepted as evidence of compensation.
- [ ] Run the two test files. The noiseless fixture's held-out roll error must be below 0.001 normalized distance; retain real-data and counter-roll results even when worse. Do not apply this transform to the pretrained RGB `basePoint`.

**Checkpoint:** Keep the candidate opt-in. A synthetic pass justifies device trials, not a general accuracy claim.

### Task 3: Persist compatible models without destroying existing scene profiles

**Files:** Create `tracking-calibration/calibration-profiles.ts` and mirror types; add `frontend/tests/tracking-calibration/calibration-profiles.test.ts`. Create `eye-tracking/calibration-profile-adapter.ts` and `remote-eye-tracking/calibration-profile-adapter.ts`, each with mirrored types. Modify existing `scene-eye-tracking/calibration-profiles.ts`, `calibration-profile-validation.ts`, `calibration-profiles.types.ts`, `use-calibration-profiles.ts`, `screens/eye-tracking-workspace.tsx` and `screens/remote-eye-tracking-page.tsx`.

**Interfaces:** `readCalibrationProfiles(): CalibrationProfileLibrary`, `saveCalibrationProfile(profile: CalibrationProfile): void`, and `checkCalibrationCompatibility(saved: CalibrationContext, current: CalibrationContext): CalibrationCompatibility`. Use a discriminated model payload for existing `Calibration`, `RemoteCalibration` or `SceneCalibration`; avoid casting between them.

The versioned context contains tracker/mode, feature/model version, input dimensions and transform, coordinate-space ID, screen aspect/geometry registration ID when applicable, and an opaque local camera identity. The personal model and saved validation summary are separate from the current session alignment. A stored validation result describes its recorded conditions, not a current guarantee. Persist no raw sample history; keep at most 20 profiles and reject inputs above 2 MB, matching existing scene limits.

- [ ] Add failing tests for valid round trips, corrupt/nonfinite payloads, unsupported version, full/quota-denied storage, camera/feature/orientation mismatch, screen-versus-scene space mismatch, and replacement by ID with the same name.
- [ ] Run the new profile test; confirm it fails before adding the envelope.
- [ ] Implement bounded serialization and tracker-owned runtime payload validation. Migrate existing scene profiles without losing names, mappings, offsets, delay or `unverified`. Legacy data without new context remains available but requires a compatibility check; it is not silently deleted or upgraded to verified.
- [ ] Add explicit restore/save adapters to screen and remote state. A failed save or failed candidate fit keeps both the stored profile and the last accepted in-memory model. Source identity stays within the existing local preferences boundary, not diagnostic exports.
- [ ] Run the new test plus existing `tests/scene-eye-tracking/calibration-profiles.test.ts` and `calibration-profile-controls.test.tsx`. Expected: PASS; verify storage errors are visible and existing replacement behavior is preserved.

**Checkpoint:** Reload can restore a compatible model. Loading a profile alone does not mark this session accurate.

### Task 4: Add brief checks and transactional session correction

**Files:** Create `tracking-calibration/session-alignment.ts`, `calibration-reuse.ts` and mirror types; add corresponding tests under `frontend/tests/tracking-calibration`. Modify the screen/remote calibration overlays and mirror types, existing gaze-offset consumers, and the scene profile hook.

**Interfaces:** `fitSessionAlignment(samples: AlignmentSample[], method: AlignmentMethod): SessionAlignment | null`; `applySessionAlignment(point: AlignmentPoint, alignment: SessionAlignment): AlignmentPoint | null`; `advanceCalibrationReuse(state: CalibrationReuseState, event: CalibrationReuseEvent): CalibrationReuseState`. An alignment sample contains `predicted`, `target`, `targetId` and `timestamp`; points are normalized X/Y tuples in the adapter's declared output space. Methods are `translation` and `affine`; the output is a discriminated correction with its fitting/validation evidence. States are `restored`, `checking`, `repairing`, `ready`, `needs-calibration`; context changes are explicit events. Define alignment contracts in `session-alignment.types.ts` and state/event contracts in `calibration-reuse.types.ts`.

- [ ] Add failing numerical tests: one labelled point only determines translation; collinear points cannot fit an affine map; translation cannot repair a rotated/scaled grid. Add state tests: interruption pauses checks, cancellation discards the candidate, and failed validation preserves the accepted model.
- [ ] Run the two new tests; confirm failure before implementation.
- [ ] Implement translation as the target-balanced mean residual. Use existing least-squares math for affine fitting; do not create a second solver. A three-point affine fit must be checked on two additional independent targets before promotion. Apply alignment once, after base mapping and before display filtering/clamping.
- [ ] Trial three comfortable return-check positions: `[0.3, 0.35]`, `[0.7, 0.35]`, `[0.5, 0.7]`. Check the unchanged model first. For a translation candidate, fit on the first two and validate against the third; incompatible or pose-dependent errors request targeted repair, not a larger X/Y offset. Mark a one-click-only correction as unverified.
- [ ] Reuse the existing explicit correction mode and tooltips. For scene output, convert the click through the actual image-content rectangle and inverse preview transform; reject letterbox clicks. For screen output, use the overlay's CSS-pixel rectangle, not device pixels. Do not duplicate click correction handlers across trackers.
- [ ] Add UI tests for retained good targets, no reset on a brief camera interruption, and one pending callback per capture. Capture gates use elapsed time and distinct observation IDs/timestamps; duplicate render frames cannot satisfy them. Trial a 700 ms stable hold with at least four unique observations; keep it opt-in until device validation.
- [ ] Run the new tests and existing overlay, offset and scene-profile UI tests. Expected: PASS; translation and affine state cannot be confused with head compensation.

**Checkpoint:** Returning users can perform a short check and repair a confirmed session error. The flow never promises that stability alone proves attention to an uncalibrated target.

### Task 5: Establish the geometry needed to reduce head-calibration effort

**Files:** Create `eye-tracking/head-tracking/camera-registration.ts` and mirror types; add `frontend/tests/eye-tracking/camera-registration.test.ts`. Modify existing `head-pose.types.ts`, `head-ray-model.ts`, `head-model-validation.ts`, `head-calibration.ts`, `calibration-diagnostics.types.ts` and the corresponding pose-source adapters only after measurement evidence exists.

**Interfaces:** `validateCameraRegistration(registration: CameraRegistration, capture: CaptureGeometry): CameraRegistrationIssue | null`. Registration specifies calibrated intrinsics/distortion, image orientation/crop, screen plane, pose frame, metric or relative units, transform provenance and version. A missing registration is an explicit unsupported capability, never identity matrices by default.

- [ ] Add failing fixtures with known focal length, principal point, camera/screen offset and a displaced eye origin. Render a fixed world target under yaw/pitch/roll and XYZ motion independently of the compensation implementation. Include combined motions, reversed axes, timing skew, missing registration and unobserved joint poses.
- [ ] Run the new fixture test; confirm that the current unregistered or axis-box assumptions fail the designated cases.
- [ ] Implement registration validation and projected screen-plane tests. Keep input transforms distinct from preview transforms. Reuse the current ray/plane core and quaternion pairing; a saved geometry transform is only reusable for its matching device configuration.
- [ ] Measure the front camera once in development at the actual capture/crop configuration using a known calibration target. Use an independently observed rigid marker on the near-eye mount to compare face-pose bias and timing. This is a development reference experiment, not another compulsory consumer setup step.
- [ ] Keep MediaPipe canonical-face pose labelled approximate unless measurements support its use. Reject unsupported combined poses using joint coverage, not just six min/max intervals. Test settled head poses as well as moving intervals.
- [ ] Evaluate a small residual over valid registered geometry with whole-motion/session holdouts. Do not replace the current head model with an underdetermined short fit. If registration cannot be measured accurately, retain the current opt-in model or explicit eye-only fallback and report the limitation.
- [ ] Run new registration tests and existing head calibration/ray tests. Expected: known-geometry fixtures pass; missing/unobservable configurations remain rejected. Synthetic acceptance is followed by Task 7's device gate.

**Checkpoint:** This is the research dependency for comfortable near-eye head compensation. A center-only correction cannot identify missing screen, mounting and eye-ray geometry.

### Task 6: Trial fewer first-use targets only over a supported base model

**Files:** Modify existing screen `calibration-session.ts` and mirror types, remote `calibration.ts`, overlays/types and their test files. Reuse `tracking-calibration/session-alignment.ts`; keep geometry fitting separate from consumer residual fitting.

**Interfaces:** Add an explicit calibration strategy to the existing session contracts: `existing-full` or `personal-residual`. The latter requires a versioned base model and context proven by Task 5 or a separately validated remote estimator. Missing prerequisites choose `existing-full`; they do not relax its rank or fit checks.

- [ ] Add failing tests: five targets cannot silently fit the current unconstrained 18-parameter near-eye geometry; an unsupported remote feature/version cannot enter the short path; a bad target retry retains the other accepted holds.
- [ ] Run both existing overlay/session test files with the new cases; confirm failure before introducing the strategy.
- [ ] Trial five inset first-use targets: center plus `[0.2, 0.2]`, `[0.8, 0.2]`, `[0.8, 0.8]`, `[0.2, 0.8]`. Fit only a low-dimensional personal residual over the supported base model. Keep independent validation away from those locations, including comfortable points outside the fitted inner area to detect extrapolation error.
- [ ] Benchmark a compact residual against current ridge calibration; consider a bounded RBF candidate only if it improves complete held-out trajectories/sessions without lowering output coverage or FPS. Do not rotate the pretrained RGB screen prediction as a 3D vector.
- [ ] Keep the existing pill target and a fixed-height instruction region beneath it. Use concise normal-posture guidance. Remove the twelve forced head holds from the short strategy only when the base model demonstrates motion coverage; never pretend to learn six-axis compensation from five stationary fixations.
- [ ] Run existing collectors at simulated 3, 7 and 30 FPS with monotonic timestamps. Expected: progress depends on elapsed valid fixation, invalid gaps pause collection, good holds survive retries, and animation does not alter target coordinates.

**Checkpoint:** Saved-model reuse can ship before short first-use calibration. The five-target strategy stays experimental until its accuracy and coverage are measured.

### Task 7: Decide default behavior from physical acceptance results

**Files:** Create `tracking-calibration/calibration-comparison.ts` and its mirror types, with `frontend/tests/tracking-calibration/calibration-comparison.test.ts`. Extend the diagnostic report and tests from Task 1; record the experimental protocol and results in this existing research document. Numeric exports stay user-initiated and bounded; no images or identifiers are added.

**Interfaces:** `compareCalibrationRuns(baseline: CalibrationRunSummary, candidate: CalibrationRunSummary): CalibrationComparison`. Define the input and result in `calibration-comparison.types.ts`: a run contains Task 1's `ValidationMetrics`, measured sustained inference FPS, p95 inference duration and the tested condition IDs; the result contains passed/failed gates and per-condition comparisons. Missing measurements or mismatched tested conditions cannot pass. Thresholds below are experimental promotion gates, not claims of achieved performance or commercial pointer precision.

- [ ] Add comparison tests that reject a candidate with improved accepted-sample error but materially fewer valid outputs, and reject an offset that is good only at the center.
- [ ] Run `bun test tests/tracking-calibration/calibration-comparison.test.ts` from `frontend`; confirm failure before implementing `compareCalibrationRuns`.
- [ ] Implement the numerical comparison using the coverage, error and performance gates below. Run the comparison test again; expected: PASS, including unavailable/mismatched measurements and a near-zero baseline error where a relative improvement must not divide by zero.
- [ ] Test near-eye screen, head-mounted scene-image output, webcam RGB, mobile RGB and full-face IR separately. Keep unsupported eye-only IR explicit. Include normal posture, comfortable yaw/pitch/roll, translations, coupled motion, occlusion, changed lighting, remounting and a return session. A head-mounted scene target may move in image pixels while remaining stationary in the world; score the correct output space.
- [ ] Reserve entire trajectories and later sessions for evaluation; do not randomly split adjacent frames. At known fixed targets compare eye-only, unchanged compensated and candidate predictions, both while moving and after settling. Include eye movement with a still head so compensation cannot flatten real gaze changes.
- [ ] Run a pilot with at least five consenting wearers and three return sessions each, spanning at least two days. Record glasses use, comfortable-motion limits and device/browser versions with the pilot results. This is an engineering pilot, not sufficient evidence for population-wide commercial accuracy.
- [ ] On the Redmi Note 8 and Poco F6 measure warm sustained inference FPS, capture-to-output p95 delay and rejection rate for at least five minutes. Trial candidates must retain at least 90% of the FPS of the current optimized baseline on the same device/configuration and add no more than 20 ms to p95 inference delay.
- [ ] Require at least 90% valid output during the declared supported-motion test, no stationary RMS regression greater than 10%, and at least 25% reduction in fixed-target head-motion RMS versus the unchanged baseline before promoting a compensation experiment. Report p95 and every motion bin; aggregate improvement cannot hide a worsening axis. These relative gates must be accompanied by an explicit absolute error report before any commercial claim.
- [ ] Measure consumer completion and comfort rather than infer them from frame tests. Trial goals are a median first-use flow of at most 15 seconds and compatible-profile return checks of at most 5 seconds; record failures and discomfort. No mandatory extreme tilt/corner holds and no whole-grid restart for one failed hold.
- [ ] Run `bun run typecheck`, `bun run lint`, `bun test` and `bun run build` from `frontend` with the project's supported Bun runtime before enabling changes. The local audit used Bun 1.3.14, while the manifest requires at least 1.4.2; record the actual runtime rather than claiming an equivalent deployment check.
- [ ] Review patent claim combinations relevant to the selected implementation and licenses for any added model/data before commercial release. Keep unvalidated candidates opt-in, retain a usable accepted profile and document hardware-dependent limits. Do not commit or push as part of the experimental implementation.

### Plan self-review

The plan covers all four requested camera scenarios through their actual measurement adapters, with near-eye scene output distinguished from screen output. Shared code is limited to contracts, scoring, profile storage and session alignment. Each review-focus failure has a corresponding test task. The patent reading changes the design priorities without asserting private product internals or patent clearance. Initial calibration shortening remains gated on an adequate base model; profile reuse and targeted repair can be implemented independently of that research dependency.

No source implementation, new dependency, camera capture, physical benchmark, commit or push was performed while preparing this plan. The checklist above records the original plan; the execution status and deviations are recorded below.

## Implementation ledger

Plan: consumer calibration implementation plan in this document. Base commit: `48e2263`, branch `v3`. Execution authorized after the research deliverable. Existing uncommitted FPS/stability changes are preserved.

- Ruling: use the authorized existing checkout and this document as the ledger, rather than creating a worktree or separate project. No commits or pushes; the user's explicit constraints override skill defaults.
- Pre-flight: Tasks 1 and 7 share validation metrics; Tasks 3 and 4 share profile context and session alignment; Tasks 5 and 6 share the prerequisite for a short personal fit. Keep tracker-specific payload validation separate from shared storage.
- Task 1, software implemented: shared validation scores raw, unique observations rather than smoothed target centroids. Rejected attempts remain in output coverage. Reports include target-balanced mean/RMS, bias, within-fixation jitter, p95 and per-target/per-condition results. Screen and remote validation use the same scorer; numeric screen diagnostic exports include these results. No images or camera identifiers were added to exports.
- Task 2, opt-in software implemented: `Trial roll` selects the versioned 14-feature IR bank. Both ocular components are restored from eye-local axes; the original 29-feature bank remains the default and RGB model predictions are unchanged. Independent rotated-canthi fixtures compare both banks on identical target/roll folds, including held-out rolls. The candidate meets the synthetic error bound of 0.001 normalized distance. Constant zero and constant nonzero local ocular offsets with target-correlated head pose now fail the compact-bank coverage guard. This guard prevents those degeneracies; it does not establish complete causal separation of head and eye motion. Real counter-roll, yaw/pitch and device accuracy remain unmeasured.
- Task 3, software implemented: bounded local profiles support screen, webcam, mobile and full-face IR models with strict tracker-owned validators. Compatibility includes camera identity, feature version, capture dimensions, transform, viewport and eye setup. Camera identity is hashed from stable source identity, not a connection epoch. Loading a profile persists its selected ID and clears current-session accuracy. New fits cannot be silently overwritten by automatic restoration. The locked near-eye model fingerprint prevents reuse with changed eye geometry, but also means rebuilding a different eye model can require recalibration.
- Task 3 ruling: preserve the existing scene profile format and storage unchanged instead of migrating it into the new screen/remote envelope. Its established names, mappings, offsets, delay and `unverified` state remain available. The save/load UI is now shared through a compatibility re-export. No new raw pupil observations, image data, stream URLs or credentials are stored in model profiles. Bounded numeric pose-support coordinates remain part of the fitted model.
- Task 4, software implemented: compatible screen/remote models offer a three-dot return check at comfortable inset positions. A translation is fitted on two target groups and tested on the third; failed checks keep the accepted model and clear stale accuracy status. Session alignment is applied once before click offset and display filtering. Loading restores alignment and offset atomically. Short checks use elapsed stable time plus at least four unique observations; existing full-calibration holds remain unchanged. Remote camera interruption/reconnect keeps the fitted model while hiding gaze and requiring another check. Completed holds survive an in-capture retry. Existing scene click-coordinate and letterbox handling is retained. The pure reuse reducer documents and tests the transactional state contract; the current workspaces retain their existing state ownership rather than adding another state controller.
- Task 5, software implemented and hardware dependency outstanding: registration contracts validate measured capture intrinsics, units, orientation and screen plane without inventing missing registration. New near-eye head models store bounded joint pose support and reject combinations unsupported by observed poses, rather than accepting every combination inside an axis box. Existing ray/plane geometry and timestamp pairing remain in use. Registration is not connected to a newly measured camera transform: no calibrated camera/rigid-marker measurements were available during this implementation. MediaPipe pose remains approximate. This work cannot claim accurate six-axis compensation on the actual rig.
- Task 6 deviation: the five-target strategy is exposed as an opt-in **grid repair over an existing compatible calibration**, not a replacement for first-use geometry fitting. It fits an affine residual on three inset targets and tests two independent targets before applying it. Unsupported bases remain on the existing full flow; the twelve head holds were not removed without the required geometric evidence. At simulated 3, 7 and 30 FPS, short capture tests depend on elapsed unique observations and do not turn repeated rendered frames into samples. Real completion time and comfort are not measured.
- Task 7, numerical gates implemented; physical promotion pending: comparisons require matching stationary/motion conditions, per-target coverage/error, at least 90% valid output, no stationary RMS regression above 10%, at least 25% aggregate head-motion RMS improvement with no worse motion bin, at least 90% of baseline sustained FPS and no more than 20 ms added p95 inference duration. Sustained FPS is currently a run-level measurement, not a separate value for every motion condition. Physical camera measurement, five-wearer return-session trials and five-minute Redmi Note 8/Poco F6 measurements have not been performed. The trial paths remain explicit and no commercial accuracy claim is made.
- Review corrections: persisted loaded-profile selection; removed connection epochs from saved camera identity; retained models across remote page-hide/reconnect; added reactive viewport and locked-eye-model compatibility; cleared stale validation after failed checks; counted rejected validation output; prevented aggregate metrics from hiding a peripheral target regression; rejected both tested head-only IR confounders. Pupil extraction was not changed.
- Final verification, 2026-10-08: `bun run typecheck`, `bun run lint`, `bun test` and `bun run build` all passed after the recovery corrections. Complete suite: **847 tests, 0 failures, 9,818 assertions across 93 files**. The Next.js production build compiled all nine routes. Local Bun is 1.3.14 and build/typecheck used the bundled Node executable; the manifest requires Bun at least 1.4.2. A local pass does not verify that supported deployment runtime or physical hardware performance.
- Recovery regression found during the complete suite: a camera interruption preserved the model but hid the restart control by keeping the validation panel open. The camera panel now exposes restart immediately, then offers **Resume calibration check** for the retained model. The end-to-end flow verifies preserved 162-sample calibration, hidden stale gaze/accuracy, successful reconnect and a completed three-dot check; viewport changes still require recalibration.
- Final review found no remaining confirmed Critical or Important defect in the reviewed changes. Browser inspection confirmed the dark screen/remote entry views load; calibrated camera states were exercised by automated fixtures rather than a physical capture. Changed files contain no environment/credential files or files over 1 MB. Branch remains `v3` at `48e2263`; no commit, push, branch or worktree was created.

### Short first-use calibration follow-up, 8 October 2026

The original automatic fallback described in this subsection was removed by the bounded-calibration correction below. These bullets record the initial implementation and its verification, not the current retry policy.

The user requested a shorter first-use sequence without sacrificing accuracy. The software now offers an opt-in **Adaptive trial** for webcam and mobile RGB tracking. The existing full flow remains the default until physical comparisons establish whether the candidate matches its accuracy and coverage. IR and near-eye first-use geometry fitting retain their existing sequences; they do not have this supported pretrained base estimate.

- The candidate requires a finite, versioned `blazegaze-v1` base prediction, valid face pose and a consistent feature bank. It fits six affine coefficients over five personal targets: center and four inset corners. It reuses the existing least-squares solver and leaves pupil extraction, appearance inference and input preprocessing unchanged. Every personal/check dot still requires 18 unique valid camera observations.
- Four additional edge locations independently check the candidate. Acceptance evaluates raw outputs before display filtering. Every target needs at least 18 predictions, at least 90% valid output, RMS error no greater than the larger of 12 CSS pixels or 2.5% of the viewport diagonal, p95 no greater than 1.5 times that tolerance, and jitter no greater than the larger of 8 pixels or 1.5% of the diagonal. Whole-target leave-one-out fitting additionally rejects a personal residual above 0.04 normalized RMS. These are experimental absolute gates, not evidence of equivalence with the full model.
- With head movement selected, one center hold checks the existing base estimate while the wearer gently turns, tilts and leans. It requires at least 18 valid observations spanning at least two seconds, strictly increasing timestamps without a gap above 500 ms, and observed spans of 0.06 radians for each rotation, 0.02 normalized image units for X/Y and 0.06 log-scale units. The same raw accuracy and coverage gates apply. Motion coverage alone cannot pass. This hold tests modest observed movement; it does not identify a new six-axis geometric model or prove accuracy at every gaze location under every head pose.
- Passing checks promote only successfully predicted observations into bounded joint pose support. Rejected frames cannot enlarge it. Live base-point prediction uses stricter pose margins than the legacy full model and rejects unsupported combinations. Models carry their base-model version through profile save/load; wrong versions or feature banks cannot silently reuse coefficients.
- A failed personal fit or independent check collects the additional data needed for the existing full feature model. A head-check timeout keeps prior holds and adds the full head pass. Full candidates need fresh independent validation before replacing the workspace model. A rejected full check keeps the candidate and training data for another check. Failed fits offer all nine locations so invalid initial holds can be replaced, rather than becoming permanently unrecoverable.
- Retry retention is bounded by capture snapshots: recaptured neutral target groups replace older holds, and only the latest full head pass is retained separately. Neutral and motion observations both participate in the full fit and successful result. Cancelling or interrupting the trial keeps the previously accepted workspace calibration.
- Review corrections: enforced the two-second/continuous head hold in the acceptance function, including timeout paths; excluded rejected observations from pose-support promotion; bounded repeated failed fits; made bad initial holds replaceable. Regression fixtures cover raw jitter hidden by a correct centroid, stationary/short/interrupted head holds, head-dependent gaze error, automatic continuation, head timeout fallback, repeated failure cycles, profile round trips, invalid replacement preservation, click offsets and reconnect recovery.
- Device comparison remains outstanding. No real wearer accuracy, calibration comfort/completion time, return-session accuracy or mobile FPS was measured for this candidate. The trial adds no dependency, network upload, raw-sample persistence, commit or push. Physical gates from Task 7 still determine any future default promotion.
- Final software verification: **864 tests passed, 0 failed, 10,067 assertions across 94 files**. Type checking, lint and the Next.js production build passed after the review corrections. The reviewer confirmed neutral and latest motion captures both survive successful fallback, with no remaining confirmed Critical or Important finding in this scope. Changed/new files include no environment/credential paths or files above 1 MB. Local verification still used Bun 1.3.14 and bundled Node; the declared Bun 1.4.2 deployment runtime remains a separate check. Branch/HEAD remain `v3` / `48e2263`, and no Git state was changed.

### Webcam capture cancellation recovery, 8 October 2026

The user reported "Capture canceled. Keep the screen fixed and retry" during webcam calibration. Automated regressions reproduced cancellation from an unchanged-dimension resize event and from startup layout changes. The browser-specific source of the user's event has not been reproduced on their device.

- Capture now ignores resize events whose dimensions have not changed. Before any accepted samples, initial layout changes update the capture geometry and restart settling safely.
- A geometry change after sampling pauses capture instead of canceling it. Restoring the original window size resumes the current hold and retains completed dots. An explicit restart at the new size clears old-coordinate data; incompatible coordinate labels are never mixed.
- Adaptive stages and validation retain their original capture viewport. Saved-profile compatibility checks defer invalidation during capture. Ending capture checks the retained model's viewport even when camera identity or profile storage is unavailable; incompatible results return to the Calibration screen.
- Camera-driven parent renders no longer restart the adaptive fallback's collector or settling timer. Target arrays are memoized per adaptive state. Completion and timeout callbacks are terminal, so a late resize cannot revive a finished collector.
- Regression coverage includes startup settling, paused capture, restored geometry, explicit restart, adaptive stage geometry, fallback with parent renders, cancellation with and without camera identity, profile deferral and late events after completion/timeout. The final review found no remaining confirmed defect in this recovery scope.
- Final verification: **873 tests passed, 0 failed, 10,281 assertions across 94 files**. Type checking, lint, whitespace checks and the production build passed; all nine Next.js routes built. Verification used local Bun 1.3.14 and bundled Node. Physical camera accuracy and the declared Bun 1.4.2 deployment runtime remain unverified.
- Pupil extraction, dependencies and secrets were not changed for this fix. The 100 changed/new paths include no environment/credential files, dependencies or files above 1 MB. Branch and HEAD remain `v3` / `48e2263`; no commit, push, new branch or worktree was created.

### Bounded calibration and targeted recovery, 8 October 2026

The user encountered five setup dots, four additional dots, then repeated nine-dot rounds. The reducer caused this: a failed fit/check automatically entered an extended head pass; a failed full fit then offered all nine locations again. That policy contradicted the intended short consumer flow. Passing synthetic numerical tests did not establish that this interaction was acceptable or that the estimator would pass its gates on the user's device.

- The adaptive flow is now explicitly bounded: five setup dots, four independent accuracy checks and one optional center head check. It never automatically switches to the legacy feature fit, nine-point collection or another head pass. Standard calibration remains separately selectable.
- A failed five-dot fit stops with an explicit five-dot retry. A failed accuracy check stops and offers only the failed check locations. The same candidate, setup samples and other independent check readings remain intact; recaptured readings and rejected attempts replace only their matching coordinates. Target IDs are regrouped by coordinates so a one-dot retry cannot collide with a different check's ID.
- Failure is a terminal pause until the user chooses a retry or leaves. A head-check failure offers one-point retry or **Finish without head check**. The latter accepts only the previously passed stationary checks and their pose support; it excludes the failed motion data and clearly reports that head movement was not verified. Skipping cannot promote a failed positional check.
- The UI states **5 + 4**, or **5 + 4 + 1** when head checking is enabled. Brief loss of a base prediction disables Start while retaining the user's selected trial; it cannot silently launch an 18-point standard calibration. Retry starts directly from its named action without another Start click.
- The affine model, leave-one-target-out fit limit, raw per-target RMS/p95/jitter/coverage gates and unique-observation requirements were retained. Validation samples never become training data in this short flow. No claim of improved physical accuracy follows from removing the fallback; failures remain visible instead of being disguised by weaker criteria.
- Research checked for this correction: [Tobii Pro SDK calibration guidance](https://www.developer.tobiipro.com/commonconcepts/calibration.html) describes retaining calibration data and recollecting selected poor locations, with validation assessed separately. [Pupil Labs best practices](https://docs.pupil-labs.com/core/best-practices/) requires validation points distinct from training points. [He et al., ICCVW 2019](https://openaccess.thecvf.com/content_ICCVW_2019/html/GAZE/He_On-Device_Few-Shot_Personalization_for_Real-Time_Gaze_Estimation_ICCVW_2019_paper.html) reports few-shot personalization for its trained models; that result does not prove equivalent accuracy for this project's estimator. Retrying held-out checks while keeping this model unchanged is an application decision, not a claimed reproduction of those implementations.
- Regression tests reproduce automatic expansion, poor independent-check acceptance, failed-target replacement, rejected-frame accounting, bounded retry memory, optional-head support isolation, parent-render stability, retry click behavior and temporary base-prediction loss. Physical accuracy, comfort and device completion time remain to be measured.
- Final verification: **878 tests passed, 0 failures, 10,296 assertions across 94 files**. Type checking, lint and the nine-route production build passed. Independent review found no remaining issue in this flow, including sequential retries of different failed checks. The remote entry page rendered correctly in the local browser; calibration recovery states were exercised through automated DOM tests, not a physical gaze session. Local verification used Bun 1.3.14 and bundled Node; the declared deployment runtime remains a separate check. Changes remain uncommitted on `v3` at `48e2263`.

### Five-point fit rejection repair plan, 8 October 2026

**Goal:** fix reproducible false fit rejections and retain usable calibration work; do not represent a numerical fit as demonstrated accuracy.

**Architecture and scope:** retain the bounded RGB five-setup/four-check sequence and existing affine model/profile schema. Normalize the two network coordinates before QR solving and derive each target center robustly from its repeated observations. Separate numerical fit diagnostics from independent raw-frame accuracy validation. Keep pupil extraction, pretrained weights, camera pipeline, head support and other tracker flows unchanged. Current checkout only; no commits, branches, worktrees, dependencies or uploads.

**Research findings:** [WebEyeTrack](https://arxiv.org/html/2508.19544v1) personalizes its gaze MLP; its [pinned JavaScript implementation](https://github.com/RedForestAI/WebEyeTrack/blob/75fbd2f5f784f2eb3a39675a8dcbf1b01c697f1c/js/src/WebEyeTrack.ts) combines affine correction with gradient adaptation. Our frozen-output affine fit is a simpler baseline, not a reproduction of that personalization or its reported accuracy. [Hoormann et al.](https://bop.unibe.ch/JEMR/article/view/2238) identify sensitivity to calibration residuals and recommend robust regression. This motivates resisting isolated capture outliers; it does not establish a particular threshold or consumer accuracy guarantee for our camera.

**Confirmed software failures:** three new regressions fail before changes: (1) a perfectly responsive but compressed/offset network output fails the solver's absolute rank threshold; (2) one detection spike pulls a fixation mean far enough to reject all five points; (3) zero-mean training jitter fails the 4% raw-frame leave-one-target-out gate despite an accurate affine center mapping. Constant/collinear output must still fail. These fixtures prove software defects, not which condition occurred on the user's camera.

- [x] Task 1: `base-point-calibration.ts`: robust fixation centers, centered/scaled QR, preserve raw leave-one-target-out error as a diagnostic rather than a duplicate acceptance gate. Tests: compressed coordinates, single spikes, noisy holds, constant and collinear predictions, unseen-point prediction. Separate types in `base-point-calibration.types.ts`.
- [x] Task 2: adaptive reducer/overlay: return typed fit issues, keep valid setup groups, retry only missing groups, and report insufficient signal separately from missing capture. Tests: one missing hold, repaired fit still needing independent checks, no candidate promotion on failure, clear error/retry UI.
- [x] Task 3: adaptive collection: require at least 600 ms as well as 18 unique observations; do not complete high-FPS holds in a fraction of a second. Keep low-FPS collection time-based and keep raw validation attempts. Tests: fast/slow cameras, duplicate frames, invalid gaps and unchanged head-check options.
- [x] Task 4: run targeted and complete tests, typecheck, lint, production build; independent code review. Document remaining physical validation and estimator limits.

**Review focus:** numerical conditioning across output scales; no fabricated signal from constant predictions; isolated outliers versus real sustained movement; validation never reused to train the candidate; failed retries never overwrite an accepted workspace/profile model. Every case has a regression in Tasks 1–3 or the existing adaptive suite. Tests should not imply webcam hardware accuracy.

**Execution:** implement inline using the existing ledger and authorized checkout. Task 1 regression run: 15 pass, 3 expected failures. No live wearer measurements available.

- Tasks 1–3 implemented: standardized QR and median fixation centers reproduce correct unseen-point mapping in the compressed-output/outlier fixtures. Raw leave-one-target-out jitter remains visible in `crossValidationError`, but does not block independent testing. The existing independent RMS/p95/jitter/coverage gates are unchanged; this is not a claim that the underlying pretrained model is now more accurate for every user.
- Fit diagnostics distinguish missing usable readings, incompatible feature versions and insufficient two-dimensional response. A missing target retry retains other setup groups and their target coordinates. The DOM regression caught and fixed a reducer/UI mismatch where the retry label named one target but clearing the failure restored the full list; setup retry targets now survive the transition.
- Adaptive setup/check holds require 18 unique observations and at least 600 ms after the settling period. Standard and head-capture policies remain unchanged. Targeted verification: 51 tests passed, 0 failed; simulated 3/7 FPS sessions complete and fast-camera bursts cannot prematurely pop a target. These are software simulations, not mobile device measurements.
- Neural personalization is intentionally not claimed or added as an unvalidated emergency change. The bundled network remains frozen and its output is calibrated by a small affine model. Five-point mapping has limits for nonlinear errors and head movement; independent validation still decides acceptance. Diagnosing the user's exact physical failure needs another real capture with the repaired fitter and its specific diagnostic result.
- Independent review found a promotion regression: a setup spike ignored by median fitting could still add its unverified head pose to live support. A new regression reproduced yaw 0.8 being accepted after stationary-only checks. The fix derives live pose support exclusively from independently checked observations (including motion holds only when that check passes); setup observations stay available for diagnostics. Targeted tests after the correction: 52 passed. Physical accuracy remains unmeasured.

- Final verification after review repair: **890 tests passed, 0 failed, 10,346 assertions across 94 files**. Type checking, lint, whitespace checks and the production build passed (all nine Next.js routes). Independent review found no remaining confirmed issue in the changed scope; it also reran full-page remote flows. No pupil extraction, dependency, credential, commit, push, branch or worktree changes were made. Branch remains `v3` at `48e2263`. Tests/build used installed Bun 1.3.14 and bundled Node; the declared Bun 1.4.2 deployment runtime and real-camera accuracy still need separate verification.

## All-tracker validation recovery repair — 2026-10-08

User scope: repair repeated accuracy-check failures across SCREEN, SCENE, and all remote modes. Existing uncommitted work must remain; no commits, branches, pushes or worktrees. Pupil extraction remains unchanged.

Confirmed defects: SCREEN validation reuses a stability gate and can never finish noisy/outage readings; scene validation scores hold medians instead of raw samples; several Recalibrate/reconnect paths delete accepted state; adaptive remote checks offer only another measurement of the unchanged candidate. Valid SCREEN head-regression profiles require eight normalization entries but storage checked nine.

Plan and ownership:
1. SCREEN: bounded independent validation with raw/outage attempts, keep accepted mapping during replacement, invalidate stale accuracy results, checkpoint the completed eye grid, fix regression profile dimensions. Targeted regression tests.
2. SCENE: raw-pair validation, preserve accepted state on cancellation/failed replacement and same-camera reconnect, finite noisy candidate exposed only as explicit unverified preview, offset recovery separate from another compulsory check. Targeted regression tests.
3. REMOTE (webcam/mobile/IR shared): bounded independent checks, report failed/incomplete measurements with explicit unverified preview, keep the current model while recalibrating, accurate verified status. Adaptive capture must never automatically repeat a setup or check pass. Targeted tests.
4. Review all changes; full tests, typecheck, lint, build. No hardware accuracy claim without real-camera validation.

Interface preflight: SCREEN owns screen session/overlay/workspace and its profile adapter; SCENE owns scene session/calibration/workspace; REMOTE owns remote files. Shared assessment, if needed, is owned by primary agent only. No shared file edits by implementers. Existing source and tests are the implementation context. Model fitting, measurement and preview remain separate: poor measurement must not become a claimed pass. No numerical threshold relaxation to conceal tracking error.

Ruling: work directly in existing v3 checkout and retain this ledger — explicit user instructions override skill defaults for isolated worktrees and commits. Subtasks use independent file ownership and will receive code review.

Implementation completed in the existing checkout:

- SCREEN checks collect fresh raw observations in bounded windows, including unavailable-output attempts. Noisy output no longer resets independent validation forever. Calibration capture pauses after 20 seconds on an unfinished dot, with an explicit retry of only that dot. Nine completed eye dots are checkpointed before head collection; users can finish eye-only or resume the head pass without recapturing the grid.
- SCREEN preserves accepted models while fitting replacements, including failed head-fit fallbacks; finite low-quality candidates have an explicit unverified-preview action. Profile regression normalization now matches the actual eight features. Measured RMS is visible independently of verified status, and changing mapping/alignment/offset invalidates its old accuracy evidence.
- REMOTE webcam/mobile/IR share bounded independent checks and results handling. Missing/poor checks retain measured evidence and an explicit preview exit. Adaptive checks never automatically expand/repeat the setup; failed poses cannot expand the preview model's supported range. Recalibration cancellation keeps the current mapping and corrections. Per-target quality evidence is required before displaying checked status; aggregate-only metadata is insufficient.
- SCENE accuracy evaluates every retained raw pair with target-balanced RMS and raw worst error; median holds no longer hide jitter. Suggested offsets are optional and do not silently promote accuracy. Cancelled/failed replacement checks restore the accepted model and clear candidate measurements/trace, retaining the failed candidate separately for explicit preview. Stable device/URL, geometry and locked eye-model fingerprints distinguish a reconnect from an incompatible setup. Unknown legacy profiles can be manually loaded as unverified previews.
- Same-source reconnect controls no longer clear calibration before reconnecting. Measured setup changes still invalidate incompatible mappings. Authentication, pupil extraction and backend behavior were not changed in this repair.

Review corrections included stale-frame scoring, old-model checkpoint availability, failed-candidate trace restoration, persistent-vs-runtime identity, and incomplete per-target evidence. Final verification: 923 tests passed, 0 failed, 10,804 assertions across 96 files; TypeScript checks, ESLint, production Next build, and git diff whitespace checks passed. Logs: `/tmp/gazecore-recovery-final-tests.log`, `/tmp/gazecore-recovery-typecheck.log`, `/tmp/gazecore-recovery-final-lint.log`, `/tmp/gazecore-recovery-final-build.log`.

This establishes tested workflow/recovery behavior, not real-camera gaze accuracy. No camera recording or physical accuracy benchmark was available in this run. Changes remain uncommitted on v3; no branches, worktrees, commits or pushes were created.

## Remote estimator repair — 2026-10-08, evening

User reproduced poor adaptive accuracy after repeated checks, gaze suppression on detectable head motion, and insufficient screen-edge coverage. Root causes confirmed in source: five setup points at .2/.8 feed only a 2D affine transform, four edge checks never update it, the optional head hold evaluates unchanged coefficients, and base-point live prediction rejects poses beyond a narrow .06rad/.025image margin. Prior recovery fixes did not improve this estimator.

Implementation design: one nine-location setup using center/corners/edge midpoints with .06/.94 perimeter; fit a small regularized spatial correction with target-held-out model selection rather than treating calibration locations as failed validation. Optional center fixation with gentle head motion learns a compact six-axis pose-dependent residual from measured target error; use held-out temporal blocks to reject harmful correction and avoid claiming independent validation. Head motion data cannot train the spatial map or be called an independent whole-screen accuracy pass. Pose support remains a confidence/coverage indicator, not a reason to suppress every valid detection. Extreme/invalid face/eye observations remain rejected by the existing detector. Preserve previous mappings on failure/cancel and all local profile/schema validation. No pupil extraction changes, commits, branches or worktrees.

Research basis: Learning gaze biases with head motion for head pose-free gaze estimation, Image and Vision Computing, DOI10.1016/j.imavis.2014.01.005, separates initial gaze calibration from learned/geometric head-bias compensation using an additional short video. WebEyeTrack arXiv2508.19544v1 explicitly adapts a gaze regressor using labeled eye appearance and head pose; a frozen network plus five-point affine-only transform is not its personalization method. This repair implements a small empirical residual, not a reproduction of either paper's claimed hardware accuracy.

Task ownership: spatial fitter owns base-point-calibration and its tests; head fitter owns new head-motion correction modules plus optional RemoteCalibration schema field/prediction/profile validation; primary owns capture flow, target sequence, UI, integration and review. Model types stay in mirror .types.ts files. Shared imports are coordinated, no overlapping edits. Verify stationary/known fixation motion and held-out unseen targets with fixtures that inject nonlinearity/noise/motion; report physical-device accuracy as unmeasured.


Implemented and reviewed:

- All remote modes now use one nine-location setup (6%/94% perimeter), followed only by the selected optional center motion hold. The former five-fit/four-check/adaptive checkbox path is removed from the user flow. Independent validation is a separate optional action with five new center/perimeter locations (12%/88%). A training fit never creates checked accuracy metadata. Missing setup readings can still retry only their location, retaining all others.
- RGB spatial correction chooses standardized affine or regularized quadratic mapping using whole-target holdout error and a preference for the simpler model within fold uncertainty. Robust fixation centers resist isolated detector spikes; raw-frame error remains diagnostic. IR and legacy feature mappings retain their established spatial fitter through the same capture flow.
- The optional center hold collects at least 48 unique readings over at least six seconds. It learns slopes of the frozen mapping's residual against observable pose axes, anchored at the setup reference so it cannot silently shift the whole gaze grid. Four contiguous held-out blocks must improve overall RMS by at least 25% without a harmful block. Unobserved axes stay zero, out-of-range residuals saturate continuously, and failed/unhelpful motion fitting preserves the completed spatial model without repeating calibration.
- Live output is no longer suppressed merely for leaving captured head coverage. Current independent accuracy-checked pose coverage is separate from learned motion coverage in remote results and the gaze overlay. Actual invalid, stale or missing eye/head evidence remains rejected. Near-eye SCREEN had the same coverage-as-availability bug: valid geometry now projects outside its measured envelope with an unverified range warning. SCENE has no corresponding head-pose gate, so its existing paired camera mapping was retained.
- Local profiles strictly validate optional spatial bases, normalization, coefficients, head motion evidence and bounds; legacy affine profiles still predict correctly. No pretrained weights, pupil extraction, auth, backend, dependency or production deployment changes were made in this repair.

Verification: 932 tests passed, zero failed, 11,121 assertions across 98 files. TypeScript, ESLint, production Next build and whitespace checks passed. Independent review reported no remaining confirmed major defect and separately reran SCREEN and remote full-page regressions (12 tests / 850 assertions). Browser smoke check loaded the remote chooser without client errors. Logs: `/tmp/gazecore-estimator-tests.log`, `/tmp/gazecore-estimator-typecheck.log`, `/tmp/gazecore-estimator-lint.log`, `/tmp/gazecore-estimator-build.log`.

Limits: these are synthetic geometry/flow checks, not measured human accuracy on Redmi/Poco/webcams. The learned correction is a local empirical pose residual, not universal 3D gaze reconstruction or a guarantee for unseen head angles/depths. Existing saved models do not acquire new coefficients automatically; try the changed estimator with a fresh calibration. All changes remain uncommitted in the existing v3 checkout.

## Metric gaze prototype plan — 2026-10-09

The user authorized implementation and virtual tests of the geometric replacement. Work stays uncommitted on the current `v3` checkout. Pupil extraction, existing calibration data and the default live estimators remain intact until the replacement earns independent accuracy evidence.

1. Add a shared metric ray/plane projector with explicit OpenCV camera axes (X right, Y down, Z forward), metre units, orthonormal screen right/down axes and rigid transforms. Test tilted displays, transformed rigs, off-screen output and invalid geometry before implementation.
2. Add separate remote and near-eye adapters. Remote camera-frame rays bypass head rotation; head-mounted rays compose measured eye-to-head and head-to-camera transforms. A monocular origin estimate must require declared physical eye-anchor separation and calibrated intrinsics, and keep its approximate provenance.
3. Probe a public pretrained 3D estimator with pinned conversion dependencies. Verify original-versus-converted numerical output on distinct inputs before adding a browser runner. Match its documented crop, channel and pose conventions; do not reuse BlazeGaze's preprocessing. Missing geometry must yield an explicit unavailable result, never guessed registration.
4. Run an independent virtual rig over center, edges and corners, yaw/pitch/roll, translations and multiple distances. Report ideal-ray consistency separately from assumed measurement noise, pose timing, registration error and mount slippage. Virtual fixtures cannot establish wearer accuracy or mobile FPS.
5. Run the existing suite, typecheck, lint and production build, and request an independent review. Record actual results and remaining hardware measurements here. Do not commit, push, create branches or worktrees.

Execution ledger: investigation confirms the current RGB model emits a two-coordinate screen estimate. The legacy head pose uses canonical-face units and negative Z, so it cannot silently supply the new metric contract. Independent reviewers are checking conversion feasibility and the coordinate/test design. No replacement is promoted merely because software tests pass.

### Prototype implementation and verified results

The isolated `frontend/research/gaze-3d/browser` prototype intersects a metre-scale gaze ray with a registered physical display plane and explicitly converts display pixels into a registered browser viewport. It validates orthonormal axes, proper rigid rotations, forward intersections and finite measurements. Off-screen coordinates remain unclamped. Remote camera-frame rays are not rotated by head pose again; near-eye rays compose measured eye-camera-to-head and head-to-camera transforms and check timestamp alignment. Eye-origin estimation requires calibrated, undistorted image coordinates, a declared rigid anchor span and an explicit optical-eye-center offset. It does not substitute average face dimensions or call an anchor midpoint the eye center.

The simulation generates observations independently of the production projector and transform helpers. It covers 25 center/perimeter locations on flat and tilted/translated displays, 96 combined head poses per location and distances of 35/60/90 cm: **4,800 fixations per scenario**. Both ideal remote and ideal near-eye cases retain every prediction and stay on their known targets within floating-point precision. This establishes geometric consistency with exact inputs, not accuracy of a neural estimator or face pose.

| Explicit simulated assumption | Mean pixel error | p95 pixel error | Available/attempted |
| --- | ---: | ---: | ---: |
| Exact remote measurement | < 0.000001 | < 0.000001 | 4,800/4,800 |
| Exact near-eye measurement and registration | < 0.000001 | < 0.000001 | 4,800/4,800 |
| Camera-frame gaze yaw biased by 1 degree | 50.97 | 76.33 | 4,800/4,800 |
| Eye depth overestimated by 2 cm | 25.71 | 60.08 | 4,800/4,800 |
| Eye origin shifted sideways by 5 mm | 22.55 | 23.95 | 4,800/4,800 |
| Eye origin frozen at 60 cm during motion | 491.58 | 1,153.95 | 4,800/4,800 |
| Head rotation incorrectly applied twice | 849.07 | 1,727.38 | 4,800/4,800 |
| Near-eye head yaw biased by 1 degree | 52.52 | 77.46 | 4,800/4,800 |
| Near-eye head pose delayed by 33 ms | 45.56 | 92.13 | 4,800/4,800 |
| Display registration shifted sideways by 5 mm | 22.55 | 23.95 | 4,800/4,800 |
| Near-eye mounting shifted by 2 mm | 8.71 | 9.92 | 4,800/4,800 |
| 100 ms timestamp skew exceeding declared 50 ms limit | unavailable | unavailable | 0/4,800 |

Errors include off-screen output; missing measurements are counted, never scored as zero. These perturbations are assumptions, not measured noise distributions or predictions of this user's hardware. The report can be regenerated with `bun run tests/gaze-geometry/virtual-report.ts` from `frontend`.

The public Apache-2.0 Intel `gaze-estimation-adas-0002` FP32 weights were converted to ONNX opset 19 using pinned offline tools. Native comparison against the **original OpenVINO IR** passed 30 distinct synthetic inputs with maximum component difference **4.1723e-7** and maximum angular difference **1.8725e-5 degrees**. Original model files have pinned official SHA-384 checksums; the bundled ONNX has a checked SHA-256. No user images, calibration data or private export were included.

The browser runner uses pinned ONNX Runtime Web 1.22.0, local WASM assets, raw float32 BGR 60×60 eye tensors and explicit model-specific yaw/pitch/roll degrees. It rejects overlapping inference, disposed use and invalid input/output contracts, and releases tensors/sessions. A real isolated headless Chrome 155 test passed **25 original-IR reference cases**, with maximum component difference **5.0664e-7**. On this Mac, 100 model-only inferences after five warmups took **7.3 ms median / 7.5 ms p95**; model loading took 274.5 ms. This excludes face detection, pose, camera acquisition, crop extraction and rendering, and does not establish mobile FPS. The saved original-IR reference generator reproduced all 25 saved reference rows exactly.

**Live promotion remains unqualified.** The released Intel model/demo and its prose describe conflicting vector directions. Raw output stays tagged `model-native-unverified`, and the camera-ray adapter rejects it. The existing live RGB/IR/near-eye estimators were not replaced by guessed axes or guessed metre scale. This prototype does not fix their measured accuracy yet. RGB weights have not been qualified for IR. SCENE still needs target depth to solve arbitrary eye-to-scene parallax; a 2D scene map cannot supply that depth.

The next required evidence is measured camera intrinsics and camera/display geometry, compatible optical-eye origins and a verified gaze/pose convention, then a labeled real-camera benchmark covering comfortable motion at center, edges, corners and changed distances. For near-eye tracking, add measured rigid mounting and exposure synchronization. These device measurements should be performed once as hardware configuration wherever possible, rather than adding repeated consumer calibration steps. Short personal calibration and return alignment can be evaluated only after the base measurements are qualified.

Reproduction commands and independent source-to-browser parity scripts are in `research/gaze-3d/README.md`; Python tooling stays separate from the app. Independent review identified and resolved an anchor-midpoint/eye-center ambiguity and malformed-rig handling, then found no remaining material defect in the bounded prototype or reproduction procedure. Final checks: **993 tests passed, 0 failed, 51,057 assertions across 104 files**; the focused geometry suite has 22 tests and 38,476 assertions. TypeScript, ESLint, production Next.js build and whitespace checks passed. Verification used local Bun 1.3.14 and bundled Node, not the declared deployment Bun 1.4.2 or a phone. No commits, pushes, branches or worktrees were created; work remains on `v3` at `48e2263`.

## Head compensation architecture audit — 2026-10-09

The latest request is reliable peripheral gaze during comfortable yaw, pitch, roll, translation and nearer/farther movement, with minimal calibration effort. Prior passing tests have not demonstrated that on this hardware. The implementation remains experimental; no commercial accuracy claim is justified.

### What the captured session actually establishes

The user's local remote-webcam export has nine full-screen training locations, 162 training readings and 91 independent check readings, but **no accepted `headCorrection`**. A live face/head preview is not evidence of a learned compensator. Head-stage attempts were not exported, so this file cannot establish why the motion fit failed.

The previous served browser module applied affine coefficients directly to the raw neural point while the stored coefficients expected standardized input. That obsolete module exactly reproduced all five exported target biases; the current module applies the saved mean/scale. Replaying current source reduces mean check error from approximately 433 to 130 CSS pixels on the same recorded observations. The remaining error is substantial. This is a replay comparison, not a new wearer accuracy measurement or a head-motion improvement.

A separate feature-only candidate fitted to the same training data produces approximately 242 CSS pixels of mean independent-check error. The current selection retains the neural spatial fit. That comparison is diagnostic only: validation readings were not used to fit either candidate or change selection thresholds. Swapping to the feature model is not a supported repair for this session.

The current remote residual is `screenPoint = spatial(eyeInput) + B * relativePose`. It can learn local translation of the gaze field. A center fixation cannot identify pose-dependent gain: if depth changes a prediction to `0.5 + 1.25 * (target - 0.5)`, center error stays zero but a target at 0.94 moves to 1.05. Collecting more center frames does not supply the missing peripheral labels. Adding another rotation or widening rejection thresholds cannot solve that ambiguity.

### Primary evidence and its limits

- [Tobii EP3557377B1](https://patents.google.com/patent/EP3557377B1/en) describes camera-intrinsic image normalization, learned gaze direction and distance correction, then personal calibration parameters. Its distance discussion matters here: measurements at one distance cannot resolve every depth error. This is a public disclosure, not confirmation that Eye Tracker 5 uses this exact implementation or permission to use patented claims commercially.
- [Zhang, Sugano & Bulling, ETRA 2018](https://collaborative-ai.org/publications/zhang18_etra.pdf) distinguishes image normalization from gaze-vector normalization. The estimator must be trained for the same transformation. Applying a new crop or treating a 2D screen estimate as a 3D ray does not reproduce the method. The authors' preprocessing repository is noncommercially licensed and was not copied.
- [Falch & Lohan, 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11019238/) combines pretrained camera-frame gaze vectors, calibrated origins and a screen plane. Their single-participant motion tests still show appreciable webcam rotation error, so the paper does not establish industry accuracy for arbitrary cameras or users.
- The authors' [iMotions Webcam Based Eye Tracking white paper](https://www.researchgate.net/publication/372236593_Webcam_Based_Eye_Tracking_-Whitepaper_v3) describes offline pretrained estimation and personal RBF mapping. It recommends 13-point calibration and stationary positioning; its small head-motion study reports worse angular error under movement. Replacing affine regression with RBF alone is not proven head compensation.
- [Browatzki, Bülthoff & Chuang, 2014](https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2014.00200/full) combines near-eye and six-axis head measurements with screen registration. Independently measured pose and adequate calibration coverage are prerequisites; optical tracking results do not transfer to an approximate webcam face transform.
- [Mansouryar et al., ETRA 2016](https://arxiv.org/abs/1601.02644) treats camera–eye separation and target depth as geometric quantities. A single eye/scene 2D map cannot remove arbitrary depth-dependent parallax or glasses slippage.

### Replacement design before another estimator change

Use a shared screen-projection contract, with different measurement adapters:

| Setup | Required measurement and transform | Current missing evidence |
| --- | --- | --- |
| Remote RGB webcam/mobile | Pose-normalized pretrained **camera-frame** gaze direction and credible eye origin, then intersection with the registered display; small personal visual-axis correction | Compatible model weights/runtime, camera intrinsics, camera/display registration, independent motion measurements |
| Remote IR | A suitable trained estimator or calibrated pupil/corneal-reflection geometry, then the same screen projection | IR illumination/camera geometry and metric eye-origin evidence; the label “IR” alone supplies neither |
| Near-eye SCREEN | Eye-in-head ray and origin, rigid eye/head-camera registration, synchronized head-to-camera pose, registered display plane | Measured rig geometry and reliable physical pose/depth; monocular face scale is approximate |
| Near-eye SCENE | Eye-to-scene geometry, exposure alignment and separate slippage/offset recovery | Target depth for physical parallax correction; network MJPEG exposes no common exposure clock |

Do not rotate a camera-frame neural gaze vector by head rotation a second time. Do not construct a physical ray from `[screenX, screenY, 1]`. Preview mirroring/rotation is separate from raw camera geometry. Hardware/factory configuration should supply device geometry wherever possible so consumers are not asked to calibrate camera intrinsics manually.

A consumer flow should keep compatible personal/device profiles, use a short return alignment and perform only the failed local repair. Initial personal calibration can shrink only after an adequate base estimator demonstrates independent edge accuracy. A short head-motion hold can test local correction, but cannot certify all six axes, all gaze directions and all depths. An empirical pose-dependent gain model would need independently labeled peripheral targets at changed poses/depths; it is a benchmark candidate, not another silent center-only replacement.

### Bounded repairs implemented in this audit

1. SCREEN head-model scoring now evaluates **every retained frame**, with equal total weight per fixation. Previously the fitting decimator also selected validation readings, allowing alternating large errors to disappear from the score. Fitter subsampling remains for performance; acceptance thresholds are unchanged.
2. SCENE USB frames use the shared capture/presentation timestamp convention used by eye/head capture. Arrival time remains separate for stall detection. Network MJPEG timing remains approximate; callback timestamps do not recover unknown exposure delay.
3. Shared live/recorded overlays retain finite out-of-screen estimates and filter history. A small red edge direction indicator identifies an off-screen estimate instead of erasing it or substituting an apparently accurate edge gaze point. Raw coordinates and error metrics remain unchanged; stale/invalid observations still expire.
4. Remote results offer **Learn head correction**, collecting only the center motion hold over the retained gaze model. Failed/cancelled retries keep mapping, offsets, alignment, previous independent measurements and an already visible gaze preview. Accepted motion correction requires a new independent check. Guidance asks for comfortable repeated movement so temporal holdouts can contain comparable motion.
5. The most recent head-stage attempts remain separately in session memory and explicit local **Export results**. They are not mixed into the spatial training data, stored in profiles, uploaded or committed. The export now permits diagnosis of rejected head fits. Opening a saved model clears unrelated prior-session sample traces.

### Evidence required before promoting compensation

Test known center, edge-midpoint and corner fixations while independently varying comfortable yaw, pitch, roll, lateral/vertical translation and depth. Include held-out combinations and return sessions. Score every raw reading, including missing and off-screen output; report per-condition bias, RMS, p95, jitter and availability, plus sustained mobile FPS and latency. Compare the same observations with/without correction. Center-only synthetic additive-bias fixtures cannot validate peripheral gain or physical depth accuracy.

The software regressions below verify the bounded repairs only. No new trained model, physical camera registration, webcam accuracy benchmark, mobile measurement, pupil-extraction change, commit, push, branch or worktree was made in this audit. Full geometric compensation is still outstanding.

Final software verification: **971 tests passed, 0 failed, 12,581 assertions across 99 files**; TypeScript, ESLint, Next.js production build and whitespace checks passed. The strengthened remote flow explicitly checks a nonzero click offset and nonnull affine alignment across cancelled, rejected and accepted head-only retries, including resumed live display after rejection. Independent review found no confirmed significant defect in this bounded scope.

A separate synthetic browser render check inspected normal, off-screen and contained-scene-image indicators; no real camera was used. HTTP inspection of the running development bundle confirmed the standardized prediction call, head-only retry, diagnostic trace and off-screen indicator are served. The temporary preview was closed. All nine production routes compiled. Local verification used Bun 1.3.14 and bundled Node, while the manifest declares Bun at least 1.4.2; the declared deployment runtime and real-device performance were not tested. Branch remains `v3` at `48e2263`, with changes uncommitted.

## Live instability investigation — 2026-10-09

The active remote tracker still uses the existing RGB/IR estimator. The separate 3D prototype is inactive and cannot account for, or fix, its current live jitter.

Three concrete continuity problems were repaired:

1. Both remote face inference and the near-eye head worker requested two faces. [MediaPipe's documented configuration](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js) enables landmark smoothing only for one face. The [native graph](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/face_landmarker/face_landmarker_graph.cc) also reruns detection when the tracked face count is below the requested maximum. Both loaders now request one face in VIDEO mode, retaining blink/pose outputs and the existing delegate fallback. This is single-person tracking: the live native result no longer supplies multiple faces for rejection. It is not person identification.
2. Every RGB blink discarded the reconstructed person-scale/depth inputs. A reopened iris with a one-pixel rim change could therefore change the estimated face width; the deterministic fixture reproduces a change from 38.4 to 32 in the model's existing units. A separate geometry-history helper preserves only these model inputs across a brief blink. It never returns cached eyes or gaze. Its one-second limit uses the last valid inference time; face loss, non-blink invalid geometry, resolution changes, inference failure and disposal clear it. The upstream reconstruction and pupil extraction are unchanged.
3. Missing remote readings reset the display filter immediately. The overlay now hides unreadable gaze while preserving its filter memory through a short interruption. Source age, invalid data, coordinate-context changes and explicit reset still expire that memory. A reviewed delayed-frame case also checks the age of the previous reading when fresh input resumes; a cancelled expiry timer cannot revive old history. Display smoothing never updates calibration or substitutes its output for raw measurements.

Red/green regressions reproduced the old two-face configuration, iris-quantization reset, post-blink display jump and delayed-frame history expiry. The rendered overlay regression verifies that no old gaze or recording snapshot remains visible during a blink. Existing low-FPS synthetic tests still cover 2/5/15/30 FPS, target jumps, pursuit, source timestamps and out-of-screen coordinates; these are software fixtures, not wearer accuracy measurements.

An isolated Chrome 155 test used the actual bundled remote MediaPipe task and the public [MediaPipe portrait fixture](https://storage.googleapis.com/mediapipe-assets/portrait.jpg), with no user camera access or external requests during inference. Each of four fresh native sessions processed 90 frames at synthetic 30 FPS timestamps; the first 20 frames were warmup. The image received alternating ±0.75-pixel horizontal and ±0.5-pixel vertical translations. Both two-face and single-face conditions were repeated. The following results were deterministic except for timing:

| Public-portrait measurement | Two-face mode | Single-face mode |
| --- | ---: | ---: |
| Rejected RGB geometry readings, out of 90 | 15 | 1 |
| RMS variation of relative iris offsets | 0.004802 | 0.003031 |
| RMS variation across yaw/pitch/roll, degrees | 0.221009 | 0.043946 |
| RMS image-coordinate landmark residual after subtracting input translation, pixels | 0.195753 | 0.718086 |
| Median landmark inference time across repeated sessions, milliseconds | 20.4 / 22.0 | 15.8 / 15.9 |

Iris and pose variation improved on this fixture, while image-coordinate residual increased. The latter includes the temporal filter's response to deliberate image translation; it is not a gaze-error metric. These results do not establish real-camera gaze accuracy, near-eye head-worker quality, mobile FPS or correct physical head compensation. The test measured landmarks/inspection only, excluding the RGB appearance model, acquisition and rendering. Its test server and isolated browser were closed afterward.

Pupil processing, trained weights, calibration mappings, offsets, authentication and backend routes were not changed in this stability repair. Existing profiles are not automatically deleted or recalibrated. Reloading and reconnecting starts workers with the new configuration; an already running worker retains its previous options. Real wearer measurements remain necessary to determine how much live instability remains.

Final verification: **1,002 tests passed, 0 failed, 51,094 assertions across 105 files**; TypeScript, ESLint, the production Next.js build and whitespace checks passed. Independent review's confirmed history-expiry defect was reproduced and fixed; review found no additional significant defect in this repair. Local verification used Bun 1.3.14 and bundled Node; the declared deployment Bun 1.4.2 and real phones were not tested. No commit, push, branch or worktree was created. Branch remains `v3` at `48e2263`.

## Accepted-baseline recovery — 2026-10-09

**Historical, superseded:** The user clarified that origin/v3 was a benchmark to
improve upon, not a request to revert. The production-default changes described
in this section have been reversed by the forward stability work below. The
historical replay measurements and their limits still apply.


The user reports that the uncommitted experiments are less usable than origin/v3.
A read-only remote check verified origin/v3 at
`48e22635ecee538cc4854bc58a062040bbf152da`, the local HEAD. A binary patch backs up
tracked changes; unrelated changes and standalone experimental modules remain
intact. There is no current calibration export, so the latest physical regression
has not been reproduced from wearer data.

The older 8 October export permits only a historical comparison. On its same 91
independent readings, the origin feature fitter and current feature fitter
produce identical predictions (266.5 px RMS, 83.7 px within-target jitter). The
experimental two-coordinate fit produces 141.4 px RMS and 64.6 px jitter there.
This older recording does not establish that the latest experiment is better,
or reproduce the reported latest regression. The origin overlay also dropped
26 off-screen estimates from this export, which would misleadingly improve a
comparison based only on displayed readings. The recovery preserves finite
off-screen measurements and visible unverified pose extrapolation.

The confirmed architectural difference is that default RGB calibration had
changed from the full binocular/pose feature regression to automatic candidate
selection, often choosing only two neural coordinates. A separate center-only
head residual then applied learned correction across the screen. Neither the
choice nor its center-only head correction has independent wearer evidence
across peripheral targets and head motions. They are removed from the default
route, without deleting their code or tests.

The restored remote route uses the existing feature fitter for webcam, mobile
and IR. Optional head training appends a second full nine-target pass; both passes
retain their frame-level labels in the same fit. The results action explicitly
starts full recalibration with head movement. Canceling or failing the replacement
preserves the current model, offset, affine session alignment and independent
validation. A successful replacement resets old adjustments and asks for a new
independent check. Loaded profiles do not need their absent training frames to
start this full replacement.

Profile eligibility is checked before selection or the load callback. Existing
compatible feature profiles still load, including their saved offsets.
Experimental neural-only or separate-head-residual profiles stay stored but
cannot silently reactivate those experiments. If both formats are available,
automatic restoration uses an eligible compatible feature profile. Source-version
checks remain in feature training and live prediction; mixed or incompatible
neural inputs cannot reuse those coefficients.

The new `remote-simple` display option uses the committed exponential filter
with fixation locking disabled. Source-age limits, duplicate-timestamp behavior
and brief-blink history remain bounded to one second, including sparse mobile
delivery. It does not alter raw gaze, calibration or validation. The previous
adaptive display filter remains an explicit experiment, outside the remote route.

Both landmark loaders again request two faces, preserving the committed native
temporal behavior and multiple-person rejection. The preceding single-face
portrait experiment measured partial features, not final appearance gaze;
it did not justify changing accepted measurement timing. Existing byte-parity
eye-crop optimizations, backend precision/parity checks, latency reporting,
bounded person-scale history, click offsets, camera persistence, measurement
recovery and finite off-screen indicators remain. Pupil extraction and auth are
unchanged. Physical accuracy and mobile performance require real-device evidence;
this recovery restores the accepted software path rather than claiming those
open problems are solved.

Final verification for this recovery: **1,012 tests passed, 0 failed, 50,367
assertions across 107 files**. TypeScript, ESLint, the production Next.js build
and whitespace checks passed. Independent review found no material defect in
the recovery. A final profile-notice regression reproduced and fixed a stale
recalibration warning; successful new fitting now clears it without deleting
stored profiles. The running development module contains `remote-simple`,
`remoteProfileLoadIssue` and the full-grid head action, with no adaptive calibration
overlay or center-only action. Replaying the historical export also verifies
byte-identical feature coefficients against origin. No fresh wearer recording
or phone benchmark was available. Existing workers require reload/reconnection
to adopt restored native options. No commit, push, branch or worktree was created.


## Forward stability — 2026-10-09

The user clarified that the committed origin/v3 result is the benchmark to
improve, not a request to restore it. The interim rollback was therefore reversed:
the newer nine-dot flow, optional center motion hold, compatible personalized
profiles, single-face processing and adaptive display filter remain active.
The bounded source-age/blink safeguards, source-version checks and profile warning
cleanup added during that audit remain. The rollback-only `remote-simple` mode
and profile-exclusion policy were removed rather than retaining unused production
paths. Shared strict profile validation remains active.

Single-face processing enables the task's native temporal smoothing, as documented
in the [MediaPipe web guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js).
It cannot establish that no second person is present: requesting one face limits
returned faces. The earlier native portrait probe measures partial feature noise
and inference timing, not wearer gaze accuracy or identity continuity.

### Mapping complexity now includes frame noise

Median-only whole-target cross-validation could favor a curved mapping whose
held-out fixation medians were accurate, while amplifying actual detector noise.
Training still uses robust fixation centers. Candidate selection now evaluates
each candidate on all raw frames from the held-out target and scores their median
squared error. This retains robustness to isolated spikes and exposes typical
frame error. Each target has equal weight; the existing one-standard-error rule
still favors an affine model when curvature has no clear advantage. The reported
crossValidationError remains raw-frame RMS, including outliers; it is not an
independent accuracy measurement. No range clamp or artificial gain is added.

A failing synthetic regression reproduced held-out frame RMS of 0.28373 despite
perfect curved fixation-center geometry. The revised selection gives 0.27116
and retains horizontal response spanning more than 80% of the screen in that
fixture. Independent nonlinear edge, interaction, compressed-coordinate and
isolated-outlier fixtures still pass. These are numerical/software checks only.

### Historical comparison

Replaying the existing 91-frame validation export with the same targets, camera
features and 1512×738 viewport gives these aggregate raw-prediction results:

| Mapping | RMS error | Within-target jitter | Valid readings | Off-screen readings |
| --- | --- | --- | --- | --- |
| origin/v3 feature fit | 266.50 px | 83.70 px | 91/91 | 19 |
| newer selected spatial fit | 141.43 px | 64.60 px | 91/91 | 26 |

For this recording the selected spatial model is affine already, so the new
complexity rule does not change its coefficients or these measurements. Adaptive
display filtering on that spatial trace gives 134.48 px RMS and 46.16 px jitter,
with 91/91 readings retained and 28 filtered predictions outside the screen.
The original display rejects off-screen readings; comparing only its retained
65/91 readings would conceal missing output and is not a fair accuracy improvement.

The export predates the latest instability report and contains no learned motion
hold. It cannot prove the current live regression resolved, head/distance accuracy,
or mobile FPS. Raw biometric readings remain outside this repository. No fitting
threshold was relaxed to pass this recording. A center motion hold estimates local
additive error; it cannot identify screen-wide, distance-dependent gaze gain or
replace a qualified 3D estimator plus measured camera-to-screen geometry.

Final verification: 1,009 tests passed across 106 files, zero failures; TypeScript,
lint, production build and git diff --check passed. Independent review found no
material defect and passed 74 focused tests. The served development bundle was
checked after rebuilding and contains the intended new flow/fitter with no
rollback-only policy. Changes remain uncommitted on the current v3 branch.


## Pre-commit cleanup and integration review — 10 October 2026

Unused metric gaze, camera registration, calibration comparison/reuse contracts and the ocular-axis experiment are preserved under `frontend/research`, outside the Next application graph. Their model, notices and optional ONNX WASM remain available to the isolated probe. The production web package no longer depends on ONNX; Docker excludes research storage. The Python vision assistant is unchanged.

The obsolete doubled remote calibration pass and unused overlay options/type exports were removed. The active optional center head hold remains. Slow-inference capture now distinguishes repeated polling of an accepted frame from a genuinely invalid or missing reading. A same-source eye camera reconnect preserves the locked model only while resolved camera identity and capture geometry match, and stale responses from the previous transport cannot publish new output. A changed or unlocked eye model clears screen calibration verification. Scene setup keys remain in memory; saved profiles receive a SHA-256 fingerprint through the shared camera identity helper. Legacy profiles remain readable as unverified previews when their setup cannot be established.

These are packaging and integration repairs. They do not establish physical head-motion accuracy or resolve the reported live range without a corresponding device capture.

The dependency audit found source-map-js indexed-offset denial of service ([GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)) and sprintf-js unbounded-format precision ([GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)). The shared override pins source-map-js to patched 1.2.2. TensorFlow's unused CLI parser chain now resolves argparse 2.0.1, which removes sprintf-js instead of retaining an unpatched formatter. The TensorFlow CLI help still runs, and the final Bun dependency audit reports no advisories. No estimator weights or inference versions changed.
