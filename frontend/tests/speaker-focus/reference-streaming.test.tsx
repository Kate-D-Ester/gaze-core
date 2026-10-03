import { afterEach, expect, spyOn, test, mock } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
if (typeof document === "undefined") {
  GlobalRegistrator.register()
}
import { act, createElement } from "../../apps/web/node_modules/react"
import {
  createRoot,
  type Root,
} from "../../apps/web/node_modules/react-dom/client"
import { ReferenceWorkspace } from "../../apps/web/src/features/speaker-focus/reference-workspace"
import { ReplayController } from "../../apps/web/src/features/speaker-focus/replay-controller"
import type { ReplayState } from "../../apps/web/src/features/speaker-focus/replay-controller.types"
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | null = null
let host: HTMLDivElement | null = null
afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  mock.restore()
})
const state: ReplayState = {
  status: "playing",
  mode: "focused",
  label: "Debate",
  media: { width: 320, height: 180, duration: 32, sampleCount: 512000 },
  tracks: [
    {
      id: "person",
      manual: false,
      observations: [{ timestamp: 0, box: [0.1, 0.1, 0.3, 0.6] }],
    },
  ],
  selectedId: "person",
  sourceSample: 0,
  timing: {
    state: "buffering",
    reserveSeconds: 0.2,
    bufferedSeconds: 0,
    delaySeconds: null,
    hardwareLatencyAvailable: true,
  },
  health: null,
  serviceError: "",
  error: "",
}
test("streaming reference exposes live controls and silent buffering without processed-file progress", async () => {
  spyOn(ReplayController.prototype, "mount").mockImplementation(function () {
    Reflect.get(this, "update").call(this, state)
  })
  const pause = spyOn(ReplayController.prototype, "pause").mockResolvedValue()
  const select = spyOn(ReplayController.prototype, "select").mockResolvedValue()
  host = document.createElement("div")
  document.body.append(host)
  await act(async () => {
    root = createRoot(host!)
    root.render(
      createElement(ReferenceWorkspace, { onSetup() {}, onExport() {} })
    )
  })
  expect(host.textContent).toContain("Buffering")
  expect(host.querySelector("progress")).toBeNull()
  expect(host.querySelector("audio")).toBeNull()
  expect(
    host.querySelector('button[aria-label="Pause reference playback"]')
  ).not.toBeNull()
  expect(
    host
      .querySelector('button[aria-label="Listen to focused audio"]')
      ?.getAttribute("aria-pressed")
  ).toBe("true")
  await act(async () =>
    host!
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Select reference speaker 1"]'
      )!
      .click()
  )
  expect(select).toHaveBeenCalled()
  await act(async () =>
    host!
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Pause reference playback"]'
      )!
      .click()
  )
  expect(pause).toHaveBeenCalled()
  expect(host.textContent).toContain("File export")
})
test("streaming status reports measured delay and explicit capability failure", async () => {
  const snapshot = {
    ...state,
    timing: { ...state.timing!, state: "playing" as const, delaySeconds: 6.2 },
    error: "Local noise suppression unavailable",
  }
  spyOn(ReplayController.prototype, "mount").mockImplementation(function () {
    Reflect.get(this, "update").call(this, snapshot)
  })
  host = document.createElement("div")
  document.body.append(host)
  await act(async () => {
    root = createRoot(host!)
    root.render(
      createElement(ReferenceWorkspace, { onSetup() {}, onExport() {} })
    )
  })
  expect(host.textContent).toContain("6.2 s")
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "noise suppression"
  )
})
