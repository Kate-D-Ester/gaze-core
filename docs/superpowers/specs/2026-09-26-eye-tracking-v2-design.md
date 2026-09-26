# GazeCore V2

Kate requested two formats in V2 progress, a complete visual setup pipeline, a minimal UI, and mathematically verified tracking based on Jason Orlosky’s video https://www.youtube.com/watch?v=Gh8LS9erugE.

## Scope
A public, local-only `/v2` workspace alongside existing authenticated routes. Tracker 1 keeps the existing detection and corner-based geometry. Tracker 2 implements the video’s near-eye pipeline using OpenCV.js in a worker. No frames or gaze samples are sent to the backend. Existing test/widget APIs remain compatible.

Camera/video → eye ROI → pupil preview → eye model → calibration → live gaze. A labeled synthetic sample permits inspecting the complete pipeline without hardware. A near-eye IR source is the working assumption; dark-pupil segmentation is not a general full-face eye recognizer. Users draw a single eye ROI, and inspect quality before proceeding.

## Tracker 2
Sparse darkest uniform patch → thresholds +5/+15/+25 → dilation → exterior contours → ellipse fit and contour overlap scoring → normalized three-point inward-curvature filtering → refit ellipse. Use OpenCV's actual rotated ellipse, explicit semiaxes and radians. Keep previews and numerical confidence together. Reject uniform, clipped, degenerate, low-contrast or insufficiently elliptical observations.

Gather up to 100 diverse, high-quality ellipses. The projected pupil normal follows the minor axis; exclude near-circular ellipses and parallel directions. Deterministic consensus intersections and weighted least squares estimate a 2D center, with temporal averaging. Infer projected sphere extent from observed pupil outer edges, requiring spatial coverage and residual checks before allowing a lock. This is a near-eye approximation, not a fully calibrated refractive eye model.

Use configurable vertical field of view (default 45°) to derive intrinsics for the full working frame. Estimate 3D sphere distance from projected radius and assumed physical radius (default 12 mm). Unproject pupil through K^-1; solve ray–sphere quadratic for nearest positive intersection; normalize intersection minus center. Reject missed/behind-camera intersections. Camera coordinates: +x right, +y down, +z away from camera; outward gaze generally has negative z. Do not reuse stale gaze on blinks or missing input.

The video ends before screen calibration. Add an explicitly separate nine-target empirical mapping from ray slopes to normalized screen coordinates, with stable fresh samples, rank checks, leave-one-target-out error, and independent validation. Mapping is invalidated by source, ROI, detector, camera model or eye model changes. Display image-space and calibrated screen-space values separately. Model-derived millimeters and angles remain estimates with default intrinsics.

## UI
Existing Geist font. Light neutral workspace, charcoal preview, restrained teal status accent. Numbered vertical steps, a large aspect-correct camera canvas, compact controls with one primary next action, threshold thumbnails, separate eye-sphere visualization, collapsible technical detail. Explicit idle/loading/error/lost-eye states. Accessible keyboard controls, focus indicators, responsive narrow layout, camera stop/unmount cleanup.

## Verification
Numerical tests: rotated ellipse axes and orientation; normalized contour filtering; consensus under outliers/parallel lines; sphere radius; ray hit/miss/tangent/inside/behind; known-angle directions; calibration recovery, rank failure and validation; reset and no stale samples. Synthetic image integration tests through real OpenCV. Browser walkthrough with labeled synthetic sample and permission-error handling. Full frontend tests, typecheck, lint and production build. Real hardware accuracy requires recorded near-eye data or a human calibration trial and cannot be guaranteed from synthetic tests.
