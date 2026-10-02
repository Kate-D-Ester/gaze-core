import { HEAD_RAY_PARAMETER_COUNT } from "./head-ray-fit"
import { collectHeadMeasurements } from "./head-calibration-data"
import { fitValidatedHeadModel } from "./head-model-validation"
import { projectHeadGaze } from "./head-gaze-model"
import type { CalibrationSample, GazeOrientation } from "../calibration.types"
import type {
  HeadCompensation,
  HeadCompensationFitResult,
} from "./head-calibration.types"
import type { Point } from "../eye-tracking.types"
import type { HeadPose } from "./head-pose.types"
import type {
  HeadRayMeasurement,
  HeadPoseEnvelope,
} from "./head-ray-model.types"
import { relativeHeadPose } from "./head-pose"
import { fitAffineMapping } from "../calibration-mapping"
import { DEFAULT_GAZE_ORIENTATION } from "../calibration-orientation"
const MINIMUM_POSE_SPAN = [0.08, 0.08, 0.12, 0.18, 0.18, 0.18]
const MOVEMENT_NAMES = [
  "sideways",
  "up/down",
  "near/far",
  "nodding",
  "turning",
  "tilting",
]

function poseEnvelope(
  readings: HeadRayMeasurement[],
  reference: HeadPose
): HeadPoseEnvelope | null {
  const minimum = Array<number>(6).fill(Infinity)
  const maximum = Array<number>(6).fill(-Infinity)
  for (const reading of readings) {
    const relative = relativeHeadPose(reading.pose, reference)
    if (!relative) return null
    for (let axis = 0; axis < 6; axis++) {
      minimum[axis] = Math.min(minimum[axis], relative[axis])
      maximum[axis] = Math.max(maximum[axis], relative[axis])
    }
  }
  return { minimum, maximum }
}

export function headPoseInRange(
  model: HeadCompensation,
  pose: HeadPose
): boolean {
  const relative = relativeHeadPose(pose, model.reference)
  if (!relative) return false
  return relative.every(
    (value, axis) =>
      value >= model.envelope.minimum[axis] &&
      value <= model.envelope.maximum[axis]
  )
}

export function mapHeadCompensatedGaze(
  model: HeadCompensation,
  eye: Point,
  pose: HeadPose
): Point | null {
  if (!headPoseInRange(model, pose)) return null
  return projectHeadGaze(model, eye, pose, model.reference)
}

export function fitHeadCompensationWithDiagnostics(
  samples: CalibrationSample[],
  orientation: GazeOrientation = DEFAULT_GAZE_ORIENTATION,
  validate = true,
  aspect = 1.6
): HeadCompensationFitResult {
  const reference = samples[0]?.headPose
  const invalidSamples: HeadCompensationFitResult = {
    model: null,
    issue: {
      code: "head-samples",
      message:
        "Head readings were missing or invalid. Reconnect the front camera before retrying the head pass.",
    },
  }
  if (!reference || !Number.isFinite(aspect) || aspect <= 0)
    return invalidSamples
  const readings = collectHeadMeasurements(samples)
  if (!readings) return invalidSamples
  const envelope = poseEnvelope(readings, reference)
  if (!envelope) return invalidSamples
  const missingAxes = MINIMUM_POSE_SPAN.flatMap((span, axis) => {
    if (envelope.maximum[axis] - envelope.minimum[axis] < span) return [axis]
    return []
  })
  if (missingAxes.length > 0) {
    return {
      model: null,
      issue: {
        code: "head-movement",
        axes: missingAxes,
        message: `Not enough ${missingAxes.map((axis) => MOVEMENT_NAMES[axis]).join(", ")} movement. Retry just the head pass.`,
      },
    }
  }
  if (readings.length < HEAD_RAY_PARAMETER_COUNT + 3) return invalidSamples
  for (let axis = 0; axis < 6; axis++) {
    const margin = (envelope.maximum[axis] - envelope.minimum[axis]) * 0.15
    envelope.minimum[axis] -= margin
    envelope.maximum[axis] += margin
  }
  const coefficients = fitAffineMapping(samples.slice(0, 9))
  if (!coefficients) return invalidSamples
  const geometric = fitValidatedHeadModel(
    samples,
    reference,
    aspect,
    "calibrated-ray-plane",
    validate
  )
  const regression = fitValidatedHeadModel(
    samples,
    reference,
    aspect,
    "calibrated-pose-regression",
    validate
  )
  let fitted = geometric
  if (
    regression.model &&
    (!geometric.model || regression.validationError < geometric.validationError)
  )
    fitted = regression
  if (!fitted.model) return { model: null, issue: fitted.issue }
  return {
    model: {
      ...fitted.model,
      reference,
      orientation,
      coefficients,
      validationError: fitted.validationError,
      maximumValidationError: fitted.maximumValidationError,
      envelope,
    },
    issue: null,
  }
}

export function fitHeadCompensation(
  samples: CalibrationSample[],
  orientation: GazeOrientation = DEFAULT_GAZE_ORIENTATION,
  validate = true,
  aspect = 1.6
): HeadCompensation | null {
  return fitHeadCompensationWithDiagnostics(
    samples,
    orientation,
    validate,
    aspect
  ).model
}
