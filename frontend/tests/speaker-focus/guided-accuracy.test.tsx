import { expect, spyOn, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { act, createElement } from "../../apps/web/node_modules/react"
import { createRoot } from "../../apps/web/node_modules/react-dom/client"
import * as TrackerHook from "../../apps/web/src/features/eye-tracking/use-tracker"
import type { TrackerController } from "../../apps/web/src/features/eye-tracking/use-tracker.types"
import * as CameraHook from "../../apps/web/src/features/scene-eye-tracking/use-scene-camera"
import * as HandHook from "../../apps/web/src/features/scene-eye-tracking/use-hand-tracker"
import { SceneCamera } from "../../apps/web/src/features/scene-eye-tracking/scene-camera"
import { SceneSession } from "../../apps/web/src/features/scene-eye-tracking/scene-session"
import { saveSceneProfile } from "../../apps/web/src/features/scene-eye-tracking/calibration-profiles"
import { DEFAULT_CAMERA_TRANSFORM } from "../../apps/web/src/features/eye-tracking/camera-transform"
import { EyeTrackingWorkspace } from "../../apps/web/src/screens/eye-tracking-workspace"
import { calibrate, collectValidation } from "../scene-eye-tracking/fixtures"

if (typeof document === "undefined") {
  GlobalRegistrator.register()
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

test("guided Focus accepts an unchecked or failed mapping without falsifying accuracy", async () => {
  localStorage.clear()
  let now = 1000
  const clock = spyOn(performance, "now").mockImplementation(() => now)
  const rectangle = spyOn(
    HTMLElement.prototype,
    "getBoundingClientRect"
  ).mockReturnValue({
    x: 0,
    y: 0,
    width: 800,
    height: 450,
    top: 0,
    left: 0,
    bottom: 450,
    right: 800,
    toJSON() {},
  })
  const { s } = calibrate()
  saveSceneProfile(
    "Unchecked mapping",
    {
      calibration: s.getSnapshot().calibration!,
      method: "hand",
      offset: [0, 0],
      delayMs: 0,
      unverified: true,
    },
    {
      trackerFormat: "spatial",
      orientation: {
        eye: DEFAULT_CAMERA_TRANSFORM,
        scene: DEFAULT_CAMERA_TRANSFORM,
      },
    }
  )
  const camera = new SceneCamera()
  const frame = {
    id: 1,
    timestamp: 1000,
    width: 640,
    height: 480,
    generation: 1,
  }
  camera.latest = frame
  const tracker: TrackerController = {
    transform: DEFAULT_CAMERA_TRANSFORM,
    setTransform() {},
    connection: "live",
    reconnectAttempt: 0,
    dimensions: { width: 640, height: 480 },
    settings: { ...TrackerHook.DEFAULT_SETTINGS, locked: true },
    configure() {},
    frame: {
      id: 1,
      timestamp: 1000,
      width: 640,
      height: 480,
      roi: { x: 0, y: 0, width: 640, height: 480 },
      detection: {
        ellipse: {
          center: [320, 240],
          major: 30,
          minor: 20,
          angle: 0,
          confidence: 0.95,
        },
        tracking: "tracking",
        seed: null,
        contour: [],
        refined: [],
        previews: [],
        selected: 0,
        reason: "",
      },
      model: null,
      gaze: { origin: [0, 0, 0], pupil: [0, 0, -1], direction: [0, 0, -1] },
      processingMs: 1,
    },
    latest: { current: null },
    source: { kind: "camera", name: "Eye camera", key: "eye" },
    sourceCanvas: { current: document.createElement("canvas") },
    busy: false,
    error: "",
    setError() {},
    engineReady: true,
    devices: [],
    async startCamera() {},
    async startNetworkStream() {},
    async startVideo() {},
    startSample() {},
    stop() {},
    setSampleTarget() {},
    setPreviewMasksEnabled() {},
    setBlink() {},
  }
  const trackerHook = spyOn(TrackerHook, "useTracker").mockReturnValue(tracker)
  const cameraHook = spyOn(CameraHook, "useSceneCamera").mockReturnValue({
    camera,
    ...camera.getSnapshot(),
    connection: "live",
    source: {
      kind: "camera",
      key: "scene",
      deviceId: "scene",
      name: "Scene camera",
    },
    frame,
  })
  const handHook = spyOn(HandHook, "useHandTracker").mockReturnValue({
    status: "ready",
    error: "",
    hand: null,
    previewHand: null,
    delegate: "GPU",
    inferenceMs: 1,
    retry() {},
  })
  let installed: SceneSession | null = null
  const restore = SceneSession.prototype.restoreCalibration
  const restoreSpy = spyOn(
    SceneSession.prototype,
    "restoreCalibration"
  ).mockImplementation(function (profile) {
    installed = this
    restore.call(this, profile)
  })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const steps = () =>
    Array.from(
      host.querySelectorAll<HTMLButtonElement>(
        'nav[aria-label="Setup steps"] button'
      )
    )
  try {
    await act(async () =>
      root.render(
        createElement(EyeTrackingWorkspace, {
          sceneMode: true,
          speakerMode: true,
        })
      )
    )
    await act(async () => steps()[4]!.click())
    expect(installed).not.toBeNull()
    expect(steps()[5]!.disabled).toBe(false)
    expect(steps()[6]!.disabled).toBe(false)
    await act(async () => steps()[4]!.click())
    await act(async () => steps()[5]!.click())
    expect(steps()[5]!.getAttribute("aria-current")).toBe("step")
    expect(
      host.querySelector('section[aria-label="Calibrated speaker focus"]')
    ).toBeNull()
    await act(async () => {
      installed!.startCapture("validation")
      const result = collectValidation(installed!, 0, () => [0.08, -0.06])
      now = result.time + 50
      frame.id = result.id + 1
      frame.timestamp = now
      installed!.addEye(
        {
          id: frame.id,
          timestamp: now,
          feature: [0, 0],
          confidence: 0.95,
          valid: true,
        },
        now
      )
      installed!.measure(frame, now, true)
    })
    expect(installed!.getSnapshot().validation?.passed).toBe(false)
    expect(steps()[6]!.disabled).toBe(false)
    const failedValidation = installed!.getSnapshot().validation
    const focusButton = Array.from(
      host.querySelectorAll<HTMLButtonElement>("button")
    ).find((button) => button.textContent?.trim() === "Continue to focus")!
    expect(focusButton.disabled).toBe(false)
    await act(async () => focusButton.click())
    expect(steps()[6]!.getAttribute("aria-current")).toBe("step")
    expect(
      host.querySelector('section[aria-label="Calibrated speaker focus"]')
    ).not.toBeNull()
    expect(host.textContent).toContain("Accuracy not verified")
    expect(installed!.getSnapshot().validation).toBe(failedValidation)
    expect(host.querySelector(".gaze-bubble")).not.toBeNull()
    const originalTimestamp = installed!.getSnapshot().measurement!.timestamp
    await act(async () => steps()[5]!.click())
    await act(async () => {
      const adjustment = host.querySelector<HTMLInputElement>(
        'input[aria-label="Gaze offset X (pixels)"]'
      )!
      adjustment.value = "25.6"
      adjustment.dispatchEvent(new Event("input", { bubbles: true }))
      now += 10
      installed!.measure(frame, now)
    })
    expect(installed!.getSnapshot().offset[0]).toBeCloseTo(0.04)
    await act(async () => steps()[6]!.click())
    const bubble = host.querySelector<HTMLElement>(".gaze-bubble")!
    expect(bubble).not.toBeNull()
    expect(parseFloat(bubble.style.left)).toBeCloseTo(54)
    expect(installed!.getSnapshot().measurement?.timestamp).toBe(
      originalTimestamp
    )
    expect(installed!.getSnapshot().validation).toBe(failedValidation)
    await act(async () => steps()[5]!.click())
    await act(async () => {
      const adjustment = host.querySelector<HTMLInputElement>(
        'input[aria-label="Gaze offset X (pixels)"]'
      )!
      adjustment.value = "0"
      adjustment.dispatchEvent(new Event("input", { bubbles: true }))
    })
    const recovery = host.querySelector(".scene-validation-recovery")!
    expect(recovery).not.toBeNull()
    expect(recovery.closest("details")?.open).toBe(true)
    const correction = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Apply suggested offset and check accuracy"]'
    )!
    expect(correction.disabled).toBe(false)
    await act(async () => correction.click())
    expect(installed!.getSnapshot().capture).toBe("validation")
    expect(steps()[6]!.disabled).toBe(false)
    await act(async () => steps()[6]!.click())
    expect(installed!.getSnapshot().capture).toBeNull()
    expect(steps()[6]!.getAttribute("aria-current")).toBe("step")
    await act(async () => steps()[5]!.click())
    await act(async () => installed!.startCapture("validation"))
    await act(async () => {
      collectValidation(installed!, 500, () => [0.08, -0.06])
    })
    expect(installed!.getSnapshot().validation?.passed).toBe(true)
    expect(steps()[6]!.disabled).toBe(false)
    const continueButton = Array.from(
      host.querySelectorAll<HTMLButtonElement>("button")
    ).find((button) => button.textContent?.trim() === "Continue to focus")!
    expect(continueButton.disabled).toBe(false)
    await act(async () => continueButton.click())
    expect(
      host.querySelector('section[aria-label="Calibrated speaker focus"]')
    ).not.toBeNull()
  } finally {
    await act(async () => root.unmount())
    host.remove()
    clock.mockRestore()
    rectangle.mockRestore()
    restoreSpy.mockRestore()
    handHook.mockRestore()
    cameraHook.mockRestore()
    trackerHook.mockRestore()
    camera.dispose()
    localStorage.clear()
  }
})
