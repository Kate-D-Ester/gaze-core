import type { TrackerController } from "../eye-tracking/use-tracker.types"
import type { MutableRefObject } from "react"
import type { GazeBubbleOverlaySnapshot } from "../gaze-bubble/gaze-bubble-overlay.types"

import type { SceneCamera } from "./scene-camera"

import type { SceneSessionSnapshot } from "./scene-session"

import type { HandObservation } from "./scene.types"

export type RecordingControlsProps = {
  camera: SceneCamera
  tracker: TrackerController
  state: SceneSessionSnapshot
  hand: HandObservation | null
  identity: string
  onRecordingChange?: (recording: boolean) => void
  preview: RecordingPreviewSurfaces
}

export type RecordingPreviewSurfaces = {
  scene: MutableRefObject<HTMLCanvasElement | null>
  gaze: MutableRefObject<GazeBubbleOverlaySnapshot | null>
}

export type RecordingOverlayFrame = Pick<
  RecordingControlsProps,
  "camera" | "tracker" | "state" | "preview"
>
