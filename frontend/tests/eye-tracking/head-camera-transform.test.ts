import { afterEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import {
  DEFAULT_HEAD_CAMERA_TRANSFORM,
  headFrameGeometry,
  normalizeHeadCameraTransform,
  readHeadCameraTransform,
  saveHeadCameraTransform,
} from "../../apps/web/src/features/eye-tracking/head-tracking/head-camera-transform"

if (typeof document === "undefined") GlobalRegistrator.register()
const key = "gazecore.head-camera.transform.v1"
afterEach(() => localStorage.removeItem(key))

test("quarter turns rotate camera input without crop or padding", () => {
  const geometry = headFrameGeometry(640, 480, {
    rotation: 90,
    mirrorX: false,
    mirrorY: false,
  })
  expect([geometry.width, geometry.height]).toEqual([480, 640])
  const [a, b, c, d, e, f] = geometry.matrix
  // Raw top-left becomes top-right, and raw bottom-right becomes bottom-left.
  expect([e, f]).toEqual([480, 0])
  expect([a * 640 + c * 480 + e, b * 640 + d * 480 + f]).toEqual([0, 640])
})

test("input mirrors apply after rotation in the oriented camera frame", () => {
  const geometry = headFrameGeometry(640, 480, {
    rotation: 90,
    mirrorX: true,
    mirrorY: false,
  })
  const [a, b, c, d, e, f] = geometry.matrix
  expect([e, f]).toEqual([0, 0])
  expect([a * 640 + c * 480 + e, b * 640 + d * 480 + f]).toEqual([480, 640])
})

test("camera orientation persists and corrupt settings fall back safely", () => {
  const transform = { rotation: 270, mirrorX: true, mirrorY: true }
  saveHeadCameraTransform(transform)
  expect(readHeadCameraTransform()).toEqual(transform)
  localStorage.setItem(key, '{"rotation":90,"mirrorX":"false"}')
  expect(readHeadCameraTransform()).toEqual(DEFAULT_HEAD_CAMERA_TRANSFORM)
  localStorage.setItem(key, "broken")
  expect(readHeadCameraTransform()).toEqual(DEFAULT_HEAD_CAMERA_TRANSFORM)
})

test("rotations wrap to quarter turns and invalid values reset", () => {
  expect(
    normalizeHeadCameraTransform({
      rotation: -90,
      mirrorX: false,
      mirrorY: false,
    }).rotation
  ).toBe(270)
  expect(
    normalizeHeadCameraTransform({
      rotation: 450,
      mirrorX: false,
      mirrorY: false,
    }).rotation
  ).toBe(90)
  expect(
    normalizeHeadCameraTransform({
      rotation: NaN,
      mirrorX: false,
      mirrorY: false,
    }).rotation
  ).toBe(0)
})
