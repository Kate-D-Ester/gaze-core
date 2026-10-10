import type {
  Point,
  Vector3,
} from "../../apps/web/src/features/eye-tracking/eye-tracking.types"
import type {
  Matrix3,
  MetricScreen,
} from "../../research/gaze-3d/browser/gaze-geometry.types"
import type { VirtualFixation, VirtualPose } from "./virtual-rig.types"

// Independent forward world, deliberately not using production rotation/projection helpers.
export function virtualRotation(
  pitch: number,
  yaw: number,
  roll: number
): Matrix3 {
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const cr = Math.cos(roll)
  const sr = Math.sin(roll)
  return [
    [cr * cy, cr * sy * sp - sr * cp, cr * sy * cp + sr * sp],
    [sr * cy, sr * sy * sp + cr * cp, sr * sy * cp - cr * sp],
    [-sy, cy * sp, cy * cp],
  ]
}

export function virtualMultiply(matrix: Matrix3, point: Vector3): Vector3 {
  return matrix.map(
    (row) => row[0] * point[0] + row[1] * point[1] + row[2] * point[2]
  ) as Vector3
}

export function virtualTransposeMultiply(
  matrix: Matrix3,
  point: Vector3
): Vector3 {
  return [0, 1, 2].map(
    (column) =>
      matrix[0][column] * point[0] +
      matrix[1][column] * point[1] +
      matrix[2][column] * point[2]
  ) as Vector3
}

export function virtualPose(time: number, depth: number): VirtualPose {
  return {
    rotation: virtualRotation(
      0.24 * Math.sin(time * 1.1),
      0.38 * Math.sin(time * 1.7),
      0.18 * Math.sin(time * 0.9)
    ),
    position: [
      0.08 * Math.sin(time * 0.8),
      0.06 * Math.cos(time * 1.3),
      depth + 0.035 * Math.sin(time * 0.6),
    ],
  }
}

export function virtualScreens(): MetricScreen[] {
  const rotation = virtualRotation(0.11, -0.16, 0.07)
  const base: MetricScreen = {
    centerMetres: [0, 0.04, 0],
    right: [1, 0, 0],
    down: [0, 1, 0],
    widthMetres: 0.34,
    heightMetres: 0.19125,
    pixelWidth: 1512,
    pixelHeight: 850,
  }
  return [
    base,
    {
      ...base,
      centerMetres: [0.025, 0.07, 0.015],
      right: [rotation[0][0], rotation[1][0], rotation[2][0]],
      down: [rotation[0][1], rotation[1][1], rotation[2][1]],
    },
  ]
}

export function createVirtualFixations(): VirtualFixation[] {
  const fixations: VirtualFixation[] = []
  const mounting = virtualRotation(0.2, -0.5, 1.4)
  const mountPosition: Vector3 = [0.04, 0.02, -0.05]
  const eyeOriginInHead: Vector3 = [0.0315, 0, -0.025]
  const eyeOriginInCamera = virtualTransposeMultiply(
    mounting,
    eyeOriginInHead.map((value, axis) => value - mountPosition[axis]) as Vector3
  )
  for (const screen of virtualScreens()) {
    for (const u of [0.02, 0.26, 0.5, 0.74, 0.98]) {
      for (const v of [0.02, 0.26, 0.5, 0.74, 0.98]) {
        const target: Point = [u, v]
        const targetPosition = screen.centerMetres.map(
          (value, axis) =>
            value +
            (u - 0.5) * screen.widthMetres * screen.right[axis] +
            (v - 0.5) * screen.heightMetres * screen.down[axis]
        ) as Vector3
        for (const depth of [0.35, 0.6, 0.9]) {
          for (let frame = 0; frame < 32; frame++) {
            const time = frame / 8
            const head = virtualPose(time, depth)
            const offset = virtualMultiply(head.rotation, eyeOriginInHead)
            const origin = head.position.map(
              (value, axis) => value + offset[axis]
            ) as Vector3
            const raw = targetPosition.map(
              (value, axis) => value - origin[axis]
            ) as Vector3
            const length = Math.hypot(...raw)
            const direction = raw.map((value) => value / length) as Vector3
            const headDirection = virtualTransposeMultiply(
              head.rotation,
              direction
            )
            const localDirection = virtualTransposeMultiply(
              mounting,
              headDirection
            )
            const timestamp = 1000 + time * 1000
            fixations.push({
              target,
              screen,
              time,
              camera: {
                frame: "opencv-camera",
                units: "metres",
                timestamp,
                ray: { originMetres: origin, direction },
              },
              nearEye: {
                frame: "eye-camera",
                units: "metres",
                timestamp,
                ray: {
                  originMetres: eyeOriginInCamera,
                  direction: localDirection,
                },
              },
              rig: {
                headFromEyeCamera: {
                  rotation: mounting,
                  translationMetres: mountPosition,
                },
                cameraFromHead: {
                  rotation: head.rotation,
                  translationMetres: head.position,
                },
                headTimestamp: timestamp,
                maxTimestampSkewMs: 50,
              },
              headRotation: head.rotation,
              eyeOriginInHead,
              headDirection,
              headPosition: head.position,
            })
          }
        }
      }
    }
  }
  return fixations
}
