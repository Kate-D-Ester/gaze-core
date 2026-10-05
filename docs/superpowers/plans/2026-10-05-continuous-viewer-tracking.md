# Continuous viewer tracking implementation plan

> Execute inline with the executing-plans and TDD workflows. Prior user authorization requests autonomous implementation in this isolated worktree.

Goal: a Scene selection follows the visual region continuously in Scene and, after verified acquisition, Target. Test each requested video region separately. OBS framing changes are cancelled.

Design: NanoTrack v3 supplies bounded temporal updates; YOLOE plus geometric verification retains second-camera acquisition. Add a Scene tracking request and source revision to Target requests. Both overlays expire after 500 ms. No physical control output, recognition of identity, uploads, or saved camera frames at runtime.

Constraints: existing Bun/uv stack; models checksum-pinned; private video artifacts stay ignored under .local-reference. Preserve camera configuration keys and Scene-only selection.

Review focus: independent Scene tracking when Target is disconnected; source/rotation changes; stale or cleared asynchronous results; low confidence and occlusion; selection of object parts without detector labels.

## Tasks

- [x] 1. Write failing temporal tracker tests for moved boxes, >80% evidence, blank/lost frames, changed dimensions, and long gaps. Implement vision/temporal.py with NanoTrack v3 and pinned assets.
- [x] 2. Extend backend/proxy protocol with track(role=scene) and match(stream revision). Allow boxed regions without ORB detail; use geometric global region acquisition and deduplicate overlapping candidates. Add HTTP boundary and acquisition tests.
- [x] 3. Write failing client tests for moving Scene overlays without Target, moving Target temporal results, old source rejection and expiry. Update ObjectTracking, types, and ObjectOverlay without extra controls.
- [x] 4. Add a reusable local video evaluator. Hand-review starting boxes and sampled truth boxes; run face, glasses, clothing, open hand, closed hand and arbitrary phone tests sequentially. Output per-case video/JSON and distinguish tracking scores from accuracy. A transformed copy tests overlap only, not a true second viewpoint.
- [x] 5. Run full Python/Bun suites, lint/types/build, real-model movement/loss/recovery, public browser playback, independent review. Apply review fixes with regression tests, commit and leave 4016 running.

Validation commands: uv run --project vision pytest vision/test; bun run --cwd frontend test; bun run --cwd frontend lint; bun run --cwd frontend typecheck; GAZE_WEB_DIST_DIR=.next-vision-preview bun run --cwd frontend/apps/web build.

Measured decision: the v2 comparison drifted/missed fine regions. The official v3 weights use a 15x15 map that OpenCV TrackerNano hardcodes as 16x16; implemented the author's ONNX decoding parameters directly through existing OpenCV DNN/NumPy. Added local appearance consistency, reverse checking for weak motion evidence, and corroborating Lucas–Kanade motion. Verified flow updates keep the neural center current; blind periodic template adaptation was rejected by video measurements. Contradictory geometric motion rejects a neural proposal. Last verified appearance crops support reacquisition. Dense appearance fallback requires correlation >92%, tonal agreement and a distinct best region; uniform/duplicate patches remain unconfirmed. These are similarity scores, not identity probabilities.


Video evaluation outcome: 49 sparse checkpoints in six sequential cases at 15 Hz. Face 12/14 Scene, 11/14 synthetic Target; specs 4/12, 5/12; clothing 4/8, 7/8; open-hand 1/7, 1/7; closed-hand 1/4, 1/4; phone 3/4, 3/4. Reliable hand/specs accuracy is not achieved. Evaluated smaller ViTTrack as a comparison and rejected it on the same local cases. Functional tests pass independently of failed video accuracy; do not mark the accuracy objective complete.


Final verification: 39 Python tests; 778 Bun tests; Ruff, frontend lint, types, production build and diff whitespace checks passed. Public real-model smoke: maximum healthy Scene/nonmatching Target pair 147.9 ms, zero Scene deactivations. Browser fixture verified moving Scene/Target box styles, blank Target box removal with Scene still Tracking, Target reacquisition, dropped Scene frame expiry/resumption and Clear. Production 4016 now reports YOLOE-26n + NanoTrack-v3 on MPS. Private accuracy is still failed, independently of these passing functional checks. No OBS framing changes were made.


## Original-reference drift guard and same-video replay (2026-10-05)

Regression tests reproduced gradual drift and contaminated recent-crop reacquisition. Both temporal verification and every acquisition/recovery now use the immutable original Scene reference. Newly acquired Target crops cannot replace it. Crop rounding is consistent, and tiny regions avoid unsupported ORB pyramid processing. Ongoing confirmed responses retain the Tracking label and the actual confirmation score.

Six identical-video cases processed all 3,966 frame pairs from selection through the final decoded frame at a 30 fps video cadence. Target independently searched from the Scene token, without a Target rectangle. Correct sparse checkpoints (IoU >=0.5, missing boxes fail): face 7/14 Scene and 7/14 Target; glasses 3/12 Scene and 3/12 Target; clothing 0/8 Scene and 1/8 Target; hand-open 1/7 Scene and 1/7 Target; hand-closed 1/4 Scene and 1/4 Target; phone 1/4 Scene and 1/4 Target. All initial Target acquisitions succeeded. No accepted boxes were wrong at the 49 reviewed checkpoints, but rejection/gaps increased substantially. **Reliable continuous tracking remains failed; rejecting reference drift does not establish accurate posture tracking or recovery.** Sparse checks do not rule out wrong matches between checkpoints. Hand annotations stop at 20s and phone annotations at 30s, although status logs and videos continue through the endpoint.

The final Python suite passes 48 tests and Ruff. Private case definitions, full-frame JSON, clips, checkpoint sheets and the report remain ignored under .local-reference/motion-tests/same-video-original-reference. Identical frame replay is not an independent physical-camera benchmark, and processing every recorded frame is not a live FPS claim.

Release verification: the final public-image real-model check passed 0/5/15-degree views, blank/unrelated rejection and 12 healthy Scene/nonmatching Target pairs, with zero Scene deactivations (maximum pair 288.2 ms). The restarted isolated 4016 viewer returns HTTP 200 and its local service reports ready on MPS. The source commit excludes all private recordings and test artifacts.
