import { detectPupil } from "../../../../../packages/ui/src/lib/gaze-core/detection"
import { gazeVector3D } from "../../../../../packages/ui/src/lib/gaze-core/geometry"
import {
  equalize,
  toGray,
} from "../../../../../packages/ui/src/lib/gaze-core/image"
import { detectSpatialPupil } from "./detection"
import { EyeModelEstimator } from "./eye-model"
import {
  cameraIntrinsics,
  gazeFromPupil,
  sphereFromProjection,
} from "./geometry"
import type { CV } from "./opencv"
import type {
  Detection,
  EyeModel,
  FrameSettings,
  Gaze,
  TrackingFrame,
} from "./types"

export class TrackingEngine {
  private readonly model = new EyeModelEstimator()
  private configKey = ""
  constructor(privateCv: CV) {
    this.cv = privateCv
  }
  private readonly cv: CV
  reset() {
    this.model.reset()
    this.configKey = ""
  }
  process(
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
    settings: FrameSettings,
    id: number,
    timestamp: number
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
      settings.fov,
      settings.radiusMm,
      settings.corners,
    ])
    if (key !== this.configKey) {
      this.model.reset()
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
    if (settings.format === "spatial") {
      detection = detectSpatialPupil(
        this.cv,
        gray,
        roi.width,
        roi.height,
        settings.threshold
      )
      const e = detection.ellipse
      model = this.model.getLatest()
      if (e && !settings.locked)
        model = this.model.observe(
          { ...e, center: [e.center[0] + roi.x, e.center[1] + roi.y] },
          width,
          height
        )
      const k = cameraIntrinsics(width, height, settings.fov)
      if (e && e.confidence >= 0.85 && model?.ready && k) {
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
      const raw = detectPupil(
        equalize(gray),
        roi.width,
        roi.height,
        [center[0] - roi.x, center[1] - roi.y],
        5,
        settings.threshold
      )
      let min = 255,
        max = 0
      for (const v of gray) {
        min = Math.min(min, v)
        max = Math.max(max, v)
      }
      const valid =
        max - min >= 18 && raw.score >= 0.35 && raw.pupilEllipse !== null
      const e = valid ? raw.pupilEllipse : null
      detection = {
        ellipse: e
          ? {
              center: e.center,
              major: e.axes[0],
              minor: e.axes[1],
              angle: e.angle,
              confidence: raw.score,
            }
          : null,
        seed: raw.pupilCenter,
        contour: [],
        refined: [],
        previews: [
          {
            label: "Threshold",
            threshold: settings.threshold,
            mask: raw.thresholdPreview,
            score: raw.score,
          },
        ],
        selected: 0,
        reason: valid ? "Pupil found" : "Pupil not found",
      }
      if (corners && radius > 4) {
        model = {
          center,
          radius,
          residual: 0,
          samples: 2,
          coverage: 1,
          ready: true,
        }
        if (e) {
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
