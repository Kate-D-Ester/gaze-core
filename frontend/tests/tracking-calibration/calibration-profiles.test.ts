import { expect, test } from "bun:test"
import {
  checkCalibrationCompatibility,
  readCalibrationProfiles,
  saveCalibrationProfile,
} from "../../apps/web/src/features/tracking-calibration/calibration-profiles"
import type {
  CalibrationContext,
  CalibrationProfile,
} from "../../apps/web/src/features/tracking-calibration/calibration-profiles.types"
const context: CalibrationContext = {
  version: 1,
  tracker: "screen",
  featureVersion: "near-eye-v1",
  cameraIdentity: "a".repeat(64),
  width: 640,
  height: 480,
  inputTransform: "0:false:false",
  outputSpace: "screen",
  screenAspect: 16 / 9,
  setupKey: "classic:1",
  geometryId: null,
}
const profile: CalibrationProfile = {
  id: "one",
  name: "Kate",
  context,
  updatedAt: "2026-10-08T00:00:00.000Z",
  offset: [0, 0],
  payload: {
    kind: "screen",
    model: {
      coefficients: [
        [0, 1, 0],
        [0, 0, 1],
      ],
      validationError: 0.01,
    },
  },
}
function storage() {
  let value: string | null = null
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next
    },
  }
}
test("bounded profiles round trip and replace by ID with the same name", () => {
  const store = storage()
  saveCalibrationProfile(profile, store)
  saveCalibrationProfile({ ...profile, offset: [0.1, -0.1] }, store)
  const result = readCalibrationProfiles(store)
  expect(result.profiles).toHaveLength(1)
  expect(result.profiles[0]?.offset).toEqual([0.1, -0.1])
  expect(() =>
    saveCalibrationProfile({ ...profile, id: "other" }, store)
  ).toThrow("already exists")
})
test("corrupt, nonfinite, unsupported and oversized data cannot load", () => {
  expect(readCalibrationProfiles({ getItem: () => "{" }).profiles).toHaveLength(
    0
  )
  expect(
    readCalibrationProfiles({ getItem: () => "x".repeat(2_000_001) }).profiles
  ).toHaveLength(0)
  const store = storage()
  expect(() =>
    saveCalibrationProfile({ ...profile, offset: [NaN, 0] }, store)
  ).toThrow()
  expect(() =>
    saveCalibrationProfile(
      { ...profile, context: { ...context, version: 2 } } as never,
      store
    )
  ).toThrow()
  expect(() =>
    saveCalibrationProfile(
      {
        ...profile,
        payload: {
          ...profile.payload,
          model: { coefficients: [[1], [2]], validationError: 0 },
        },
      } as never,
      store
    )
  ).toThrow()
})
test("incompatible cameras, features, dimensions, orientation and spaces require recalibration", () => {
  expect(checkCalibrationCompatibility(context, context).compatible).toBe(true)
  for (const change of [
    { cameraIdentity: "b".repeat(64) },
    { featureVersion: "v2" },
    { width: 320 },
    { inputTransform: "90:false:false" },
    { outputSpace: "scene-image" },
    { setupKey: "other" },
  ]) {
    expect(
      checkCalibrationCompatibility(context, {
        ...context,
        ...change,
      } as CalibrationContext).compatible
    ).toBe(false)
  }
  expect(
    checkCalibrationCompatibility(
      { ...context, cameraIdentity: "" },
      { ...context, cameraIdentity: "" }
    ).compatible
  ).toBe(false)
})
test("storage failures leave the existing profile intact", () => {
  const store = storage()
  saveCalibrationProfile(profile, store)
  const before = store.getItem()
  expect(() =>
    saveCalibrationProfile(profile, {
      ...store,
      setItem: () => {
        throw new Error("Quota")
      },
    })
  ).toThrow()
  expect(store.getItem()).toBe(before)
})
