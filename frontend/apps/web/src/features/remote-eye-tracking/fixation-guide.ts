import type {
  CalibrationSample,
  Point,
  RemoteMode,
  RemoteObservation,
} from "./remote-eye-tracking.types"
import { ScreenCalibrationGuide } from "../tracking-calibration/screen-calibration"
import { poseVector } from "./calibration"
import type { RemoteFixationSignal } from "./fixation-guide.types"

function measuredCameraOffsets(
  observation: RemoteObservation,
  mode: RemoteMode
): number[] | null {
  const camera = observation.cameraOcularOffsets
  if (camera?.length === 4 && camera.every(Number.isFinite)) {
    return camera
  }
  const vectors = observation.vectors
  const left = vectors?.leftEye
  const right = vectors?.rightEye
  if (
    vectors?.coordinateSpace !==
      "camera-image-x-right-y-down-z-toward-camera" ||
    !left ||
    !right ||
    left.camera.length !== 2 ||
    right.camera.length !== 2 ||
    (mode === "ir" &&
      (left.source !== "ir-pupil" || right.source !== "ir-pupil"))
  ) {
    return null
  }
  const offsets = [...right.camera, ...left.camera]
  return offsets.every(Number.isFinite) ? offsets : null
}

function signal(
  observation: RemoteObservation,
  mode: RemoteMode,
  kind: RemoteFixationSignal["kind"] | null
): RemoteFixationSignal | null {
  // Prefer measured binocular displacement to the noisy, uncalibrated neural
  // estimate. Keep the baseline's source fixed when resuming older captures.
  if (kind === null || kind === "camera-ocular") {
    const camera = measuredCameraOffsets(observation, mode)
    if (camera) {
      return {
        kind: "camera-ocular",
        point: [(camera[0] + camera[2]) / 2, (camera[1] + camera[3]) / 2],
        orientation: [-1, 1],
        jitterLimit: 0.025,
        minimumMovement: 0.004,
      }
    }
    if (kind === "camera-ocular") {
      return null
    }
  }
  if (observation.basePoint?.every(Number.isFinite)) {
    const reference =
      mode === "ir" && observation.pose?.kind === "eye-reference"
    if (mode === "ir" && !reference) {
      return null
    }
    return {
      kind: reference ? "reference" : "network",
      point: observation.basePoint,
      orientation: reference ? [-1, 1] : [1, 1],
      jitterLimit: reference ? 0.025 : 0.04,
      minimumMovement: reference ? 0.004 : 0.015,
    }
  }
  // Feature arrays mix eye and face axes. Their first two values are not screen gaze.
  return null
}

/** Capture guidance only. Independent checks and intentional motion holds bypass this. */
export class RemoteFixationGuide {
  private guide: ScreenCalibrationGuide | null = null
  private signalKind: RemoteFixationSignal["kind"] | null = null
  reason = ""
  constructor(
    private readonly mode: RemoteMode,
    training: CalibrationSample[]
  ) {
    const targets = new Map<string, CalibrationSample[]>()
    for (const sample of training) {
      const key = sample.target.join(",")
      const group = targets.get(key) ?? []
      group.push(sample)
      targets.set(key, group)
    }
    for (const group of targets.values()) {
      this.record(group[0].target, group)
    }
  }
  private read(observation: RemoteObservation): RemoteFixationSignal | null {
    const value = signal(observation, this.mode, this.signalKind)
    if (!value || (this.signalKind && this.signalKind !== value.kind)) {
      return null
    }
    if (!this.guide) {
      this.signalKind = value.kind
      this.guide = new ScreenCalibrationGuide(
        value.orientation,
        value.minimumMovement
      )
    }
    return value
  }
  record(target: Point, samples: CalibrationSample[]): void {
    const points = samples.flatMap((sample) => {
      const value = this.read(sample.observation)
      return value ? [value.point] : []
    })
    this.guide?.record(target, points)
  }
  accepts(
    target: Point,
    observation: RemoteObservation,
    samples: CalibrationSample[]
  ): boolean {
    const value = this.read(observation)
    this.reason = ""
    if (!value) {
      this.reason = "Waiting for a clear eye reading"
      return false
    }
    if (!this.guide!.matches(value.point, target)) {
      this.reason = "Look toward the dot"
      return false
    }
    const recent = samples.slice(-5).flatMap((sample) => {
      const measured = this.read(sample.observation)
      return measured ? [measured.point] : []
    })
    recent.push(value.point)
    const mean: Point = [0, 0]
    for (const point of recent) {
      mean[0] += point[0] / recent.length
      mean[1] += point[1] / recent.length
    }
    const jitter = Math.sqrt(
      recent.reduce(
        (sum, point) =>
          sum + (point[0] - mean[0]) ** 2 + (point[1] - mean[1]) ** 2,
        0
      ) / recent.length
    )
    if (jitter > value.jitterLimit) {
      this.reason = "Hold your gaze steady"
      return false
    }
    const first = samples[0]?.observation.pose
    if (first && observation.pose) {
      const previous = poseVector(first)
      const current = poseVector(observation.pose)
      const limits = [0.04, 0.04, 0.04, 0.025, 0.025, 0.04]
      if (
        current.some(
          (position, axis) => Math.abs(position - previous[axis]) > limits[axis]
        )
      ) {
        this.reason = "Hold your head steady"
        return false
      }
    }
    return true
  }
}
