import { afterEach, expect, mock, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { act, createElement } from "../../apps/web/node_modules/react"
import { createRoot } from "../../apps/web/node_modules/react-dom/client"
import { HeadControls } from "../../apps/web/src/features/eye-tracking/head-tracking/head-controls"
import type { HeadTrackingController } from "../../apps/web/src/features/eye-tracking/head-tracking/use-head-tracking.types"

if (typeof document === "undefined") GlobalRegistrator.register()
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  writable: true,
  value: true,
})
const host = document.createElement("div")
let root: ReturnType<typeof createRoot>
const head: HeadTrackingController = {
  enabled: false,
  status: "off",
  pose: null,
  stream: null,
  error: "",
  latest: { current: null },
  history: { current: [] },
  transform: { rotation: 0, mirrorX: false, mirrorY: false },
  setTransform: mock(() => {}),
  start: mock(async () => {}),
  stop: mock(() => {}),
}

test("head-camera orientation icons expose tooltips and invalidate calibration before changing input", async () => {
  const invalidate = mock(() => {})
  document.body.append(host)
  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(HeadControls, {
        head,
        devices: [],
        eyeDeviceId: "",
        simulated: false,
        onConfigurationChange: invalidate,
        onSkip() {},
      })
    )
  })
  const rotate = host.querySelector<HTMLButtonElement>(
    '[aria-label="Rotate front camera clockwise"]'
  )
  expect(rotate).not.toBeNull()
  expect(rotate?.title).toBe("Rotate front camera clockwise")
  await act(async () => rotate!.click())
  expect(invalidate).toHaveBeenCalledTimes(1)
  expect(head.setTransform).toHaveBeenCalledWith({
    rotation: 90,
    mirrorX: false,
    mirrorY: false,
  })
  const mirror = host.querySelector<HTMLButtonElement>(
    '[aria-label="Mirror front camera input"]'
  )!
  expect(mirror.title).toBe("Mirror front camera input")
  await act(async () => mirror.click())
  expect(head.setTransform).toHaveBeenCalledWith({
    rotation: 0,
    mirrorX: true,
    mirrorY: false,
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.replaceChildren()
  host.remove()
  mock.clearAllMocks()
})

test("head tracking is optional and never starts a camera merely by entering its step", async () => {
  const skip = mock(() => {})
  document.body.append(host)
  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(HeadControls, {
        head,
        devices: [],
        eyeDeviceId: "",
        simulated: false,
        onConfigurationChange: () => {},
        onSkip: skip,
      })
    )
  })
  expect(head.start).not.toHaveBeenCalled()
  const skipButton = host.querySelector<HTMLButtonElement>(
    '[aria-label="Skip head tracking"]'
  )!
  await act(async () => skipButton.click())
  expect(skip).toHaveBeenCalledTimes(1)
})

test("the active eye camera is excluded and a separate front camera is selected", async () => {
  const devices = [
    { deviceId: "eye-camera", label: "Eye camera" },
    { deviceId: "front-camera", label: "Integrated Webcam" },
  ] as MediaDeviceInfo[]
  document.body.append(host)
  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(HeadControls, {
        head,
        devices,
        eyeDeviceId: "eye-camera",
        simulated: false,
        onConfigurationChange: () => {},
        onSkip: () => {},
      })
    )
  })
  const values = Array.from(
    host.querySelectorAll("option"),
    (option) => option.value
  )
  expect(values).not.toContain("eye-camera")
  expect(values).toContain("front-camera")
  const connect = host.querySelector<HTMLButtonElement>(
    '[aria-label="Connect front camera"]'
  )!
  await act(async () => connect.click())
  expect(head.start).toHaveBeenCalledWith("front-camera")
})

test("with only an eye camera, Connect is disabled and Skip remains available", async () => {
  document.body.append(host)
  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(HeadControls, {
        head,
        devices: [
          { deviceId: "eye-camera", label: "Eye camera" },
        ] as MediaDeviceInfo[],
        eyeDeviceId: "eye-camera",
        simulated: false,
        onConfigurationChange: () => {},
        onSkip: () => {},
      })
    )
  })
  const connect = host.querySelector<HTMLButtonElement>(
    '[aria-label="Connect front camera"]'
  )!
  const skip = host.querySelector<HTMLButtonElement>(
    '[aria-label="Skip head tracking"]'
  )!
  expect(connect.disabled).toBe(true)
  expect(skip.disabled).toBe(false)
  expect(host.textContent).toContain("Needs a second camera")
})

test("an active front camera displays a mirrored direction vector and hides it when the face is lost", async () => {
  const pose = {
    id: 1,
    timestamp: 1000,
    position: [0, 0, -50],
    rotation: [0, 0.2, 0],
    previewAnchor: [0.25, 0.4],
  }
  const active = {
    ...head,
    enabled: true,
    status: "tracking",
    pose,
    latest: { current: pose },
  } as HeadTrackingController
  document.body.append(host)
  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(HeadControls, {
        head: active,
        devices: [],
        eyeDeviceId: "",
        simulated: false,
        onConfigurationChange: () => {},
        onSkip: () => {},
      })
    )
  })
  const arrow = host.querySelector<SVGLineElement>(
    '[data-head-vector="forward"]'
  )!
  expect(arrow).not.toBeNull()
  expect(Number(arrow.getAttribute("x1"))).toBeCloseTo(120)
  expect(Number(arrow.getAttribute("x2"))).toBeLessThan(
    Number(arrow.getAttribute("x1"))
  )
  expect(
    host.querySelector('[aria-label="Head direction vector"]')
  ).not.toBeNull()
  await act(async () =>
    root.render(
      createElement(HeadControls, {
        head: { ...active, status: "lost", pose: null },
        devices: [],
        eyeDeviceId: "",
        simulated: false,
        onConfigurationChange: () => {},
        onSkip: () => {},
      })
    )
  )
  expect(host.querySelector('[data-head-vector="forward"]')).toBeNull()
})
