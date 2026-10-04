import { afterEach, expect, spyOn, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
if (typeof document === "undefined") {
  GlobalRegistrator.register()
}
import {
  act,
  createElement,
  useSyncExternalStore,
} from "../../apps/web/node_modules/react"
import {
  createRoot,
  type Root,
} from "../../apps/web/node_modules/react-dom/client"
import { ReplayController } from "../../apps/web/src/features/speaker-focus/replay-controller"
import { PreviewBuffer } from "../../apps/web/src/features/speaker-focus/preview-buffer"
import { ReplayStage } from "../../apps/web/src/features/speaker-focus/replay-stage"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | null = null
let host: HTMLDivElement | null = null
let controller: ReplayController | null = null
afterEach(async () => {
  await act(async () => root?.unmount())
  controller?.dispose()
  host?.remove()
})

test("pressing the video beside a face selects it before a moving overlay can lose the click", async () => {
  controller = new ReplayController()
  const active = controller
  const preview = new PreviewBuffer({
    decode: async () =>
      ({ width: 320, height: 180, close() {} }) as ImageBitmap,
  })
  Reflect.set(active, "preview", preview)
  Reflect.set(active, "source", {
    position: 160000,
    pause() {},
    dispose() {},
    drawCurrent() {},
    async seek() {},
  })
  Reflect.set(active, "anchor", 160000)
  Reflect.get(active, "update").call(active, {
    status: "paused",
    media: { width: 320, height: 180, duration: 32, sampleCount: 512000 },
    sourceSample: 160000,
    displayedSample: 160000,
    tracks: [
      {
        id: "person",
        manual: false,
        observations: [{ timestamp: 10, box: [0.7, 0.2, 0.15, 0.3] }],
      },
    ],
  })
  function View() {
    const state = useSyncExternalStore(active.subscribe, active.getSnapshot)
    return createElement(ReplayStage, { controller: active, state })
  }
  host = document.createElement("div")
  document.body.append(host)
  await act(async () => {
    root = createRoot(host!)
    root.render(createElement(View))
  })
  const canvas = host.querySelector("canvas")!
  const bounds = spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    left: 100,
    top: 200,
    width: 640,
    height: 360,
  } as DOMRect)
  const context = spyOn(canvas, "getContext").mockReturnValue({
    drawImage() {},
  } as CanvasRenderingContext2D)
  try {
    await act(async () => {
      canvas.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 1,
          button: 0,
          clientX: 596,
          clientY: 263,
        })
      )
      Reflect.get(active, "reply").call(active, {
        type: "faces",
        generation: 1,
        tracks: [
          {
            id: "person-reacquired",
            manual: false,
            observations: [{ timestamp: 10, box: [0.7, 0.21, 0.15, 0.3] }],
          },
        ],
      })
      preview.add(160000, new Blob(["fresh frame"]), 2)
      await active.draw(canvas)
    })
    expect(active.getSnapshot().selectedId).toBe("person-reacquired")
    expect(host.querySelector('button[aria-pressed="true"]')).not.toBeNull()
    expect(host.textContent).toContain("Locked")
  } finally {
    bounds.mockRestore()
    context.mockRestore()
  }
})
