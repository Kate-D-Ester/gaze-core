import { afterEach, expect, test, spyOn } from "bun:test"
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
  expect(health).toHaveBeenCalled()
  expect(host.textContent).toContain("Local service ready")
  expect(host.textContent).toContain("Speaker focus")
  expect(host.textContent).toContain("Processed clip")
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
  expect(host.textContent).toContain("Experimental separation")
  health.mockRestore()
})
