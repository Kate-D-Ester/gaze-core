import type { NativeEyeImage, NativeGazeInput } from "./native-gaze-model.types"

export const NATIVE_EYE_SIZE = 60
export const NATIVE_EYE_PIXELS = NATIVE_EYE_SIZE * NATIVE_EYE_SIZE
export const NATIVE_EYE_VALUES = NATIVE_EYE_PIXELS * 3

/** The caller supplies an already resized crop matching the original model's preprocessing. */
export function nativeEyeTensor(image: NativeEyeImage): Float32Array {
  if (
    image.width !== NATIVE_EYE_SIZE ||
    image.height !== NATIVE_EYE_SIZE ||
    image.data.length !== NATIVE_EYE_PIXELS * 4
  ) {
    throw new Error("The 3D gaze prototype requires a 60 by 60 RGBA eye crop")
  }
  const tensor = new Float32Array(NATIVE_EYE_VALUES)
  for (let pixel = 0; pixel < NATIVE_EYE_PIXELS; pixel++) {
    tensor[pixel] = image.data[pixel * 4 + 2]
    tensor[NATIVE_EYE_PIXELS + pixel] = image.data[pixel * 4 + 1]
    tensor[NATIVE_EYE_PIXELS * 2 + pixel] = image.data[pixel * 4]
  }
  return tensor
}

export function validateNativeGazeInput(input: NativeGazeInput): boolean {
  for (const eye of [input.leftEye, input.rightEye]) {
    if (
      !(eye instanceof Float32Array) ||
      eye.length !== NATIVE_EYE_VALUES ||
      !eye.every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 255
      )
    ) {
      return false
    }
  }
  return (
    Array.isArray(input.headAnglesDegrees) &&
    input.headAnglesDegrees.length === 3 &&
    input.headAnglesDegrees.every(Number.isFinite)
  )
}
