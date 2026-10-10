import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { act, createElement, Profiler } from "../../apps/web/node_modules/react"
import { createRoot } from "../../apps/web/node_modules/react-dom/client"
import { RemoteCalibrationOverlay } from "../../apps/web/src/features/remote-eye-tracking/calibration-overlay"
import { AdaptiveCalibrationOverlay } from "../../apps/web/src/features/remote-eye-tracking/adaptive-calibration-overlay"
import type { AdaptiveCalibrationOverlayProps } from "../../apps/web/src/features/remote-eye-tracking/adaptive-calibration-overlay.types"
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

async function render() {
  await act(async () =>
    root.render(
      createElement(RemoteCalibrationOverlay, {
        latest,
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

async function tick(
  elapsed: number,
  reason: string | null = null,
  networkReadings = false,
  moving = false,
  errorX = 0,
  spatialFeature = false,
  missingBasePoint = false
) {
  now += elapsed
  const dot = host.querySelector<HTMLElement>(".remote-target")
  const target = [
    parseFloat(dot?.style.left ?? "50") / 100,
    parseFloat(dot?.style.top ?? "50") / 100,
  ]
  const turn = moving ? Math.sin(now / 350) : 0
  const tilt = moving ? Math.sin(now / 470) : 0
  const roll = moving ? Math.sin(now / 620) : 0
  const leanX = moving ? Math.sin(now / 800) : 0
  const leanY = moving ? Math.sin(now / 1100) : 0
  const depth = moving ? Math.sin(now / 1450) : 0
  latest.current = {
    timestamp: now,
    width: 640,
    height: 480,
    // Deliberately unchanged at every target: remote capture must not add a direction gate.
    feature:
      networkReadings || spatialFeature
        ? [(target[0]! - 0.5) / 0.5, (target[1]! - 0.5) / 0.5, turn * 0.05]
        : [0.1, 0.2],
    quality: 0.9,
    reason,
    eyes: [],
    faceBox: null,
    basePoint:
      networkReadings && !missingBasePoint
        ? [
            (target[0]! - 0.03) / 1.1 + errorX + turn * 0.025 + leanX * 0.012,
            (target[1]! + 0.02) / 0.9 + tilt * 0.02 + leanY * 0.01,
          ]
        : spatialFeature && !networkReadings
          ? [target[0]!, target[1]!]
          : null,
    cameraOcularOffsets: spatialFeature
      ? [0.5 - target[0]!, target[1]! - 0.5, 0.5 - target[0]!, target[1]! - 0.5]
      : undefined,
    baseModelVersion: networkReadings ? "blazegaze-v1" : undefined,
    pose: {
      kind: "face",
      yaw: turn * 0.05,
      pitch: tilt * 0.05,
      roll: roll * 0.05,
      x: 0.5 + leanX * 0.015,
      y: 0.5 + leanY * 0.015,
      scale: 0.2 * Math.exp(depth * 0.05),
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

test("unchanged capture progress does not rerender at display refresh rate", async () => {
  const commits = mock(() => {})
  await act(async () => {
    root.render(
      createElement(
        Profiler,
        { id: "capture", onRender: commits },
        createElement(RemoteCalibrationOverlay, {
          latest,
          calibration: null,
          onComplete: complete,
          onCancel: cancel,
        })
      )
    )
  })
  await start()
  await tick(700, "face-not-found")
  commits.mockClear()
  for (let frame = 0; frame < 30; frame++) {
    await tick(16, "face-not-found")
  }
  expect(commits.mock.calls.length).toBeLessThanOrEqual(1)
  expect(
    host.querySelector(".eye-calibration-feedback")?.textContent
  ).toContain("Face the camera")
  await tick(21000, "face-not-found")
  expect(
    host.querySelector(".eye-calibration-feedback")?.textContent
  ).toContain("Not enough samples")
})

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

test.each(["complete", "timeout"] as const)(
  "finished capture ignores late resize events: %s",
  async (outcome) => {
    const timeout = mock<RemoteCalibrationOverlayProps["onComplete"]>(() => {})
    const height = window.innerHeight
    const descriptor = Object.getOwnPropertyDescriptor(window, "innerHeight")
    try {
      await act(async () =>
        root.render(
          createElement(RemoteCalibrationOverlay, {
            latest,
            trainingTargets: [[0.5, 0.5]],
            autoStart: true,
            onComplete: complete,
            onTargetTimeout: timeout,
            onCancel: cancel,
          })
        )
      )
      if (outcome === "complete") {
        for (let frame = 0; frame < 40; frame++) {
          await tick(100)
        }
        expect(complete).toHaveBeenCalledTimes(1)
      } else {
        await tick(21000, "face-not-found")
        expect(timeout).toHaveBeenCalledTimes(1)
      }
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: height - 50,
      })
      await act(async () => window.dispatchEvent(new Event("resize")))
      expect(host.textContent).not.toContain("Window size changed")
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: height,
      })
      await act(async () => window.dispatchEvent(new Event("resize")))
      await tick(21000, "face-not-found")
      expect(complete.mock.calls.length + timeout.mock.calls.length).toBe(1)
      expect(cancel).not.toHaveBeenCalled()
    } finally {
      if (descriptor) {
        Object.defineProperty(window, "innerHeight", descriptor)
      } else {
        Reflect.deleteProperty(window, "innerHeight")
      }
    }
  }
)

test("the pill advances only with accepted frames, shows blink guidance by the dot, and pops before moving", async () => {
  await render()
  await start()
  await tick(700)
  const pill = () => host.querySelector<HTMLElement>(".eye-calibration-pill")!
  const before = pill().style.backgroundColor
  await tick(100, "blink")
  expect(pill().style.backgroundColor).toBe(before)
  const feedback = host.querySelector<HTMLElement>(".eye-calibration-feedback")!
  expect(feedback.textContent).toContain("Eyes closed or partly covered")
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
    "4%"
  )
  expect(host.querySelector<HTMLElement>(".remote-target")?.style.top).toBe(
    "4%"
  )
  expect(host.querySelector(".is-bursting") !== null).toBe(false)
  expect(complete).not.toHaveBeenCalled()
})

test("remote capture keeps the nine-target order and 18 accepted samples per dot", async () => {
  await render()
  await start()
  for (let frame = 0; frame < 350 && !complete.mock.calls.length; frame++)
    await tick(100)
  expect(complete).toHaveBeenCalledTimes(1)
  const samples = complete.mock.calls[0][0]
  expect(samples).toHaveLength(162)
  const expected = [
    [0.5, 0.5],
    [0.04, 0.04],
    [0.96, 0.04],
    [0.5, 0.96],
    [0.04, 0.96],
    [0.5, 0.04],
    [0.96, 0.96],
    [0.04, 0.5],
    [0.96, 0.5],
  ]
  for (let index = 0; index < samples.length; index++) {
    expect(samples[index].target).toEqual(expected[Math.floor(index / 18)])
    expect(samples[index].targetId).toBe(Math.floor(index / 18))
  }
  await tick(1000)
  expect(complete).toHaveBeenCalledTimes(1)
})

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

test("retry retains completed targets and records rejected attempts", async () => {
  await render()
  await start()
  await tick(700)
  for (let frame = 0; frame < 17; frame++) await tick(50)
  await tick(260)
  await tick(21000, "face-not-found")
  const retry = host.querySelector<HTMLButtonElement>(
    '[aria-label="Retry capture"]'
  )!
  await act(async () => retry.click())
  expect(host.querySelector<HTMLElement>(".remote-target")?.style.left).toBe(
    "4%"
  )
  for (let frame = 0; frame < 400 && complete.mock.calls.length === 0; frame++)
    await tick(100)
  expect(complete).toHaveBeenCalledTimes(1)
  expect(complete.mock.calls[0][0]).toHaveLength(162)
  expect(
    complete.mock.calls[0][2]?.some(
      (sample) => sample.observation.reason === "face-not-found"
    )
  ).toBe(true)
})

test("continuation stages start without another click and capture only requested targets", async () => {
  await act(async () =>
    root.render(
      createElement(RemoteCalibrationOverlay, {
        latest,
        calibration: null,
        autoStart: true,
        trainingTargets: [[0.5, 0.5]],
        onComplete: complete,
        onCancel: cancel,
      })
    )
  )
  expect(host.querySelector(".eye-calibration-start")).toBeNull()
  for (let frame = 0; frame < 40 && !complete.mock.calls.length; frame++) {
    await tick(100)
  }
  expect(complete.mock.calls[0]?.[0]).toHaveLength(18)
})

test("startup viewport changes settle before collecting at the new geometry", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, "innerHeight")
  const height = window.innerHeight
  try {
    await render()
    await start()
    await tick(100)
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: height - 60,
    })
    await act(async () => window.dispatchEvent(new Event("resize")))
    expect(cancel).not.toHaveBeenCalled()
    for (let frame = 0; frame < 400 && !complete.mock.calls.length; frame++) {
      await tick(100)
    }
    expect(complete.mock.calls[0]?.[0]).toHaveLength(162)
    expect(complete.mock.calls[0]?.[1].height).toBe(height - 60)
  } finally {
    if (descriptor) Object.defineProperty(window, "innerHeight", descriptor)
    else Reflect.deleteProperty(window, "innerHeight")
  }
})

test("a mid-capture viewport change pauses sampling and resumes without losing completed dots", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, "innerHeight")
  const height = window.innerHeight
  try {
    await render()
    await start()
    await tick(700)
    for (let frame = 0; frame < 17; frame++) await tick(50)
    await tick(260)
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: height - 60,
    })
    await act(async () => window.dispatchEvent(new Event("resize")))
    expect(cancel).not.toHaveBeenCalled()
    expect(host.textContent).toContain("Window size changed")
    for (let frame = 0; frame < 240; frame++) await tick(100)
    expect(complete).not.toHaveBeenCalled()
    expect(host.querySelector<HTMLElement>(".remote-target")?.style.left).toBe(
      "4%"
    )
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: height,
    })
    await act(async () => window.dispatchEvent(new Event("resize")))
    for (let frame = 0; frame < 400 && !complete.mock.calls.length; frame++)
      await tick(100)
    expect(complete.mock.calls[0]?.[0]).toHaveLength(162)
    expect(complete.mock.calls[0]?.[1].height).toBe(height)
    expect(cancel).not.toHaveBeenCalled()
  } finally {
    if (descriptor) Object.defineProperty(window, "innerHeight", descriptor)
    else Reflect.deleteProperty(window, "innerHeight")
  }
})

test("restarting at a new size explicitly clears old-coordinate holds", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, "innerHeight")
  const height = window.innerHeight
  try {
    await render()
    await start()
    await tick(700)
    for (let frame = 0; frame < 17; frame++) await tick(50)
    await tick(260)
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: height - 60,
    })
    await act(async () => window.dispatchEvent(new Event("resize")))
    const restartedAt = now
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Restart calibration at this size"]'
        )!
        .click()
    )
    expect(host.querySelector<HTMLElement>(".remote-target")?.style.left).toBe(
      "50%"
    )
    for (let frame = 0; frame < 400 && !complete.mock.calls.length; frame++)
      await tick(100)
    expect(complete.mock.calls[0]?.[0]).toHaveLength(162)
    expect(
      complete.mock.calls[0]?.[0][0]?.observation.timestamp
    ).toBeGreaterThan(restartedAt)
    expect(complete.mock.calls[0]?.[1].height).toBe(height - 60)
    expect(cancel).not.toHaveBeenCalled()
  } finally {
    if (descriptor) Object.defineProperty(window, "innerHeight", descriptor)
    else Reflect.deleteProperty(window, "innerHeight")
  }
})

async function renderUnified(
  onComplete: AdaptiveCalibrationOverlayProps["onComplete"],
  headMovement = false,
  mode: AdaptiveCalibrationOverlayProps["mode"] = "webcam"
) {
  await act(async () =>
    root.render(
      createElement(AdaptiveCalibrationOverlay, {
        latest,
        mode,
        headMovement,
        onComplete,
        onCancel: cancel,
      })
    )
  )
}

test.each(["webcam", "mobile", "ir"] as const)(
  "unified %s capture fits all nine spatial targets before optional validation",
  async (mode) => {
    const accepted = mock<AdaptiveCalibrationOverlayProps["onComplete"]>(
      () => {}
    )
    await renderUnified(accepted, false, mode)
    await start()
    for (let frame = 0; frame < 350 && !accepted.mock.calls.length; frame++) {
      await tick(100, null, mode !== "ir", false, 0, true)
      expect(host.textContent).not.toContain("Check accuracy")
    }
    expect(accepted).toHaveBeenCalledTimes(1)
    const result = accepted.mock.calls[0][0]
    const targets = result.samples.filter((_, index) => index % 18 === 0)
    expect(targets.map((sample) => sample.target)).toEqual([
      [0.5, 0.5],
      [0.04, 0.04],
      [0.96, 0.04],
      [0.5, 0.96],
      [0.04, 0.96],
      [0.5, 0.04],
      [0.96, 0.96],
      [0.04, 0.5],
      [0.96, 0.5],
    ])
    expect(result.samples).toHaveLength(162)
    expect(result.model.targetCount).toBe(9)
    expect(result.model.sampleCount).toBe(162)
    expect(result.model.inputKind).toBe(
      mode === "ir" ? undefined : "base-point"
    )
    if (mode !== "ir") expect(result.model.spatialBasis).toBe("affine")
    expect(result.validation).toBeNull()
    expect(result.accuracyVerified).toBe(false)
    expect(result.headMovementLearned).toBe(false)
    await tick(1000, null, mode !== "ir", false, 0, true)
    expect(accepted).toHaveBeenCalledTimes(1)
  }
)

test("head compensation learns one center hold after the nine spatial targets without claiming accuracy", async () => {
  const accepted = mock<AdaptiveCalibrationOverlayProps["onComplete"]>(() => {})
  await renderUnified(accepted, true)
  await start()
  for (
    let frame = 0;
    frame < 350 && !host.textContent?.includes("Head compensation");
    frame++
  ) {
    await tick(100, null, true)
  }
  expect(host.textContent).toContain("Head compensation")
  expect(host.textContent).toContain(
    "Keep watching. Repeat gentle turns, nods and tilts."
  )
  const headStartedAt = now
  await tick(700, null, true, true)
  for (let frame = 0; frame < 48; frame++) await tick(16, null, true, true)
  expect(accepted).not.toHaveBeenCalled()
  expect(host.querySelector(".is-bursting")).toBeNull()
  while (now - headStartedAt < 5900) await tick(100, null, true, true)
  expect(accepted).not.toHaveBeenCalled()
  expect(host.querySelector<HTMLElement>(".remote-target")?.style.left).toBe(
    "50%"
  )
  expect(host.querySelector<HTMLElement>(".remote-target")?.style.top).toBe(
    "50%"
  )
  for (let frame = 0; frame < 150 && !accepted.mock.calls.length; frame++)
    await tick(100, null, true, true)
  expect(accepted).toHaveBeenCalledTimes(1)
  const result = accepted.mock.calls[0][0]
  expect(result.model.sampleCount).toBe(162)
  expect(result.model.targetCount).toBe(9)
  expect(result.headMovementLearned).toBe(true)
  expect(result.headCorrectionUpdated).toBe(true)
  expect(result.headSamples.length).toBeGreaterThanOrEqual(48)
  expect(result.model.headCorrection).toBeDefined()
  expect(result.validation).toBeNull()
  expect(result.accuracyVerified).toBe(false)
  await tick(21000, null, true, true)
  expect(accepted).toHaveBeenCalledTimes(1)
})

test("head compensation keeps all accepted spatial dots and the original viewport across a resize pause", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, "innerHeight")
  const height = window.innerHeight
  const accepted = mock<AdaptiveCalibrationOverlayProps["onComplete"]>(() => {})
  try {
    await renderUnified(accepted, true)
    await start()
    for (
      let frame = 0;
      frame < 350 && !host.textContent?.includes("Head compensation");
      frame++
    )
      await tick(100, null, true)
    expect(host.textContent).toContain("Head compensation")
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: height - 60,
    })
    await act(async () => window.dispatchEvent(new Event("resize")))
    for (let frame = 0; frame < 30; frame++) await tick(100, null, true, true)
    expect(host.textContent).toContain("Window size changed")
    expect(accepted).not.toHaveBeenCalled()
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: height,
    })
    await act(async () => window.dispatchEvent(new Event("resize")))
    for (let frame = 0; frame < 180 && !accepted.mock.calls.length; frame++)
      await tick(100, null, true, true)
    expect(accepted).toHaveBeenCalledTimes(1)
    expect(accepted.mock.calls[0][0].viewport.height).toBe(height)
    expect(accepted.mock.calls[0][0].model.sampleCount).toBe(162)
    expect(accepted.mock.calls[0][0].headMovementLearned).toBe(true)
    expect(cancel).not.toHaveBeenCalled()
  } finally {
    if (descriptor) Object.defineProperty(window, "innerHeight", descriptor)
    else Reflect.deleteProperty(window, "innerHeight")
  }
})

test.each([null, "face-not-found"])(
  "unsuccessful head learning completes with the spatial model and no repeat or retry trap: %p",
  async (reason) => {
    const accepted = mock<AdaptiveCalibrationOverlayProps["onComplete"]>(
      () => {}
    )
    await renderUnified(accepted, true, "mobile")
    await start()
    for (
      let frame = 0;
      frame < 350 && !host.textContent?.includes("Head compensation");
      frame++
    )
      await tick(100, null, true)
    expect(host.textContent).toContain("Head compensation")
    for (let frame = 0; frame < 240 && !accepted.mock.calls.length; frame++)
      await tick(100, reason, true)
    expect(accepted).toHaveBeenCalledTimes(1)
    const result = accepted.mock.calls[0][0]
    expect(result.headMovementLearned).toBe(false)
    expect(result.model.headCorrection).toBeUndefined()
    expect(result.model.sampleCount).toBe(162)
    expect(result.model.targetCount).toBe(9)
    expect(result.validation).toBeNull()
    expect(result.accuracyVerified).toBe(false)
    expect(host.querySelector('[aria-label="Retry capture"]')).toBeNull()
    await tick(30000, reason, true)
    expect(accepted).toHaveBeenCalledTimes(1)
  }
)

test("legacy RGB features remain usable through the unified nine-point capture", async () => {
  const accepted = mock<AdaptiveCalibrationOverlayProps["onComplete"]>(() => {})
  await renderUnified(accepted)
  await start()
  for (let frame = 0; frame < 350 && !accepted.mock.calls.length; frame++)
    await tick(100, null, false, false, 0, true)
  expect(accepted).toHaveBeenCalledTimes(1)
  expect(accepted.mock.calls[0][0].model.inputKind).toBeUndefined()
  expect(accepted.mock.calls[0][0].model.targetCount).toBe(9)
  expect(accepted.mock.calls[0][0].validation).toBeNull()
})

test("an unchanged eye axis pauses the current dot before it can contaminate the mapping", async () => {
  const accepted = mock<AdaptiveCalibrationOverlayProps["onComplete"]>(() => {})
  await renderUnified(accepted)
  await start()
  for (
    let frame = 0;
    frame < 350 && host.querySelector(".remote-target");
    frame++
  ) {
    const dot = host.querySelector<HTMLElement>(".remote-target")!
    const x = parseFloat(dot.style.left) / 100
    await tick(100, null, true, false, 0.5 - (x - 0.03) / 1.1)
  }
  expect(accepted).not.toHaveBeenCalled()
  expect(host.textContent).toContain("Not enough samples")
  expect(host.querySelector<HTMLElement>(".remote-target")?.style.left).toBe(
    "4%"
  )
  expect(host.querySelector<HTMLElement>(".remote-target")?.style.top).toBe(
    "4%"
  )
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Retry capture"]')!
      .click()
  )
  expect(host.querySelector(".remote-target")).not.toBeNull()
  expect(host.querySelector(".eye-calibration-start")).toBeNull()
  for (let frame = 0; frame < 350 && !accepted.mock.calls.length; frame++)
    await tick(100, null, true)
  expect(accepted).toHaveBeenCalledTimes(1)
  expect(accepted.mock.calls[0][0].model.sampleCount).toBe(162)
  expect(accepted.mock.calls[0][0].validation).toBeNull()
})

test("fast cameras cannot finish a spatial hold from 18 rushed frames", async () => {
  const accepted = mock<AdaptiveCalibrationOverlayProps["onComplete"]>(() => {})
  await renderUnified(accepted)
  await start()
  await tick(700, null, true)
  for (let frame = 0; frame < 18; frame++) await tick(16, null, true)
  expect(host.querySelector<HTMLElement>(".remote-target")?.style.left).toBe(
    "50%"
  )
  expect(host.querySelector(".is-bursting")).toBeNull()
  for (let frame = 0; frame < 22; frame++) await tick(16, null, true)
  await tick(300, null, true)
  expect(host.querySelector<HTMLElement>(".remote-target")?.style.left).toBe(
    "4%"
  )
  expect(accepted).not.toHaveBeenCalled()
})

test("a missing spatial location retries its hold without repeating previously accepted dots", async () => {
  const accepted = mock<AdaptiveCalibrationOverlayProps["onComplete"]>(() => {})
  await renderUnified(accepted)
  await start()
  for (
    let frame = 0;
    frame < 1000 && !host.querySelector('[aria-label="Retry capture"]');
    frame++
  ) {
    const dot = host.querySelector<HTMLElement>(".remote-target")!
    const missing = dot.style.left === "96%" && dot.style.top === "4%"
    await tick(100, null, true, false, 0, false, missing)
  }
  expect(host.querySelector('[aria-label="Retry capture"]')).not.toBeNull()
  expect(accepted).not.toHaveBeenCalled()
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Retry capture"]')!
      .click()
  )
  expect(host.querySelector<HTMLElement>(".remote-target")?.style.left).toBe(
    "96%"
  )
  expect(host.querySelector<HTMLElement>(".remote-target")?.style.top).toBe(
    "4%"
  )
  for (let frame = 0; frame < 350 && !accepted.mock.calls.length; frame++)
    await tick(100, null, true)
  expect(accepted).toHaveBeenCalledTimes(1)
  expect(accepted.mock.calls[0][0].model.sampleCount).toBe(162)
  expect(accepted.mock.calls[0][0].validation).toBeNull()
})

test.each([3, 7])(
  "nine-point capture completes with unique camera frames at %p FPS",
  async (fps) => {
    const accepted = mock<AdaptiveCalibrationOverlayProps["onComplete"]>(
      () => {}
    )
    await renderUnified(accepted, false, "mobile")
    await start()
    for (let frame = 0; frame < 450 && !accepted.mock.calls.length; frame++)
      await tick(1000 / fps, null, true)
    expect(accepted).toHaveBeenCalledTimes(1)
    expect(accepted.mock.calls[0][0].model.sampleCount).toBe(162)
    expect(accepted.mock.calls[0][0].validation).toBeNull()
  }
)

test("independent checks finish with missing readings instead of trapping the user on a dot", async () => {
  const accepted = mock<AdaptiveCalibrationOverlayProps["onComplete"]>(() => {})
  await renderUnified(accepted)
  await start()
  for (let frame = 0; frame < 350 && !accepted.mock.calls.length; frame++) {
    await tick(100, null, true)
  }
  expect(accepted).toHaveBeenCalledTimes(1)
  latest.current = null
  await act(async () =>
    root.render(
      createElement(RemoteCalibrationOverlay, {
        latest,
        calibration: accepted.mock.calls[0][0].model,
        targets: [
          [0.5, 0.15],
          [0.85, 0.5],
        ],
        autoStart: true,
        onComplete: complete,
        onCancel: cancel,
      })
    )
  )
  for (let frame = 0; frame < 220 && !complete.mock.calls.length; frame++) {
    now += 100
    const queued = [...frames.values()]
    frames.clear()
    await act(async () => queued.forEach((callback) => callback(now)))
  }
  expect(complete).toHaveBeenCalledTimes(1)
  expect(complete.mock.calls[0][0]).toHaveLength(0)
  const attempts = complete.mock.calls[0][2]!
  expect(new Set(attempts.map((sample) => sample.targetId)).size).toBe(2)
  expect(attempts.every((sample) => sample.observation.feature === null)).toBe(
    true
  )
  expect(host.querySelector('[aria-label="Retry capture"]')).toBeNull()
})

test("screen and remote setup sample near the perimeter instead of leaving a large border unmeasured", async () => {
  const screen =
    await import("../../apps/web/src/features/eye-tracking/calibration")
  const remote =
    await import("../../apps/web/src/features/remote-eye-tracking/calibration")
  for (const targets of [
    screen.CALIBRATION_TARGETS,
    remote.CALIBRATION_TARGETS,
  ]) {
    expect(targets).toHaveLength(9)
    expect(targets[0]).toEqual([0.5, 0.5])
    for (const axis of [0, 1]) {
      const values = targets.map((target) => target[axis]!)
      expect(Math.min(...values)).toBeLessThanOrEqual(0.04)
      expect(Math.max(...values)).toBeGreaterThanOrEqual(0.96)
    }
  }
})
