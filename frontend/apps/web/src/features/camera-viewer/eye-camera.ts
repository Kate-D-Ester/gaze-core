import type { CameraTransform } from "../eye-tracking/camera-transform"
import type { TrackerController } from "../eye-tracking/use-tracker.types"
import type { SceneCameraSnapshot } from "../scene-eye-tracking/scene-camera.types"
import type { ViewerCamera } from "./viewer-camera.types"

/** Observes the existing eye worker; never owns another camera or model. */
export class ViewerEyeCamera implements ViewerCamera {
  private tracker: TrackerController
  private snapshot: SceneCameraSnapshot
  private generation = 0
  private readonly emptyCanvas = document.createElement("canvas")
  private readonly listeners = new Set<() => void>()

  constructor(tracker: TrackerController) {
    this.tracker = tracker
    this.snapshot = this.readSnapshot()
  }
  get canConnect() {
    return this.tracker.engineReady
  }
  get rawCanvas() {
    return this.tracker.sourceCanvas.current ?? this.emptyCanvas
  }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  update(tracker: TrackerController) {
    const previous = this.tracker
    this.tracker = tracker
    const rotated =
      JSON.stringify(previous.transform) !== JSON.stringify(tracker.transform)
    if (
      previous.source !== tracker.source ||
      rotated ||
      (previous.frame && !tracker.frame)
    ) {
      this.generation++
    }
    if (
      previous.source === tracker.source &&
      !rotated &&
      previous.frame === tracker.frame &&
      previous.busy === tracker.busy &&
      previous.error === tracker.error &&
      previous.devices === tracker.devices &&
      previous.connection === tracker.connection &&
      previous.reconnectAttempt === tracker.reconnectAttempt &&
      previous.engineReady === tracker.engineReady
    ) {
      return
    }
    this.snapshot = this.readSnapshot()
    this.listeners.forEach((listener) => listener())
  }
  private readSnapshot(): SceneCameraSnapshot {
    const tracker = this.tracker
    const source = tracker.source
    const supportedSource =
      source && (source.kind === "camera" || source.kind === "network")
        ? {
            ...source,
            kind: source.kind,
            key: source.key ?? `${source.kind}:${this.generation}`,
          }
        : null
    const frame = supportedSource ? tracker.frame : null
    return {
      source: supportedSource,
      busy: tracker.busy,
      error: tracker.error,
      devices: tracker.devices,
      connection: tracker.connection,
      retryAttempt: tracker.reconnectAttempt,
      transform: tracker.transform,
      frame: frame
        ? {
            id: frame.id,
            timestamp: frame.timestamp,
            width: frame.width,
            height: frame.height,
            generation: this.generation,
          }
        : null,
    }
  }
  startCamera = async (
    deviceId: string,
    excludedDevices: readonly string[] = []
  ) => {
    if (!this.tracker.engineReady) {
      return
    }
    await this.tracker.startCamera(deviceId, excludedDevices)
  }
  startNetworkStream = async (url: string) => {
    if (!this.tracker.engineReady) {
      return
    }
    await this.tracker.startNetworkStream(url)
  }
  setTransform = (transform: CameraTransform) =>
    this.tracker.setTransform(transform)
  stop = () => this.tracker.stop()
}
