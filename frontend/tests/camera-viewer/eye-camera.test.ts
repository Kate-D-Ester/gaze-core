import { expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { createViewerTracker } from "./fixtures"
import { ViewerEyeCamera } from "../../apps/web/src/features/camera-viewer/eye-camera"
import {
  createVisualSelection,
  isSelectionCurrent,
} from "../../apps/web/src/features/camera-viewer/selection"
if (typeof document === "undefined") {
  GlobalRegistrator.register()
}

test("the viewer uses the tracker canvas and delegates controls without replacing its model", async () => {
  const eye = createViewerTracker()
  const calls: unknown[] = []
  eye.startCamera = async (...args) => {
    calls.push(args)
  }
  eye.setTransform = (value) => {
    calls.push(value)
  }
  const camera = new ViewerEyeCamera(eye)
  expect(camera.rawCanvas).toBe(eye.sourceCanvas.current!)
  expect(camera.getSnapshot().source?.url).toBe(eye.source?.url)
  await camera.startCamera("eye-usb", ["scene-usb", "aux-usb"])
  camera.setTransform({ rotation: 90, mirrorX: true, mirrorY: false })
  expect(calls).toEqual([
    ["eye-usb", ["scene-usb", "aux-usb"]],
    { rotation: 90, mirrorX: true, mirrorY: false },
  ])
  expect(eye.settings.locked).toBe(true)
})
test("ordinary tracker frames preserve selections, while a new source or orientation invalidates them", () => {
  const eye = createViewerTracker()
  const camera = new ViewerEyeCamera(eye)
  const selection = createVisualSelection(
    [0.3, 0.6],
    camera.getSnapshot(),
    100
  )!
  camera.update({ ...eye, frame: { ...eye.frame!, id: 2, timestamp: 110 } })
  expect(isSelectionCurrent(selection, camera.getSnapshot(), 110)).toBe(true)
  const rotated = { ...eye, transform: { ...eye.transform, rotation: 90 } }
  camera.update(rotated)
  expect(isSelectionCurrent(selection, camera.getSnapshot(), 110)).toBe(false)
  const next = createVisualSelection([0.3, 0.6], camera.getSnapshot(), 100)!
  camera.update({ ...rotated, source: { ...eye.source!, key: "eye:2" } })
  expect(isSelectionCurrent(next, camera.getSnapshot(), 100)).toBe(false)
})
test("an interrupted tracker feed never exposes a stale photo or selection frame", () => {
  const eye = createViewerTracker()
  const camera = new ViewerEyeCamera(eye)
  const initial = camera.getSnapshot()
  const selection = createVisualSelection([0.3, 0.6], initial, 100)!
  camera.update({
    ...eye,
    connection: "reconnecting",
    busy: true,
    frame: null,
    reconnectAttempt: 1,
  })
  expect(camera.getSnapshot().frame).toBeNull()
  camera.update(eye)
  expect(isSelectionCurrent(selection, camera.getSnapshot(), 100)).toBe(false)
  const stable = camera.getSnapshot()
  camera.update(eye)
  expect(camera.getSnapshot()).toBe(stable)
})

test("settings changes refresh pupil drawing metadata without replacing the worker frame", () => {
  const eye = createViewerTracker()
  const camera = new ViewerEyeCamera(eye)
  const preview = camera.eyePreview
  expect(camera.eyePreview).toBe(preview)
  camera.update(eye)
  expect(camera.eyePreview).toBe(preview)
  const snapshot = camera.getSnapshot()
  const settings = {
    ...eye.settings,
    corners: [
      [100, 200],
      [500, 200],
    ] as [[number, number], [number, number]],
  }
  camera.update({ ...eye, settings })
  expect(camera.getSnapshot()).not.toBe(snapshot)
  expect(camera.eyePreview.corners).toBe(settings.corners)
  expect(camera.eyePreview.frame).toBe(eye.frame)
})
