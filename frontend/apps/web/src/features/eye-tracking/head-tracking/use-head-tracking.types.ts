import type { MutableRefObject } from "react"
import type { HeadPose } from "./head-pose.types"
import type { HeadCameraState } from "./head-camera.types"
import type { HeadCameraTransform } from "./head-camera-transform.types"

export type HeadTrackingController = HeadCameraState & {
  enabled: boolean
  latest: MutableRefObject<HeadPose | null>
  history: MutableRefObject<HeadPose[]>
  start: (deviceId: string) => Promise<void>
  stop: () => void
  transform: HeadCameraTransform
  setTransform: (value: HeadCameraTransform) => void
}
