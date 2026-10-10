import { predictBasePointSpatial } from "./base-point-spatial"
import { RGB_BASE_MODEL_VERSION } from "./rgb-model-version"
import type {
  Point,
  RemoteCalibration,
  RemoteObservation,
} from "./remote-eye-tracking.types"

export function hasRgbBasePoint(observation: RemoteObservation): boolean {
  const pose = observation.pose
  return (
    observation.source !== "video" &&
    observation.baseModelVersion === RGB_BASE_MODEL_VERSION &&
    !!observation.basePoint &&
    observation.basePoint.length === 2 &&
    observation.basePoint.every(Number.isFinite) &&
    !!observation.feature?.length &&
    observation.feature.length <= 64 &&
    observation.feature.every(Number.isFinite) &&
    !observation.reason &&
    observation.quality >= 0.45 &&
    pose?.kind === "face" &&
    pose.scale > 0 &&
    [pose.yaw, pose.pitch, pose.roll, pose.x, pose.y, pose.scale].every(
      (value) => typeof value === "number" && Number.isFinite(value)
    )
  )
}

/** Predict valid eye readings; measured pose coverage is reported separately from availability. */
export function predictBasePointCandidate(
  model: RemoteCalibration,
  observation: RemoteObservation
): Point | null {
  const featureVersion =
    observation.featureVersion ?? `legacy-${observation.feature?.length ?? 0}`
  if (
    model.inputKind !== "base-point" ||
    model.featureVersion !== featureVersion ||
    model.baseModelVersion !== observation.baseModelVersion ||
    !hasRgbBasePoint(observation)
  ) {
    return null
  }
  return predictBasePointSpatial(model, observation.basePoint!)
}
