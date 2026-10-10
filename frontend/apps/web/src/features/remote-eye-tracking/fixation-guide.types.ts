import type { Point } from "./remote-eye-tracking.types"
export type RemoteFixationSignal = {
  kind: "camera-ocular" | "network" | "reference"
  point: Point
  orientation: Point
  jitterLimit: number
  minimumMovement: number
}
