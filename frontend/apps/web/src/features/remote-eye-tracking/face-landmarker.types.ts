import type { FaceLandmarker } from "@mediapipe/tasks-vision-remote"

export type FaceLandmarkerOptions = { outputFaceBlendshapes?: boolean }

export type FaceLandmarkerRuntime = {
  landmarker: FaceLandmarker
  canvas: OffscreenCanvas
  delegate: "GPU" | "CPU"
}

export type ImportedVisionModule = {
  default: unknown
}

export type VisionModuleFactory = {
  ModuleFactory?: unknown
  Module?: unknown
}
