export type CameraTransform = {
  rotation: number
  mirrorX: boolean
  mirrorY: boolean
}

export type FrameDimensions = { width: number; height: number }

export type CameraTransformRole =
  "eye" | "scene" | "viewer-eye" | "viewer-scene" | "viewer-auxiliary"
