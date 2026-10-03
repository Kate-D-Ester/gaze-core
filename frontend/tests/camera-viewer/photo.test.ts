import { afterEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { captureCameraPhoto } from "../../apps/web/src/features/camera-viewer/photo"
import { liveSnapshot } from "./fixtures"
if (typeof document === "undefined") {
  GlobalRegistrator.register()
}
const originalCreate = document.createElement.bind(document)
afterEach(() => {
  document.createElement = originalCreate
})

test("photo capture rejects a disconnected or stale feed before touching its canvas", async () => {
  const rawCanvas = document.createElement("canvas")
  const state = liveSnapshot()
  await expect(
    captureCameraPhoto(
      { rawCanvas, getSnapshot: () => ({ ...state, connection: "idle" }) },
      1000
    )
  ).rejects.toThrow("fresh frame")
  await expect(
    captureCameraPhoto({ rawCanvas, getSnapshot: () => state }, 2001)
  ).rejects.toThrow("fresh frame")
})

test("manual photo copies the transformed frame into a separate PNG canvas", async () => {
  const rawCanvas = document.createElement("canvas")
  const state = liveSnapshot()
  const copies: unknown[][] = []
  document.createElement = ((tag: string) => {
    const element = originalCreate(tag)
    if (tag === "canvas") {
      Object.defineProperty(element, "getContext", {
        value: () => ({ drawImage: (...args: unknown[]) => copies.push(args) }),
      })
      Object.defineProperty(element, "toBlob", {
        value: (callback: BlobCallback, format: string) => {
          expect(format).toBe("image/png")
          callback(new Blob(["encoded PNG"], { type: "image/png" }))
        },
      })
    }
    return element
  }) as typeof document.createElement
  const photo = await captureCameraPhoto(
    { rawCanvas, getSnapshot: () => state },
    1100
  )
  expect(photo.size).toBeGreaterThan(0)
  expect(copies).toEqual([[rawCanvas, 0, 0, 640, 480]])
})

test("canvas encoding failure cannot download an empty photo", async () => {
  const rawCanvas = document.createElement("canvas")
  document.createElement = ((tag: string) => {
    const element = originalCreate(tag)
    if (tag === "canvas") {
      Object.defineProperty(element, "getContext", {
        value: () => ({ drawImage() {} }),
      })
      Object.defineProperty(element, "toBlob", {
        value: (callback: BlobCallback) => callback(null),
      })
    }
    return element
  }) as typeof document.createElement
  await expect(
    captureCameraPhoto({ rawCanvas, getSnapshot: liveSnapshot }, 1000)
  ).rejects.toThrow("encode")
})
