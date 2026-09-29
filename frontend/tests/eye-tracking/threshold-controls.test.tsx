import { afterEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
if (typeof document === "undefined") GlobalRegistrator.register()
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
const { act, createElement } = await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { ThresholdControls } =
  await import("../../apps/web/src/features/eye-tracking/threshold-controls")
const { useTracker } =
  await import("../../apps/web/src/features/eye-tracking/use-tracker")
import type { TrackerController } from "../../apps/web/src/features/eye-tracking/use-tracker.types"

let tracker: TrackerController
const host = document.createElement("div")
let root: ReturnType<typeof createRoot>
function Harness() {
  tracker = useTracker()
  return createElement(ThresholdControls, {
    tracker,
    update: tracker.configure,
  })
}
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})
test("threshold slider applies each adjustment before the pointer is released", async () => {
  ;(globalThis as any).Worker = class {
    postMessage() {}
    terminate() {}
  }
  globalThis.requestAnimationFrame = () => 1
  globalThis.cancelAnimationFrame = () => {}
  document.body.append(host)
  await act(async () => {
    root = createRoot(host)
    root.render(createElement(Harness))
  })
  const slider = host.querySelector<HTMLInputElement>('input[type="range"]')!
  expect(slider).not.toBeNull()
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(slider, "25")
    slider.dispatchEvent(new Event("input", { bubbles: true }))
  })
  expect(tracker.settings.threshold).toBe(25)
})
