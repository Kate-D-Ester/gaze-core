# Three-camera viewer

This public trial previews Eye, Scene, and Target camera feeds independently. It provides real Scene-to-Target visual object matching, manual markers and PNG photos. The Eye panel now shares the existing v3 eye tracker and setup session. Object matching works without Eye; calibrated gaze remains optional.

## Run

From this worktree's root:

```sh
bun install --cwd frontend --frozen-lockfile
SAM2_BUILD_CUDA=0 uv sync --project vision --frozen
uv run --project vision vision/prepare.py
# Start the viewer and its owned local vision service:
bun run --cwd frontend dev
```

Open `http://localhost:4001/trial/three-camera-viewer`, or choose Three-camera viewer on the dashboard. The separate auth backend is not needed for this public route. Camera access requires localhost or HTTPS and browser camera permission.

Choose USB or Network separately in each panel and press Connect. Use three distinct USB devices. The default-camera option may select an already connected device; choose an explicit available device if that happens. USB connection attempts are serialized to prevent duplicate allocation. Disconnect affects only its feed; stop cameras disconnects all three.

Network feeds connect directly from the browser, using v3's MJPEG and browser-readable video pipeline. The camera must allow CORS on stream and redirect responses, and the browser may require local-network permission. For a local ESP32 `/stream` URL without an explicit port, an initial CORS/network failure can retry the stream on port 81. No app relay is required. Unsupported codecs/transports need conversion outside this viewer. RTSP URLs do not play directly in a browser. Source type, device and ordinary stream URLs are remembered locally. URLs containing credentials, a query string or a fragment stay in memory and must be entered again after reload.

Rotate, enter a rotation angle, mirror horizontally, flip vertically, or reset each feed independently. Eye and Scene orientation share the tracker setup preferences, so the same transformed image appears in both views. Target orientation has its own viewer key. Changing Eye or Scene orientation invalidates incompatible calibration.

## Setup and calibration

The default view shows the camera panels and a compact command bar that stays visible while the feeds scroll. Help contains three short setup steps and links to the camera panels. Orientation expands each feed’s rotate/mirror controls. A single connected feed is enough for static selection and photos.

Choose **Gaze setup**, configure Eye camera → Eye region → Eye model → Scene camera → Calibration, then choose **Use in viewer**. Setup runs inside this page. Both views share one eye worker, the same camera connections and the live scene calibration session; switching views does not refit or discard the model. The viewer Eye feed draws the same pupil and model overlays as setup. Temporary frame gaps preserve the scene mapping; stale pupil and gaze overlays disappear and fresh evidence restores them automatically. Changing a source, orientation or image size still invalidates calibration. Viewer speech stops while setup is open. Finish or cancel capture/recording before returning.

A compact status distinguishes eye setup needed, a ready eye model, a loaded saved mapping, an estimated mapping and a current accuracy check. The existing v3 readiness, saved-profile compatibility and accuracy checks still apply. Camera allocation prevents reuse of the Target USB device during setup and blocks view/step changes while a connection is pending.

On a fresh page load, saved source fields, orientation, eye-region/model settings and scene profiles load from this browser origin. Connect explicitly, rebuild and lock the live eye model, then load the compatible saved scene profile or calibrate again. The fitted automatic model is held by the worker and cannot survive a full page reload. A previous setup page that has already unmounted cannot supply its old worker/model. Browser ports/origins have separate local preferences.

After calibration, the Scene preview shows a red gaze bubble. It uses the same live mapping, offset and accuracy check as setup. Saved/one-point mappings are marked estimated; stale pupil evidence, disconnected feeds, calibration capture and incompatible setup hide the bubble. This mapping is relative to the scene image, so it is displayed there rather than projected onto unrelated page coordinates.

## Object matching

Connect Scene and Target. Click an object in Scene to select it and start tracking immediately, or drag a rectangle around it. The Scene box follows the selected region as it moves. Drag a rectangle to select a part such as specs, a hand or a patch of clothing. Target is a passive tracking view and never accepts manual selections. Small objects such as glasses can use this visual example, but enough visible detail must exist to verify the instance. Button, typed and spoken `select` always use Scene, regardless of the active photo camera. Fresh calibrated gaze takes priority over an older clicked point; otherwise the last current Scene point/rectangle is retried. There is no implicit center fallback.

The third view shows **Searching**, **Ambiguous**, or a cyan tracking box. Geometric acquisition displays **Locked** with its score; ongoing motion displays **Tracking**, and dense acquisition displays **Matched appearance**. Geometric acquisition requires a score strictly above 80%, at least eight inliers and valid coverage/geometry. Ongoing SAM 2.1 mask tracking requires object presence above 80%, finite predicted mask quality of at least 0.5 and a valid box; dense acquisition requires >92% correlation. The Tracking label omits percentages because presence and predicted mask quality do not measure instance identity. This score is not a calibrated identity probability. Detector confidence alone never establishes an instance match. Similar plausible candidates remain Ambiguous; plain, blurry, occluded, tiny or substantially changed views can stay Searching. Clear stops matching. A new Scene source/orientation discards the reference. Target source changes reacquire. Temporary frame loss hides both boxes. Brief recovery can use up to three stable views within 12 analyzed frames and two seconds. Geometry plus optical motion or learned appearance must support two consistent observations within three analyzed frames and one second. Actual absence, malformed evidence and expiry clear that confirmation. See the model research for the individual evidence thresholds. Longer loss searches from the immutable original Scene selection. Recent appearances cannot replace that reference or the original segmentation conditioning.

When camera quality differs, an additional acquisition check compares candidates at a common resolution and blur level, with luminance normalization for learned appearance and a separate raw-colour check. It still requires independent mask corroboration, a unique candidate and two consistent observations. Ordinary ambiguity remains unconfirmed. There are no additional setup controls or model downloads for this path.

The web launcher owns a loopback-only local Python service using pinned YOLOE nano, SAM 2.1 Tiny and DINOv2 Small models, MPS when available and CPU otherwise. Model preparation downloads about 262 MiB of verified weights once (including the retained NanoTrack comparison weights); the isolated runtime environment is larger. The first startup warms models in the background; if Select reports warming up, retry in a moment. Nothing downloads from an image request. [Model research](object-tracking-model-research.md) explains why NanoTrack alone cannot perform the second-camera search.

## Commands

Click a camera's heading to choose it for photos. Scene alone accepts clicks and rectangles for object selection; its focused preview also supports Enter/Space to explicitly select the center. Eye and Target previews are passive. Reference markers hide when frames are stale; changing the Scene source or orientation invalidates the reference.

Typed commands and buttons work in supported modern browsers:

- `select` / `select it` (**Select**): always select in Scene: use fresh calibrated gaze, otherwise retry the current mouse point/rectangle. Never implicitly use the center.
- `clear` / `clear selection`: stop matching and remove the active marker.
- `switch camera`: cycle Eye → Scene → Target.
- `eye camera`, `scene camera`, `target camera`: choose a feed for photos. The previous `auxiliary camera` phrase is still supported.
- `take photo` / `take a photo`: download one PNG from the active fresh transformed frame.
- `stop cameras` / `stop all cameras`: disconnect all feeds and stop voice.
- `stop voice`: turn off microphone recognition.

Phrases must match a whole command. Unknown input does nothing and displays help. Photos contain the camera image in the chosen orientation, without UI markers or coordinate metadata. There is no automatic photo capture.

## Local voice and privacy

Tap **Voice off** and allow microphone access. Wait until the button says **Listening**, say one complete English command, then pause. English commands run in the app's local Vosk WASM worker. No browser language-pack installation is required, and there is no remote speech fallback. The same button stops listening or retries a failed start. **Heard: select** (or another supported phrase) confirms recognition. Nonempty unsupported or low-confidence final speech shows **Command not understood** without executing it. Partial speech and silent results do not execute commands. Action outcomes and voice feedback stay in the pinned command bar.

Development and production builds prepare the pinned WASM assets and a checksum-verified English model (about 40 MB) from the official Vosk model host. The model is cached in this worktree and served from the app's own origin. Preparation requires standard unzip/tar tools. Runtime audio stays on this device; loading the model does not upload audio. Voice stops on microphone/worker errors, page hiding, stop cameras, opening setup and leaving the viewer. Stop also cancels model startup and releases any late microphone stream.

Only selected Scene and Target analysis frames are sent to the authenticated service on this same computer. They stay in bounded memory and are cleared or expired; model predictor caches are also released. Eye frames, audio, photos, transcripts and the supplied reference video are not sent to any external service. Source URLs are not logged; credential-bearing URLs are not persisted. Local settings and saved profiles follow the existing v3 setup storage. This feature has no hardware-control output or firing commands. See [vision dependency notice](../vision/NOTICE.md).

## Verification on this branch

### Camera quality differences — 2026-10-05

The quality fallback uses the existing models with no extra UI or downloads. The private Scene image selected the blue screwdriver case; Target independently searched the supplied separate-camera video. All 1080 decoded frames were analyzed. Acquisition occurred at 0.756s, with continuous overlay results through 35.713s and 17/17 correct tracking checkpoints after acquisition. The initial 0.13s observation remained unconfirmed. Removed, blank, recoloured and duplicate targets stayed unlocked. Stream reset required fresh confirmation; Clear released the acquired states.

All six old video cases retained their 47/49 sparse checkpoints in each view, including both hand postures. Face at 18s and glasses at 26s still have the previously documented missing overlays. 129 Python tests and 71 focused frontend tests passed; real angle, distractor, memory, expiry and tiny-object checks passed. Code review found no remaining Important issues. Camera quality normalization does not establish a general identity accuracy percentage. After the server restart, Clear and select again to start a fresh session.

### Scene-only selection and Target overlay — 2026-10-05

A Scene click or rectangle now starts selection without a second button press. Eye and Target previews cannot create manual points. Select always routes to Scene, and fresh calibrated gaze takes priority over an old clicked point. The command bar labels the Scene → Target flow; camera activation chooses photo source only. Target shows a fresh cyan box marked Locked above the existing strict 80% threshold, Searching, Ambiguous or an actionable error. Camera settings keep their internal auxiliary storage keys so this visible rename does not discard preferences.

The initial regression run reproduced missing automatic selection, wrong-camera voice selection and a missing-service fetch error. The corrected flow passed 32 focused tests and the 773-test frontend suite. Review found that gaze was overwriting manual fallback and an old completion could replace newer feedback; both have red-to-green regression coverage. Mouse fallback remains separate from gaze selection, and neither input changes the active photo camera. Browser validation used the real local models with public images and Eye disconnected: one click acquired the Target box; Target taps were inert; blank frames removed it and restoration reacquired it. Generated spoken select ran through the real decoder while preserving the Target photo source. The 390px layout had no horizontal overflow and kept commands pinned. Lint, typecheck and production build passed. Port 4016 was restored as a detached project-owned process, with its PID and log under ignored .local-reference. No personal camera frames or microphone audio were captured. No hardware output was added.

### Real object matching — 2026-10-05

The initial object-matching implementation passed 769 frontend tests, 12 Python tests, lint, TypeScript checks, Ruff and the production build. Regression tests cover stale source/orientation responses, bounded requests, clear during selection, missing-frame recovery, strict >80% acceptance, ambiguous candidates, reference expiry and release of predictor image caches. Independent review findings were addressed with regression coverage.

Real model acceptance on bundled public samples passed on MPS: rotated/scaled overlapping views matched with 99% geometric scores; blank and different-scene views remained Searching. Median analysis time after warm-up was 87 ms. Browser validation confirmed real match geometry, loss on a blank third feed, automatic reacquisition, Clear, custom rectangles and generated `select` through the real offline decoder. Eye was disconnected. The 390px layout had no horizontal overflow and kept commands visible during scrolling. This does not establish accuracy across unrelated physical camera viewpoints, people or tiny glasses; those remain device-specific checks.

The independently built preview is at `http://127.0.0.1:4016/trial/three-camera-viewer`. Port 4014 was left running after automatic approval review blocked restarting it, so that older process does not contain the final origin-check correction. Restarting that process is the only pending application step.

To reproduce the independent preview from `frontend/apps/web`:

```sh
GAZE_WEB_DIST_DIR=.next-vision-preview bun run build
GAZE_WEB_DIST_DIR=.next-vision-preview bun scripts/dev.ts start --hostname 127.0.0.1 --port 4016
```

To verify with public images and generated speech, from `frontend` run:

```sh
GAZE_TEST_VIEWER_URL=http://127.0.0.1:4016 bun tests/camera-viewer/browser-smoke-server.ts
```

Open `http://127.0.0.1:4030`, expand the test controls and choose **Public object views**. Click or drag an object in Scene and Select. **Blank third feed** tests loss and reacquisition. This loopback-only fixture does not open a physical camera or microphone.

### Earlier branch verification

The initial implementation passed 676 frontend tests, lint, typecheck, production build, and `bun audit`. The setup and speech recovery follow-up is verified below. The public production route was inspected at 1280px and 390px CSS widths and tested for command switching, source controls, transform independence and disconnected-frame rejection. Camera/microphone APIs were exercised with controlled platform fixtures in tests; live validation with three physical cameras and a microphone remains outstanding.

The inherited global `brace-expansion` v5 override was removed because `minimatch` v3 expects the v1 callable API. The lockfile now resolves compatible patched versions and passes the dependency audit. If an existing install retains the incompatible dependency symlink, run `bun install --force --frozen-lockfile` once.

### Setup and speech recovery follow-up

680 frontend tests, lint, typecheck and the production build passed. Browser checks verified setup shortcuts, typed camera switching after a refused speech installation, the visible retry control, the existing six-step scene/eye calibration route and a narrow layout. The browser still returns `false` for English model installation without a diagnostic reason; live speech recognition is not verified in this browser. This change improves setup and failure recovery; it does not claim to repair the browser's model installer.

### Minimal interface follow-up

Setup instructions, command examples and optional voice details use expandable help. Gaze setup remains visible. Idle voice messages and repeated descriptions are removed from the default view; actionable errors and speech installation recovery remain available.

### Shared setup and v3 integration

Merged local v3 commit `4458a3c` at `8b95543`, including the model stability and annotated-session fixes. The shared setup implementation passed 719 frontend tests, lint, typecheck and the production build. The final compact setup header also passed its 14 focused workspace tests and repeated lint/typecheck/build checks. Independent code review found no remaining Critical/Important issues.

Browser checks confirmed the saved ESP URL, on-page setup/return controls and narrow/wide layout. The real ESP eye feed became live at 640×480 and remained connected across viewer → setup → viewer, checked through connection status without capturing live images. Complete physical calibration and three simultaneous physical camera feeds still require the user's devices; automated regression tests cover model/calibration continuity, invalidation, pending USB requests, worker failure, device exclusion and source preferences.

### Voice, gaze preview and pinned commands

The viewer now serves its own English recognizer instead of relying on the failing browser pack installer. Real WASM recognition was tested with generated English speech through the production AudioWorklet; no personal audio was captured. Synthetic feeds were used to inspect gaze motion/expiry, selection, camera switching and command-bar scrolling.

To repeat the browser simulation on macOS, build and start this worktree's preview at port 4014, then from frontend run `bun tests/camera-viewer/browser-smoke-server.ts` and open `http://127.0.0.1:4030`. The loopback-only fixture generates a "select" WAV with macOS speech tools, renders synthetic feeds, and offers gaze-pause and dropped-frame recovery checks. Click the fixture viewer’s **Voice off** button to run generated speech through the real decoder, voice controller and viewer command dispatch; it does not access a microphone. **Drop frames** pauses the Eye and Scene feeds; **Resume frames** restores both overlays while retaining calibration. Other platforms can supply a synthetic WAV at `.local-reference/voice/select.wav`. The fixture is separate from the production viewer.

This follow-up passed 726 full-suite tests and 36 focused viewer tests after the final viewport correction, plus lint, typecheck, production build and dependency audit. Independent review has no remaining Critical/Important findings. Actual WASM recognized generated speech at 44100 Hz. Browser checks covered 1280×900, 390×844 and 390×449, command switching, independent static selection, gaze motion/expiry, pinned scrolling, bounded help and visible keyboard focus. Physical microphone quality and complete physical calibration remain device checks.

### Pupil preview and dropped-frame recovery

The Eye viewer reuses the v3 pupil/model renderer and the existing worker. Scene calibration identity now uses persistent canvas geometry, so a missing frame does not erase the mapping. A remounted preview redraws when its connection becomes live, even if frame identity is unchanged. Pupil metadata expires after 250 ms and returns with fresh evidence; raw photos remain unchanged. Genuine camera source, orientation and geometry changes still invalidate calibration.

Verified with 732 frontend tests, lint, typecheck and production build. An initial concurrent run timed out the existing input-mirror calibration test; its isolated rerun passed all eight calibration tests, and the subsequent full run passed all 732 tests. Independent review found no remaining Critical/Important issues. Browser simulation paused both Eye and Scene frames, confirmed missing previews with calibration retained, then restored the pupil ellipse and live scene gaze without recalibration. Only synthetic feed images were captured. Physical camera interruption/recovery remains a device check.


### Manual point confirmation and voice feedback

Select no longer invents a center point. **Confirm point** and spoken/typed `select` require a current manually clicked marker, retain its coordinates, and reject stale/disconnected frames. Command results and local voice feedback share the pinned controls. The button displays Voice off, Starting, Listening or Retry voice; supported final speech shows Heard, while rejected final speech gives a short retry hint without executing it.

Verified with 755 frontend tests, lint, typecheck and production build. Independent review found no remaining Critical/Important issues. Real WASM recognized generated `select` at 48000 Hz, and the complete decoder → voice controller → viewer command flow at 44100 Hz confirmed an off-center clicked point. Browser checks covered the desktop layout and 390×449 scrolling with bounded help and pinned feedback; markers remained independent across cameras. The synthetic fixture replaces microphone input only. Physical microphone quality and physical calibration remain device checks. The preview server was restarted on port 4014; user camera sessions were not reloaded.


### Previous simulated HUD (superseded by real object matching)

The decorative auxiliary HUD passed 757 full-suite frontend tests, lint, typecheck and production build. Review found no Critical/Important issues; its point-preservation test suggestion was addressed and the nine workspace tests passed again. Synthetic browser checks disconnected Eye and Scene, observed the auxiliary scan effect, clicked an off-center auxiliary point, and confirmed it with generated spoken `select` through the real decoder/controller. The 390×844 layout had no horizontal overflow, kept commands pinned, and retained the point across HUD off/on. Only synthetic feed images were saved. The synthetic eye source now implements disconnect by stopping its generated frames, and stopped sources clear their latest frame reference.


### Continuous arbitrary-region tracking

Selection stays in Scene; Target remains passive. The selected box now follows fresh motion in Scene, including with Target disconnected. After verified Target acquisition its box follows independently. Both expire after 500ms and reject late results from previous sources, transforms, generations or selections. Commands and the existing layout are unchanged; the OBS framing complaint was withdrawn.

To evaluate a local clip, create a JSON case list with unique names, start/end seconds, a normalized initial box and optional truth boxes keyed by seconds. Run from this worktree root:

```sh
uv run --project vision vision/evaluate_video.py --video /path/to/clip.mov --cases /path/to/cases.json --output .local-reference/motion-results --analysis-fps 30 --target-mode same-video
```

The output directory must be new. The tool runs cases one by one and creates one annotated MP4/JSON per case, checkpoint images and summary.json. Yellow boxes are hand-reviewed truth; cyan boxes are accepted tracker results. Success means IoU >=0.5 at a checkpoint, including missing boxes as failures. Scores and visible-frame fractions are not accuracy measurements. By default, Target receives the same decoded pixels and independently searches using the Scene token, without a supplied Target box. Use --target-mode transformed for the rotation/scale/translation stress test. Neither mode is an independently recorded viewpoint. The supplied original video is opened read-only and remains untouched.


### Earlier motion accuracy limits

The 2026-10-05 local video evaluation fails reliable specs and open/closed hand tracking. Clothing boxes can drift in extent, and occlusion can distort face tracking. Continuous overlays and stale-frame handling are implemented, but an overlay or >80% evidence score is not proof of correct tracking. See object-tracking-model-research.md for measured checkpoint results. Private case definitions, per-frame JSON, annotated clips and the report remain under ignored .local-reference/motion-tests/continuous-final-v9; no personal recording is versioned. That earlier Target test used a transformed Scene copy, not an independent second camera.


### Earlier original-reference drift guard (superseded)

Regression tests reproduced gradual drift and contaminated recent-crop reacquisition. Both temporal verification and every acquisition/recovery now use the immutable original Scene reference. Newly acquired Target crops cannot replace it. Crop rounding is consistent, and tiny regions avoid unsupported ORB pyramid processing. Ongoing confirmed responses retain the Tracking label and the actual confirmation score.

Six identical-video cases processed all 3,966 frame pairs from selection through the final decoded frame at a 30 fps video cadence. Target independently searched from the Scene token, without a Target rectangle. Correct sparse checkpoints (IoU >=0.5, missing boxes fail): face 7/14 Scene and 7/14 Target; glasses 3/12 Scene and 3/12 Target; clothing 0/8 Scene and 1/8 Target; hand-open 1/7 Scene and 1/7 Target; hand-closed 1/4 Scene and 1/4 Target; phone 1/4 Scene and 1/4 Target. All initial Target acquisitions succeeded. No accepted boxes were wrong at the 49 reviewed checkpoints, but rejection/gaps increased substantially. **That version failed reliable continuous tracking; rejecting reference drift alone did not establish accurate posture tracking or recovery.** Sparse checks do not rule out wrong matches between checkpoints. Hand annotations stop at 20s and phone annotations at 30s, although status logs and videos continue through the endpoint.

The final Python suite passes 48 tests and Ruff. Private case definitions, full-frame JSON, clips, checkpoint sheets and the report remain ignored under .local-reference/motion-tests/same-video-original-reference. Identical frame replay is not an independent physical-camera benchmark, and processing every recorded frame is not a live FPS claim.

Release verification: the final public-image real-model check passed 0/5/15-degree views, blank/unrelated rejection and 12 healthy Scene/nonmatching Target pairs, with zero Scene deactivations (maximum pair 288.2 ms). The restarted isolated 4016 viewer returns HTTP 200 and its local service reports ready on MPS. The source commit excludes all private recordings and test artifacts.


### SAM 2.1 memory tracking — 2026-10-05

The active motion tracker is now SAM 2.1 Tiny at 512 pixels, with independent bounded Scene/Target memory and the original selection preserved for acquisition. Small angle/posture changes no longer require equality with the original crop. Weak overlap during fast movement requires strong evidence from the immediately preceding accepted mask; zero overlap and abrupt extent changes still require corroboration before updating memory.

| Case | Scene checkpoints | Target checkpoints | Median pair ms |
| --- | --- | --- | --- |
| face | 13/14 | 13/14 | 205 |
| glasses | 11/12 | 11/12 | 204 |
| clothing | 8/8 | 8/8 | 206 |
| hand-open | 7/7 | 7/7 | 209 |
| hand-closed | 4/4 | 4/4 | 233 |
| phone | 3/4 | 3/4 | 205 |

These six same-video cases processed 671 analyzed frame pairs at 5 Hz, from selection through the final real frame at 32.833 seconds. Target independently acquired every initial selection using the Scene token, without a Target rectangle. Both views passed 46/49 sparse reviewed checkpoints (IoU >=0.5, missing boxes fail). The three failures were missing boxes: face at 18s, glasses at 26s and phone at 30s. No accepted box was wrong at those reviewed checkpoints; unannotated frames are not an identity-accuracy claim. Brief gaps remain. Hand truth ends at 20s, and both hand cases remain Searching after loss at about 22s through the endpoint; phone truth ends at 30s. Independent physical-camera viewpoints remain unverified.

Verification passed 86 Python tests, Ruff and 71 focused viewer/tooling tests. Real public-image inference passed 0/5/15-degree views, blank/unrelated rejection, disappearance with a same-category distractor, original return, independent Target reset, four interleaved tokens/eight camera states, bounded memory and release on Clear/expiry. The nonmatching-Target test had zero Scene deactivations (maximum pair 192.3 ms). Private clips, annotations and reports remain ignored. Frontend source and the existing preview build are unchanged by this backend replacement.

The isolated preview was restarted on port 4016 after these checks. Its route returns HTTP 200 and the service reports `ready`, `YOLOE-26n + SAM 2.1 Tiny + DINOv2`, device `mps`. Clear the old selection and select again to initialize the new camera memories.


### Fast-motion recovery and small selections — 2026-10-05

Fast motion can now recover without occupying the previous pixels. Two corroborated SAM observations must agree with recent accepted memory and stay within bounded displacement and extent; appearance similarity alone cannot authorize a jump. Original Scene references remain immutable, and failed observations do not enter accepted tracking memory.

Tiny selections retain their useful native pixels during dense search. For 12–63-pixel short sides, unique nearby context can propose a location, but two strongly supported masks from original Scene conditioning must verify the object before Target initializes independently. Duplicate contexts are compared at the selected-object scale. Ambiguous surroundings do not block a uniquely verified direct object match. No controls or UI text were added.

The supplied 17×23-pixel shelf-object screenshot acquired on its second Target observation and remained correctly bounded for 11 subsequent static checks. Removed-object, blank and duplicated views remained unlocked for 12 checks each. Target stream changes reset confirmation; returning the object reacquired. Clear released the context and camera states. This screenshot fixture does not establish accuracy for new physical viewpoints or moving tiny objects.

The final six-case same-video replay processed 671 analyzed pairs at 5 Hz through 32.833 seconds. Both views passed 47/49 sparse checkpoints: face 13/14, glasses 11/12, clothing 8/8, open hand 7/7, closed hand 4/4 and phone 4/4. Phone loss at 29.4 seconds now recovered at 29.6 seconds. The two failed checkpoints were missing overlays, not accepted wrong boxes. Hand tracking still remains Searching after the changed/occluded hand at 21.8 seconds; hand truth ends at 20 seconds, phone truth at 30 seconds. Sparse checks do not establish correctness between annotations.

Verification passed 115 Python tests, Ruff and 71 focused viewer/tooling tests. Real public-image checks passed angle changes, same-category distractor rejection, long absence, original return, independent Target reset, four interleaved selections with eight bounded camera states, and release on Clear/expiry. The source branch excludes all private media and replay artifacts. See object-tracking-model-research.md for score thresholds, runtime and limitations.
