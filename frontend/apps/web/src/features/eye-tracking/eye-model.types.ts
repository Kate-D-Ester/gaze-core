export type EyeModelLockStatus = {
  ready: boolean
  blocker: "waiting" | "samples" | "coverage" | "radius" | "fit" | "ready"
  coveredDirections: number
  requiredDirections: number
  progress: number
}
