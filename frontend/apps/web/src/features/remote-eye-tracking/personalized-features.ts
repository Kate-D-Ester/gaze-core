import { normalizeHeadPlaneEyeOffsets } from "./face-perspective"
import { rotateHeadVector } from "../eye-tracking/head-tracking/head-geometry"
import {
  RGB_EMBEDDING_SIZE,
  RGB_EMBEDDING_VERSION,
  RGB_IRIS_REFINEMENT_VERSION,
} from "./rgb-model-version"
import type {
  PersonalizedInputKind,
  RemoteObservation,
} from "./remote-eye-tracking.types"

export function personalizedFeatureVersion(
  kind: PersonalizedInputKind
): string {
  if (kind === "binocular-camera") {
    return "binocular-camera-plane-v1"
  }
  if (kind === "appearance-refined") {
    return "blazegaze-dense16-pixel-iris-v1"
  }
  if (kind === "appearance") {
    return "blazegaze-dense16-headplane-v1"
  }
  return "binocular-headplane-v1"
}

export function personalizedFeatureCount(kind: PersonalizedInputKind): number {
  return isBinocularInput(kind) ? 10 : RGB_EMBEDDING_SIZE + 10
}

export function isBinocularInput(kind: PersonalizedInputKind): boolean {
  return kind === "binocular" || kind === "binocular-camera"
}

/** Keep pose separate from normalized ocular geometry; head-relative gaze alone is insufficient. */
export function personalizedFeatures(
  observation: RemoteObservation,
  kind: PersonalizedInputKind
): number[] | null {
  const pose = observation.pose
  const feature = observation.feature
  if (
    !pose ||
    pose.kind !== "face" ||
    !feature ||
    pose.yaw === null ||
    pose.pitch === null ||
    pose.roll === null ||
    pose.scale <= 0
  ) {
    return null
  }
  let offsets: number[]
  if (!isBinocularInput(kind)) {
    if (
      feature.length !== 29 ||
      observation.appearanceVersion !== RGB_EMBEDDING_VERSION ||
      observation.appearanceEmbedding?.length !== RGB_EMBEDDING_SIZE
    ) {
      return null
    }
    offsets = feature.slice(2, 6)
    if (kind === "appearance-refined") {
      const refinement = observation.irisRefinement
      if (
        refinement?.version !== RGB_IRIS_REFINEMENT_VERSION ||
        refinement.offsets.length !== 4 ||
        refinement.confidence.length !== 2 ||
        refinement.confidence.some(
          (value) => !Number.isFinite(value) || value < 0 || value > 1
        )
      ) {
        return null
      }
      offsets = refinement.offsets
    }
  } else {
    if (
      observation.baseModelVersion !== undefined ||
      ![14, 29].includes(feature.length)
    ) {
      return null
    }
    offsets = feature.slice(0, 4)
  }
  if (kind === "binocular-camera") {
    const camera = observation.cameraOcularOffsets
    if (camera?.length !== 4 || !camera.every(Number.isFinite)) {
      return null
    }
    const forward = rotateHeadVector(
      [0, 0, 1],
      [pose.pitch, pose.yaw, pose.roll]
    )
    if (forward[2] < 0.25) {
      return null
    }
    // The measured ocular displacement already rotates in image axes. Project
    // the face axis in those same axes; calibration learns its gains. This is
    // a camera-plane feature bank, not a reconstructed physical gaze ray.
    const values = [
      ...camera,
      forward[0] / forward[2],
      -forward[1] / forward[2],
      pose.roll,
      pose.x - 0.5,
      pose.y - 0.5,
      Math.log(pose.scale),
    ]
    return values.every(Number.isFinite) ? values : null
  }
  const ocular = normalizeHeadPlaneEyeOffsets(offsets, pose.yaw, pose.pitch)
  if (!ocular) {
    return null
  }
  const values = [
    ...ocular,
    pose.yaw,
    pose.pitch,
    pose.roll,
    pose.x - 0.5,
    pose.y - 0.5,
    Math.log(pose.scale),
  ]
  if (!isBinocularInput(kind)) {
    values.unshift(...observation.appearanceEmbedding!)
  }
  return values.every(Number.isFinite) ? values : null
}
