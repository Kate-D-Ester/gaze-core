import { afterEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { createViewerTracker, liveSnapshot } from "./fixtures"
import { ViewerEyeCamera } from "../../apps/web/src/features/camera-viewer/eye-camera"
if (typeof document === "undefined") GlobalRegistrator.register()
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
const { act, createElement } = await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { CameraPreview } =
  await import("../../apps/web/src/features/camera-viewer/camera-preview")
const original = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  "getContext"
)
let cleanup: (() => Promise<void>) | undefined
let drawn: HTMLCanvasElement[] = []
let ellipses: unknown[][] = []
function drawingContext() {
  drawn = []
  ellipses = []
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value() {
      const canvas = this
      return {
        drawImage() {
          drawn.push(canvas)
        },
        beginPath() {},
        rect() {},
        fill() {},
        setLineDash() {},
        strokeRect() {},
        ellipse(...args: unknown[]) {
          ellipses.push(args)
        },
        stroke() {},
        arc() {},
        moveTo() {},
        lineTo() {},
      }
    },
  })
}
afterEach(async () => {
  await cleanup?.()
  cleanup = undefined
  if (original)
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", original)
})
async function preview(camera: ViewerEyeCamera, state = camera.getSnapshot()) {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  cleanup = async () => {
    await act(async () => root.unmount())
    host.remove()
  }
  const render = async (
    next: typeof state,
    now = next.frame?.timestamp ?? 0
  ) => {
    await act(async () =>
      root.render(
        createElement(CameraPreview, {
          camera,
          state: next,
          now,
          label: "Eye camera",
          selection: null,
          onPoint() {},
        })
      )
    )
  }
  await render(state)
  return { host, render }
}
test("a recovered connection redraws a remounted canvas even when its frame identity is unchanged", async () => {
  drawingContext()
  const tracker = createViewerTracker()
  tracker.sourceCanvas.current!.width = 640
  tracker.sourceCanvas.current!.height = 480
  const camera = new ViewerEyeCamera(tracker)
  const live = liveSnapshot()
  const { host, render } = await preview(camera, live)
  const first = host.querySelector("canvas")!
  expect(drawn).toContain(first)
  await render({ ...live, connection: "reconnecting" })
  expect(host.querySelector("canvas")).toBeNull()
  await render(live)
  const recovered = host.querySelector("canvas")!
  expect(recovered).not.toBe(first)
  expect(drawn).toContain(recovered)
  expect(recovered.width).toBe(640)
})
test("viewer draws the pupil in image coordinates and resumes on a fresh frame after a gap", async () => {
  drawingContext()
  const tracker = createViewerTracker()
  tracker.sourceCanvas.current!.width = 640
  tracker.sourceCanvas.current!.height = 480
  tracker.frame = {
    ...tracker.frame!,
    roi: { x: 100, y: 50, width: 400, height: 300 },
    detection: {
      ...tracker.frame!.detection,
      ellipse: {
        center: [120, 100],
        major: 25,
        minor: 18,
        angle: 0.2,
        confidence: 0.95,
      },
    },
  }
  const camera = new ViewerEyeCamera(tracker)
  const { host, render } = await preview(camera)
  expect(ellipses[0]?.slice(0, 5)).toEqual([220, 150, 25, 18, 0.2])
  camera.update({ ...tracker, frame: null })
  await render(camera.getSnapshot())
  expect(host.querySelector("canvas")).toBeNull()
  const before = ellipses.length
  camera.update({
    ...tracker,
    frame: { ...tracker.frame!, id: 2, timestamp: 200 },
  })
  await render(camera.getSnapshot())
  expect(ellipses.length).toBe(before + 1)
  expect(ellipses.at(-1)?.slice(0, 2)).toEqual([220, 150])
})

test("pupil overlay expires while an unchanged worker frame is stalled and returns with fresh evidence", async () => {
  drawingContext()
  const tracker = createViewerTracker()
  tracker.sourceCanvas.current!.width = 640
  tracker.sourceCanvas.current!.height = 480
  tracker.frame = {
    ...tracker.frame!,
    timestamp: 1000,
    detection: {
      ...tracker.frame!.detection,
      ellipse: {
        center: [320, 240],
        major: 25,
        minor: 18,
        angle: 0,
        confidence: 0.95,
      },
    },
  }
  const camera = new ViewerEyeCamera(tracker)
  const { host, render } = await preview(camera)
  expect(ellipses).toHaveLength(1)
  const originalDraws = drawn.length
  await render(camera.getSnapshot(), 1251)
  expect(host.querySelector("canvas")).not.toBeNull()
  expect(drawn.length).toBeGreaterThan(originalDraws)
  expect(ellipses).toHaveLength(1)
  camera.update({
    ...tracker,
    frame: { ...tracker.frame, id: 2, timestamp: 1300 },
  })
  await render(camera.getSnapshot(), 1300)
  expect(ellipses).toHaveLength(2)
})
