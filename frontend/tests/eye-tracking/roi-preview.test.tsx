import { afterEach, beforeEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { act, createElement } from "../../apps/web/node_modules/react"
import {
  createRoot,
  type Root,
} from "../../apps/web/node_modules/react-dom/client"
import { EyePreview } from "../../apps/web/src/features/eye-tracking/components/eye-preview"
import {
  fitPreviewCard,
  fitPreviewFrame,
  fitPreviewStage,
  fitSquarePreview,
} from "../../apps/web/src/features/eye-tracking/preview-layout"
import {
  useTracker,
  type TrackerController,
} from "../../apps/web/src/features/eye-tracking/use-tracker"
import type { Rect } from "../../apps/web/src/features/eye-tracking/types"

if (typeof document === "undefined") GlobalRegistrator.register()
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
let root: Root,
  host: HTMLDivElement,
  tracker: TrackerController,
  committed: Rect[],
  thresholdViewChanges: boolean[]
function Harness({ width, height }: { width?: number; height?: number } = {}) {
  tracker = useTracker()
  const previewTracker =
    width && height ? { ...tracker, dimensions: { width, height } } : tracker
  return createElement(EyePreview, {
    tracker: previewTracker,
    selectRegion: true,
    selectCorners: false,
    onRegion: (roi: Rect) => {
      committed.push(roi)
      tracker.configure({ roi })
    },
    onCorner: () => {},
    onThresholdViewChange: (enabled: boolean) =>
      thresholdViewChanges.push(enabled),
  })
}
beforeEach(async () => {
  committed = []
  thresholdViewChanges = []
  ;(globalThis as any).Worker = class {
    postMessage() {}
    terminate() {}
  }
  globalThis.requestAnimationFrame = () => 1
  globalThis.cancelAnimationFrame = () => {}
  HTMLCanvasElement.prototype.getContext = (() => null) as any
  HTMLElement.prototype.setPointerCapture = () => {}
  HTMLElement.prototype.releasePointerCapture = () => {}
  HTMLElement.prototype.hasPointerCapture = () => true
  host = document.createElement("div")
  document.body.append(host)
  await act(async () => {
    root = createRoot(host)
    root.render(createElement(Harness))
  })
  await act(async () => {
    tracker.startSample()
    tracker.configure({ roi: { x: 100, y: 80, width: 200, height: 120 } })
  })
  const canvas = host.querySelector("canvas")!
  canvas.width = 640
  canvas.height = 480
  canvas.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 640,
    height: 480,
    right: 640,
    bottom: 480,
    x: 0,
    y: 0,
    toJSON() {},
  })
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})
test("threshold view requests masks until the image view is selected again", async () => {
  const buttons = Array.from(
    host.querySelectorAll<HTMLButtonElement>(".eye-preview-switch button")
  )
  const thresholdButton = buttons.find(
    (button) => button.textContent === "Threshold"
  )!
  const imageButton = buttons.find((button) => button.textContent === "Image")!

  await act(async () => thresholdButton.click())
  await act(async () => imageButton.click())

  expect(thresholdViewChanges).toEqual([true, false])
})
test("preview frame follows the active camera aspect ratio", async () => {
  const stage = host.querySelector(".eye-preview-stage") as HTMLDivElement
  expect(Number.parseFloat(stage.style.aspectRatio)).toBeCloseTo(4 / 3, 10)
  await act(async () => {
    root.render(createElement(Harness, { width: 1280, height: 720 }))
  })
  expect(Number.parseFloat(stage.style.aspectRatio)).toBeCloseTo(16 / 9, 10)
})
test("preview sizing preserves camera ratio while fitting available space", () => {
  for (const [width, height] of [
    [640, 480],
    [1280, 720],
    [720, 720],
  ]) {
    const fitted = fitPreviewFrame(width, height, 800, 400)!
    expect(fitted.width).toBeLessThanOrEqual(800)
    expect(fitted.height).toBeLessThanOrEqual(400)
    expect(fitted.width / fitted.height).toBeCloseTo(width / height, 10)
  }
  expect(fitPreviewFrame(0, 480, 800, 400)).toBeNull()
})
test("empty preview card stays square inside the available frame", () => {
  expect(fitSquarePreview(900, 360)).toEqual({ width: 360, height: 360 })
  expect(fitSquarePreview(320, 500)).toEqual({ width: 320, height: 320 })
  expect(fitSquarePreview(0, 500)).toBeNull()
})
test("empty viewfinder stays square independently of threshold controls", () => {
  const stage = fitPreviewStage(null, null, 900, 360, 88)!
  expect(stage.width).toBe(stage.height)
  expect(stage.image.height).toBe(stage.height - 88)
})
test("camera preview stage retains the native ratio below fixed controls", () => {
  const stage = fitPreviewStage(1280, 720, 800, 500, 96)!
  expect(stage.image.width / stage.image.height).toBeCloseTo(16 / 9, 10)
  expect(stage.height).toBe(stage.image.height + 96)
})
test("camera ratio changes the fitted image without shrinking the card", () => {
  const wide = fitPreviewCard(1280, 720, 600, 320, 48, 64)!
  const classic = fitPreviewCard(640, 480, 600, 320, 48, 64)!
  expect(wide.card).toEqual({ width: 600, height: 320 })
  expect(classic.card).toEqual(wide.card)
  expect(wide.preview).toEqual({ width: 600, height: 256 })
  expect(wide.image.width / wide.image.height).toBeCloseTo(16 / 9, 10)
  expect(classic.image.width / classic.image.height).toBeCloseTo(4 / 3, 10)
})
async function pointer(target: Element, type: string, x: number, y: number) {
  await act(async () => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 1,
        clientX: x,
        clientY: y,
        button: 0,
      })
    )
  })
}
test("moving an existing ROI keeps tracking settings unchanged until release", async () => {
  const canvas = host.querySelector("canvas")!
  await pointer(canvas, "pointerdown", 150, 120)
  await pointer(canvas, "pointermove", 620, 460)
  expect(committed).toHaveLength(0)
  expect(tracker.settings.roi).toEqual({
    x: 100,
    y: 80,
    width: 200,
    height: 120,
  })
  await pointer(canvas, "pointerup", 620, 460)
  expect(committed).toEqual([{ x: 440, y: 360, width: 200, height: 120 }])
})
test("the southeast handle resizes to the image boundary and commits once", async () => {
  const handle = host.querySelector('[aria-label="Resize ROI bottom right"]')!
  expect(handle).not.toBeNull()
  await pointer(handle, "pointerdown", 300, 200)
  await pointer(handle, "pointermove", 700, 600)
  expect(committed).toHaveLength(0)
  await pointer(handle, "pointerup", 700, 600)
  expect(committed).toEqual([{ x: 100, y: 80, width: 540, height: 400 }])
})
test("arrow keys move the ROI and shift arrows resize it", async () => {
  const canvas = host.querySelector("canvas")!
  await act(async () => {
    canvas.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
    )
  })
  expect(tracker.settings.roi.x).toBe(101)
  await act(async () => {
    canvas.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        shiftKey: true,
        bubbles: true,
      })
    )
  })
  expect(tracker.settings.roi.height).toBe(121)
})
test("Redraw permits a new box inside an existing full-frame ROI", async () => {
  await act(async () =>
    tracker.configure({ roi: { x: 0, y: 0, width: 640, height: 480 } })
  )
  const redraw = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Redraw"
  )!
  expect(redraw).toBeDefined()
  await act(async () => redraw.click())
  const canvas = host.querySelector("canvas")!
  await pointer(canvas, "pointerdown", 100, 100)
  await pointer(canvas, "pointermove", 300, 250)
  await pointer(canvas, "pointerup", 300, 250)
  expect(committed).toEqual([{ x: 100, y: 100, width: 200, height: 150 }])
})
