# Scene-camera eye tracking

Open `/trial/scene-camera-eye-tracking`. This public route runs locally in the browser with one eye camera and one outward-facing scene camera. `/trial` retains screen calibration.

```sh
cd frontend
bun install --frozen-lockfile
bun run dev --port 4014
```

For a production preview, run `bun run build` followed by `bun run --cwd apps/web preview --port 4014`. The dev/build commands regenerate the classic hand worker and matching WASM files from the pinned MediaPipe package. The hand model is included in the repository; no CDN/model download is required by a wearer.

## Setup

1. Choose the eye camera, frame the eye, and build/lock the eye model. Both v2 manual and automatic tracker formats remain available.
2. Connect a different outward-facing USB device or a browser-readable network stream. IP addresses and mDNS hostnames work exactly as for the eye camera, for example `http://192.168.1.90:81/stream` or `http://esp32cam.local:81/stream`. The standard ESP32 CameraWebServer stream endpoint uses port 81. Streams need HTTP(S), a browser-supported video format or MJPEG, and CORS access for this app's origin. An HTTPS page may block an HTTP stream. Use a secure compatible source or a localhost app and check your browser's local-network restrictions.
3. Mount both cameras rigidly on the headset. Scene frames are unmirrored, with x increasing rightward and y increasing downward. The preview preserves their native aspect ratio.
4. Start finger calibration. Look at your **physical index fingertip**, move it through the scene view, and pause in each of the nine preview regions. Watching the finger's screen image would provide the wrong fixation reference. MediaPipe draws all 21 landmarks and highlights index landmark 8.
5. Keep each hold steady while samples are collected. The collector settles for 300 ms, then needs at least 20 distinct eye/scene pairs spanning at least 800 ms. Movement, a blink, missing/ambiguous hands, stale frames, or lost pupil evidence resets the incomplete hold. All nine regions and broad horizontal/vertical coverage are required.
6. Open live scene gaze, then collect five fresh finger holds with **Check accuracy**. This reports normalized image RMS and native-scene pixel RMS; the fitting score alone is not an independent accuracy measurement.

## Timing and mapping

Both pipelines use `performance.now()` timestamps. Pairing allows at most 100 ms mismatch after the selected relative delay adjustment. Eye history is limited to three seconds; stale scene data older than 250 ms and stale eye data older than 250 ms plus the absolute configured delay are rejected.

A positive **Scene arrival delay relative to eye** means the scene stream arrives later. For example, +100 ms pairs a scene received at 1000 ms with eye evidence near 900 ms. This is a manually supplied compensation for transport/decode delay, not hardware synchronization. Compare fresh accuracy checks at stable working distances when tuning it; a fixed compensation cannot correct variable network jitter.

The mapping uses gaze features from the locked eye model. It fits an affine model and a quadratic candidate using whole-location leave-one-out checks, choosing the quadratic only for at least 10% improvement. Fits with normalized RMS over 0.08, singular features, or insufficient coverage are rejected. These thresholds are initial software guardrails; measured accuracy still depends on the headset, optics, fixation and synchronization.

The mapping survives browser resizing and head motion while the eye/camera alignment stays fixed. Changes to sources, frame dimensions, eye setup or delay invalidate it. After headset slippage, use **Recalibrate / headset moved**. Depth changes can introduce monocular parallax error; calibrate and validate near your working distance. Hand-relative MediaPipe world landmarks do not provide absolute scene-camera distance.

Live gaze works after the hand leaves the view. Pupil or scene loss suppresses the dot; outside-view coordinates remain outside-view in exported data rather than being clamped to the edges. Predictions outside the sampled bounding coverage are marked as extrapolated.

## Local recording and exports

**Start recording / data log** records an overlay-free scene video and coordinate log. USB video uses an owned clone of the camera track. Network/MJPEG video is a browser re-encode of a separate raw canvas. Optional eye video is a re-encode of the raw eye preview canvas. Hand skeletons, gaze dots, traces and heatmaps are never baked into those raw recordings.

Each session is bounded to ten minutes, 18,000 coordinate rows, 18,000 hand observations and 128 MiB of combined video (64 MiB per video when recording both). A camera failure, setup/calibration change, codec failure or limit finalizes available data. Completed downloads remain available until cleared or replaced. If video capture is unsupported, coordinate logging remains usable. Leaving the route stops capture; save downloads before closing it.

- **Raw scene/eye video:** browser-selected MP4 or WebM; the filename matches the actual MIME type.
- **Gaze CSV:** elapsed session milliseconds, browser timestamps, eye/scene frame IDs and timestamps, confidence, normalized/pixel coordinates, validity, loss reason and extrapolation flag.
- **Session JSON:** calibration pairs and holds, independent validation, camera/settings/model metadata, delay, time origin, video start offsets, gaze measurements and full image/hand-relative world landmarks.
- **Heatmap PNG:** dwell-weighted image-space density over the last raw scene frame. Invalid/out-of-frame intervals and gaps over 250 ms contribute no dwell. It accumulates camera-image locations as the headset moves; it does not identify or register physical objects across motion.

Video timestamps and gaze timestamps share a browser clock but are not guaranteed frame-exact. JSON records each encoder's start offset from the coordinate-session origin. Test alignment with your cameras before using exports for timing-sensitive analysis.

## Research basis

[Bâce, Staal and Sörös's ETRA fingertip-calibration paper](https://vs.inf.ethz.ch/publ/papers/mbace_etra2018.pdf) and [published Pupil plugin](https://github.com/mihaibace/fingertip-calibration) demonstrate physical-fingertip fixation as a calibration reference. [Pupil's guide](https://docs.pupil-labs.com/core/software/pupil-capture/#gaze-mapping-and-accuracy) emphasizes field-of-view coverage, separate accuracy tests and depth-dependent parallax. [Google's web guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js) documents the hand landmarks and recommends worker inference to avoid blocking the interface. The current feature combines these ideas with the existing v2 gaze model; hardware accuracy is not inferred from those studies.

## Verification and hardware check

Run `bun test`, `bun run typecheck`, `bun run lint`, and `bun run build` from `frontend`. Tests cover calibration quality, pairing, loss, independent camera lifecycle, worker cleanup, recording failure, export formats and heatmap dwell.

Before relying on a real headset, validate a second set of physical fixations at intended depths, compare both manual/auto modes, test stream jitter and disconnect/reconnect, check video/coordinate offsets with an observable event, and repeat after taking off/refitting the headset. Automated tests and browser fixtures cannot measure actual gaze accuracy.

## Reproducible browser smoke fixture

After `bun run build`, run `bun tests/scene-eye-tracking/prepare-browser-fixture.ts` from `frontend`, then `bun run --cwd apps/web preview --host 127.0.0.1 --port 4014`. Open `/scene-fixture.html`. This disposable page uses synthetic camera, pupil and hand data; it does not request camera access or modify the production route.

Use **Test real MediaPipe worker** to load the production worker/WASM/model and run inference on a synthetic image. Connect the synthetic scene camera, start finger calibration and then sweep nine regions. Open live gaze, record/stop, export CSV/JSON/PNG, and toggle hand/pupil loss. A new production build removes the fixture page. These checks prove browser integration, not hardware accuracy.
