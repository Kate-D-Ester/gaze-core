# GazeCore

GazeCore provides a Next.js browser-based eye-tracking experience and a separate auth/API-key service. Eye tracking is available at `/trial/screen-eye-tracking`; `/v2` redirects there for older links.

The dashboard offers four **Try it out** cards:

- Speaker focus: `/trial/speaker-focus`
- Screen eye tracking: `/trial/screen-eye-tracking`
- Remote eye tracking: `/trial/remote-eye-tracking`
- Scene camera eye tracking: `/trial/scene-camera-eye-tracking`

Each tracker’s GazeCore heading returns to `/dashboard`. The trial routes are public; the dashboard retains its existing account flow. `/trial`, `/trials`, and `/v2` remain redirects for older screen-tracker links.

## Try eye tracking

```sh
cd frontend
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:4001/trial/screen-eye-tracking`. Camera access requires localhost or HTTPS and browser permission. Eye camera frames are processed locally in the browser. Explicitly starting live speaker focus sends scene JPEG frames and mixed microphone PCM only to the loopback inference service; the auth backend does not receive them. Network cameras connect directly from the browser; there is no camera relay service or camera API route. The browser resolves ESP32 `.local` and IP URLs and follows camera redirects. If a local HTTP `/stream` URL on the default port is blocked, the app tries the ESP32 stream port 81 on that same host. Working URLs and custom ports are preserved. The camera must allow CORS so the app can read pixels. Browser local-network and mixed-content restrictions still apply. `bun run dev` starts the app on port 4001; `bun run start` and `bun run preview` require `bun run build` first.

## Remote eye tracking

Open `/trial/remote-eye-tracking` for mobile, webcam, or IR tracking. See
[the remote tracking guide](docs/remote-eye-tracking-v3.md) for setup, research,
and validation. Mobile camera access requires a trusted HTTPS origin. All model
assets are bundled locally; camera frames remain on the device.

## Scene-camera tracking

Open `/trial/scene-camera-eye-tracking` for the headset eye-camera + scene-camera flow, hand/marker/one-point calibration, local raw recording, coordinate exports and heatmaps. See [the scene-camera guide](docs/scene-camera-eye-tracking.md) for setup, synchronization and accuracy limits. Integration into another working branch is documented in the [worktree-v4 merge handoff](docs/worktree-v4-merge-handoff.md).

## Auth and API keys

The dashboard, Google/email authentication, and API-key management use the separate backend service. Follow [the backend setup guide](backend/README.md) to configure its environment and database. The `/trial/screen-eye-tracking` eye-tracking experience can run without that service.

See [Eye tracking V2](docs/eye-tracking-v2.md) for the tracker workflow, models, limitations, and validation details.

## Development checks

From `frontend`, run `bun test`, `bun run lint`, `bun run typecheck`, and
`bun run build`. The build prepares the local hand-tracking worker and WASM
assets automatically.

Remote face tracking uses the `@mediapipe/tasks-vision-remote` alias pinned to
1.0.1. Head and hand tracking use `@mediapipe/tasks-vision` pinned to 0.10.32.
Keep each runtime paired with its own WASM assets; these versions are not
interchangeable. See the [remote integration handoff](docs/remote-eye-tracking-v3-handoff.md)
and [scene integration handoff](docs/worktree-v4-merge-handoff.md) for the
original implementation and hardware validation notes.

## V3 codebase

The frontend uses Next.js 16.3.8, React 19.3.0 and Tailwind CSS 4.3.3.
See [frontend structure and commands](frontend/README.md) and the
[v3 audit report](docs/v3-codebase-audit.md) for migration decisions, shared code,
security fixes and verification. The separate `vision_assistant` Python work is
not imported, bundled, deleted or changed by this application migration.


## Local speaker focus

`/trial/speaker-focus` starts with eye camera setup, eye region/model, scene camera,
calibration and a fresh accuracy check. Focus then shows the current gaze and the
selected face. Looking at objects keeps that person locked; a fresh 0.5-second
dwell on another face switches the lock, while losing the person pauses focused
audio. When several faces overlap the displayed gaze bubble, the face covering
the largest area of that bubble wins; equal coverage keeps the current lock.
**Test a video** opens the separate click-based reference test.
Returning to setup preserves its calibration. Recalibrate clears the old mapping.

The local service extracts the selected face's voice from the original mixed audio
and synchronized face video. Reference playback feeds only elapsed audio and
presented frames to the same streaming engine as live microphone capture. Focused
starts in Buffering; it never plays the mixture while waiting. Original is an
explicit comparison mode. File export is a separate whole-file operation.
Outputs remain experimental: overlapping voices and artifacts can remain.

Prepare dependencies and the approved mixed reference once:

```sh
cd ~/Desktop/Codex-projects/gaze-speaker-focus/speaker-service
uv sync --frozen
uv run python -m gaze_speaker.assets --dir data/assets
cd ../frontend
bun install --frozen-lockfile
bun run prepare:speaker-reference ~/Desktop/Codex-projects/scene-speech-reference/cnn-debate-low-quality-320x180-15fps.mp4
bun run dev:speaker-focus
```

Open `http://127.0.0.1:4010/trial/speaker-focus`. The single development command
starts the frontend on 4010 and local model service on 4033 with this exact allowed
origin. Camera streams use the direct browser connection from v3. Stop the command
before restarting it. The reference setup
verifies SHA-256 and keeps the video out of Git; local uploads are also supported.

To try the optional AV-MossFormer2 engine, explicitly prepare its official weights,
then launch the same workspace with that engine:

```sh
cd ~/Desktop/Codex-projects/gaze-speaker-focus/speaker-service
uv run python -m gaze_speaker.assets --engine av-mossformer2 --dir data/av-assets
cd ../frontend
GAZE_SPEAKER_ENGINE=av-mossformer2 bun run dev:speaker-focus
```

RTFS remains the default. The service engine and actual inference device are shown
in the reference test. AV-MossFormer2 is a promising comparison candidate; our local
ASR/signal diagnostics are not a human listening test or proof of clean isolation.
See [reusable model research](docs/speaker-separation-research.md) for primary sources,
measured Mac performance and limitations.

Live listening requests a microphone explicitly and requires a camera/microphone
alignment check. Playback delay adapts to warmed inference speed, arrival jitter
and audio-device latency, with one selected target. Both engines process newly
available audio when the worker is free, using recent context instead of waiting
for a complete fixed analysis window. Faster hardware reduces processing delay. Continuous RNNoise
suppresses environmental noise after separation. On overload, reference input
pauses without dropping source samples; live capture stops, drains accepted audio
and offers Resume. There is no fixed four-second playback deadline or live
120-second recording limit.
ESP32 MJPEG scene streams can be used with a separately selected microphone after
a manual camera/microphone alignment check. Network timing uses frame arrival
times and the chosen offset; it is explicitly estimated and cannot compensate
for changing upstream camera latency. An ESP32 eye stream can still supply gaze
through the direct camera connection.
Physical gaze accuracy and sustained live performance require a hardware trial.

For a built frontend, run Next on `127.0.0.1:4010` and start the local speaker
service with that exact allowed origin. Camera streams require the same browser
CORS and local-network permissions as v3. Model downloads are explicit and checksum
pinned.

See [speaker service setup](speaker-service/README.md) for configuration/limits and
[original measurements](docs/gaze-speaker-focus-results.md) for reproducible RTFS
checks. Local inference needs no cloud account or auth server.
