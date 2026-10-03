import { afterEach, beforeEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import type { Root } from "../../apps/web/node_modules/react-dom/client"
import { SceneSession } from "../../apps/web/src/features/scene-eye-tracking/scene-session"
import {
  readSceneProfiles,
  saveSceneProfile,
} from "../../apps/web/src/features/scene-eye-tracking/calibration-profiles"
import { useCalibrationProfiles } from "../../apps/web/src/features/scene-eye-tracking/use-calibration-profiles"
import { CalibrationProfileControls } from "../../apps/web/src/features/scene-eye-tracking/calibration-profile-controls"
import { DEFAULT_CAMERA_TRANSFORM } from "../../apps/web/src/features/eye-tracking/camera-transform"
import type { SceneProfileSetup } from "../../apps/web/src/features/scene-eye-tracking/calibration-profiles.types"
import { calibrate, collectValidation } from "./fixtures"

if (typeof document === "undefined") GlobalRegistrator.register()
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
const { act, createElement, useSyncExternalStore } =
  await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const setup: SceneProfileSetup = {
  trackerFormat: "classic",
  orientation: {
    eye: DEFAULT_CAMERA_TRANSFORM,
    scene: DEFAULT_CAMERA_TRANSFORM,
  },
}
let root: Root | null = null
let host: HTMLDivElement
let openedLive = 0
beforeEach(() => {
  localStorage.clear()
  openedLive = 0
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root?.unmount())
  host.remove()
})

function Controls({
  session,
  ready = true,
  disabled = false,
}: {
  session: SceneSession
  ready?: boolean
  disabled?: boolean
}) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const controller = useCalibrationProfiles({
    session,
    state,
    setup,
    ready,
    disabled,
    onLoaded: () => {
      openedLive++
    },
  })
  return createElement(CalibrationProfileControls, { controller })
}
async function render(session: SceneSession, ready = true, disabled = false) {
  await act(async () =>
    root!.render(createElement(Controls, { session, ready, disabled }))
  )
}
async function click(label: string) {
  const button = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`
  )!
  expect(button).not.toBeNull()
  expect(button.disabled).toBe(false)
  await act(async () => button.click())
}

async function saveNamedProfile(name: string) {
  await click("Save calibration profile")
  const input = host.querySelector<HTMLInputElement>(
    '[aria-label="Calibration profile name"]'
  )!
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, name)
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new Event("change", { bubbles: true }))
  })
  await click("Confirm profile name")
}

test("a completed mapping can be saved when the accuracy check has not passed", async () => {
  const { s, id } = calibrate(false)
  const collected = collectValidation(s, id, () => [0.06, -0.04])
  expect(s.getSnapshot().validation?.passed).toBe(false)
  const mapping = s.getSnapshot().calibration
  await render(s)
  await saveNamedProfile("Kate · unchecked")

  const saved = readSceneProfiles().profiles[0]
  expect(saved.calibration.coefficients).toEqual(mapping!.coefficients)
  expect(saved.unverified).toBe(true)
  expect(s.getSnapshot().calibration).toBe(mapping)
  expect(s.getSnapshot().validation?.passed).toBe(false)
  expect(host.textContent).toContain("accuracy not verified")

  await act(async () => s.setOffset([0.03, -0.01]))
  expect(readSceneProfiles().profiles[0].offset).toEqual([0.03, -0.01])
  expect(readSceneProfiles().profiles[0].unverified).toBe(true)
  await act(async () => {
    s.startCapture("validation")
    collectValidation(s, collected.id, () => [-0.03, 0.01])
  })
  expect(s.getSnapshot().validation?.passed).toBe(true)
  expect(readSceneProfiles().profiles[0].unverified).toBe(false)
})

test("saving after cancelling an accuracy check retains the completed mapping", async () => {
  const { s } = calibrate(false)
  const mapping = s.getSnapshot().calibration
  s.cancelCapture()
  await render(s)
  await saveNamedProfile("Pending check")
  expect(readSceneProfiles().profiles[0].calibration.coefficients).toEqual(
    mapping!.coefficients
  )
  expect(readSceneProfiles().profiles[0].unverified).toBe(true)
})

test("save remains disabled before fitting and during active capture", async () => {
  await render(new SceneSession())
  expect(
    host.querySelector<HTMLButtonElement>(
      '[aria-label="Save calibration profile"]'
    )!.disabled
  ).toBe(true)
  const { s } = calibrate(false)
  await render(s)
  expect(
    host.querySelector<HTMLButtonElement>(
      '[aria-label="Save calibration profile"]'
    )!.disabled
  ).toBe(true)
})

test("save provides an inline name and keeps offset changes with that user", async () => {
  const session = calibrate().s
  await render(session)
  await click("Save calibration profile")
  const input = host.querySelector<HTMLInputElement>(
    '[aria-label="Calibration profile name"]'
  )!
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, "Kate")
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new Event("change", { bubbles: true }))
  })
  await click("Confirm profile name")
  expect(readSceneProfiles().profiles[0]?.name).toBe("Kate")
  expect(host.querySelector("form")).toBeNull()
  await act(async () => session.setOffset([0.1, -0.02]))
  expect(readSceneProfiles().profiles[0].offset).toEqual([0.1, -0.02])
})

test("the last chosen profile loads once after camera setup, without restarting calibration", async () => {
  const previous = calibrate().s.getSnapshot()
  saveSceneProfile(
    "Kate",
    { ...previous, calibration: previous.calibration! },
    setup
  )
  const session = new SceneSession()
  await render(session, false)
  expect(session.getSnapshot().calibration).toBeNull()
  await render(session, true)
  expect(openedLive).toBe(1)
  expect(session.getSnapshot().reusedCalibration).toBe(true)
  expect(session.getSnapshot().capture).toBeNull()
  await act(async () => session.invalidate())
  expect(session.getSnapshot().calibration).toBeNull()
  expect(openedLive).toBe(1)
  expect(host.querySelector<HTMLSelectElement>("select")!.value).toBe("")
})

test("selecting another user restores their offset and controls are locked during recording", async () => {
  const previous = calibrate().s.getSnapshot()
  const kate = saveSceneProfile(
    "Kate",
    { ...previous, calibration: previous.calibration!, offset: [0.02, 0] },
    setup
  )
  saveSceneProfile(
    "Alex",
    { ...previous, calibration: previous.calibration!, offset: [-0.1, 0] },
    setup
  )
  const session = new SceneSession()
  await render(session)
  expect(session.getSnapshot().offset).toEqual([-0.1, 0])
  const select = host.querySelector<HTMLSelectElement>("select")!
  await act(async () => {
    select.value = kate.id
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  expect(session.getSnapshot().offset).toEqual([0.02, 0])
  await render(session, true, true)
  expect(select.disabled).toBe(true)
  expect(
    [
      ...host.querySelectorAll<HTMLButtonElement>(".scene-profile-row button"),
    ].every((button) => button.disabled)
  ).toBe(true)
})
