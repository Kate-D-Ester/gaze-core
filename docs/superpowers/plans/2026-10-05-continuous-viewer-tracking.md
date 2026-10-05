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
