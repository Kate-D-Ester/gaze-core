import { afterEach, beforeEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { act, createElement, useState } from "../../apps/web/node_modules/react"
import { createRoot } from "../../apps/web/node_modules/react-dom/client"
import { CalibrationProfileControls } from "../../apps/web/src/features/tracking-calibration/calibration-profile-controls"
import { useSavedCalibration } from "../../apps/web/src/features/tracking-calibration/use-calibration-profiles"
import {
  readCalibrationProfiles,
  saveCalibrationProfile,
} from "../../apps/web/src/features/tracking-calibration/calibration-profiles"
import { useGazeAdjustment } from "../../apps/web/src/features/eye-tracking/use-gaze-adjustment"
import type { CalibrationContext } from "../../apps/web/src/features/tracking-calibration/calibration-profiles.types"
import type { RemoteCalibration } from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"

if (typeof document === "undefined") GlobalRegistrator.register()
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const host = document.createElement("div")
let root: ReturnType<typeof createRoot>
const pose = [0, 0, 0, 0.5, 0.5, Math.log(0.2)]
const baseline: RemoteCalibration = {
  mode: "webcam",
  featureVersion: "legacy-29",
  featureMean: Array(29).fill(0),
  featureScale: Array(29).fill(1),
  coefficients: [Array(30).fill(0), Array(30).fill(0)],
  regularization: 0.1,
  crossValidationError: 0.1,
  poseKind: "face",
  poseSamples: [pose],
  poseBounds: { min: pose, max: pose },
  targetCount: 9,
  sampleCount: 162,
}
const experimental: RemoteCalibration = {
  ...baseline,
  inputKind: "base-point",
  baseModelVersion: "blazegaze-v1",
  featureMean: [0, 0],
  featureScale: [1, 1],
  coefficients: [
    [0, 1, 0],
    [0, 0, 1],
  ],
}
const context: CalibrationContext = {
  version: 1,
  tracker: "webcam",
  featureVersion: "legacy-29",
  cameraIdentity: "a".repeat(64),
  width: 640,
  height: 480,
  inputTransform: "camera-raw",
  outputSpace: "screen",
  screenAspect: 16 / 9,
  setupKey: "fixture-setup",
  geometryId: null,
}

function Harness() {
  const [model, setModel] = useState<RemoteCalibration | null>(null)
  const { offset, setOffset } = useGazeAdjustment(model)
  const controller = useSavedCalibration({
    context,
    payload: model ? { kind: "remote", model } : null,
    offset,
    ready: true,
    disabled: false,
    onLoaded: (payload, savedOffset) => {
      if (payload.kind !== "remote") return
      setModel(payload.model)
      setOffset(savedOffset, payload.model)
    },
  })
  let kind = "none"
  if (model) kind = model.inputKind ?? "features"
  return createElement(
    "div",
    null,
    createElement(CalibrationProfileControls, {
      controller,
      sceneLabels: false,
    }),
    createElement("output", null, JSON.stringify({ kind, offset }))
  )
}

function store(id: string, model: RemoteCalibration) {
  saveCalibrationProfile({
    id,
    name: id,
    context,
    payload: { kind: "remote", model },
    updatedAt: "2026-10-09T00:00:00Z",
    offset: [0.1, -0.1],
  })
}
async function select(id: string) {
  const select = host.querySelector<HTMLSelectElement>(
    '[aria-label="Calibration profile"]'
  )!
  select.value = id
  await act(async () =>
    select.dispatchEvent(new Event("change", { bubbles: true }))
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

test("the committed feature profile still restores with its saved adjustment", async () => {
  store("baseline", baseline)
  await act(async () => root.render(createElement(Harness)))
  expect(host.querySelector("output")?.textContent).toBe(
    '{"kind":"features","offset":[0.1,-0.1]}'
  )
  expect(host.textContent).toContain("Loaded · saved calibration")
})

test("a newer profile restores without discarding its saved adjustment", async () => {
  store("experimental", experimental)
  const previous = readCalibrationProfiles()
  await act(async () => root.render(createElement(Harness)))
  expect(host.querySelector("output")?.textContent).toBe(
    '{"kind":"base-point","offset":[0.1,-0.1]}'
  )
  expect(host.textContent).toContain("Loaded · saved calibration")
  await select("experimental")
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(readCalibrationProfiles()).toEqual(previous)
})

test("the selected newer profile restores and older profiles remain selectable", async () => {
  store("baseline", baseline)
  store("experimental", experimental)
  await act(async () => root.render(createElement(Harness)))
  const loaded = host.querySelector("output")?.textContent
  expect(loaded).toContain('"kind":"base-point"')
  const previous = readCalibrationProfiles()
  expect(previous.selectedId).toBe("experimental")
  expect(previous.profiles).toHaveLength(2)
  await select("baseline")
  expect(host.querySelector("output")?.textContent).toContain(
    '"kind":"features"'
  )
  expect(readCalibrationProfiles().profiles).toEqual(previous.profiles)
})
