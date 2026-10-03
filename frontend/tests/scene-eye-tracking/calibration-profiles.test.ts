import { beforeEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { calibrate } from "./fixtures"
import {
  SceneSession,
  canUseSceneCalibration,
} from "../../apps/web/src/features/scene-eye-tracking/scene-session"
import {
  SCENE_PROFILE_STORAGE_KEY,
  readSceneProfiles,
  saveSceneProfile,
  deleteSceneProfile,
  selectSceneProfile,
  sceneProfileSetupIssue,
} from "../../apps/web/src/features/scene-eye-tracking/calibration-profiles"
import { DEFAULT_CAMERA_TRANSFORM } from "../../apps/web/src/features/eye-tracking/camera-transform"
import type { SceneProfileSetup } from "../../apps/web/src/features/scene-eye-tracking/calibration-profiles.types"

if (typeof localStorage === "undefined") GlobalRegistrator.register()
beforeEach(() => localStorage.clear())
const setup: SceneProfileSetup = {
  trackerFormat: "classic",
  orientation: {
    eye: DEFAULT_CAMERA_TRANSFORM,
    scene: DEFAULT_CAMERA_TRANSFORM,
  },
}
function draft() {
  const state = calibrate().s.getSnapshot()
  return {
    calibration: state.calibration!,
    method: state.method,
    offset: [0.02, -0.03] as [number, number],
    delayMs: 30,
  }
}

test("different users retain independent named mappings and offsets after reload", () => {
  const kate = saveSceneProfile("Kate", draft(), setup)
  const alex = saveSceneProfile("Alex", { ...draft(), offset: [0.1, 0] }, setup)
  expect(readSceneProfiles().profiles).toHaveLength(2)
  selectSceneProfile(kate.id)
  const reloaded = readSceneProfiles()
  expect(reloaded.selectedId).toBe(kate.id)
  expect(
    reloaded.profiles.find((profile) => profile.id === kate.id)?.offset
  ).toEqual([0.02, -0.03])
  expect(
    reloaded.profiles.find((profile) => profile.id === alex.id)?.offset
  ).toEqual([0.1, 0])
  expect(reloaded.profiles[0].calibration.holds[0].pairs).toHaveLength(1)
})

test("saving and restoring an unchecked mapping cannot promote preview readings to valid gaze", () => {
  saveSceneProfile(
    "Unchecked",
    { ...draft(), offset: [0, 0], delayMs: 0, unverified: true },
    setup
  )
  const saved = readSceneProfiles().profiles[0]
  expect(saved.unverified).toBe(true)
  const restored = new SceneSession()
  restored.restoreCalibration(saved)
  expect(canUseSceneCalibration(restored.getSnapshot())).toBe(false)
  restored.addEye({
    id: 1,
    timestamp: 1000,
    feature: [0, 0],
    confidence: 0.95,
    valid: true,
  })
  restored.measure(
    { id: 1, timestamp: 1000, width: 640, height: 480, generation: 1 },
    1000
  )
  expect(restored.getSnapshot().measurement?.position?.[0]).toBeCloseTo(0.5)
  expect(restored.getSnapshot().measurement?.preview).toBe(true)
  expect(restored.getSnapshot().measurement?.valid).toBe(false)
  expect(restored.getSnapshot().measurement?.estimated).toBe(false)
})

test("legacy profiles remain loadable and malformed verification flags are rejected", () => {
  saveSceneProfile("Existing profile", draft(), setup)
  const restored = new SceneSession()
  restored.restoreCalibration(readSceneProfiles().profiles[0])
  expect(canUseSceneCalibration(restored.getSnapshot())).toBe(true)
  const raw = JSON.parse(localStorage.getItem(SCENE_PROFILE_STORAGE_KEY)!)
  raw.profiles[0].unverified = "false"
  localStorage.setItem(SCENE_PROFILE_STORAGE_KEY, JSON.stringify(raw))
  expect(readSceneProfiles().profiles).toHaveLength(0)
})

test("updates and deletion only affect the chosen profile", () => {
  const kate = saveSceneProfile("Kate", draft(), setup)
  const alex = saveSceneProfile("Alex", draft(), setup)
  saveSceneProfile(
    "Kate · headset",
    { ...draft(), offset: [0.05, 0] },
    setup,
    kate.id
  )
  expect(readSceneProfiles().profiles).toHaveLength(2)
  expect(
    readSceneProfiles().profiles.find((profile) => profile.id === kate.id)?.name
  ).toBe("Kate · headset")
  deleteSceneProfile(kate.id)
  expect(readSceneProfiles().profiles.map((profile) => profile.id)).toEqual([
    alex.id,
  ])
  expect(readSceneProfiles().selectedId).toBeNull()
})

test("invalid names and duplicate names cannot silently replace someone else's calibration", () => {
  saveSceneProfile("Kate", draft(), setup)
  expect(() => saveSceneProfile("  ", draft(), setup)).toThrow(/name/i)
  expect(() => saveSceneProfile("kate", draft(), setup)).toThrow(/already/i)
  expect(readSceneProfiles().profiles).toHaveLength(1)
})

test("corrupt storage and unsupported versions are ignored", () => {
  localStorage.setItem(SCENE_PROFILE_STORAGE_KEY, "{broken")
  expect(readSceneProfiles().profiles).toEqual([])
  localStorage.setItem(
    SCENE_PROFILE_STORAGE_KEY,
    JSON.stringify({ version: 99, profiles: [] })
  )
  expect(readSceneProfiles().profiles).toEqual([])
  const saved = saveSceneProfile("Kate", draft(), setup)
  const library = readSceneProfiles()
  library.profiles[0].calibration.scale = [0, 1]
  localStorage.setItem(SCENE_PROFILE_STORAGE_KEY, JSON.stringify(library))
  expect(readSceneProfiles().profiles).toEqual([])
  expect(readSceneProfiles().selectedId).not.toBe(saved.id)
})

test("loading checks tracker type and camera orientation, but allows reconnects", () => {
  const saved = saveSceneProfile("Kate", draft(), setup)
  expect(sceneProfileSetupIssue(saved, setup)).toBe("")
  expect(
    sceneProfileSetupIssue(saved, { ...setup, trackerFormat: "spatial" })
  ).toMatch(/tracker/i)
  expect(
    sceneProfileSetupIssue(saved, {
      ...setup,
      orientation: {
        ...setup.orientation,
        scene: { ...DEFAULT_CAMERA_TRANSFORM, mirrorX: true },
      },
    })
  ).toMatch(/orientation/i)
})

test("full local storage reports failure without losing existing profiles", () => {
  saveSceneProfile("Kate", draft(), setup)
  const original = localStorage
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage"
  )!
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: original.getItem.bind(original),
      setItem() {
        throw new DOMException("Full", "QuotaExceededError")
      },
    },
  })
  try {
    expect(() => saveSceneProfile("Alex", draft(), setup)).toThrow(
      /storage.*full/i
    )
    expect(readSceneProfiles().profiles.map((profile) => profile.name)).toEqual(
      ["Kate"]
    )
  } finally {
    Object.defineProperty(globalThis, "localStorage", descriptor)
  }
})
