import type {
  Point,
  Vector3,
} from "../../apps/web/src/features/eye-tracking/eye-tracking.types"
import type {
  CameraGazeMeasurement,
  NearEyeGazeMeasurement,
  NearEyeRig,
} from "../../research/gaze-3d/browser/gaze-adapters.types"
import type {
  Matrix3,
  MetricScreen,
  RigidTransform,
} from "../../research/gaze-3d/browser/gaze-geometry.types"

export type VirtualFixation = {
  target: Point
  screen: MetricScreen
  camera: CameraGazeMeasurement
  nearEye: NearEyeGazeMeasurement
  rig: NearEyeRig
  headRotation: Matrix3
  eyeOriginInHead: Vector3
  headDirection: Vector3
  headPosition: Vector3
  time: number
}

export type VirtualPose = { rotation: Matrix3; position: Vector3 }
export type VirtualCase = {
  name: string
  assumption: string
  project: (
    fixation: VirtualFixation
  ) => ReturnType<
    typeof import("../../research/gaze-3d/browser/gaze-adapters").projectRemoteGaze
  >
}

export type VirtualMetrics = {
  name: string
  assumption: string
  attempted: number
  available: number
  unavailable: number
  outside: number
  meanPixels: number | null
  rmsPixels: number | null
  p95Pixels: number | null
  maxPixels: number | null
}

export type VirtualReport = {
  evidence: "synthetic-geometry-only"
  accuracyMeasuredOnCamera: false
  fpsMeasuredOnPhone: false
  targetsPerScreen: number
  posesPerTarget: number
  screens: number
  rows: VirtualMetrics[]
}

export type VirtualTransform = RigidTransform
