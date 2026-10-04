# Worktree-v4 merge handoff for the EIA / integration chat

This is a historical handoff. The current v3 app has since removed the camera relay described below and connects network cameras directly from the browser. Use `frontend/README.md` for current startup and camera permission requirements.

Prepared for Kate on 2026-10-02. This document describes the complete scene-camera work and the behavior to preserve when integrating it into the actual working branch. It is a handoff, not evidence that a merge or deployment has happened.

## 1. Source and merge scope

| Item | Inspected value |
| --- | --- |
| Source checkout | `/Users/kate/Desktop/Codex-projects/worktree-v4` |
| Source branch | `codex/worktree-v4` |
| Current committed HEAD | `60b69efd06ad3daecc0d99ee5cdca2d5edcdf24b` |
| Common ancestor with the locally fetched `origin/v2` | `cd0d193f9aeafcf76010e20053300383a9b8d19e` |
| Locally fetched `origin/v2` at inspection | `cd0d193f9aeafcf76010e20053300383a9b8d19e` |
| Local `v2` at inspection | `e2b1e841b2b1870a08090118182b954acd4d49c6` |
| Original `v2` checkout | `/Users/kate/Documents/personal/gaze-core` |
| Feature route | `/trial/scene-camera-eye-tracking` |
| Current preview | `http://127.0.0.1:4014/trial/scene-camera-eye-tracking` |
| Local network-camera relay | `http://127.0.0.1:4022` |
| Destination branch | Not specified in this documentation request; resolve it from Kate's intended working checkout before integration. |

The source was created for this work from `v2`. Do not substitute the separate `codex/v3-webcam-gaze` worktree or assume that Kate's phrase “full worktree” means that other branch. The local `v2` and fetched `origin/v2` refs now differ; inspect the target's recent work instead of overwriting it with an older source tree. These refs describe local inspection, not a newly fetched remote state.

**The source contains substantial uncommitted modifications and untracked new source files. Merging only the current HEAD will omit the latest camera recovery, UI, marker, one-point direction, sound, offset and calibration-stability work.** Capture the complete source state, including this documentation, before integration. Do not use `git diff HEAD` alone as the full feature inventory: the original route and recording implementation are already committed.

Committed history after the common ancestor:

```text
6ba620f Improve pupil reacquisition across occlusion
71b9871 docs: design scene camera eye tracking
1db012c docs: plan scene camera implementation
d4f9a1a feat: add scene calibration quality gates
128b8d2 feat: add independent scene camera and hand worker
8aaf720 feat: add fingertip calibrated scene gaze route
6231177 feat: record scene gaze and export session artifacts
9fe352d test: verify scene runtime and document headset workflow
60b69ef fix: preserve scene calibration and recording timing
```

Keep the relevant pupil reacquisition changes and tests when resolving overlap with the destination. Some of this history may already exist there; compare ancestry and behavior rather than blindly replaying duplicates.

## 2. Kate's requirements and the current result

| Requirement | Preserve during integration |
| --- | --- |
| Separate scene route based on V2 | Public `/trial/scene-camera-eye-tracking`, using the existing V2 tracker. `/trial` remains the screen-tracking flow and `/v2` continues to redirect to `/trial`. No authentication/backend dependency for these trial routes. |
| Two cameras | Independent eye and scene sources, lifecycle and previews. Both support USB and network sources. Prevent selecting the same resolved USB device for both roles, including default-device resolution and the reverse selection order. |
| Eye setup steps 1–3 | Camera, eye region and eye model remain. Keep both **Eye Tracker 1 / manual** and **Eye Tracker 2 / automatic**. Calibration method selection is a separate choice. |
| Step 4 | Connect and orient the outward scene camera. Keep source selection simple and remember entered URLs independently for the two cameras. |
| Scene calibration | Keep all three methods: **Hand**, **Marker**, **One point**. Do not replace one with another or make marker calibration a download-only workflow. |
| Network stability | Shared MJPEG/video connection recovery for both eye and scene cameras, latest-frame processing, corrupt-JPEG dropping and automatic retries. Temporary loss must not crash the route or masquerade as valid fresh frames. |
| ESP32 / IP URLs | Preserve the exact supplied host, port and path. A working `http://esp32.local/stream` must not be silently changed to port 81 or require camera firmware CORS/HTTPS changes. The local relay supplies readable pixels. |
| Orientation controls | Clockwise/counterclockwise quarter turns, a numeric arbitrary-angle control, horizontal mirror, vertical flip and reset on both cameras. Controls have accessible names and visible hover/focus tooltips. |
| Minimal interface | Compact headings, icon source/transform controls, help on hover/focus, concise status. Do not restore repeated “STEP 01 / CAMERA”, redundant instructions, large empty cards or overwhelming paragraphs inside the product UI. |
| Camera-card layout | Preserve aligned card heights and current responsive proportions. Marker calibration has three equal-width/equal-height desktop cards: **eye left, marker center, scene right**. The target stays fixed when progress or status changes. Small screens adapt without clipping controls or horizontal overflow. |
| Calibration debugging | Eye and scene previews remain visible together during calibration, showing actual pupil confidence/readiness alongside the reference. They use the same evidence as the collector. |
| Stable collection | Saved holds and completed progress are retained. Short loss pauses the unfinished hold; sustained loss/movement resets only unfinished evidence. Do not restore automatic endless calibration/retry loops. |
| Sound | Stable-lock cue, continuous fresh-sample capture tone, short interruption buzzer, saved-point cue, and remembered mute preference. Users can keep looking at the physical reference. |
| Failed accuracy checks | Keep the fitted mapping visible as an explicitly unverified preview with errors and recovery actions. Do not block all preview access or silently claim accuracy passed. |
| Live adjustment | X/Y offsets in scene pixels, reset and optional one-point X/Y sensitivity. Apply offsets consistently to the dot, trace, coordinates and heatmap; preserve the separate accuracy state. |
| Data and recording | Local gaze logs, full hand landmarks when available, raw scene video, optional raw eye video, CSV, JSON and dwell heatmap PNG. Hand presence is not required for live gaze after calibration. |
| Five-point quick mode | Discussed as a possible improvement, **not implemented**. Current Hand/Marker require nine calibration regions plus five fresh checks. Do not document or ship five-point operation as an existing feature. |

Kate reported that the **card/marker method worked very well on her real setup** after the circular-marker update. Preserve that working detector, target layout and calibration mathematics. Her latest correction concerns the one-point direction convention, not a request to rewrite the successful marker method. The multi-point hand method had not yet received her equivalent hardware confirmation. The latest one-point correction has software/browser verification, not a new hardware accuracy measurement.

## 3. Architecture and files to carry together

The complete checkout-relative paths appear in the manifest. In this table, `src/`, `scripts/` and `public/` shorthand is relative to `frontend/apps/web`; bare scene module names belong to `src/features/scene-eye-tracking/`.

| Area | Files and responsibility |
| --- | --- |
| Route and shared eye flow | `frontend/apps/web/src/App.tsx`, `src/pages/v2-page.tsx`, `src/pages/v2.css`; route selects `<V2Page sceneMode />`. Keep screen tracking and account routes functional. |
| Pupil/model evidence | `src/features/eye-tracking/detection.ts`, `detection.types.ts`, `engine.ts`, `eye-tracking.types.ts`, `use-tracker.ts`, `use-tracker-worker.ts` and associated types. Preserve occlusion/reacquisition behavior and the locked-model lifecycle. |
| Shared network path | `src/features/eye-tracking/network-source.ts`, `network-camera.ts`, `camera-relay.ts`, `camera-relay-server.ts`, existing `mjpeg.ts`; `scripts/camera-relay.ts` and the `camera-relay` package script. Both camera roles use these modules. |
| Orientation and preferences | `src/features/eye-tracking/camera-transform.ts`, `components/camera-transform-controls.tsx`, `components/camera-source-type.tsx`, `components/help-tip.tsx`, `use-camera-source-preferences.ts`, existing `tracker-preferences.ts`; eye preview, threshold and step/source/region/model control changes. |
| Scene lifecycle | Entire `src/features/scene-eye-tracking/` directory, including `scene-camera.ts`, `scene-workspace.tsx`, `use-scene-camera.ts`, `scene-preview.tsx`, `calibration-eye-preview.tsx`, `scene.css` and `scene.types.ts`. |
| Shared calibration | `calibration.ts`, `scene-session.ts`, `use-scene-session.ts`, `eye-evidence.ts`, `scene-controls.tsx`, `calibration-method-controls.tsx`, `calibration-preferences.ts`, `one-point-calibration.ts`, `gaze-offset-controls.tsx`, `validation-recovery-controls.tsx`, `use-calibration-feedback.ts`. |
| Reference trackers | `hand.worker.ts`, `hand-tracker.ts`, `hand-stability.ts`, `use-hand-tracker.ts`; `marker.worker.ts`, `marker-tracker.ts`, `marker-detector.ts`, `use-marker-tracker.ts`, `screen-calibration-marker.tsx`. |
| Recording/export | `recording.ts`, `session-recorder.ts`, `recording-controls.tsx`, `session.ts`, `heatmap.ts`, `download.ts`. |
| Runtime assets | `frontend/apps/web/package.json`, `frontend/bun.lock`, `scripts/prepare-vision.ts`, `public/models/hand_landmarker.task`, `public/models/LICENSE`, `public/models/README.md`, app `.gitignore`. |
| Verification | Existing and new `frontend/tests/eye-tracking/` checks, entire `frontend/tests/scene-eye-tracking/`, `scripts/scene-browser-fixture.tsx`, `scripts/hand-replay.ts`. The fixture uses synthetic inputs and the actual production marker worker. |
| Documentation | `README.md`, `docs/eye-tracking-v2.md`, `docs/scene-camera-eye-tracking.md`, this handoff, scene design/plan files, `docs/gaze-core-calibration-marker.svg`, existing scene preview image. |

Merge the shared eye-tracking changes as well as the scene folder. Copying only the new route or scene folder omits network recovery, camera transforms, source preferences, reusable UI and evidence fixes that the feature depends on.

### Shared hand/card calibration contract

```text
Hand: raw MediaPipe index-tip landmark 8 -> SceneSession.observeHand
                                             |
Marker: fresh detected circle center ---------+-> observeReference
                                                  |
                                        inspectReferenceObservation
                                        timestamp / pupil pairing
                                                  |
                                             collectPair
                                        observed stable hold
                                                  |
                                       inspectSceneCalibration
                                                  |
                                      validateSceneCalibration
                                        fresh independent holds
```

The session converts the hand into a generic reference before pairing. Both methods use the **same collector, candidate mapping fits and accuracy calculations**. Hand points are manually locked with Space; marker points are automatically captured in uncovered scene regions. Those interaction differences do not justify separate mapping code. One-point mode shares reference pairing/collection but deliberately has its own one-hold estimator.

Keep the parity regression in `scene-modes.test.ts`: identical reference/eye coordinates passed through Hand and Marker must produce the same independent scene prediction and accuracy result.

## 4. Coordinate convention: do not reintroduce the one-point bug

Kate corrects the camera views herself using rotation and mirroring. Those **adjusted views are the reference frames**. The eye tracker already operates on the adjusted eye image; scene detection already operates on the adjusted scene canvas. These image transforms are applied once before analysis.

With a normal front-facing eye view and a normal outward-facing scene view:

| Wearer's gaze | Adjusted eye-image pupil movement | Adjusted scene gaze |
| --- | --- | --- |
| Right | Left | Right |
| Left | Right | Left |
| Up | Up | Up |
| Down | Down | Down |

The fresh one-point estimate uses the locked eye's gaze slopes relative to the fixation anchor:

```text
scene_x = anchor_scene_x - gain_x * (eye_feature_x - anchor_eye_feature_x)
scene_y = anchor_scene_y + gain_y * (eye_feature_y - anchor_eye_feature_y)
```

Default gain is `0.5` horizontally and `0.5 * adjusted_scene_width / adjusted_scene_height` vertically, a nominal 90-degree horizontal projection. Signed gain edits can deliberately reverse sensitivity. This is an estimate of scale; one fixation cannot measure the entire physical mounting/optical relationship.

**Do not restore `sceneOrientation * inverse(eyeOrientation)` in `fitOnePointCalibration`.** That previous implementation undid Kate's corrected views and could swap axes or reverse the intended direction. Orientation is retained as setup metadata and changing it invalidates the mapping; it is not reapplied to the already adjusted features. Preserve normal camera display transforms themselves.

If one-point capture reanchors a previously checked mapping, retain that mapping's learned coefficients and compute only its translation offset. Do not impose the fresh estimator's horizontal sign on a learned mapping. X/Y gain edits of a fresh estimate retain its facing convention.

All exported scene coordinates use X right / Y down in the adjusted scene image. No edge clamping: coordinates outside the image stay outside it. Predictions outside sampled coverage are marked as extrapolated.

## 5. Reference detection, stability and timing

### Working circular marker

Preserve the broad black outer ring, white gap, black center disc, tiny red fixation center and white quiet zone. The on-page and printable SVG share this design. Do not revert to the complex checker/ArUco pattern that Kate's camera struggled to detect.

The OpenCV worker applies light Gaussian denoising, Otsu and local adaptive thresholds. It checks nested ellipse geometry, relative band sizes, concentricity and local contrast. The small black center disc supplies the fixation coordinate, reducing perspective bias from the larger outer ellipse. It estimates a 2D reference center; it does not recover a 3D marker pose.

Preserve latest-frame worker scheduling, 960-pixel longest-side input limit, fresh timestamps, generation checks, bounded resources and disposal of bitmaps/OpenCV matrices. Similar-sized ambiguous references are rejected. A smaller preview copy cannot replace the dominant reference; after acquisition, an abrupt shrink below 40% of the prior accepted area is rejected. Source/image-size changes reset this guard. Do not replace missing detections with cached calibration points.

During on-page marker calibration, the **displayed** scene preview masks the recognized black/white pattern while retaining its outline/center. This prevents an optical feedback copy from becoming another target. The detector's input canvas and raw recordings remain unmasked. The middle target's size and position cannot change during capture.

### Hand tracking and collection

- MediaPipe `@mediapipe/tasks-vision` **0.10.32**, locally served float16 Hand Landmarker v1, `VIDEO` mode, one calibration hand. GPU first with CPU fallback.
- A classic IIFE hand worker is required because the pinned runtime uses `importScripts`. `prepare-vision.ts` generates it and copies matching WASM assets. Do not switch it to a module worker without validating runtime compatibility.
- Hand inference keeps at most one request in flight and processes the newest waiting scene frame. Input preserves aspect ratio with a 640-pixel longest side; original scene coordinates and timestamps are retained.
- Light preview smoothing and a palm-size-relative jump confirmation guard reduce jitter. Accepted calibration/log points remain raw, timestamped detector coordinates. Smoothing and a dimmed last outline must never supply evidence.
- The detector is configured for one hand. Do not promise dependable multi-hand detection merely because downstream validation can reject multiple landmark sets.
- Collector states distinguish waiting, settling, capturing, paused and saved. Completed holds are kept; saved progress stays full. Hand-label flips do not reset a fixation. Keep explicit, targeted retries rather than automatic endless corner retries.

Current collection/timing values:

| Rule | Current value |
| --- | --- |
| Initial stable settling | 300 ms |
| Fresh distinct pairs per hold | At least 20 |
| Observed steady capture time | At least 800 ms; missing intervals do not count |
| Minimum eye confidence | 0.70 |
| Eye/scene mismatch after configured delay | At most 100 ms |
| Scene freshness | 250 ms |
| Brief weak eye-evidence pause | Up to 350 ms |
| Armed reference recovery | Up to 3 seconds, without inventing samples |
| History | 3 seconds, bounded |

Both pipelines use monotonic `performance.now()` receipt/decode timestamps. Positive scene delay means scene arrives later: a scene at 1000 ms with +100 ms uses eye evidence near 900 ms. Negative delay waits for later eye evidence. Keep the queued-reference and historical-scene handling for negative delays. A fixed adjustment is not hardware synchronization and cannot cancel variable network jitter.

### Capture sounds

Keep the low stable-lock cue, quiet continuous tone during fresh sample collection, 180 ms interruption buzz and rising saved-point cue. The continuous tone stops on pause, cancel, mute or completion. A 250 ms fresh-sample watchdog prevents it continuing through a stalled pipeline; duplicate repaints cannot renew it. Buzzes are rate limited to once per second. Remember mute preference and handle browser audio activation through the user's calibration interaction.

## 6. Mapping, accuracy failure and live adjustment

Hand and Marker currently collect nine distinct regions with broad horizontal/vertical coverage, then five new physical fixations for validation. Keep manual eye-model geometry and auto eye-model geometry supported in every method.

The fitter compares affine, projective and quadratic candidates using whole-location leave-one-out diagnostics. A more complex fit needs at least a 10% diagnostic improvement. Projective fits reject singular geometry and a horizon inside the sampled feature rectangle. A good full fit is not rejected solely because leaving out a corner creates extrapolation error. Training and fresh validation require normalized RMS at most `0.025` and worst-location error at most `0.05`; report native-scene pixel errors too. These are current software thresholds, not measured angular accuracy.

If fitting fails, report a structural problem or offer an explicit replacement of the worst location while keeping the other eight holds. Do not automatically cycle through the same failing point. On a successful fit, Hand/Marker begin the five fresh checks and open live gaze automatically if those pass.

If the fresh check fails:

- Retain the mapping and show the dashed amber **Unverified preview**, RMS, worst error and per-location diagnostics. Fresh predictions can be previewed but must not become validated recording/heatmap samples.
- Keep X/Y offset controls accessible. A proposed constant translation must substantially reduce error and fit the existing limits; it still needs **new fixations** to count as an accuracy pass.
- Keep **Try offset & check**, **Repeat point** where appropriate, **Check again**, recalibration and local diagnostic downloads. An offset change invalidates reuse of the old check.
- Preserve stale-frame/pupil-loss suppression even in an unverified preview.

One point opens estimated live tracking immediately after one stable fixation; it does not invent a validation pass. Estimated recordings remain available and carry the explicit estimate flag. Optional Check accuracy measures five new locations without silently refitting the mapping.

Positive live offset X moves right; positive Y moves down, in native adjusted-scene pixels. Keep offset application consistent across the dot, trace, log and heatmap. Clear the old trace on offset edits. Keep previous validation labeled as previous until a fresh check passes at the current offset. Disable edits during recording; a programmatic coordinate-system/setup change finalizes the recording.

Changing camera source, image dimensions, orientation, eye setup/model or delay invalidates the mapping. Browser resizing alone does not. Temporary network recovery with unchanged source geometry retains setup, while stale data is suppressed. Headset slippage needs recalibration; changing working depth can produce parallax error.

**Five-point discussion status:** a quicker center-plus-four-inset-corner mode with extra positions requested only when needed was recommended, not built. The fitter explicitly requires nine regions and fresh validation explicitly requires five holds. A future quick mode must change those contracts together, choose a mapping identifiable from five locations, and preserve independent checking. Do not simply shorten the target array or loosen thresholds to make tests pass. Do not bundle that feature silently into this merge.

## 7. Camera connection and remembered configuration

Network data path:

```text
eye or scene URL field -> shared NetworkCamera -> openNetworkSource
   -> browser fetch of http://127.0.0.1:4022/stream?url=...
   -> Bun relay resolves .local/private LAN camera on the wearer's computer
   -> MJPEG decode or browser-supported video -> fresh adjusted frames
```

No camera-side CORS header or HTTPS requirement. The local relay adds the response access headers; it does not stream camera data through the auth backend. A hosted app still needs a relay on the wearer's machine, the hosted origin configured there and any browser-required local-network permission. Do not claim that top-level browser URL playback grants canvas pixel access, or that the current implementation needs no local software when hosted.

The current relay accepts HTTP(S), `.local` hosts, private IPv4 ranges and IPv6 unique-local addresses. It rejects arbitrary public hosts, URL credentials and redirects; users supply the final endpoint. It is not a general RTSP/HLS bridge, public proxy or arbitrary authenticated-camera client. Keep loopback binding and the explicit app-origin allowlist. `GAZE_CAMERA_RELAY_ALLOWED_ORIGINS` is a comma-separated list of exact origins. It replaces defaults when set. The server offers `GAZE_CAMERA_RELAY_PORT`, but the browser client currently fixes the origin to port 4022; changing only the server port breaks connection.

Network recovery uses a 15-second initial connection deadline, a waiting state after 1.5 seconds without frames, reconnection after 8 seconds, exponential retry delays capped at 15 seconds and retry-count reset after 10 healthy seconds. Damaged JPEGs are dropped; slow decode retains only the newest pending frame. Explicit disconnect/unmount cancels retries and releases media. Both eye and scene roles use this behavior. USB track loss remains a separate disconnect path; it is not covered by the network retry promise.

Diagnostic limitation: `openNetworkSource` has descriptive relay/upstream errors, but `NetworkCamera.connect` currently catches connection failures and retries without forwarding those detailed messages. The UI can therefore remain in its reconnecting state when the relay or camera is unavailable. Do not confuse the source-module error tests with proof that every detailed failure is displayed by the full UI. Keep recovery intact if improving this reporting later.

Preserve these local storage keys and graceful fallback when storage is unavailable:

| Key | Meaning |
| --- | --- |
| `gazecore.eye-camera.source.v1` | Eye source mode and network URL |
| `gazecore.scene-camera.source.v1` | Scene source mode and network URL |
| `gazecore.eye-camera.transform.v1` | Eye rotation, mirror X/Y |
| `gazecore.scene-camera.transform.v1` | Scene rotation, mirror X/Y |
| `gazecore.eye-tracking.preferences.v1` | Per-format tracker settings, region/manual geometry and dimensions |
| `gaze-core.scene.calibration-method` | Hand / Marker / One point selection |
| `gaze-core.scene.point-sound` | Sound on/off |

Preferences do not restore a locked, validated calibration after reload. Tracker settings restore unlocked; the scene mapping, live offset, one-point gains, recordings and pending calibration are session state, not durable storage. Do not promise all configuration/session data is persisted just because URL preferences are.

## 8. Recording and export contract

Recordings remain local. No gaze, hand, video or diagnostic upload is introduced by this feature.

- Untransformed USB scene recording uses an owned clone of its video track. If the scene is rotated/mirrored, record the adjusted raw canvas instead. Network scene and optional eye recording are canvas re-encodes. Keep preview overlays and marker-display masking out of these canvases.
- Raw video means overlay-free camera frames, not an untouched compressed network bitstream. Keep selected orientation consistent with exported coordinates.
- Live gaze does not depend on keeping the hand/marker visible once calibrated. Pupil/scene loss produces invalid intervals, not invented coordinates. One-point output is explicitly estimated.
- Preserve final encoder chunks: successful recordings finalize on the encoder's final `stop`, not just an early `inactive` state. Recording cleanup releases only owned tracks and does not stop the still-active camera preview.
- Ten-minute sessions; up to 18,000 coordinate rows and 18,000 hand observations; 128 MiB combined video, or 64 MiB per video with both enabled. Preserve useful completed artifacts on codec failure, limits or setup changes. Data-only logging is available when video recording is unsupported.
- Downloads remain until cleared/replaced; a new recording replaces prior downloads. Leaving the route stops/disposes capture, so users must save before closing it. Do not describe recordings as permanent browser storage.

CSV columns are `session_ms,timestamp_ms,eye_frame_id,scene_frame_id,eye_timestamp_ms,scene_timestamp_ms,confidence,normalized_x,normalized_y,pixel_x,pixel_y,valid,reason,extrapolated,estimated`. JSON schema version 1 includes calibration/validation holds, raw pairs, camera/model/settings metadata, delay, applied offset, method, quality, browser time origin, video start offsets, measurements and available hand image/world landmarks. Keep null/invalid values and quoted CSV reasons safe.

Heatmaps are dwell density in the camera image over a raw background. Invalid/out-of-frame intervals and gaps over 250 ms add no dwell. This does not identify a world object or register the scene across head motion. MediaPipe world landmarks are hand-relative, not absolute scene depth. Shared browser timestamps do not guarantee frame-exact video/gaze alignment.

## 9. Build and run

Use Bun, preserving the lockfile and pinned vision versions. From the source checkout:

```sh
cd frontend
bun install --frozen-lockfile
bun run dev --host 127.0.0.1 --port 4014
```

In another terminal:

```sh
cd frontend/apps/web
bun run camera-relay
```

For a production preview instead of dev:

```sh
cd frontend
bun run build
bun run --cwd apps/web preview --host 127.0.0.1 --port 4014
```

For a hosted origin, set `GAZE_CAMERA_RELAY_ALLOWED_ORIGINS` on the local relay to the exact deployed origin. Existing default local app ports are 4001, 4014, 4173 and 5173 for localhost/127.0.0.1. Do not launch a duplicate listener over the already-running 4014/4022 servers without inspecting them.

Carry the checked-in hand model and license. Its documented SHA-256 is `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`. Keep the package's `prepare:vision` calls in dev/build. Generated `public/vision-runtime/`, `dist/`, node_modules, local recordings, secrets and temporary test artifacts are not source to merge. The marker and eye workers use the existing pinned OpenCV runtime. Preserve the build scripts instead of hand-copying generated assets.

## 10. Integration procedure and conflict rules

1. Read this document, the current feature guide and the destination's instructions. Resolve the actual target branch and inspect its worktree, status, ancestry and recent commits. Preserve both source and destination changes.
2. Inventory the **complete live source**, committed delta plus tracked edits plus untracked source. The manifest below is a dated aid, not a replacement for a fresh status check. Compare against the common ancestor and destination; do not snapshot only HEAD or copy only the scene folder.
3. Before merging, make the complete source reviewable and recoverable using the integration chat's authorized Git workflow. If committing, review tracked and new source files together and exclude generated/dependency/private artifacts. Do not amend older commits, force-reset, clean away untracked source or stash/pop blindly over unrelated work.
4. Integrate the preserved feature snapshot into the resolved destination. Resolve shared-file conflicts semantically; do not blanket-select “ours” or “theirs.” Carry route, workers, dependencies, shared evidence, camera transforms, recording, tests and docs as a coherent unit.
5. In `App.tsx`, preserve destination routes and account flow while retaining the two public trial routes and V2 redirect. In `v2-page.tsx`/CSS/preview components, preserve both tracking workflows, minimal UI and aligned layouts. Scope scene behavior so it cannot replace screen calibration.
6. In eye/network modules, preserve the shared relay, recovery, pixel transforms, generation/stale-result rejection, fresh-frame timestamps, model retention during same-geometry recovery and actual device exclusion in both selection directions. Carry the related type and lifecycle tests together.
7. In calibration/session modules, preserve working marker detection, shared hand/card mathematics, adjusted-view one-point direction, pause-versus-reset behavior, validation preview/recovery, raw evidence and quality flags. Do not discard failures, lower confidence/error thresholds, or relabel estimates as verified simply to unblock recording.
8. In package/lock/build conflicts, retain destination dependencies plus the pinned vision dependency and worker preparation scripts. Keep licenses/model assets; rebuild rather than merge generated output.
9. Run the destination's checks and the acceptance matrix below. Inspect both trial routes and camera recovery in the integrated build. Update the verification record to the actual target results, including any remaining failures or hardware limits.
10. Report the destination branch/commit, included source snapshot, conflicts resolved and results. Archive/remove the source worktree only after the integration is verified and Kate's cleanup intent is clear. This documentation request does not itself merge, publish, message another chat or remove worktrees.

Useful read-only source inspection commands:

```sh
git status --short --branch
git log --oneline origin/v2..HEAD
git diff --name-status cd0d193f9aeafcf76010e20053300383a9b8d19e
git ls-files --others --exclude-standard
git diff --check
```

The base hash is the inspected local common ancestor, not a hard-coded future integration base. Recompute ancestry if refs move.

## 11. Verification and acceptance

Last implementation verification on 2026-10-02: **317 frontend tests, 0 failures, 2,035 assertions across 33 files**, plus both workspace type checks, lint and production build. This documents the last completed implementation run; the receiving chat must verify its merged destination afresh. OpenCV's existing Vite externalization notices for `fs/path/crypto` are build notices, not a browser runtime failure.

Run from the integrated `frontend`:

```sh
bun test
bun run lint
bun run typecheck
bun run build
```

| Acceptance check | Required result / evidence |
| --- | --- |
| Public routes | Scene route opens without backend/auth; `/trial` still uses screen calibration; `/v2` redirects; destination account routes are preserved. |
| Two-camera setup | Manual and auto eye modes complete steps 1–3; scene is separate; same USB device is excluded even when default resolution reveals a collision. |
| Network cameras | Exact `.local` and private-IP URL work through the relay for both roles. Stalls/corrupt JPEGs recover, disconnect cancels retries, stale data never counts. Test invalid-URL guidance, relay-unavailable retry status and unchanged-geometry model retention; detailed retry diagnostics have the limitation described above. |
| Preferences | Eye and scene URLs/modes/transforms survive reload independently; malformed/blocked storage does not crash; settings restore unlocked. |
| Orientation/UI | Full frame fits through 0/90/180/270 and arbitrary rotations, mirror/flip/reset. Hover/focus labels are visible, not clipped. Marker cards are eye/target/scene in that order, equal desktop sizing, stable target, responsive smaller layout. |
| Hand collection | Nine holds and five fresh checks; manual Space locks; saved progress retained; brief gaps/jitter pause; sustained loss resets unfinished evidence; no automatic endless retry. Eye view explains readiness without requiring a glance away from the physical reference. |
| Marker collection | On-page broad circle tracked through nine regions plus fresh validation; low-contrast/blur/oblique cases and recursive preview protection continue passing. No hand landmarks needed. Keep optional print only as an alternative. |
| Shared fitter | `scene-modes.test.ts` parity case retains equal mapping/validation behavior for equivalent hand/card inputs. |
| One point | One Space fixation opens estimated live preview; wearer-right/left and up/down work in corrected views for both eye models and varied transform metadata. Off-center anchor and gain edits work; a prior checked mapping retains its learned shape. |
| Accuracy recovery | Failed check exposes unverified preview and diagnostics; constant offset needs new checks; targeted replacement keeps unaffected holds; current-offset verification controls recording quality. |
| Sound | Lock, continuous fresh capture, interruption and saved cues work; watchdog stops stale capture tone; mute persists. Saved cue survives transition into validation. |
| Recording/export | Overlay-free scene/optional eye video, transformed USB canvas when needed, data fallback, correct extensions, final chunks, separate track ownership, CSV/JSON flags and metadata, offsets and dwell heatmap. Hand can leave while gaze continues. |
| Cleanup | Mode/source/setup changes cancel invalid work; old worker epochs cannot publish; route exit/unmount stops owned resources; useful finalized artifacts remain available while mounted. |

The disposable browser fixture is prepared **after** a production build:

```sh
bun tests/scene-eye-tracking/prepare-browser-fixture.ts
```

Open `/scene-fixture.html` on the preview server. It uses synthetic sensors, the production marker worker and optional real MediaPipe runtime/replay. Toggle blur/low contrast, recursive camera preview, pupil/hand loss, jitter, perspective, validation bias and isolated outliers. Test all methods and inspect finalized raw video. A new production build removes the fixture. Its settings share the same local storage origin: record and restore the user's original method/camera preferences, do not interrupt an active user capture, and close temporary test tabs afterward.

Previous browser evidence includes nine marker holds plus five checks with simulated blur, low contrast and preview feedback; nine hand holds plus fresh checks with confidence dips/jitter/spikes; unverified offset/outlier recovery; real pinned MediaPipe initialization; continuous audio interruption/resumption; 960 × 540 VP8 raw playback; one-point physical-facing directions after gain changes. These are integration results, not hardware accuracy guarantees.

Hardware acceptance remains necessary: try Kate's actual ESP32/IP and USB combination, compare manual/auto eye models, confirm one-point directions without correcting them through a second display mirror, test network loss/recovery, validate physical fixations at intended depths and check video/gaze timing with an observable event. MediaPipe can still lose a real hand; the app pauses transparently rather than fabricating tracking. The current system does not implement Pupil Labs 3D bundle adjustment, Tobii's factory-calibrated hardware model, automatic depth/parallax/slippage correction or world-registered heatmaps.

## 12. Related documents and ready-to-use handoff prompt

- [Current feature/setup guide](scene-camera-eye-tracking.md)
- [Scene design](superpowers/specs/2026-10-01-scene-camera-eye-tracking-design.md)
- [Original scene implementation plan](superpowers/plans/2026-10-01-scene-camera-eye-tracking.md)
- [Calibration modes plan](superpowers/plans/2026-10-02-calibration-modes.md)
- [V2 eye tracking guide](eye-tracking-v2.md)
- [Shared on-page/printable marker](gaze-core-calibration-marker.svg)

Older design/plan wording is historical when it conflicts with the inspected implementation and Kate's later corrections captured here. Keep the latest coordinate convention and working circular-marker behavior. The feature guide links the research sources; do not claim vendor-equivalent algorithms or accuracy from those references.

Paste this into the receiving EIA/integration chat when authorizing the merge:

> Read `/Users/kate/Desktop/Codex-projects/worktree-v4/docs/worktree-v4-merge-handoff.md` and the current scene-camera guide. Integrate the complete `codex/worktree-v4` work into my intended working branch, first resolving which checkout/branch that is. The latest implementation includes tracked edits and untracked source beyond HEAD; preserve and include all of them. Keep both trial routes, manual/auto eye setup, shared eye/scene relay and recovery, remembered URLs/transforms, compact icon UI, aligned cards, the working on-page circular marker, shared hand/card calibration, stable fresh-sample collection and sound, corrected front-facing one-point direction, failed-check preview/recovery, X/Y offsets, local raw recordings and exports. Five-point quick calibration was discussed but is not implemented and is not part of this merge. Resolve conflicts without discarding either branch's unrelated work, run the full verification and acceptance checks, and report the included snapshot and remaining limitations. Do not remove the source worktree before the integration is verified.

## Appendix: source file manifest

The source inventory below is generated from the inspected common-ancestor-to-working-tree tracked delta plus non-ignored untracked files. Refresh it if the source changes. Generated runtime assets and dependencies are intentionally excluded.

Tracked changes/additions compared with the inspected base (69 files):

```text
README.md
docs/eye-tracking-v2.md
docs/scene-camera-eye-tracking.md
docs/scene-camera-preview.jpg
docs/superpowers/plans/2026-10-01-scene-camera-eye-tracking.md
docs/superpowers/specs/2026-10-01-scene-camera-eye-tracking-design.md
frontend/apps/web/.gitignore
frontend/apps/web/package.json
frontend/apps/web/public/models/LICENSE
frontend/apps/web/public/models/README.md
frontend/apps/web/public/models/hand_landmarker.task
frontend/apps/web/scripts/prepare-vision.ts
frontend/apps/web/scripts/scene-browser-fixture.tsx
frontend/apps/web/src/App.tsx
frontend/apps/web/src/features/eye-tracking/components/eye-preview.tsx
frontend/apps/web/src/features/eye-tracking/components/eye-preview.types.ts
frontend/apps/web/src/features/eye-tracking/components/v2-step-panel.tsx
frontend/apps/web/src/features/eye-tracking/components/v2-step-panel.types.ts
frontend/apps/web/src/features/eye-tracking/detection.ts
frontend/apps/web/src/features/eye-tracking/detection.types.ts
frontend/apps/web/src/features/eye-tracking/engine.ts
frontend/apps/web/src/features/eye-tracking/eye-tracking.types.ts
frontend/apps/web/src/features/eye-tracking/network-source.ts
frontend/apps/web/src/features/eye-tracking/steps/model-controls.tsx
frontend/apps/web/src/features/eye-tracking/steps/region-controls.tsx
frontend/apps/web/src/features/eye-tracking/steps/source-controls.tsx
frontend/apps/web/src/features/eye-tracking/steps/source-controls.types.ts
frontend/apps/web/src/features/eye-tracking/threshold-controls.tsx
frontend/apps/web/src/features/eye-tracking/use-tracker-worker.ts
frontend/apps/web/src/features/eye-tracking/use-tracker.ts
frontend/apps/web/src/features/eye-tracking/use-tracker.types.ts
frontend/apps/web/src/features/scene-eye-tracking/calibration.ts
frontend/apps/web/src/features/scene-eye-tracking/hand-tracker.ts
frontend/apps/web/src/features/scene-eye-tracking/hand.worker.ts
frontend/apps/web/src/features/scene-eye-tracking/heatmap.ts
frontend/apps/web/src/features/scene-eye-tracking/recording-controls.tsx
frontend/apps/web/src/features/scene-eye-tracking/recording.ts
frontend/apps/web/src/features/scene-eye-tracking/scene-camera.ts
frontend/apps/web/src/features/scene-eye-tracking/scene-controls.tsx
frontend/apps/web/src/features/scene-eye-tracking/scene-preview.tsx
frontend/apps/web/src/features/scene-eye-tracking/scene-session.ts
frontend/apps/web/src/features/scene-eye-tracking/scene-workspace.tsx
frontend/apps/web/src/features/scene-eye-tracking/scene.css
frontend/apps/web/src/features/scene-eye-tracking/scene.types.ts
frontend/apps/web/src/features/scene-eye-tracking/session-recorder.ts
frontend/apps/web/src/features/scene-eye-tracking/session.ts
frontend/apps/web/src/features/scene-eye-tracking/use-hand-tracker.ts
frontend/apps/web/src/features/scene-eye-tracking/use-scene-camera.ts
frontend/apps/web/src/features/scene-eye-tracking/use-scene-session.ts
frontend/apps/web/src/pages/v2-page.tsx
frontend/apps/web/src/pages/v2.css
frontend/bun.lock
frontend/tests/eye-tracking/detection.test.ts
frontend/tests/eye-tracking/engine.test.ts
frontend/tests/eye-tracking/lifecycle.test.tsx
frontend/tests/eye-tracking/manual-corner-help.test.tsx
frontend/tests/eye-tracking/network-source.test.ts
frontend/tests/eye-tracking/roi-preview.test.tsx
frontend/tests/eye-tracking/v2-components.test.tsx
frontend/tests/scene-eye-tracking/calibration.test.ts
frontend/tests/scene-eye-tracking/hand-tracker.test.ts
frontend/tests/scene-eye-tracking/heatmap.test.ts
frontend/tests/scene-eye-tracking/prepare-browser-fixture.ts
frontend/tests/scene-eye-tracking/recording.test.ts
frontend/tests/scene-eye-tracking/route.test.tsx
frontend/tests/scene-eye-tracking/scene-camera.test.ts
frontend/tests/scene-eye-tracking/scene-session.test.ts
frontend/tests/scene-eye-tracking/session-recorder.test.ts
frontend/tests/scene-eye-tracking/session.test.ts
```

Non-ignored untracked files that must also be captured (39 files):

```text
docs/gaze-core-calibration-marker.svg
docs/superpowers/plans/2026-10-02-calibration-modes.md
docs/worktree-v4-merge-handoff.md
frontend/apps/web/scripts/camera-relay.ts
frontend/apps/web/scripts/hand-replay.ts
frontend/apps/web/src/features/eye-tracking/camera-relay-server.ts
frontend/apps/web/src/features/eye-tracking/camera-relay.ts
frontend/apps/web/src/features/eye-tracking/camera-transform.ts
frontend/apps/web/src/features/eye-tracking/components/camera-source-type.tsx
frontend/apps/web/src/features/eye-tracking/components/camera-transform-controls.tsx
frontend/apps/web/src/features/eye-tracking/components/help-tip.tsx
frontend/apps/web/src/features/eye-tracking/network-camera.ts
frontend/apps/web/src/features/eye-tracking/use-camera-source-preferences.ts
frontend/apps/web/src/features/scene-eye-tracking/calibration-eye-preview.tsx
frontend/apps/web/src/features/scene-eye-tracking/calibration-method-controls.tsx
frontend/apps/web/src/features/scene-eye-tracking/calibration-preferences.ts
frontend/apps/web/src/features/scene-eye-tracking/download.ts
frontend/apps/web/src/features/scene-eye-tracking/eye-evidence.ts
frontend/apps/web/src/features/scene-eye-tracking/gaze-offset-controls.tsx
frontend/apps/web/src/features/scene-eye-tracking/hand-stability.ts
frontend/apps/web/src/features/scene-eye-tracking/marker-detector.ts
frontend/apps/web/src/features/scene-eye-tracking/marker-tracker.ts
frontend/apps/web/src/features/scene-eye-tracking/marker.worker.ts
frontend/apps/web/src/features/scene-eye-tracking/one-point-calibration.ts
frontend/apps/web/src/features/scene-eye-tracking/screen-calibration-marker.tsx
frontend/apps/web/src/features/scene-eye-tracking/use-calibration-feedback.ts
frontend/apps/web/src/features/scene-eye-tracking/use-marker-tracker.ts
frontend/apps/web/src/features/scene-eye-tracking/validation-recovery-controls.tsx
frontend/tests/eye-tracking/camera-relay.test.ts
frontend/tests/eye-tracking/camera-transform.test.ts
frontend/tests/eye-tracking/network-camera.test.ts
frontend/tests/scene-eye-tracking/eye-evidence.test.ts
frontend/tests/scene-eye-tracking/fixtures.ts
frontend/tests/scene-eye-tracking/marker-detector.test.ts
frontend/tests/scene-eye-tracking/marker-tracker.test.ts
frontend/tests/scene-eye-tracking/one-point-orientation.test.ts
frontend/tests/scene-eye-tracking/scene-controls.test.tsx
frontend/tests/scene-eye-tracking/scene-modes.test.ts
frontend/tests/scene-eye-tracking/screen-marker.test.tsx
```
