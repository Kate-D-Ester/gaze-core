# Eye tracking V2

Open `/v2` for the six-step workspace. It runs locally without the backend or sign-in. The dashboard and test page also link to it. Existing authenticated routes and the original tracker remain available.

## Run

From this checkout:

```sh
cd frontend
bun install --frozen-lockfile
bun run dev --host 127.0.0.1 --port 4012
```

Visit `http://127.0.0.1:4012/v2`. Camera capture requires localhost or HTTPS and browser camera permission. Prefer a close, steady view of one eye, such as the near-eye camera in the tutorial. A normal webcam may not resolve the pupil well enough. Local video and a clearly labeled synthetic sample are also supported. Frames are processed in a Web Worker and are not uploaded.

## Use the pipeline

1. **Camera:** select a camera, open an eye video, or try the synthetic sample.
2. **Eye region:** drag around one eye, keeping the entire pupil movement inside the region. Confirm that one pupil is visible. This is a manual region selection, not face or eye classification.
3. **Pupil:** inspect the green outline and threshold previews. Adjust the threshold only if needed. A contour-fit score measures agreement with an ellipse, not the probability that the object is an eye.
4. **Eye model:** in Tracker 1, select the two eye corners. In Tracker 2, slowly look in several directions until the blue sphere is stable and the model can be locked. Camera geometry is available under the disclosure.
5. **Calibrate:** keep the head and camera still and look at each of nine targets. Each target requires settled, fresh, stable gaze samples.
6. **Live gaze:** open the gaze view, validate against five other targets, or export the current result as JSON. Validation reports root-mean-square distance in browser CSS pixels. It is not an angular-accuracy measurement.

Changing the source, format, crop, threshold, corners or camera geometry resets dependent estimates. Resizing the window invalidates screen calibration. Rebuild and recalibrate after moving the eye camera. Lost or stale pupils produce no current gaze instead of retaining the previous point. Nothing is persisted across page reloads.

The synthetic sample drives a generated eye through the same detector, model and calibration code. During target capture it follows the target automatically. Its output is always labeled simulated and is useful for verifying the pipeline, not for measuring real-camera accuracy.

## What the two formats do

**Eye Tracker 1** reuses the existing `frontend/packages/ui/src/lib/gaze-core` grayscale conversion, equalization, detector and `gazeVector3D` implementation. Its manually selected corner midpoint and half corner distance define the original eye model. The V2 adapter adds source handling, invalid-frame gating and the shared previews and calibration. It adapts the original positive-z gaze to the V2 camera convention; this format does not reconstruct metric 3D pupil positions.

**Eye Tracker 2** implements the sequence from Jason Orlosky's [The Hidden Math Behind 3D Eye Tracking](https://www.youtube.com/watch?v=Gh8LS9erugE) and [MIT-licensed reference implementation](https://github.com/JEOresearch/EyeTracker/tree/main/3DTracker):

- Locate a dark, spatially uniform patch with a sparse mean/variance search.
- Try grayscale thresholds at patch intensity plus 5, 15 and 25, with a user offset. Dilate, extract contours and fit ellipses with OpenCV.
- Refine the contour using three-point inward bisectors, refit and score contour-to-ellipse agreement. Reject uniform frames, clipped contours and implausible shapes.
- Intersect the minor-axis lines of diverse pupil ellipses. Use deterministic consensus and weighted least squares to reject outliers and unstable parallel lines. Average recent center estimates and use the observed outer pupil extent to estimate the projected sphere radius.
- Unproject each pupil center through a pinhole camera and intersect that ray with the sphere. Normalize the sphere-center-to-intersection vector to obtain gaze.

The source snapshot (with normalized line endings and trailing whitespace) and original license are in `research/`. The tutorial explicitly leaves screen calibration for a later video. The nine-point affine mapping and independent validation are additions in this implementation.

## Mathematical conventions and deliberate corrections

Image coordinates have x to the right and y down. Camera coordinates have +z away from the camera. Ellipse `major` and `minor` are **semiaxes in pixels**, and `angle` is the major-axis angle in **radians**. OpenCV's full diameters and degree angles are converted once at the detector boundary. Crop-local positions are translated to full-frame coordinates before fitting the eye model.

For major-axis angle θ, the minor-axis direction is `(-sin θ, cos θ)`. Its perpendicular unit normal n defines a line residual `n · (c − p)`. The center minimizes the confidence-weighted sum of squared residuals. Nearly circular pupils are excluded because their orientation is indeterminate. A ready model needs at least 30 inliers across five of eight angular sectors; obsolete support cannot leave a model ready indefinitely.

For two contour-neighbor vectors a and b, the inward bisector is `a/|a| + b/|b|`. Its dot product with the vector toward the contour center is normalized by both lengths before comparison with `cos(60°) = 0.5`. The reference compared an unnormalized dot product with a cosine, which makes the decision depend on pixel scale; this implementation corrects that dimensional inconsistency.

With vertical field of view φ and square pixels, `fx = fy = height / (2 tan(φ/2))`. The camera ray is `normalize(((u − cx)/fx, (v − cy)/fy, 1))`. The assumed eye radius R and the projected sphere's angular radius α give center distance `D = R / sin α`. This construction is exact for an on-axis spherical silhouette; representing an off-axis silhouette by an image circle remains an approximation.

For normalized ray d, origin o and sphere center C, set `b = d · (o − C)` and `c = |o − C|² − R²`. Solve `t = −b ± sqrt(b² − c)` and choose the nearest positive root. Negative discriminants and intersections behind the camera are rejected. A tiny numerical tolerance handles roundoff at tangency; the implementation does not fabricate a tangent for a missed ray. Gaze is `normalize(o + t d − C)`.

Screen features are `(gx/−gz, gy/−gz)`. An affine map fits normalized browser coordinates from nine targets using centered/scaled QR least squares, with rank and non-finite checks. Leave-one-target-out error checks calibration consistency; the five-point validation captures different targets after fitting. Predictions remain unclamped so off-screen estimates are visible as off-screen rather than falsely accurate edge hits.

## Assumptions and practical limits

The defaults of 45° vertical field of view and 12 mm eye radius are **assumptions**, not measured camera or subject parameters. Enter the actual camera field of view when known. The radius mostly sets metric scale; it cannot turn this model into a calibrated eye-anatomy measurement.

The tutorial's minor-axis convergence and outer-extent sphere fit are approximate eye models. They do not compensate for corneal refraction, lens distortion, pupil-size changes, eyelid occlusion or head/camera motion. Screen calibration is empirical and only valid for the current pose and viewport. A dark object can resemble a pupil, which is why the visible eye-region and contour checks are required. Real footage and camera-specific validation are needed before making accuracy claims.

## Verification

```sh
cd frontend
bun run test
bun run typecheck
bun run build
cd apps/web
bunx eslint src/features/eye-tracking src/pages/v2-page.tsx
```

The suite covers analytic rays and spheres, rotated ellipse axes, robust center fitting, calibration rank rejection and known mappings, genuine OpenCV detection on synthetic grayscale images, loss of pupils, stale model support, source cancellation and source startup while settings change. The production browser walkthrough covers both formats, calibration, validation and responsive layouts.

The repository-wide lint command also checks pre-existing components that currently fail lint (`PreviewCanvasPanel`, the shared button component and the authentication page). The new V2 modules pass their scoped lint check. The OpenCV worker adds approximately 10.8 MB before transfer compression; its first load takes longer than the UI. Vite's `fs`, `path` and `crypto` externalization notices originate from unused Node branches in the OpenCV distribution.
