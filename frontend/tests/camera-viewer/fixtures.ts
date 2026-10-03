import type { SceneCameraSnapshot } from "../../apps/web/src/features/scene-eye-tracking/scene-camera.types"
export function liveSnapshot(): SceneCameraSnapshot {
  return {
    source: {
      kind: "camera",
      name: "Preview",
      key: "usb:preview:1",
      deviceId: "preview",
    },
    busy: false,
    error: "",
    devices: [],
    connection: "live",
    retryAttempt: 0,
    transform: { rotation: 0, mirrorX: false, mirrorY: false },
    frame: { id: 1, generation: 1, timestamp: 1000, width: 640, height: 480 },
  }
}

import type { TrackerController } from "../../apps/web/src/features/eye-tracking/use-tracker.types"
import { DEFAULT_SETTINGS } from "../../apps/web/src/features/eye-tracking/use-tracker"
export function createViewerTracker(): TrackerController {
  const frame = {
    id: 1,
    timestamp: 100,
    width: 640,
    height: 480,
    roi: { x: 0, y: 0, width: 640, height: 480 },
    detection: {
      ellipse: null,
      seed: null,
      contour: [],
      refined: [],
      previews: [],
      selected: 0,
      reason: "fixture",
    },
    model: null,
    gaze: null,
    processingMs: 0,
  }
  return {
    transform: { rotation: 0, mirrorX: false, mirrorY: false },
    setTransform() {},
    connection: "live",
    reconnectAttempt: 0,
    dimensions: { width: 640, height: 480 },
    settings: { ...DEFAULT_SETTINGS, locked: true },
    configure() {},
    frame,
    latest: { current: frame },
    source: {
      kind: "network",
      name: "Eye",
      url: "http://camera.local/stream",
      key: "eye:1",
    },
    sourceCanvas: { current: document.createElement("canvas") },
    busy: false,
    error: "",
    setError() {},
    engineReady: true,
    devices: [],
    async startCamera() {},
    async startNetworkStream() {},
    async startVideo() {},
    startSample() {},
    stop() {},
    setSampleTarget() {},
    setPreviewMasksEnabled() {},
    setBlink() {},
  }
}
