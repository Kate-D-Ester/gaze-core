import type { Vector3 } from "../../../apps/web/src/features/eye-tracking/eye-tracking.types"
import type {
  MetricGazeRay,
  RigidTransform,
  ScreenProjection,
} from "./gaze-geometry.types"

export type CameraGazeMeasurement = {
  frame: "opencv-camera"
  units: "metres"
  timestamp: number
  ray: MetricGazeRay
}

export type NearEyeGazeMeasurement = {
  frame: "eye-camera"
  units: "metres"
  timestamp: number
  ray: MetricGazeRay
}

export type NearEyeRig = {
  headFromEyeCamera: RigidTransform
  cameraFromHead: RigidTransform
  headTimestamp: number
  maxTimestampSkewMs: number
}

export type GazeAdapterResult =
  | ScreenProjection
  | {
      kind: "unavailable"
      reason:
        | "invalid-measurement"
        | "missing-registration"
        | "invalid-registration"
        | "unsynchronized-pose"
    }

/** X right, Y up, Z from the eyes toward the camera; explicitly confirmed by the estimator adapter. */
export type EyeCenteredDirection = {
  frame: "eye-centered-toward-camera"
  direction: Vector3
}
