# Camera-only object matching

Kate wants a real visual overlay for an LED-only cosplay prop. Selecting an object in the scene view must find that instance in the auxiliary view, without requiring the eye tracker. The existing simulated HUD cannot satisfy this. No hardware control, aiming corrections, firing output, or facial identity recognition is part of this feature.

## Flow

Click an object in Scene and press Select (the same typed/voice command). YOLOE prompt-free detection chooses the smallest detected box containing the click. Dragging a box provides an explicit visual example for small/undetected objects, including glasses. A fresh calibrated gaze can supply the Scene point when no manual point exists, as Kate originally requested. Selection captures the oriented scene frame; no implicit center selection. Clear stops matching. A single compact badge in the third preview shows Choose object, Searching, Matched, Ambiguous, or an actionable error. A box appears only for a fresh, accepted match. The existing pinned commands and camera setup remain.

## Matching and limitations

YOLOE nano visual prompts propose objects resembling the scene example. OpenCV ORB correspondences and RANSAC geometry corroborate the instance. The displayed match score is the geometric inlier proportion, requiring at least eight inliers and a score strictly above 0.80. YOLO confidence is a separate detector score, not an identity probability. Similar plausible candidates are rejected as ambiguous. No guarantee of recognition of every object or every viewpoint: small, plain, blurry, occluded, or radically changed views can stay Searching. The reference remains fixed to prevent drift; no biometric identity database.

## Architecture

An isolated uv Python environment runs two pinned YOLOE models and OpenCV in a loopback-only service owned by the web launcher. A same-origin Next route proxies bounded JSON requests; a per-launch secret protects the service. Only Scene reference and Auxiliary analysis frames are sent locally, kept in memory, and expired. Eye frames are never sent. No camera URL fetching or image persistence. Dependencies/model downloads are explicit setup, never triggered by image requests; analytics and automatic dependency installation are disabled.

The browser sends at most one inference at a time and drops intermediate frames. A selection/source generation tags each request. Clear, orientation/source changes, hidden/unmounted UI, and newer selection invalidate late results. Frame stalls hide results; recovery on the same source resumes matching. Auxiliary disconnect/source changes clear its overlay and continue searching in the new source. A fixed reference is discarded if Scene orientation/source changes. HTTP timeouts and invalid responses surface errors, with retry via Select.

## Validation

Test actual threshold, geometry, ambiguity, input limits, expiry, authentication, stale async results, and frame loss/recovery. Exercise real YOLO inference using public fixtures and translated/rotated views plus a blank/different scene. Verify existing eye/voice/camera tests, lint, typecheck, build, and minimal browser overlay without accessing Kate's live cameras. Include upstream AGPL license notice; do not publish or relicense the existing project.
