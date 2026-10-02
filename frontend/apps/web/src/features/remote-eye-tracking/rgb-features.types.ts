import type { HeadPose, Point, Rect } from "./remote-eye-tracking.types"

export type RgbFaceResult = {
  faceLandmarks: { x: number; y: number; z: number }[][]
  facialTransformationMatrixes: {
    rows: number
    columns: number
    data: number[]
  }[]
  faceBlendshapes: { categories: { categoryName: string; score: number }[] }[]
}

export type RgbFaceGeometry = {
  valid: true
  landmarks: Point[]
  normalizedLandmarks: Point[]
  eyes: { center: Point; radius: number }[]
  irisOffsets: [number, number, number, number]
  faceBox: Rect
  pose: HeadPose & { kind: "face"; yaw: number; pitch: number; roll: number }
  rotation: number[][]
  legacyModelRotation: number[][]
  legacyModelScale: number
  quality: number
}

export type RgbFaceInspection =
  RgbFaceGeometry | { valid: false; reason: string }

export type RgbPixels = {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type RgbFaceInspectionOptions = {
  requireIris?: boolean
  allowPartialEyes?: boolean
}

export type RgbPhysicalModel = { faceWidthCm: number; depth: number }

export type RgbPhysicalPose = {
  headVector: [number, number, number]
  faceOrigin: [number, number, number]
  faceWidthCm: number
}
