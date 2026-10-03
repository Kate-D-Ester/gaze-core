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

Open `http://localhost:4001/trial/screen-eye-tracking`. Camera access requires localhost or HTTPS and browser permission. Eye camera frames are processed locally in the browser. Explicitly starting live speaker focus sends scene JPEG frames and mixed microphone PCM only to the loopback inference service; the auth backend does not receive them. Network camera streams, including ESP32 `.local` URLs, are read through a local relay, so the camera itself does not need CORS support. `bun run dev` starts the relay automatically and reuses it if it is already running. To use a built preview or hosted app, run `bun run camera-relay` from `frontend/apps/web` separately. For a hosted app, set `GAZE_CAMERA_RELAY_ALLOWED_ORIGINS` to its exact origin when starting the relay.

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

The new public trial extracts a selected visible person's speech with a local
pretrained RTFS-Net/CTCNet service. Click selection works without gaze hardware;
the scene camera live stage reuses its existing calibration and camera. Outputs
are experimental: other voices and artifacts remain, especially in poor video.
Live playback deliberately includes **4 seconds of delay**. Measured replay
throughput does not certify ESP32 optics, infrared behavior or physical clocks.

Use two terminals in this isolated worktree. The following uses port 4010 so the
original v3 checkout's port 4001 can stay running.

```sh
cd ~/Desktop/Codex-projects/gaze-speaker-focus/speaker-service
uv sync --frozen
uv run python -m gaze_speaker.assets --dir data/assets
uv run gaze-speaker --device auto --origin http://127.0.0.1:4010
```

```sh
cd ~/Desktop/Codex-projects/gaze-speaker-focus/frontend
bun install --frozen-lockfile
bun run prepare:speaker-reference
bun run build
cd apps/web
bun x next start --hostname 127.0.0.1 --port 4010
```

Open `http://127.0.0.1:4010/trial/speaker-focus`. Reference preparation expects
only the approved mixed degraded clip in the sibling `scene-speech-reference`
folder; it verifies its SHA-256 and keeps it out of Git. A local file upload is
also supported. For ESP32 network video in a built preview, start the existing
relay with `bun run camera-relay` from `frontend/apps/web`; a separate microphone
is required. Start microphone capture explicitly and verify audiovisual alignment
before enabling the live path. Model downloads are explicit and checksum pinned.

See [speaker service setup](speaker-service/README.md) for configuration and
limits, and [measurements and quality limits](docs/gaze-speaker-focus-results.md)
for reproducible tests. No cloud inference, auth server, merge or publication is
required for this local trial.
