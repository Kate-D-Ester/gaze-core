# Eye tracking V2

Open `/trial` for the five-step eye-tracking workspace. Camera capture, pupil detection, eye-model fitting, calibration, and gaze estimation run in the browser and do not require sign-in or the backend. `/v2` redirects to `/trial` for existing links. The separate backend remains for account authentication and API-key management.

## Run

From the repository root:

```sh
cd frontend
bun install --frozen-lockfile
bun run dev
```

Visit `http://localhost:4001/trial`. Camera capture requires localhost or HTTPS and browser camera permission. Prefer a close, steady view of one eye. A normal webcam may not resolve the pupil well enough. USB cameras and network streams are supported; frames are processed in a Web Worker and are not uploaded. Network streams must be reachable by the browser and allow cross-origin access (CORS); the tracker does not use a server relay.

## Use the pipeline

1. **Camera:** choose a USB camera or enter a network stream URL. Camera names are listed when available and may appear after permission is granted. Permission is requested only when you start the preview.
2. **Eye region:** use **Edit ROI** to move the box, resize its eight handles, or **Redraw** it. Arrow keys move the region; Shift + arrows resize it and Alt uses 10-pixel steps. Numeric coordinates are applied together. Keep the full pupil movement inside the region, then continue; no confirmation checkbox is required. This is a manual region selection, not face or eye classification.
3. **Eye model:** inspect the pupil outline and threshold preview while looking around; threshold controls remain available above the preview. Dragging the slider updates segmentation immediately; numeric entries apply on Enter or blur. **Auto tracker** follows the last pupil rim and uses threshold segmentation when it needs a new outline; its slider adjusts the segmentation bias. **Manual tracker** applies one absolute grayscale cutoff (0–255), with an exact numeric entry. The threshold view shows the segmentation mask or the observed rim points used for tracking. A fit score measures geometric and image support, not the probability that the object is an eye. In Manual tracker, select the two eye corners. In Auto tracker, look in several directions until the blue sphere is stable, then lock it. Camera geometry is available under the disclosure.
4. **Calibrate:** keep the head and camera still and look at each of nine targets. Each target requires settled, fresh, stable gaze samples.
5. **Live gaze:** open the gaze view, validate against five other targets, or export the current result as JSON. Validation reports root-mean-square distance in browser CSS pixels. It is not an angular-accuracy measurement.

Changing the source, format, crop, threshold, corners or camera geometry resets dependent estimates. Resizing the window invalidates screen calibration. Rebuild and recalibrate after moving the eye camera. Lost or stale pupils produce no current gaze instead of retaining the previous point. Nothing is persisted across page reloads.


## What the two formats do

**Eye Tracker 1** reuses the existing `frontend/packages/ui/src/lib/gaze-core` grayscale conversion, equalization, detector and `gazeVector3D` implementation. Its manually selected corner midpoint and half corner distance define the original eye model. The V2 adapter adds source handling, invalid-frame gating and the shared previews and calibration. It adapts the original positive-z gaze to the V2 camera convention; this format does not reconstruct metric 3D pupil positions.

**Eye Tracker 2** implements the sequence from Jason Orlosky's [The Hidden Math Behind 3D Eye Tracking](https://www.youtube.com/watch?v=Gh8LS9erugE) and [MIT-licensed reference implementation](https://github.com/JEOresearch/EyeTracker/tree/main/3DTracker):

- Locate a dark, spatially uniform patch with a sparse mean/variance search and calculate an Otsu intensity split.
- With a recent accepted pupil, first measure dark-to-light edges along 64 normals in a narrow band around its last outline. Fit the current points and trim outliers. When occlusion makes a new shape unreliable, estimate translation with bounded robust fitting while retaining the last measured axes and angle. This path requires current image evidence and a well-conditioned translation; it never outputs a missing measurement solely from history. Shape-constrained observations supply pupil position but do not train the 3D eye model.
- When direct rim tracking fails, estimate an intensity cutoff from a local histogram around the previous pupil, accumulating approximately its expected pixel area. Compare that cutoff and offsets of ±6. Initial acquisition uses the original three patch/Otsu cutoffs, and recovery can also try the broad Otsu cutoff. All masks remain inside the selected eye ROI. The previous experimental spatially varying masks were removed because they could merge the iris and eyelid into a convincing false ellipse. Manual mode still uses one absolute cutoff. A small elliptical opening removes narrow strands; its kernel follows pupil size and starts at 3 × 3 during acquisition.
- Refine mask contours using three-point inward bisectors, fit an ellipse and score contour agreement. Sample 64 positions around the fitted rim to check outward contrast. Rank candidates using that evidence, surrounding contrast, interior intensity consistency and a modest temporal preference. Crop-edge points are excluded without discarding all remaining pupil arcs. The primitive is OpenCV’s [least-squares fitEllipse](https://docs.opencv.org/4.x/d3/dc0/group__imgproc__shape.html). Absolute contrast magnitude is not converted into a confidence ceiling: that rejected valid, blurred IR pupils at oblique angles.
- For a weak fit, recover visible rim arcs using bounded deterministic stratified trials. Recovery requires at least 12 inlier points, support in 20 of 32 angular sectors, and outward contrast at 62.5% of sampled rim positions. Auto can reconstruct a pupil attached to a dark eyelid without relying on the merged region's filled area. Manual retains the additional 55% contour-inlier and 0.75–1.15 filled-area checks. If Auto still lacks an acquisition-quality fit, one blurred edge pass supplies curved arcs for another recovery attempt. Long straight edge sections and sharp reversals are excluded.
- If segmentation cannot recover a recent pupil, search a bounded grid of nearby centers with its last shape, then refine at most three promising rim matches. This handles movement while lashes obscure the outline. Relocation runs after segmentation so ordinary shape changes at extreme angles can establish a new ellipse first.
- Confirm abrupt relocations across two frames and use confidence hysteresis for an established track. Rim tracking uses observations at most 150 ms old. Position association expires after 750 ms; a size constraint survives for three seconds after loss to prevent an eye-sized shadow replacing the pupil. Only accepted detections update the remembered threshold band and shape anchor. No current pupil means no current gaze.
- Intersect the minor-axis lines of diverse pupil ellipses. Use deterministic consensus and weighted least squares to reject outliers and unstable parallel lines. Average recent center estimates and use the observed outer pupil extent to estimate the projected sphere radius.
- Unproject each pupil center through a pinhole camera and intersect that ray with the sphere. Normalize the sphere-center-to-intersection vector to obtain gaze.

The source snapshot (with normalized line endings and trailing whitespace) and original license are in `research/`. The tutorial explicitly leaves screen calibration for a later video. Full-ROI candidate search, automatic/manual threshold controls, temporal association, the nine-point affine mapping and independent validation are robustness and usability additions to the reference pipeline. Input frames preserve up to 1280 × 960 pixels before ROI cropping.

The tracking/detection split and area-based intensity estimate are informed by [PuReST](https://www.hci.uni-tuebingen.de/assets/pdf/publications/TWE062018.pdf). [Pupil Labs' open detector](https://github.com/pupil-labs/pupil-detectors/blob/master/src/pupil_detectors/detector_2d/detect_2d.hpp) also checks support near a previous ellipse before broader contour search. This code uses its own grayscale-profile implementation, not a port of either complete detector. Commercial robustness also depends on optics and illumination: [Tobii describes near-infrared illumination, corneal reflections and dedicated cameras](https://www.tobii.com/resource-center/learn-articles/how-do-eye-trackers-work).

Processing remains in the worker at a maximum of 24 sampled frames per second with one frame in flight. Busy capture cycles are skipped. Grayscale conversion writes directly into a reusable ROI buffer. Successful direct rim tracking avoids full-ROI threshold/contour passes. Relocation considers at most a 17 × 17 grid. Each contour pass fits at most 24 shortlisted contours, each sampled to at most 256 points. At most two contour recovery attempts run per frame, each with 24 trial fits and one optional inlier refit. Translation recovery uses at most 24 pairs of already sampled edges. Preview masks are copied only when requested and refresh at most five times per second; their cache is keyed by method and label to avoid displaying a threshold mask as tracked edges. Processing time still depends on ROI size, image complexity and hardware.

## Mathematical conventions and deliberate corrections

Image coordinates have x to the right and y down. Camera coordinates have +z away from the camera. Ellipse `major` and `minor` are **semiaxes in pixels**, and `angle` is the major-axis angle in **radians**. OpenCV's full diameters and degree angles are converted once at the detector boundary. Crop-local positions are translated to full-frame coordinates before fitting the eye model.

For major-axis angle θ, the minor-axis direction is `(-sin θ, cos θ)`. Its perpendicular unit normal n defines a line residual `n · (c − p)`. The center minimizes the confidence-weighted sum of squared residuals. Nearly circular pupils are excluded because their orientation is indeterminate. A model becomes ready after at least 30 inliers span five of eight angular sectors. Once ready, it is retained through transient failed fits; **Rebuild model** or a relevant setting change starts a fresh fit.

For two contour-neighbor vectors a and b, the inward bisector is `a/|a| + b/|b|`. Its dot product with the vector toward the contour center is normalized by both lengths before comparison with `cos(60°) = 0.5`. The reference compared an unnormalized dot product with a cosine, which makes the decision depend on pixel scale; this implementation corrects that dimensional inconsistency.

With vertical field of view φ and square pixels, `fx = fy = height / (2 tan(φ/2))`. The camera ray is `normalize(((u − cx)/fx, (v − cy)/fy, 1))`. The assumed eye radius R and the projected sphere's angular radius α give center distance `D = R / sin α`. This construction is exact for an on-axis spherical silhouette; representing an off-axis silhouette by an image circle remains an approximation.

For normalized ray d, origin o and sphere center C, set `b = d · (o − C)` and `c = |o − C|² − R²`. Solve `t = −b ± sqrt(b² − c)` and choose the nearest positive root. Negative discriminants and intersections behind the camera are rejected. A tiny numerical tolerance handles roundoff at tangency; the implementation does not fabricate a tangent for a missed ray. Gaze is `normalize(o + t d − C)`.

Screen features are `(gx/−gz, gy/−gz)`. An affine map fits normalized browser coordinates from nine targets using centered/scaled QR least squares, with rank and non-finite checks. Leave-one-target-out error checks calibration consistency; the five-point validation captures different targets after fitting. Predictions remain unclamped so off-screen estimates are visible as off-screen rather than falsely accurate edge hits.

## Assumptions and practical limits

The defaults of 45° vertical field of view and 12 mm eye radius are **assumptions**, not measured camera or subject parameters. Enter the actual camera field of view when known. The radius mostly sets metric scale; it cannot turn this model into a calibrated eye-anatomy measurement.

The tutorial's minor-axis convergence and outer-extent sphere fit are approximate eye models. They do not compensate for corneal refraction, lens distortion, pupil-size changes, eyelid occlusion or head/camera motion. Screen calibration is empirical and only valid for the current pose and viewport. A dark object can resemble a pupil, which is why careful eye-region framing and geometric fit checks matter. Real footage and camera-specific validation are needed before making accuracy claims.

## Troubleshooting threshold and pupil loss

- **Auto bias is not a fixed cutoff.** Auto primarily follows measured rim edges and adjusts segmentation when needed. Switching to **Manual** starts with the selected segmentation cutoff, or an estimated interior/exterior midpoint after rim tracking or edge recovery. The latter is a starting value for tuning; it does not reproduce the edge measurements exactly.
- A fixed cutoff does not fix the incoming camera intensities. If available, lock camera exposure/gain in the camera's own controls, focus the pupil rim, and keep illumination steady. The app crops the ROI after capture; it does not lock camera exposure. Bright reflections inside the pupil remain inside the ROI. Exposure control capabilities vary by device; see the [MediaStream Image Capture specification](https://w3c.github.io/mediacapture-image/).
- A solid mint outline is accepted. A dashed sand outline is a current, unaccepted candidate; it contributes neither eye-model observations nor gaze. Weak candidates report a short reason rather than silently disappearing. The blue sphere is an estimated eye model and is only shown from the Eye model step onward.
- Keep the pupil's full movement and some surrounding iris inside the ROI, including downward eye positions. Avoid raising the cutoff until the iris merges into it. Partial rim tracking can retain a known pupil shape while current visible arcs locate its center. This estimates the hidden part of the outline; it does not measure the occluded shape independently. Broad shadows can still resemble a pupil. Large reflections, blur, fully closed eyelids and pupils below the usable pixel size can leave insufficient information for a measurement.

The September 27 screenshot investigation reproduced a weak fit (about 74%) on the cleaner threshold mask. Rim recovery raised its geometric support to about 84%, above the unchanged 82% acquisition gate. One image-view crop also recovered; the most distorted crop still had no reliable automatic detection. These are screenshot-derived static checks, not measured gaze accuracy or proof of video stability. User image data stays out of version control.

The September 30 revision was replayed against a supplied 37.4-second IR recording at 24 fps, with a 600 × 400 ROI starting at (320, 270) in the 1280 × 720 source and Auto bias zero. The revised engine returned an accepted pupil on 897/897 sampled frames; the original committed engine returned one on 629/897 with the same input. Corner and lash-occlusion overlays were inspected, including the previously missed movement under lashes. These counts measure output continuity, not labeled pupil or gaze accuracy. The final native Bun/OpenCV replay measured a median processing time of about 0.7 ms and a 95th percentile of 9.1 ms; it excludes decoding, browser capture, worker transfer and rendering. Live-browser performance still needs device-specific checking. The footage, replay scripts and annotated comparison remain outside the repository.

## Verification

```sh
cd frontend
bun test
bun run typecheck
bun run lint
bun run build
```

The suite covers analytic rays and spheres, rotated ellipse axes, robust center fitting, calibration rank rejection and known mappings, OpenCV detection on synthetic grayscale images, pupil loss, stale model support, source cancellation, and source startup while settings change. Detection regressions cover pupils across the ROI despite a darker eyelash, a larger dark distractor, an enclosing iris, absolute thresholds, abrupt false jumps, recovery, and mild partial occlusion. Additional synthetic cases cover illumination gradients, small pupils in large ROIs, wide pupils in shallow ROIs, eyelid-connected rims, partial clipping, crossing lashes, and consistent selection with previews on or off. ROI tests cover bounds, handles, movement, redraw, and commit-on-release behavior.

The OpenCV worker adds approximately 10.8 MB before transfer compression, so its first load can take longer than the UI. Vite's `fs`, `path`, and `crypto` externalization notices originate from unused Node branches in the OpenCV distribution.
