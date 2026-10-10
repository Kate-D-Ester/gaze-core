import { normalize } from "../../../apps/web/src/features/eye-tracking/geometry"
import type { Vector3 } from "../../../apps/web/src/features/eye-tracking/eye-tracking.types"
import {
  crossProduct,
  isFiniteVector3,
  isRigidTransform,
  projectGazeToScreen,
  transformGazeRay,
} from "./gaze-geometry"
import type { MetricScreen } from "./gaze-geometry.types"
import type {
  CameraGazeMeasurement,
  EyeCenteredDirection,
  GazeAdapterResult,
  NearEyeGazeMeasurement,
  NearEyeRig,
} from "./gaze-adapters.types"

/** A camera-frame estimator already accounts for head orientation. No head rotation belongs here. */
export function projectRemoteGaze(
  measurement: CameraGazeMeasurement,
  screen: MetricScreen
): GazeAdapterResult {
  if (
    measurement.frame !== "opencv-camera" ||
    measurement.units !== "metres" ||
    !Number.isFinite(measurement.timestamp) ||
    measurement.timestamp < 0
  ) {
    return { kind: "unavailable", reason: "invalid-measurement" }
  }
  return projectGazeToScreen(measurement.ray, screen)
}

/** A head-mounted eye camera needs both measured mounting and current head pose. */
export function projectNearEyeGaze(
  measurement: NearEyeGazeMeasurement,
  rig: NearEyeRig | null,
  screen: MetricScreen
): GazeAdapterResult {
  if (
    measurement.frame !== "eye-camera" ||
    measurement.units !== "metres" ||
    !Number.isFinite(measurement.timestamp) ||
    measurement.timestamp < 0
  ) {
    return { kind: "unavailable", reason: "invalid-measurement" }
  }
  if (!rig) {
    return { kind: "unavailable", reason: "missing-registration" }
  }
  if (
    !isRigidTransform(rig.headFromEyeCamera) ||
    !isRigidTransform(rig.cameraFromHead) ||
    !Number.isFinite(rig.headTimestamp) ||
    rig.headTimestamp < 0 ||
    !Number.isFinite(rig.maxTimestampSkewMs) ||
    rig.maxTimestampSkewMs < 0
  ) {
    return { kind: "unavailable", reason: "invalid-registration" }
  }
  if (
    Math.abs(measurement.timestamp - rig.headTimestamp) > rig.maxTimestampSkewMs
  ) {
    return { kind: "unavailable", reason: "unsynchronized-pose" }
  }
  const headRay = transformGazeRay(measurement.ray, rig.headFromEyeCamera)
  const cameraRay = headRay && transformGazeRay(headRay, rig.cameraFromHead)
  if (!cameraRay) {
    return { kind: "unavailable", reason: "invalid-measurement" }
  }
  return projectGazeToScreen(cameraRay, screen)
}

/** Convert an explicitly declared eye-centered basis; this does not infer an unknown model convention. */
export function eyeCenteredDirectionToCamera(
  measurement: EyeCenteredDirection,
  originMetres: Vector3
): Vector3 | null {
  if (
    measurement.frame !== "eye-centered-toward-camera" ||
    !isFiniteVector3(originMetres) ||
    !isFiniteVector3(measurement.direction)
  ) {
    return null
  }
  const towardCamera = normalize([
    -originMetres[0],
    -originMetres[1],
    -originMetres[2],
  ])
  if (!towardCamera) {
    return null
  }
  const right = normalize(crossProduct([0, -1, 0], towardCamera))
  if (!right) {
    return null
  }
  const up = crossProduct(towardCamera, right)
  const [x, y, z] = measurement.direction
  return normalize([
    x * right[0] + y * up[0] + z * towardCamera[0],
    x * right[1] + y * up[1] + z * towardCamera[1],
    x * right[2] + y * up[2] + z * towardCamera[2],
  ])
}
