# Remote eye tracking V3 integration handoff

Use this document when integrating `codex/v3-webcam-gaze` into another branch. It records the implemented UI, user experience, tracking contracts, and checks that must survive the merge. This is an integration guide, not a request to redesign the page or replace its algorithms.

Reviewed on 2026-10-02 against implementation commit `e8f0b75`. The implementation worktree is `~/Desktop/Codex-projects/gaze-core-v3`; its original base is `6ba620f`. The destination branch has not been specified. Use the destination's current instructions and inspect its changes before integrating.

## Read order and current scope

1. Read this handoff for product and merge requirements.
2. Read [the V3 implementation and evaluation guide](remote-eye-tracking-v3.md), especially its latest coverage and accuracy follow-up.
3. Read [the RGB model provenance notice](../research/WebEyeTrack-NOTICE.md) before touching models, preprocessing, or asset loading.
4. Inspect the source and tests named below. Earlier [design notes](superpowers/specs/2026-10-01-remote-eye-tracking-design.md) and [implementation plan](superpowers/plans/2026-10-01-remote-eye-tracking.md) are historical snapshots.

The latest code and evaluation supersede earlier assumptions that every IR setup needs glints, that full-face IR should be processed as a near-eye crop, or that manual thresholding is the normal starting point. Buttercup was researched afterwards; its models, segmentation, and shared 3D gaze solver have **not** been implemented here.

## Product and routes

- `/trials/remote-eye-tracking` is public and works without authentication, API keys, or the backend service.
- `/trial` and `/trials` retain the normal tracker. `/v2` redirects to `/trial`.
- The normal trials page retains its manual and automatic tracker options and links to remote tracking. Remote modes do not replace them.
- Remote tracking has exactly three choices. Visible titles are deliberately short; accessible names preserve the complete concept.

| Mode | Visible card label | Accessible card name | Icon |
| --- | --- | --- | --- |
| Mobile | Mobile | Mobile eye tracker | `Smartphone` |
| Webcam | Webcam | Webcam-based eye tracker | `Camera` |
| IR | IR camera | IR webcam-based eye tracker | `ScanEye` |

Selecting a card enters setup; it does not request camera permission. Live setup follows **Choose → Camera → Position → Calibrate → Validate → Results**. These are progress indicators, not unrestricted navigation buttons. Local recording inspection uses only the first three stages and cannot produce a screen calibration.

## UI rules to preserve

The user explicitly requested minimal text, mostly icons, and explanatory text on hover. Keep that decision throughout integration.

- Keep the title, short card labels, current stage, necessary field labels, units, and actionable errors visible. Do not hide information needed to recover from an error inside a tooltip.
- Use the existing `IconButton`, `Hint`, and `SetupHelp` components. Icon actions have an `aria-label`; tooltips appear on hover and keyboard focus. Toggle actions retain `aria-pressed`.
- Help remains a tap-to-open `details` element, with Escape handling. Touch users must not depend on hover to understand setup.
- Keep one short instruction for the current step. Longer preparation, HTTPS, head movement, and accuracy explanations belong in Help or documentation.
- Preserve disabled states for unavailable actions, a spinner for startup, and visible status or alert text for failures. An attractive preview is not proof that calibration can start.
- Do not add marketing banners, decorative gradients, explanatory card paragraphs, extra dashboards, or model comparison controls as part of merging.
- Do not expose model internals in the main flow unless the user needs them to make a setup decision.

### Visual layout

Reuse the existing `.eye-app` theme from `v2.css` and the scoped `.remote-*` styles from `remote-eye-tracking.css`. The remote page intentionally imports both files. Removing either changes the layout, theme, or focus behavior.

| Property | Current implementation |
| --- | --- |
| Typeface | Geist Variable with sans-serif fallback |
| Background and cards | `#090909` and `#141514` |
| Main text and muted text | `#f4f4f2` and `#a3a6a3` |
| Primary accent | `#a7d7c5` |
| Panel borders | Theme `--line`, currently `#303330` |
| Content | Maximum width 1120 px; centered |
| Desktop mode cards | Three columns, 174 px tall |
| Desktop workspace | Preview and controls in a 1.6 to 1 column ratio |
| Narrow layout | At 700 px and below, cards and workspace stack |
| Narrow mode cards | 96 px tall, icon beside label |
| Icon actions and camera select | 44 px action size or minimum select height |
| Remote page scrolling | Automatic height, minimum `100svh`, scrolling enabled |

These are the current reference values, not a reason to overwrite destination theme changes blindly. Preserve the visual hierarchy, compact controls, keyboard focus, and narrow layout when resolving theme conflicts. Do not apply the remote page's scrolling override globally to the normal tracker.

Keep tooltips inside the viewport, especially at the first and last progress icon. Reduced-motion rules disable the spinner animation and card transition. Preserve preview aspect ratio and `object-fit: contain`; cropping the displayed feed can make overlays misleading.

### Preview and coordinates

The preview shows the full source feed with current face, eye, and IR region measurements. Live RGB preview is mirrored using CSS on **both** the video and its overlays. IR and recorded-video previews are not mirrored. Inference remains in source coordinates; do not flip measurements again or make display mirroring part of calibration math.

Mint outlines indicate measured eyes or the face. Warm yellow indicates IR regions and glints. These are diagnostic observations, not calibrated screen gaze. The downloadable overlay movies use a separate rendering palette and are not the page's design reference.

The live gaze dot is a separate fixed viewport overlay, is hidden during target capture, has `pointer-events: none`, and is shown only for a finite supported screen point within the viewport. Do not clamp an invalid or offscreen prediction onto a screen edge and display it as valid.

## UX states and recovery

| Stage or condition | Required behavior |
| --- | --- |
| Choose | Three cards; no camera stream or permission prompt |
| Camera | Camera selector and Discover cameras available before tracking starts |
| Permission pending | Explain browser action briefly; allow cancellation; disable conflicting starts |
| Camera ready | Show feed, processed-result fps, source dimensions, signal, and head/reference readings |
| Permission, source, or model failure | Visible error with a usable restart, discovery, or source replacement path |
| Position | Current eye signal gates Continue; IR defaults to automatic eye regions and threshold |
| Calibration | Full viewport target, progress, cancel, and head movement option |
| Capture timeout | Retry or cancel; retry restarts all targets rather than mixing interrupted captures |
| Validation | Five distinct new target locations; calibration and validation remain separate |
| Results | Mean error, P95 error, and within-target jitter in pixels; export and recalibration actions |
| Unsupported head position | Pause gaze output and guide recalibration; do not silently extrapolate |
| Screen resize or orientation change | Invalidate calibration; live ready flow returns to calibration |
| Camera disconnect or page hiding | Clear output and calibration; return to a recoverable camera stage |
| Local video | Native play, pause, and seek controls; screen calibration disabled |

Camera discovery can briefly request a permission stream to unlock device names; it stops that stream and does not start inference. Refresh device discovery on hotplug. Preserve handling of permission requests that finish after cancellation or a mode change.

The current selector chooses **one active source** from multiple connected cameras. Simultaneous RGB plus IR capture, synchronization, and camera fusion are not implemented. Do not describe discovery as dual-camera tracking.

The Results recommendation at mean error greater than 8% of the viewport diagonal is a current UI heuristic, not a validated production accuracy threshold. The visible fps value describes processing results, not necessarily camera capture fps.

## Calibration and head movement

- Every sample keeps its concurrent eye features, known target, and head/reference pose. Different targets may have different head positions; do not average away those differences or require a fixed head across the sequence.
- Head movement is enabled by default. Ordinary calibration presents nine locations; extended calibration presents those same nine twice, with gentle head motion during the second pass. That is 18 presentations, **nine unique calibration locations**.
- Each presentation collects 18 accepted fresh observations after a 700 ms settling period. Duplicate timestamps, future or stale observations, low quality, invalid features, missing pose, and recorded-video observations are excluded.
- Regression standardizes features and uses regularization selected by leaving out complete target groups. Repeated head passes at the same target stay in the same group. Never replace this with a random adjacent-frame split.
- Validation uses five different locations. A validation fit must not train or tune the calibration it evaluates.
- Preserve `poseSupported`: the support check uses both bounds and proximity to actually observed joint poses. A broad Cartesian box alone accepts combinations the user never calibrated.
- Full-face rotation is obtained from the native MediaPipe matrix convention. Keep its column-major interpretation separate from the upstream appearance model's input convention.
- Close-up IR reference translation and apparent scale are not a full face rotation or metric 6DOF head pose. Keep their UI and export labels distinct.
- Do not recalibrate from the tracker's own predictions without known screen targets. That creates feedback and drift.

## Tracking pipeline contracts

### Webcam and mobile

Both paths use local MediaPipe face/iris geometry and the bundled pretrained BlazeGaze appearance model. Their feature mappings and backend preferences differ; they are not independently trained phone and laptop networks.

Mobile prefers single-thread WASM, then WebGL, then CPU. Webcam prefers WebGL, then WASM, then CPU. Preserve model-compatible crop preprocessing, head inputs, source hashes, error handling, and disposal. Do not replace a missing appearance model with a silent iris-only fallback. Phone handling does not currently use a gyroscope or native phone depth sensor.

### Full-face IR and close-up IR

Full-face IR uses face/canthi/lid geometry to locate eyes and compensate head motion. It measures pupil centers from the source-resolution eye pixels using the shared normal-tracker `PupilTracker`. RGB appearance inference is not part of this path.

- Automatic threshold is `0` and is the default. The manual 1–255 slider appears only after Auto threshold is disabled.
- Automatic full-face eye regions are the default. A manually selected close-up region is an explicit alternative, not a setup prerequisite.
- Full-face binocular calibration does **not** require glints. Its feature representation stays fixed when reflections disappear.
- Close-up pupil/corneal-reflection tracking requires a current usable reflection for gaze features; pupil tracking history can survive temporary missing glints.
- Two eyes and the native/local/global recovery paths maintain independent histories. Current canthi geometry remaps history for crop translation, scale, and roll.
- Original pixel evidence takes priority. Two-scale local illumination recovery and global contrast fallback are proposals; transformed recoveries still need distributed pupil-rim support in the original camera pixels.
- Preserve reflection rejection, dark/bright polarity handling, blink clearing, missing-evidence clearing, history expiry, and bounded reacquisition.
- MediaPipe iris geometry is an optional **search prior**, never a substitute pupil center. Invalid, off-aperture, collapsed, one-sided, or collinear priors fall back to the eye-opening search.
- A previous shape may help measure a current partial rim. A previous center must not become a fresh detection merely because the current pupil is missing.

Here, original pixels means the decoded camera image before recovery transforms. It does not mean Buttercup's sensor-level RAW10 input.

### Worker and media lifecycle

Keep inference off the UI thread, one frame in flight, no accumulated frame queue, physical-video-frame deduplication, and generation checks around asynchronous work. Close transferred bitmaps; dispose tensors, models, vision resources, workers, event listeners, streams, and object URLs when their owner stops.

Results expire after one second without a new frame. Stop, mode changes, source replacement, disconnection, unmount, and page hiding must not leave stale gaze visible. A late permission response or worker result must not resurrect an old session.

Local videos use browser object URLs and stay local. Seeking or changing replay settings clears worker history, rejects obsolete in-flight results, and reprocesses a paused selected frame. Recorded observations cannot enter live screen calibration. Interactive replay processes available frames; it is not the exhaustive sequential evaluation runner.

## Files that must move together

Paths below are relative to the repository root. Use the complete branch diff when integrating; this table identifies dependencies and likely conflict points, not a subset to cherry-pick.

| Area | Source and integration files |
| --- | --- |
| Public routes and entry | `frontend/apps/web/src/App.tsx`, `frontend/apps/web/src/pages/v2-page.tsx` |
| Page and compact controls | `frontend/apps/web/src/pages/remote-eye-tracking-page.tsx`, `frontend/apps/web/src/features/remote-eye-tracking/remote-controls.tsx` |
| Styling | `frontend/apps/web/src/pages/remote-eye-tracking.css`, scoped additions and shared tokens in `frontend/apps/web/src/pages/v2.css` |
| Capture, worker, and source lifecycle | `session.ts`, `use-remote-tracker.ts`, `remote.worker.ts`, `types.ts` under `frontend/apps/web/src/features/remote-eye-tracking/` |
| Calibration and status | `calibration.ts`, `calibration-overlay.tsx`, `sample-collector.ts`, `observation-status.ts` in that same directory |
| RGB and face inference | `rgb-processor.ts`, `rgb-features.ts`, `face-landmarker.ts` in that directory |
| IR inference and recovery | `ir-processor.ts`, `ir-eye-tracker.ts`, `ir-face-features.ts`, `ir-features.ts`, `ir-preprocessing.ts` in that directory |
| Shared pupil detector | `pupil-tracker.ts`, `detection.ts`, `detection.types.ts`, `geometry.ts`, `engine.ts`, `eye-tracking.types.ts` under `frontend/apps/web/src/features/eye-tracking/` |
| Model and WASM assets | Entire `frontend/apps/web/public/models/remote-eye-tracking/` directory |
| Dependencies and delivery | `frontend/apps/web/package.json`, `frontend/bun.lock`, `frontend/apps/web/vite.config.ts`, `frontend/nginx.conf`, `.gitattributes` |
| Tests | `frontend/tests/remote-eye-tracking/` and modified `frontend/tests/eye-tracking/detection.test.ts` |
| Provenance and operating guide | `research/WebEyeTrack-NOTICE.md`, `docs/remote-eye-tracking-v3.md`, this handoff, and README links |

The normal engine also uses the extracted shared pupil tracker. Keeping remote files while dropping shared detector changes breaks the intended pipeline; copying a second detector defeats the shared fixes.

## Merge procedure

1. Work in a clean destination checkout under `~/Desktop/Codex-projects/`. Confirm the intended destination branch and preserve any unrelated work.
2. Review `git diff --stat 6ba620f..codex/v3-webcam-gaze` and `git log --oneline 6ba620f..codex/v3-webcam-gaze`. The implementation chain includes initial V3, icon simplification, camera discovery, shared pupil tracking, replay/recovery, and the latest accuracy guards. Do not integrate only the first V3 commit.
3. Integrate the complete branch using the destination project's normal workflow. Resolve routes, shared detector, theme, worker configuration, dependencies, and deployment conflicts deliberately; do not blanket-accept one side of a conflict.
4. Retain the destination's unrelated routes, auth, server configuration, and newer fixes. The remote public route must still bypass account initialization.
5. Keep dependencies and the Bun lockfile consistent. Include actual model binaries, weight shards, and runtime assets; do not serve a SPA HTML fallback as a missing model or WASM response. Preserve byte-for-byte runtime assets and their provenance notice.
6. Keep ES module worker output and lazy mode loading. Retain trusted development TLS configuration and production SPA fallback. Keep asset gzip support where Nginx is used; verify deployment content types and compression rather than assuming configuration proves delivery.
7. Run the automated and manual gates below. Record results after merging into the destination, not just the source branch's historical results.

Private recordings, per-frame biometric results, generated overlay videos, and benchmark caches are not integration assets. They stay outside tracked source and production bundles. Do not commit, publish, or upload them. Deployment and pushing are separate actions; this handoff does not request them.

## Verification before accepting the merge

From the destination repository's `frontend` directory:

```sh
bun install --frozen-lockfile
bun run test
bun run lint
bun run build
```

The build runs TypeScript project checks before Vite output. Run `git diff --check` from the repository root for merge edits. Review model checksums against the provenance notice if assets changed.

At `e8f0b75`, the historical verification was 316 tests across 29 files, zero failures, 2,501 assertions, plus lint and production build. This count is a reference, not a substitute for running the merged checkout's tests.

### Browser and device checks

- Open `/trial`, `/trials`, and `/trials/remote-eye-tracking` without signing in. Verify both the normal tracker and all three remote cards remain available.
- Inspect desktop, 390 px portrait, and landscape layouts. Check scrolling, stacked cards, no horizontal overflow, tooltip placement, focus visibility, and tap-to-open Help.
- Check card selection causes no permission request. With two attached cameras, discover and select either before starting tracking. Test denial, cancellation, hotplug, and disconnect.
- Check ready, loading, no signal, model failure, and recovery states. Exercise Stop and Change setup; the old camera and gaze must clear.
- Verify mirrored live RGB and unmirrored IR/video overlays align with the displayed feed.
- In IR, verify automatic eye regions and threshold initially; manually select an eye, reset to automatic, and change threshold while paused on a local video.
- Calibrate with head motion at different targets and during the second pass. Validate on five new targets. Check out-of-support head movement pauses gaze; resize/orientation changes invalidate calibration.
- Open a local recording, play, pause, scrub repeatedly, change settings while paused, replace the file, and reach its end. Confirm no recorded frame can start or complete screen calibration.
- Check JSON export retains mode, method, viewport, calibration, validation, samples, and the distinction between face pose and close-up reference pose.
- Confirm model requests remain same-origin and frames are not uploaded. On phones, test trusted HTTPS, `playsInline`, actual sustained performance, and permission recovery.

For local desktop startup, use `bun run dev --host 0.0.0.0 --port 4003` from `frontend` and open `http://localhost:4003/trials/remote-eye-tracking`. A phone needs a trusted HTTPS origin; a plain LAN HTTP address is insufficient. See the operating guide for the existing TLS environment variables. Never include certificate keys in Git.

## Accuracy evidence and unfinished work

| Recording | Source frames | Both pupils reported | Any pupil reported |
| --- | ---: | ---: | ---: |
| Off-axis lighting, `01-53-37` | 1,217 | 1,031, or 84.7% | 1,194 |
| Lighting directed at eyes, `01-55-24` | 1,200 | 1,044, or 87.0% | 1,166 |

These are latest complete sequential **detection coverage** counts, not pupil-center accuracy, visible-pupil recall, screen-gaze accuracy, or real-time fps. They supersede the older 479/865 binocular counts. Real-video center accuracy remains unmeasured without independent labels. The synthetic maximum center error of 1.164 source pixels must never be presented as measured video accuracy.

Remaining uncertain examples include clip 2 frame 869 eye 1 and clip 1 frame 330 eye 1. Glare, blur, faint boundaries, and partial rims can still produce incorrect fits. Mean/p95 processing times also do not establish sustained 30-fps tracking on every device. OpenCV's 128 MiB WASM heap and approximately 26.83 MB of cold IR vision assets remain relevant mobile constraints; actual phone performance is still to be measured.

Buttercup is a future research candidate. Separate pupil/iris/lid segmentation, visibility-aware ellipse fitting, bounded local refinement, and a shared binocular objective may be useful. Its RAW16 sensor model is not compatible with our ordinary camera frames; its published small development results do not establish gains here. No explicit reuse license was found in the inspected repository. Keep any future implementation separate from this integration, establish code/model reuse rights, and evaluate it against an independently labeled holdout before claiming improvement. Source assessment: [Buttercup model](https://buttercup.caskey.org/custom-model.html), [refinement results](https://buttercup.caskey.org/limbus-refiner.html), [CondSeg paper](https://arxiv.org/html/2408.17231v1).

## Prompt to give the merging agent

> Integrate `codex/v3-webcam-gaze` into the intended destination branch. First read `docs/remote-eye-tracking-v3-handoff.md`, the latest sections of `docs/remote-eye-tracking-v3.md`, and `research/WebEyeTrack-NOTICE.md`. Preserve the compact icon UI, public routes, pre-start camera selection, automatic full-face IR pipeline, shared pupil tracker, synchronized head-aware calibration, and local replay lifecycle. Integrate the complete dependency and asset changes. Treat the original design spec as historical where the handoff supersedes it; Buttercup is research only. Resolve destination conflicts without discarding unrelated work. Run the documented merge gates and report changed files, test results, browser/device checks, and remaining limits. Do not equate coverage with accuracy or add a redesign, model replacement, upload, deployment, or push to this task.
