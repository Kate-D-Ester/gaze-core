import { gazeVector3D } from "../../../../../packages/ui/src/lib/gaze-core/geometry"
import { toGray } from "../../../../../packages/ui/src/lib/gaze-core/image"
import { detectSpatialPupil, isContinuousPupil } from "./detection"
import { EyeModelEstimator } from "./eye-model"
import {
  cameraIntrinsics,
  gazeFromPupil,
  sphereFromProjection,
} from "./geometry"
import type { CV } from "./opencv.types"
import type {
  Detection,
  Ellipse,
  EyeModel,
  FrameSettings,
  Gaze,
  TrackingFrame,
} from "./eye-tracking.types"
import type { PendingPupilFit } from "./engine.types"

const pupilMemoryMs = 750

export class TrackingEngine {
  private readonly model = new EyeModelEstimator()
  private configKey = ""
  private previousSelected: number | undefined
  private previous: Ellipse | null = null
  private seenAt = -Infinity
  private pending: PendingPupilFit | null = null
  constructor(privateCv: CV) {
    this.cv = privateCv
  }
  private readonly cv: CV
  reset() {
    this.model.reset()
    this.configKey = ""
    this.previousSelected = undefined
    this.previous = null
    this.pending = null
    this.seenAt = -Infinity
  }
  process(
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
    settings: FrameSettings,
    id: number,
    timestamp: number,
    includePreviewMasks = true,
    evaluateAllThresholds = true
  ): TrackingFrame {
    const start = performance.now(),
      roi = settings.roi
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
    )
      throw new Error("Invalid camera frame or eye region.")
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
    const cropped = new Uint8ClampedArray(roi.width * roi.height * 4)
    for (let y = 0; y < roi.height; y++)
      cropped.set(
        rgba.subarray(
          ((y + roi.y) * width + roi.x) * 4,
          ((y + roi.y) * width + roi.x + roi.width) * 4
        ),
        y * roi.width * 4
      )
    const gray = toGray(cropped)
    let detection: Detection,
      model: EyeModel | null = null,
      gaze: Gaze | null = null
    if (timestamp - this.seenAt > pupilMemoryMs) {
      this.previous = null
      this.pending = null
    }
    if (settings.format === "spatial") {
      detection = detectSpatialPupil(
        this.cv,
        gray,
        roi.width,
        roi.height,
        settings.threshold,
        {
          thresholdMode: settings.thresholdMode,
          previous: this.previous,
          previousSelected: this.previousSelected,
          includePreviewMasks,
          evaluateAllThresholds,
        }
      )
      this.previousSelected =
        detection.selected >= 0 ? detection.selected : undefined
      this.associate(detection, timestamp, roi.width, roi.height)
      const e = detection.ellipse
      model = this.model.getLatest()
      if (e && !settings.locked)
        model = this.model.observe(
          { ...e, center: [e.center[0] + roi.x, e.center[1] + roi.y] },
          width,
          height,
          roi.width,
          roi.height
        )
      const k = cameraIntrinsics(width, height, settings.fov)
      if (e && detection.tracking === "tracking" && model?.ready && k) {
        const sphere = sphereFromProjection(
          model.center,
          model.radius,
          settings.radiusMm,
          k
        )
        if (sphere)
          gaze = gazeFromPupil(
            [e.center[0] + roi.x, e.center[1] + roi.y],
            sphere,
            k
          )
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
      detection = detectSpatialPupil(
        this.cv,
        gray,
        roi.width,
        roi.height,
        settings.threshold,
        {
          thresholdMode: "manual",
          expectedCenter: [center[0] - roi.x, center[1] - roi.y],
          previous: this.previous,
          previousSelected: this.previousSelected,
          includePreviewMasks,
          evaluateAllThresholds,
        }
      )
      this.previousSelected =
        detection.selected >= 0 ? detection.selected : undefined
      this.associate(detection, timestamp, roi.width, roi.height)
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
  /** Never replace a missing measurement with an old gaze. Confirm abrupt relocations. */
  private associate(
    detection: Detection,
    timestamp: number,
    width: number,
    height: number
  ) {
    const candidate = detection.ellipse
    if (!candidate) {
      this.pending = null
      detection.tracking = this.previous ? "reacquiring" : "lost"
      if (this.previous && detection.reason === "Pupil not found")
        detection.reason = "Reacquiring pupil"
      return
    }
    const continuous =
      this.previous &&
      isContinuousPupil(candidate, this.previous, width, height)
    const confirmed =
      this.pending &&
      timestamp - this.pending.time <= 150 &&
      isContinuousPupil(candidate, this.pending.ellipse, width, height)
    const accepted = continuous
      ? candidate.confidence >= 0.72
      : candidate.confidence >= 0.82 && (!this.previous || confirmed)
    if (!accepted) {
      this.pending = { ellipse: candidate, time: timestamp }
      detection.candidate = candidate
      detection.ellipse = null
      detection.tracking = "reacquiring"
      detection.reason =
        candidate.confidence < 0.82
          ? "Weak outline · adjust cutoff or reduce glare"
          : "Confirming pupil movement"
      return
    }
    this.previous = candidate
    this.seenAt = timestamp
    this.pending = null
    detection.tracking = "tracking"
    detection.reason = "Pupil found"
  }
}
