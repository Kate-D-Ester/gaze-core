import type { Vector3 } from "../../../apps/web/src/features/eye-tracking/eye-tracking.types"
import type { RgbPixels } from "../../../apps/web/src/features/remote-eye-tracking/rgb-features.types"

export type NativeEyeImage = RgbPixels
export type NativeGazeInput = {
  /** Image-left and image-right eye crops; raw BGR channel-first pixels, 0..255. */
  leftEye: Float32Array
  rightEye: Float32Array
  /** Model-specific yaw, pitch, roll in degrees; MediaPipe values are not interchangeable. */
  headAnglesDegrees: Vector3
}

export type NativeGazeResult = {
  frame: "model-native-unverified"
  vector: Vector3
  modelId: "intel-gaze-adas-0002-onnx-prototype"
  inferenceMs: number
}

export type NativeGazeModel = {
  predict: (input: NativeGazeInput) => Promise<NativeGazeResult>
  dispose: () => Promise<void>
}
