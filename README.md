# GazeCore

GazeCore provides a browser-based eye-tracking experience and a separate auth/API-key service. Eye tracking is available at `/trial`; `/v2` redirects there for older links.

## Try eye tracking

```sh
cd frontend
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:4001/trial`. Camera access requires localhost or HTTPS and browser permission. USB and network camera frames are processed in a browser Web Worker and are not sent to the backend. Network streams must be reachable by the browser and allow cross-origin access (CORS).

## Scene-camera tracking

Open `/trial/scene-camera-eye-tracking` for the headset eye-camera + scene-camera flow, fingertip calibration, local raw recording, coordinate exports and heatmaps. See [the scene-camera guide](docs/scene-camera-eye-tracking.md) for setup, synchronization and accuracy limits.

## Auth and API keys

The dashboard, Google/email authentication, and API-key management use the separate backend service. Follow [the backend setup guide](backend/README.md) to configure its environment and database. The `/trial` eye-tracking experience can run without that service.

See [Eye tracking V2](docs/eye-tracking-v2.md) for the tracker workflow, models, limitations, and validation details.
