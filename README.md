# GazeCore

GazeCore provides a browser-based eye-tracking experience and a separate auth/API-key service. Eye tracking is available at `/trial`; `/v2` redirects there for older links.

## Try eye tracking

```sh
cd frontend
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:4001/trial`. Camera access requires localhost or HTTPS and browser permission. USB and network camera frames are processed locally and are not sent to the backend. Network camera streams, including ESP32 `.local` URLs, are read through a local relay, so the camera itself does not need CORS support. Run `bun run camera-relay` from `frontend/apps/web` alongside the web app. For a hosted app, set `GAZE_CAMERA_RELAY_ALLOWED_ORIGINS` to its exact origin when starting the relay.

## Scene-camera tracking

Open `/trial/scene-camera-eye-tracking` for the headset eye-camera + scene-camera flow, hand/marker/one-point calibration, local raw recording, coordinate exports and heatmaps. See [the scene-camera guide](docs/scene-camera-eye-tracking.md) for setup, synchronization and accuracy limits. Integration into another working branch is documented in the [worktree-v4 merge handoff](docs/worktree-v4-merge-handoff.md).

## Auth and API keys

The dashboard, Google/email authentication, and API-key management use the separate backend service. Follow [the backend setup guide](backend/README.md) to configure its environment and database. The `/trial` eye-tracking experience can run without that service.

See [Eye tracking V2](docs/eye-tracking-v2.md) for the tracker workflow, models, limitations, and validation details.
