import { afterEach, beforeEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { act, createElement, useState } from "../../apps/web/node_modules/react"
import { createRoot } from "../../apps/web/node_modules/react-dom/client"
import { CalibrationProfileControls } from "../../apps/web/src/features/tracking-calibration/calibration-profile-controls"
import { useSavedCalibration } from "../../apps/web/src/features/tracking-calibration/use-calibration-profiles"
import { useGazeAdjustment } from "../../apps/web/src/features/eye-tracking/use-gaze-adjustment"
import {
  saveCalibrationProfile,
  readCalibrationProfiles,
} from "../../apps/web/src/features/tracking-calibration/calibration-profiles"
import type { Calibration } from "../../apps/web/src/features/eye-tracking/calibration.types"
import type { CalibrationContext } from "../../apps/web/src/features/tracking-calibration/calibration-profiles.types"
if (typeof document === "undefined") GlobalRegistrator.register()
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const host = document.createElement("div")
let root: ReturnType<typeof createRoot>
const model: Calibration = {
  coefficients: [
    [0, 1, 0],
    [0, 0, 1],
  ],
  validationError: 0.01,
}
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
function Harness({
  ready = true,
  camera = context.cameraIdentity,
  disabled = false,
  rejectSaved = false,
}) {
  const [calibration, setCalibration] = useState<Calibration | null>(null)
  const { offset, setOffset } = useGazeAdjustment(calibration)
  const controller = useSavedCalibration({
    context: { ...context, cameraIdentity: camera },
    payload: calibration ? { kind: "screen", model: calibration } : null,
    offset,
    ready,
    disabled,
    loadIssue: () =>
      rejectSaved ? "Experimental mapping kept. Recalibrate." : null,
    onIncompatible: () => setCalibration(null),
    onLoaded: (payload, savedOffset) => {
      if (payload.kind !== "screen") return
      setCalibration(payload.model)
      setOffset(savedOffset, payload.model)
    },
  })
  return createElement(
    "div",
    null,
    createElement(CalibrationProfileControls, {
      controller,
      sceneLabels: false,
    }),
    createElement(
      "output",
      { "aria-label": "Restored offset" },
      JSON.stringify(offset)
    ),
    createElement(
      "button",
      { "aria-label": "New fit", onClick: () => setCalibration({ ...model }) },
      "New fit"
    )
  )
}
beforeEach(() => {
  window.localStorage.clear()
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})
function save() {
  saveCalibrationProfile({
    id: "saved",
    name: "Kate",
    updatedAt: "2026-10-08T00:00:00Z",
    context,
    payload: { kind: "screen", model },
    offset: [0.1, -0.1],
  })
}
async function render(ready = true, camera = context.cameraIdentity) {
  await act(async () => root.render(createElement(Harness, { ready, camera })))
}
test("a compatible profile restores once after setup and retains its saved offset atomically", async () => {
  save()
  await render(false)
  expect(host.querySelector("output")?.textContent).toBe("[0,0]")
  await render(true)
  expect(host.querySelector("output")?.textContent).toBe("[0.1,-0.1]")
  expect(host.textContent).toContain("Loaded · saved calibration")
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="New fit"]')!.click()
  )
  expect(host.querySelector("output")?.textContent).toBe("[0,0]")
  await render(true)
  expect(host.querySelector("output")?.textContent).toBe("[0,0]")
})
test("a camera mismatch cannot automatically load a personal model", async () => {
  save()
  await render(true, "b".repeat(64))
  expect(host.querySelector("output")?.textContent).toBe("[0,0]")
  const select = host.querySelector<HTMLSelectElement>(
    '[aria-label="Calibration profile"]'
  )!
  select.value = "saved"
  await act(async () =>
    select.dispatchEvent(new Event("change", { bubbles: true }))
  )
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("changed")
  expect(host.querySelector("output")?.textContent).toBe("[0,0]")
})

test("an interruption retains the model but a changed camera invalidates it", async () => {
  save()
  await render()
  expect(host.querySelector("output")?.textContent).toBe("[0.1,-0.1]")
  await render(false)
  expect(host.querySelector("output")?.textContent).toBe("[0.1,-0.1]")
  await render(true)
  expect(host.querySelector("output")?.textContent).toBe("[0.1,-0.1]")
  await render(true, "b".repeat(64))
  expect(host.querySelector("output")?.textContent).toBe("[0,0]")
  await render(true)
  expect(host.querySelector("output")?.textContent).toBe("[0.1,-0.1]")
})

test("loading a profile remembers that choice when the workspace is reopened", async () => {
  save()
  saveCalibrationProfile({
    id: "second",
    name: "Second",
    updatedAt: "2026-10-08T01:00:00Z",
    context,
    payload: { kind: "screen", model },
    offset: [0.2, 0.1],
  })
  await render()
  expect(host.querySelector("output")?.textContent).toBe("[0.2,0.1]")
  const select = host.querySelector<HTMLSelectElement>(
    '[aria-label="Calibration profile"]'
  )!
  select.value = "saved"
  await act(async () => {
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  expect(host.querySelector("output")?.textContent).toBe("[0.1,-0.1]")
  await act(async () => root.unmount())
  root = createRoot(host)
  await render()
  expect(host.querySelector("output")?.textContent).toBe("[0.1,-0.1]")
})

test("an in-progress capture defers context invalidation until the capture ends", async () => {
  save()
  await render()
  await act(async () =>
    root.render(
      createElement(Harness, {
        camera: "b".repeat(64),
        disabled: true,
      })
    )
  )
  expect(host.querySelector("output")?.textContent).toBe("[0.1,-0.1]")
  await render(true, "b".repeat(64))
  expect(host.querySelector("output")?.textContent).toBe("[0,0]")
})

test("profile eligibility blocks restoration before selection without deleting stored data", async () => {
  save()
  const stored = readCalibrationProfiles()
  await act(async () =>
    root.render(createElement(Harness, { rejectSaved: true }))
  )
  expect(host.querySelector("output")?.textContent).toBe("[0,0]")
  expect(host.textContent).toContain("Experimental mapping kept")
  expect(readCalibrationProfiles()).toEqual(stored)
  const select = host.querySelector<HTMLSelectElement>(
    '[aria-label="Calibration profile"]'
  )!
  select.value = "saved"
  await act(async () =>
    select.dispatchEvent(new Event("change", { bubbles: true }))
  )
  expect(host.querySelector("output")?.textContent).toBe("[0,0]")
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Experimental mapping kept"
  )
  expect(readCalibrationProfiles()).toEqual(stored)
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="New fit"]')!.click()
  )
  expect(host.textContent).not.toContain("Experimental mapping kept")
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(readCalibrationProfiles()).toEqual(stored)
})
