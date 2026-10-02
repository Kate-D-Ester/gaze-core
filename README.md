# GazeCore

GazeCore provides a browser-based eye-tracking experience and a separate auth/API-key service. Eye tracking is available at `/trial/screen-eye-tracking`; `/v2` redirects there for older links.

The dashboard offers three **Try it out** cards:

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

Open `http://localhost:4001/trial/screen-eye-tracking`. Camera access requires localhost or HTTPS and browser permission. USB and network camera frames are processed locally and are not sent to the backend. Network camera streams, including ESP32 `.local` URLs, are read through a local relay, so the camera itself does not need CORS support. Run `bun run camera-relay` from `frontend/apps/web` alongside the web app. For a hosted app, set `GAZE_CAMERA_RELAY_ALLOWED_ORIGINS` to its exact origin when starting the relay.

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
