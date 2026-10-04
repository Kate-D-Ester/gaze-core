# Three-camera viewer

This public trial previews Eye, Scene, and Auxiliary camera feeds independently. It provides static image markers and manual PNG photos. The Eye panel now shares the existing v3 eye tracker and setup session. Static selection does not identify, track, or match an object across cameras.

## Run

From this worktree's `frontend` folder:

```sh
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:4001/trial/three-camera-viewer`, or choose Three-camera viewer on the dashboard. The separate auth backend is not needed for this public route. Camera access requires localhost or HTTPS and browser camera permission.

Choose USB or Network separately in each panel and press Connect. Use three distinct USB devices. The default-camera option may select an already connected device; choose an explicit available device if that happens. USB connection attempts are serialized to prevent duplicate allocation. Disconnect affects only its feed; stop cameras disconnects all three.

Network feeds connect directly from the browser, using v3's MJPEG and browser-readable video pipeline. The camera must allow CORS on stream and redirect responses, and the browser may require local-network permission. For a local ESP32 `/stream` URL without an explicit port, an initial CORS/network failure can retry the stream on port 81. No app relay is required. Unsupported codecs/transports need conversion outside this viewer. RTSP URLs do not play directly in a browser. Source type, device and ordinary stream URLs are remembered locally. URLs containing credentials, a query string or a fragment stay in memory and must be entered again after reload.

Rotate, enter a rotation angle, mirror horizontally, flip vertically, or reset each feed independently. Eye and Scene orientation share the tracker setup preferences, so the same transformed image appears in both views. Auxiliary orientation has its own viewer key. Changing Eye or Scene orientation invalidates incompatible calibration.

## Setup and calibration

The default view shows the camera panels and a compact command bar that stays visible while the feeds scroll. Help contains three short setup steps and links to the camera panels. Orientation expands each feed’s rotate/mirror controls. A single connected feed is enough for static selection and photos.

Choose **Gaze setup**, configure Eye camera → Eye region → Eye model → Scene camera → Calibration, then choose **Use in viewer**. Setup runs inside this page. Both views share one eye worker, the same camera connections and the live scene calibration session; switching views does not refit or discard the model. The viewer Eye feed draws the same pupil and model overlays as setup. Temporary frame gaps preserve the scene mapping; stale pupil and gaze overlays disappear and fresh evidence restores them automatically. Changing a source, orientation or image size still invalidates calibration. Viewer speech stops while setup is open. Finish or cancel capture/recording before returning.

A compact status distinguishes eye setup needed, a ready eye model, a loaded saved mapping, an estimated mapping and a current accuracy check. The existing v3 readiness, saved-profile compatibility and accuracy checks still apply. Camera allocation prevents reuse of the Auxiliary USB device during setup and blocks view/step changes while a connection is pending.

On a fresh page load, saved source fields, orientation, eye-region/model settings and scene profiles load from this browser origin. Connect explicitly, rebuild and lock the live eye model, then load the compatible saved scene profile or calibrate again. The fitted automatic model is held by the worker and cannot survive a full page reload. A previous setup page that has already unmounted cannot supply its old worker/model. Browser ports/origins have separate local preferences.

After calibration, the Scene preview shows a red gaze bubble. It uses the same live mapping, offset and accuracy check as setup. Saved/one-point mappings are marked estimated; stale pupil evidence, disconnected feeds, calibration capture and incompatible setup hide the bubble. This mapping is relative to the scene image, so it is displayed there rather than projected onto unrelated page coordinates.

Static viewer points remain manual; calibration does not turn them into tracked targets or eye-driven selection.

## Commands

Click a camera's heading to make it active. Click its preview to pin a static image point, or focus the preview and press Enter/Space to choose its center. The marker stays at that image position and clears from view after reconnecting, changing orientation, or losing fresh frames.

Typed commands and buttons work in supported modern browsers:

- `select` / `select it`: keep the active marker, or select the preview center.
- `clear` / `clear selection`: remove the active marker.
- `switch camera`: cycle Eye → Scene → Auxiliary.
- `eye camera`, `scene camera`, `auxiliary camera`: choose a feed.
- `take photo` / `take a photo`: download one PNG from the active fresh transformed frame.
- `stop cameras` / `stop all cameras`: disconnect all feeds and stop voice.
- `stop voice`: turn off microphone recognition.

Phrases must match a whole command. Unknown input does nothing and displays help. Photos contain the camera image in the chosen orientation, without UI markers or coordinate metadata. There is no automatic photo capture.

## Local voice and privacy

Tap **Voice** and allow microphone access. English commands run in the app's local Vosk WASM worker. No browser language-pack installation is required, and there is no remote speech fallback. The same Voice button retries a failed start. Speak one complete command at a time; partial, unsupported or low-confidence results are ignored.

Development and production builds prepare the pinned WASM assets and a checksum-verified English model (about 40 MB) from the official Vosk model host. The model is cached in this worktree and served from the app's own origin. Preparation requires standard unzip/tar tools. Runtime audio stays on this device; loading the model does not upload audio. Voice stops on microphone/worker errors, page hiding, stop cameras, opening setup and leaving the viewer. Stop also cancels model startup and releases any late microphone stream.

Frames, photos, transcripts, commands, and the supplied reference video are not uploaded by this feature. Source URLs are not logged; credential-bearing URLs are not persisted. Local settings and saved profiles follow the existing v3 setup storage. The viewer does not contain object acquisition/tracking, cross-camera matching, hardware-control output, or firing commands.

## Verification on this branch

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

To repeat the browser simulation on macOS, build and start this worktree's preview at port 4014, then from frontend run `bun tests/camera-viewer/browser-smoke-server.ts` and open `http://127.0.0.1:4030`. The loopback-only fixture generates a "scene camera" WAV with macOS speech tools, renders synthetic feeds, and offers generated-speech, gaze-pause and dropped-frame recovery checks. **Drop frames** pauses the Eye and Scene feeds; **Resume frames** restores both overlays while retaining calibration. Other platforms can supply a synthetic WAV at `.local-reference/voice/scene.wav`. The fixture is separate from the production viewer.

This follow-up passed 726 full-suite tests and 36 focused viewer tests after the final viewport correction, plus lint, typecheck, production build and dependency audit. Independent review has no remaining Critical/Important findings. Actual WASM recognized generated speech at 44100 Hz. Browser checks covered 1280×900, 390×844 and 390×449, command switching, independent static selection, gaze motion/expiry, pinned scrolling, bounded help and visible keyboard focus. Physical microphone quality and complete physical calibration remain device checks.

### Pupil preview and dropped-frame recovery

The Eye viewer reuses the v3 pupil/model renderer and the existing worker. Scene calibration identity now uses persistent canvas geometry, so a missing frame does not erase the mapping. A remounted preview redraws when its connection becomes live, even if frame identity is unchanged. Pupil metadata expires after 250 ms and returns with fresh evidence; raw photos remain unchanged. Genuine camera source, orientation and geometry changes still invalidate calibration.

Verified with 732 frontend tests, lint, typecheck and production build. An initial concurrent run timed out the existing input-mirror calibration test; its isolated rerun passed all eight calibration tests, and the subsequent full run passed all 732 tests. Independent review found no remaining Critical/Important issues. Browser simulation paused both Eye and Scene frames, confirmed missing previews with calibration retained, then restored the pupil ellipse and live scene gaze without recalibration. Only synthetic feed images were captured. Physical camera interruption/recovery remains a device check.
