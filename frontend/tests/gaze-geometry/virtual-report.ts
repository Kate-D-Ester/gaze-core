import {
  projectNearEyeGaze,
  projectRemoteGaze,
} from "../../research/gaze-3d/browser/gaze-adapters"
import type {
  Matrix3,
  RigidTransform,
} from "../../research/gaze-3d/browser/gaze-geometry.types"
import type { Vector3 } from "../../apps/web/src/features/eye-tracking/eye-tracking.types"
import {
  createVirtualFixations,
  virtualMultiply,
  virtualPose,
  virtualRotation,
} from "./virtual-rig"
import type {
  VirtualCase,
  VirtualFixation,
  VirtualMetrics,
  VirtualReport,
} from "./virtual-rig.types"

function matrixProduct(left: Matrix3, right: Matrix3): Matrix3 {
  return left.map((row) =>
    [0, 1, 2].map(
      (column) =>
        row[0] * right[0][column] +
        row[1] * right[1][column] +
        row[2] * right[2][column]
    )
  ) as Matrix3
}

function cameraWithDirection(fixation: VirtualFixation, direction: Vector3) {
  return projectRemoteGaze(
    { ...fixation.camera, ray: { ...fixation.camera.ray, direction } },
    fixation.screen
  )
}

function cameraWithOriginError(fixation: VirtualFixation, error: Vector3) {
  const originMetres = fixation.camera.ray.originMetres.map(
    (value, axis) => value + error[axis]
  ) as Vector3
  return projectRemoteGaze(
    { ...fixation.camera, ray: { ...fixation.camera.ray, originMetres } },
    fixation.screen
  )
}

function nearEyeWithPose(
  fixation: VirtualFixation,
  cameraFromHead: RigidTransform
) {
  return projectNearEyeGaze(
    fixation.nearEye,
    { ...fixation.rig, cameraFromHead },
    fixation.screen
  )
}

function scenarios(): VirtualCase[] {
  const oneDegree = Math.PI / 180
  return [
    {
      name: "Ideal remote geometry",
      assumption: "Exact camera-frame gaze and eye origin; no estimator tested",
      project: (fixation) =>
        projectRemoteGaze(fixation.camera, fixation.screen),
    },
    {
      name: "Ideal near-eye geometry",
      assumption:
        "Exact eye-local gaze and synchronized measured mounting/head pose",
      project: (fixation) =>
        projectNearEyeGaze(fixation.nearEye, fixation.rig, fixation.screen),
    },
    {
      name: "Gaze direction error: 1 degree",
      assumption: "Constant one-degree camera-axis yaw error",
      project: (fixation) =>
        cameraWithDirection(
          fixation,
          virtualMultiply(
            virtualRotation(0, oneDegree, 0),
            fixation.camera.ray.direction
          )
        ),
    },
    {
      name: "Origin depth error: 2 cm",
      assumption: "Eye-origin Z overestimated by 0.02 metres",
      project: (fixation) => cameraWithOriginError(fixation, [0, 0, 0.02]),
    },
    {
      name: "Origin lateral error: 5 mm",
      assumption: "Eye-origin X overestimated by 0.005 metres",
      project: (fixation) => cameraWithOriginError(fixation, [0.005, 0, 0]),
    },
    {
      name: "Fixed origin at 60 cm",
      assumption: "Live direction retained but origin frozen at [0,0,0.6]",
      project: (fixation) =>
        projectRemoteGaze(
          {
            ...fixation.camera,
            ray: { ...fixation.camera.ray, originMetres: [0, 0, 0.6] },
          },
          fixation.screen
        ),
    },
    {
      name: "Head rotation applied twice",
      assumption:
        "Incorrectly rotate an already camera-frame gaze direction by head pose",
      project: (fixation) =>
        cameraWithDirection(
          fixation,
          virtualMultiply(fixation.headRotation, fixation.camera.ray.direction)
        ),
    },
    {
      name: "Near-eye head yaw error: 1 degree",
      assumption:
        "Head orientation has constant one-degree camera-axis yaw error",
      project: (fixation) =>
        nearEyeWithPose(fixation, {
          ...fixation.rig.cameraFromHead,
          rotation: matrixProduct(
            virtualRotation(0, oneDegree, 0),
            fixation.headRotation
          ),
        }),
    },
    {
      name: "Near-eye pose delayed: 33 ms",
      assumption:
        "Head pose is 33 ms older than eye exposure during the generated motion",
      project: (fixation) => {
        const baseDepth =
          fixation.headPosition[2] - 0.035 * Math.sin(fixation.time * 0.6)
        const older = virtualPose(fixation.time - 0.033, baseDepth)
        return projectNearEyeGaze(
          fixation.nearEye,
          {
            ...fixation.rig,
            cameraFromHead: {
              rotation: older.rotation,
              translationMetres: older.position,
            },
            headTimestamp: fixation.nearEye.timestamp - 33,
          },
          fixation.screen
        )
      },
    },
    {
      name: "Screen registration error: 5 mm",
      assumption: "Screen center displaced by 0.005 metres along camera X",
      project: (fixation) =>
        projectRemoteGaze(fixation.camera, {
          ...fixation.screen,
          centerMetres: [
            fixation.screen.centerMetres[0] + 0.005,
            fixation.screen.centerMetres[1],
            fixation.screen.centerMetres[2],
          ],
        }),
    },
    {
      name: "Near-eye mounting error: 2 mm",
      assumption:
        "Assumed eye-camera mount displaced by 0.002 metres in head X",
      project: (fixation) => {
        const mount = fixation.rig.headFromEyeCamera
        return projectNearEyeGaze(
          fixation.nearEye,
          {
            ...fixation.rig,
            headFromEyeCamera: {
              ...mount,
              translationMetres: [
                mount.translationMetres[0] + 0.002,
                mount.translationMetres[1],
                mount.translationMetres[2],
              ],
            },
          },
          fixation.screen
        )
      },
    },
    {
      name: "Near-eye pose missing timing: 100 ms",
      assumption: "100 ms exposure skew exceeds the declared 50 ms maximum",
      project: (fixation) =>
        projectNearEyeGaze(
          fixation.nearEye,
          { ...fixation.rig, headTimestamp: fixation.nearEye.timestamp - 100 },
          fixation.screen
        ),
    },
  ]
}

function measureScenario(
  scenario: VirtualCase,
  fixations: VirtualFixation[]
): VirtualMetrics {
  const errors: number[] = []
  let outside = 0
  for (const fixation of fixations) {
    const result = scenario.project(fixation)
    if (result.kind !== "projected") {
      continue
    }
    errors.push(
      Math.hypot(
        result.pixels[0] - fixation.target[0] * fixation.screen.pixelWidth,
        result.pixels[1] - fixation.target[1] * fixation.screen.pixelHeight
      )
    )
    if (result.outside) {
      outside++
    }
  }
  errors.sort((first, second) => first - second)
  const metrics: VirtualMetrics = {
    name: scenario.name,
    assumption: scenario.assumption,
    attempted: fixations.length,
    available: errors.length,
    unavailable: fixations.length - errors.length,
    outside,
    meanPixels: null,
    rmsPixels: null,
    p95Pixels: null,
    maxPixels: null,
  }
  if (errors.length) {
    metrics.meanPixels =
      errors.reduce((total, error) => total + error, 0) / errors.length
    metrics.rmsPixels = Math.sqrt(
      errors.reduce((total, error) => total + error * error, 0) / errors.length
    )
    metrics.p95Pixels = errors[Math.ceil(errors.length * 0.95) - 1]
    metrics.maxPixels = errors[errors.length - 1]
  }
  return metrics
}

export function runVirtualGazeReport(): VirtualReport {
  const fixations = createVirtualFixations()
  return {
    evidence: "synthetic-geometry-only",
    accuracyMeasuredOnCamera: false,
    fpsMeasuredOnPhone: false,
    targetsPerScreen: 25,
    posesPerTarget: 96,
    screens: 2,
    rows: scenarios().map((scenario) => measureScenario(scenario, fixations)),
  }
}

if (import.meta.main) {
  console.log(JSON.stringify(runVirtualGazeReport(), null, 2))
}
