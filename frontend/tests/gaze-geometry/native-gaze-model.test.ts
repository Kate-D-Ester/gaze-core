import { expect, test } from "bun:test"
import {
  nativeEyeTensor,
  validateNativeGazeInput,
} from "../../research/gaze-3d/browser/native-gaze-input"

test("model eye pixels preserve raw BGR channel-first order without BlazeGaze scaling", () => {
  const data = new Uint8ClampedArray(60 * 60 * 4)
  data.set([11, 22, 33, 255], 0)
  data.set([44, 55, 66, 255], 4)
  const tensor = nativeEyeTensor({ width: 60, height: 60, data })
  expect(tensor.length).toBe(10800)
  expect([...tensor.slice(0, 2)]).toEqual([33, 66])
  expect([...tensor.slice(3600, 3602)]).toEqual([22, 55])
  expect([...tensor.slice(7200, 7202)]).toEqual([11, 44])
})

test("incorrect patch shape and invalid tensor values fail before inference", () => {
  expect(() =>
    nativeEyeTensor({
      width: 61,
      height: 60,
      data: new Uint8ClampedArray(61 * 60 * 4),
    })
  ).toThrow()
  const input = {
    leftEye: new Float32Array(10800),
    rightEye: new Float32Array(10800),
    headAnglesDegrees: [20, -10, 5] as [number, number, number],
  }
  expect(validateNativeGazeInput(input)).toBe(true)
  expect(
    validateNativeGazeInput({ ...input, leftEye: new Float32Array(3) })
  ).toBe(false)
  expect(
    validateNativeGazeInput({
      ...input,
      rightEye: new Float32Array(10800).fill(Infinity),
    })
  ).toBe(false)
  expect(
    validateNativeGazeInput({
      ...input,
      leftEye: new Float32Array(10800).fill(256),
    })
  ).toBe(false)
  expect(
    validateNativeGazeInput({ ...input, headAnglesDegrees: [NaN, 0, 0] })
  ).toBe(false)
})
