import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { act, createElement } from "../../apps/web/node_modules/react"
import { createRoot } from "../../apps/web/node_modules/react-dom/client"
import { RemoteCalibrationOverlay } from "../../apps/web/src/features/remote-eye-tracking/calibration-overlay"
import type { RemoteObservation } from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"
import type { RemoteCalibrationOverlayProps } from "../../apps/web/src/features/remote-eye-tracking/calibration-overlay.types"

if (typeof document === "undefined") GlobalRegistrator.register()
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let now = 0
let nextFrame = 0
const frames = new Map<number, FrameRequestCallback>()
const latest = { current: null as RemoteObservation | null }
const complete = mock<RemoteCalibrationOverlayProps["onComplete"]>(() => {})
const cancel = mock(() => {})
const host = document.createElement("div")
let root: ReturnType<typeof createRoot>
let restoreClock = () => {}

beforeEach(() => {
  now = 0
  frames.clear()
  latest.current = null
  complete.mockClear()
  cancel.mockClear()
  const clock = spyOn(performance, "now").mockImplementation(() => now)
  const request = spyOn(globalThis, "requestAnimationFrame").mockImplementation(
    (callback) => {
      frames.set(++nextFrame, callback)
      return nextFrame
    }
  )
  const cancelFrame = spyOn(
    globalThis,
    "cancelAnimationFrame"
  ).mockImplementation((id) => {
    frames.delete(id)
  })
  restoreClock = () => {
    clock.mockRestore()
    request.mockRestore()
    cancelFrame.mockRestore()
  }
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  restoreClock()
})

async function render(extended = false) {
  await act(async () =>
    root.render(
      createElement(RemoteCalibrationOverlay, {
        latest,
        extended,
        calibration: null,
        onComplete: complete,
        onCancel: cancel,
      })
    )
  )
}

async function start() {
  const button = host.querySelector<HTMLButtonElement>(".eye-calibration-start")
  expect(button).not.toBeNull()
  await act(async () => button!.click())
}

async function tick(elapsed: number, reason: string | null = null) {
  now += elapsed
  latest.current = {
    timestamp: now,
    width: 640,
    height: 480,
    // Deliberately unchanged at every target: remote capture must not add a direction gate.
    feature: [0.1, 0.2],
    quality: 0.9,
    reason,
    eyes: [],
    faceBox: null,
    basePoint: null,
    pose: {
      kind: "face",
      yaw: 0,
      pitch: 0,
      roll: 0,
      x: 0.5,
      y: 0.5,
      scale: 0.2,
    },
    method: "Synthetic eye frames",
    processingMs: 1,
  }
  const queued = [...frames.values()]
  frames.clear()
  await act(async () => {
    for (const callback of queued) callback(now)
  })
}

test("remote capture waits for its start instruction and can be cancelled before sampling", async () => {
  await render()
  await tick(5000)
  expect(host.querySelector("h2")?.textContent).toContain("until it pops")
  expect(host.querySelector(".remote-target")).toBeNull()
  expect(complete).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(
    host.querySelector(".eye-calibration-start")
  )
  await act(async () =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
  )
  expect(cancel).toHaveBeenCalledTimes(1)
})

test("the pill advances only with accepted frames, shows blink guidance by the dot, and pops before moving", async () => {
  await render()
  await start()
  await tick(700)
  const pill = () => host.querySelector<HTMLElement>(".eye-calibration-pill")!
  const before = pill().style.backgroundColor
  await tick(100, "blink")
  expect(pill().style.backgroundColor).toBe(before)
  const feedback = host.querySelector<HTMLElement>(".eye-calibration-feedback")!
  expect(feedback.textContent).toContain("Open your eyes")
  expect(feedback.style.top).toContain("50%")
  for (let i = 0; i < 17; i++) await tick(50)
  expect(pill().style.backgroundColor).not.toBe(before)
  expect(host.querySelector(".is-bursting")).not.toBeNull()
  expect(host.querySelector<HTMLElement>(".remote-target")?.style.left).toBe(
    "50%"
  )
  await tick(200)
  expect(host.querySelector(".is-bursting")).not.toBeNull()
  await tick(60)
  expect(host.querySelector<HTMLElement>(".remote-target")?.style.left).toBe(
    "10%"
  )
  expect(host.querySelector<HTMLElement>(".remote-target")?.style.top).toBe(
    "10%"
  )
  expect(host.querySelector(".is-bursting")).toBeNull()
  expect(complete).not.toHaveBeenCalled()
})

test.each([false, true])(
  "remote capture preserves its 9-target order, 18 samples per target, and optional second pass: %p",
  async (extended) => {
    await render(extended)
    await start()
    for (
      let frame = 0;
      frame < 650 && complete.mock.calls.length === 0;
      frame++
    ) {
      await tick(100)
    }
    expect(complete).toHaveBeenCalledTimes(1)
    const samples = complete.mock.calls[0][0]
    expect(samples).toHaveLength(extended ? 324 : 162)
    const expected = [
      [0.5, 0.5],
      [0.1, 0.1],
      [0.5, 0.1],
      [0.9, 0.1],
      [0.9, 0.5],
      [0.9, 0.9],
      [0.5, 0.9],
      [0.1, 0.9],
      [0.1, 0.5],
    ]
    for (let index = 0; index < samples.length; index++) {
      expect(samples[index].target).toEqual(
        expected[Math.floor(index / 18) % 9]
      )
      expect(samples[index].targetId).toBe(Math.floor(index / 18))
    }
    await tick(1000)
    expect(complete).toHaveBeenCalledTimes(1)
  }
)

test("timeout keeps retry guidance by the target and restarts sampling cleanly", async () => {
  await render()
  await start()
  await tick(21000, "face-not-found")
  const feedback = host.querySelector(".eye-calibration-feedback")!
  expect(feedback.textContent).toContain("Not enough samples")
  const retry = feedback.querySelector<HTMLButtonElement>(
    '[aria-label="Retry capture"]'
  )!
  expect(retry).not.toBeNull()
  await act(async () => retry.click())
  expect(
    host.querySelector(".eye-calibration-feedback")?.textContent
  ).not.toContain("Not enough samples")
  await tick(700)
  expect(host.querySelector(".eye-calibration-pill")).not.toBeNull()
  expect(complete).not.toHaveBeenCalled()
})
