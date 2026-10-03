import { afterEach, beforeEach, expect, test, spyOn, mock } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
if (typeof document === "undefined") {
  GlobalRegistrator.register()
}
import {
  act,
  createElement,
  StrictMode,
} from "../../apps/web/node_modules/react"
import {
  createRoot,
  type Root,
} from "../../apps/web/node_modules/react-dom/client"
import { SpeakerClient } from "../../apps/web/src/features/speaker-focus/client"
import { SpeakerFocusWorkspace } from "../../apps/web/src/features/speaker-focus/workspace"
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const originalWorker = globalThis.Worker
beforeEach(() => {
  Object.assign(globalThis, {
    Worker: class {
      postMessage() {}
      terminate() {}
    },
  })
})
let root: Root | null = null
let host: HTMLDivElement | null = null
afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount()
    })
  }
  host?.remove()
  root = null
  mock.restore()
  Object.assign(globalThis, { Worker: originalWorker })
})

test("public speaker workspace distinguishes original, focused and processed-file listening", async () => {
  const health = spyOn(SpeakerClient.prototype, "health").mockResolvedValue({
    ready: true,
    model_state: "ready",
    engine: "RTFS-Net-4-LRS2",
    device: "cpu",
    error: null,
    clip: true,
    live: false,
    max_upload_bytes: 125829120,
    max_duration: 120,
    queued: 0,
    window_seconds: 2,
    stride_seconds: 1,
  })
  host = document.createElement("div")
  document.body.append(host)
  await act(async () => {
    root = createRoot(host!)
    root.render(
      createElement(StrictMode, null, createElement(SpeakerFocusWorkspace))
    )
  })
  const reference = Array.from(host!.querySelectorAll("button")).find(
    (button) => button.textContent === "Test a video"
  )
  expect(reference).toBeDefined()
  await act(async () => {
    reference!.click()
  })
  expect(health).toHaveBeenCalled()
  expect(host.textContent).toContain("Local service ready")
  expect(host.textContent).toContain("Speaker focus")
  expect(host.textContent).toContain("Reference test")
  expect(
    host
      .querySelector('button[aria-label="Listen to original audio"]')
      ?.getAttribute("aria-pressed")
  ).toBe("true")
  expect(
    host
      .querySelector('button[aria-label="Listen to focused audio"]')
      ?.getAttribute("aria-pressed")
  ).toBe("false")
  expect(host.querySelector('input[type="file"]')).not.toBeNull()
  expect(host.textContent).not.toContain("For calibrated gaze selection")
  health.mockRestore()
})

test("speaker focus starts with camera setup and blocks unchecked focus", async () => {
  spyOn(SpeakerClient.prototype, "health").mockRejectedValue(
    new Error("Test service unavailable")
  )
  host = document.createElement("div")
  document.body.append(host)
  await act(async () => {
    root = createRoot(host!)
    root.render(createElement(SpeakerFocusWorkspace))
  })
  const steps = Array.from(
    host.querySelectorAll('nav[aria-label="Setup steps"] button')
  )
  expect(
    steps.map((button) => button.textContent?.replace(/^\d+/, ""))
  ).toEqual([
    "Eye camera",
    "Eye region",
    "Eye model",
    "Scene camera",
    "Calibrate",
    "Check accuracy",
    "Focus",
  ])
  expect((steps[6] as HTMLButtonElement).disabled).toBe(true)
  expect(host.querySelector('input[type="file"]')).toBeNull()
  const setup = host.querySelector('nav[aria-label="Setup steps"]')
  const reference = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Test a video"
  )!
  await act(async () => {
    reference.click()
  })
  const back = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Back to setup"
  )!
  await act(async () => {
    back.click()
  })
  expect(host.querySelector('nav[aria-label="Setup steps"]')).toBe(setup)
})
