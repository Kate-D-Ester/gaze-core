import type {
  CalibrationSample,
  Point,
  Vector3,
} from "../../apps/web/src/features/eye-tracking/eye-tracking.types"
import type { HeadPose } from "../../apps/web/src/features/eye-tracking/head-tracking/head-pose.types"

export const fixtureReference: HeadPose = {
  id: 1,
  timestamp: 1000,
  position: [0, 0, -50],
  rotation: [0, 0, 0],
}
export const fixtureTargets: Point[] = [
  [0.5, 0.5],
  [0.1, 0.1],
  [0.9, 0.1],
  [0.9, 0.9],
  [0.1, 0.9],
  [0.5, 0.1],
  [0.9, 0.5],
  [0.5, 0.9],
  [0.1, 0.5],
]

function rotationMatrix([pitch, yaw, roll]: Vector3): number[][] {
  const cp = Math.cos(pitch),
    sp = Math.sin(pitch)
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw)
  const cr = Math.cos(roll),
    sr = Math.sin(roll)
  return [
    [cr * cy, cr * sy * sp - sr * cp, cr * sy * cp + sr * sp],
    [sr * cy, sr * sy * sp + cr * cp, sr * sy * cp - cr * sp],
    [-sy, cy * sp, cy * cp],
  ]
}

/** Independent forward fixture: tilted display, offset eye, non-unit gain and a skewed eye camera. */
export function fixtureEyeFeature(target: Point, pose: HeadPose): Point {
  const screen = rotationMatrix([0.05, -0.08, 0.02])
  const head = rotationMatrix(pose.rotation)
  const displayPoint = [30 * (0.5 - target[0]), 18.75 * (0.5 - target[1]), 0]
  const eyeOffset = [2, 3, 4]
  const ray = [0, -6, 0].map(
    (value, axis) =>
      value +
      screen[axis].reduce(
        (sum, entry, index) => sum + entry * displayPoint[index],
        0
      ) -
      pose.position[axis] -
      head[axis].reduce(
        (sum, entry, index) => sum + entry * eyeOffset[index],
        0
      )
  )
  const local = [0, 1, 2].map((axis) =>
    head.reduce((sum, row, index) => sum + row[axis] * ray[index], 0)
  )
  // Inverse of [[1.5,.2,.07],[-.1,-1.3,.03],[.1,.08,1]]. Fixed cofactors avoid using the production mapper.
  const image = [
    -1.3024 * local[0] - 0.1944 * local[1] + 0.097 * local[2],
    0.103 * local[0] + 1.493 * local[1] - 0.052 * local[2],
    0.122 * local[0] - 0.1 * local[1] - 1.93 * local[2],
  ]
  return [image[0] / image[2], image[1] / image[2]]
}

export function fixtureMotionPoses(): HeadPose[] {
  const poses = [fixtureReference]
  for (let axis = 0; axis < 6; axis++) {
    for (const sign of [-1, 1]) {
      const pose: HeadPose = {
        ...fixtureReference,
        id: poses.length + 1,
        position: [...fixtureReference.position],
        rotation: [0, 0, 0],
      }
      if (axis < 3) pose.position[axis] += sign * (axis === 2 ? 5 : 3)
      else pose.rotation[axis - 3] = sign * 0.16
      poses.push(pose)
    }
  }
  return poses
}

export function fixtureCalibrationSamples(): CalibrationSample[] {
  const samples = fixtureTargets.map((target) => ({
    target,
    feature: fixtureEyeFeature(target, fixtureReference),
    headPose: fixtureReference,
  }))
  for (const pose of fixtureMotionPoses().slice(1)) {
    samples.push({
      target: [0.5, 0.5],
      feature: fixtureEyeFeature([0.5, 0.5], pose),
      headPose: pose,
    })
  }
  return samples
}
