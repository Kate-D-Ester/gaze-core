import { gazeVector3D } from "./manual-gaze-vector"
import { EyeModelEstimator } from "./eye-model"
import type {
  Detection,
  EyeModel,
  FrameSettings,
  Gaze,
  TrackingFrame,
} from "./eye-tracking.types"
import {
  cameraIntrinsics,
  gazeFromPupil,
  sphereFromProjection,
} from "./geometry"
import type { CV } from "./opencv.types"
import { PupilTracker } from "./pupil-tracker"
export class TrackingEngine {
  private readonly model = new EyeModelEstimator()
  private configKey = ""
  private readonly pupils: PupilTracker
  private gray = new Uint8Array(0)
  constructor(privateCv: CV) {
    this.pupils = new PupilTracker(privateCv)
  }
  reset() {
    this.model.reset()
    this.configKey = ""
    this.pupils.reset()
  }
  process(
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
    settings: FrameSettings,
    id: number,
    timestamp: number,
    includePreviewMasks = true
  ): TrackingFrame {
    const start = performance.now()
    const roi = settings.roi
    if (
      ![width, height, roi.x, roi.y, roi.width, roi.height].every(
        Number.isInteger
      ) ||
      roi.x < 0 ||
      roi.y < 0 ||
      roi.width < 1 ||
      roi.height < 1 ||
      roi.x + roi.width > width ||
      roi.y + roi.height > height ||
      rgba.length !== width * height * 4
    ) {
      throw new Error("Invalid camera frame or eye region.")
    }
    const key = JSON.stringify([
      width,
      height,
      settings.format,
      roi,
      settings.threshold,
      settings.thresholdMode,
      settings.fov,
      settings.radiusMm,
      settings.corners,
    ])
    if (key !== this.configKey) {
      this.reset()
      this.configKey = key
    }
    if (this.gray.length !== roi.width * roi.height) {
      this.gray = new Uint8Array(roi.width * roi.height)
    }
    const gray = this.gray
    // Crop and convert directly into a reusable buffer, without an intermediate RGBA crop.
    for (let y = 0; y < roi.height; y++) {
      let source = ((y + roi.y) * width + roi.x) * 4
      const row = y * roi.width
      for (let x = 0; x < roi.width; x++) {
        gray[row + x] = Math.round(
          rgba[source] * 0.299 +
            rgba[source + 1] * 0.587 +
            rgba[source + 2] * 0.114
        )
        source += 4
      }
    }
    let detection: Detection
    let model: EyeModel | null = null
    let gaze: Gaze | null = null
    if (settings.format === "spatial") {
      detection = this.pupils.accept(
        this.pupils.detect(
          gray,
          roi.width,
          roi.height,
          settings.threshold,
          timestamp,
          { thresholdMode: settings.thresholdMode, includePreviewMasks }
        ),
        timestamp,
        roi.width,
        roi.height
      )
      const e = detection.ellipse
      model = this.model.getLatest()
      if (e && !settings.locked && detection.shapeObserved !== false) {
        model = this.model.observe(
          { ...e, center: [e.center[0] + roi.x, e.center[1] + roi.y] },
          width,
          height,
          roi.width,
          roi.height
        )
      }
      const k = cameraIntrinsics(width, height, settings.fov)
      if (e && detection.tracking === "tracking" && model?.ready && k) {
        const sphere = sphereFromProjection(
          model.center,
          model.radius,
          settings.radiusMm,
          k
        )
        if (sphere) {
          gaze = gazeFromPupil(
            [e.center[0] + roi.x, e.center[1] + roi.y],
            sphere,
            k
          )
        }
      }
    } else {
      const corners = settings.corners
      const center: [number, number] = corners
        ? [
            (corners[0][0] + corners[1][0]) / 2,
            (corners[0][1] + corners[1][1]) / 2,
          ]
        : [roi.x + roi.width / 2, roi.y + roi.height / 2]
      const radius = corners
        ? Math.hypot(
            corners[0][0] - corners[1][0],
            corners[0][1] - corners[1][1]
          ) / 2
        : roi.width / 3
      detection = this.pupils.accept(
        this.pupils.detect(
          gray,
          roi.width,
          roi.height,
          settings.threshold,
          timestamp,
          {
            thresholdMode: "manual",
            expectedCenter: [center[0] - roi.x, center[1] - roi.y],
            includePreviewMasks,
          }
        ),
        timestamp,
        roi.width,
        roi.height
      )
      const e = detection.ellipse
      if (corners && radius > 4) {
        model = {
          center,
          radius,
          residual: 0,
          samples: 2,
          coverage: 1,
          ready: true,
        }
        if (e && detection.tracking === "tracking") {
          const v = gazeVector3D(
            e.center,
            [center[0] - roi.x, center[1] - roi.y],
            radius
          )
          gaze = {
            origin: [0, 0, 0],
            direction: [v[0], v[1], -v[2]],
            pupil: [...v],
          }
        }
      }
    }
    return {
      id,
      timestamp,
      width,
      height,
      roi,
      detection,
      model,
      gaze,
      processingMs: performance.now() - start,
    }
  }
}
