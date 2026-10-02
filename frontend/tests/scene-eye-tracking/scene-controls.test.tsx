import { afterEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import type { Root } from "../../apps/web/node_modules/react-dom/client"
import { SceneSession } from "../../apps/web/src/features/scene-eye-tracking/scene-session"
import { calibrate, collectValidation } from "./fixtures"
import type { HandTrackerSnapshot } from "../../apps/web/src/features/scene-eye-tracking/hand-tracker"
import {
  CALIBRATION_TARGETS,
  MAX_FRAME_AGE_MS,
  VALIDATION_TARGETS,
} from "../../apps/web/src/features/scene-eye-tracking/calibration"
import type {
  SceneCamera,
  SceneCameraSnapshot,
} from "../../apps/web/src/features/scene-eye-tracking/scene-camera"
if (typeof document === "undefined") GlobalRegistrator.register()
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
const { act, createElement } = await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { FingerControls, SceneSourceControls, SceneLiveControls } =
  await import("../../apps/web/src/features/scene-eye-tracking/scene-controls")
const { RecordingControls } =
  await import("../../apps/web/src/features/scene-eye-tracking/recording-controls")
const { useSyncExternalStore } =
  await import("../../apps/web/node_modules/react")
import type { TrackerController } from "../../apps/web/src/features/eye-tracking/use-tracker.types"
let root: Root | null = null,
  host: HTMLDivElement
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = null
  host?.remove()
})

test("Space starts one-point capture once and automatically opens live gaze without an accuracy claim", async () => {
  const session = new SceneSession("one-point")
  let live = 0
  function Controls() {
    const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
    return createElement(FingerControls, {
      session,
      state,
      hands: { status: "ready", error: "" },
      canCapture: true,
      retry() {},
      onLive() {
        live++
      },
    })
  }
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(Controls)))
  expect(host.querySelectorAll("[role='radio']")).toHaveLength(3)
  const methodButton = host.querySelector<HTMLButtonElement>(
    "[aria-label='One point calibration']"
  )!
  methodButton.focus()
  await act(async () =>
    methodButton.dispatchEvent(
      new KeyboardEvent("keydown", { code: "Space", bubbles: true })
    )
  )
  expect(session.getSnapshot().capture).toBe("calibration")
  expect(session.getSnapshot().collection?.armed).toBe(true)
  await act(async () => {
    for (let id = 1; id <= 40; id++) {
      session.addEye({
        id,
        timestamp: id * 50,
        feature: [0, 0],
        valid: true,
        confidence: 0.95,
      })
      session.observeHand(
        {
          scene: {
            id,
            timestamp: id * 50,
            width: 640,
            height: 480,
            generation: 1,
          },
          landmarks: [
            Array.from({ length: 21 }, () => ({ x: 0.7, y: 0.3, z: 0 })),
          ],
          worldLandmarks: [],
          handedness: ["Right"],
        },
        id * 50
      )
    }
  })
  expect(session.getSnapshot().calibration?.holds).toHaveLength(1)
  expect(session.getSnapshot().validation).toBeNull()
  expect(live).toBe(1)
  expect(host.textContent).toContain("accuracy not measured")
})
async function runConnection(activeDuringRecovery: boolean) {
  let advanced = 0,
    release!: () => void
  const camera = {
    startCamera: () =>
      new Promise<void>((resolve) => {
        release = resolve
      }),
  } as unknown as SceneCamera
  let state: SceneCameraSnapshot = {
    source: null,
    busy: false,
    error: "",
    devices: [],
    frame: null,
    connection: "idle",
    retryAttempt: 0,
    transform: { rotation: 0, mirrorX: false, mirrorY: false },
  }
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  const render = async (active: boolean) =>
    act(async () => {
      root!.render(
        createElement(SceneSourceControls, {
          camera,
          state,
          active,
          onConnected: () => {
            advanced++
          },
        })
      )
    })
  await render(true)
  await act(async () =>
    (host.querySelector(".eye-button.primary") as HTMLButtonElement).click()
  )
  state = { ...state, busy: true, connection: "reconnecting" }
  await render(activeDuringRecovery)
  state = {
    ...state,
    busy: false,
    source: { kind: "network", name: "Camera", key: "network:camera" },
    connection: "live",
  }
  await act(async () => release())
  await render(activeDuringRecovery)
  await render(true)
  return advanced
}
test("completing a pending camera connection cannot navigate away from another setup step", async () => {
  expect(await runConnection(false)).toBe(0)
})
test("a successful automatic startup retry advances calibration once while the connection panel is active", async () => {
  expect(await runConnection(true)).toBe(1)
})
test("live X/Y pixel controls preserve the mapping, reset together, and are disabled during recording", async () => {
  const { s } = calibrate()
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  const render = (recording = false) =>
    act(async () =>
      root!.render(
        createElement(SceneLiveControls, {
          session: s,
          state: s.getSnapshot(),
          canValidate: true,
          onCalibrate() {},
          recording,
        })
      )
    )
  await render()
  const x = host.querySelector<HTMLInputElement>(
    "[aria-label='Gaze offset X (pixels)']"
  )
  const y = host.querySelector<HTMLInputElement>(
    "[aria-label='Gaze offset Y (pixels)']"
  )
  expect(x).not.toBeNull()
  expect(y).not.toBeNull()
  const edit = async (input: HTMLInputElement, value: string) =>
    act(async () => {
      input.focus()
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
      input.blur()
    })
  await edit(x!, "16")
  await render()
  await edit(y!, "-12")
  expect(s.getSnapshot().offset).toEqual([0.025, -0.025])
  await render()
  expect(host.textContent).toContain("Previous accuracy check")
  await act(async () =>
    (
      host.querySelector(
        "[aria-label='Reset gaze offset']"
      ) as HTMLButtonElement
    ).click()
  )
  expect(s.getSnapshot().offset).toEqual([0, 0])
  await render(true)
  expect(
    host.querySelector<HTMLInputElement>(
      "[aria-label='Gaze offset X (pixels)']"
    )!.disabled
  ).toBe(true)
  expect(
    host.querySelector<HTMLButtonElement>("[aria-label='Reset gaze offset']")!
      .disabled
  ).toBe(true)
})
test("a failed accuracy check exposes pixel errors, offset controls and a correction followed by fresh validation", async () => {
  const { s, id } = calibrate(false)
  collectValidation(s, id, () => [0.06, -0.04])
  const mapping = s.getSnapshot().calibration
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () =>
    root!.render(
      createElement(FingerControls, {
        session: s,
        state: s.getSnapshot(),
        hands: { status: "ready" } as HandTrackerSnapshot,
        canCapture: true,
        retry() {},
        onLive() {},
      })
    )
  )
  expect(host.textContent).toContain("Unverified preview")
  expect(host.textContent).toContain("42.9 px RMS")
  expect(
    host.querySelector("[aria-label='Gaze offset X (pixels)']")
  ).not.toBeNull()
  const apply = host.querySelector<HTMLButtonElement>(
    "[aria-label='Apply suggested offset and check accuracy']"
  )
  expect(apply).not.toBeNull()
  expect(
    host.querySelector("[aria-label='Download calibration diagnostics']")
  ).not.toBeNull()
  await act(async () => apply!.click())
  expect(s.getSnapshot().offset[0]).toBeCloseTo(-0.06)
  expect(s.getSnapshot().offset[1]).toBeCloseTo(0.04)
  expect(s.getSnapshot().capture).toBe("validation")
  expect(s.getSnapshot().validation).toBeNull()
  expect(s.getSnapshot().collection?.holds).toHaveLength(0)
  expect(s.getSnapshot().calibration).toBe(mapping)
})
test("a cancelled accuracy check still labels fresh provisional gaze as unverified instead of waiting", async () => {
  const { s, id, time } = calibrate(false)
  s.cancelCapture()
  s.addEye({
    id: id + 1,
    timestamp: time + 50,
    feature: [0, 0],
    confidence: 0.95,
    valid: true,
  })
  s.measure(
    {
      id: id + 1,
      timestamp: time + 50,
      width: 640,
      height: 480,
      generation: 1,
    },
    time + 50
  )
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () =>
    root!.render(
      createElement(SceneLiveControls, {
        session: s,
        state: s.getSnapshot(),
        canValidate: true,
        onCalibrate() {},
      })
    )
  )
  expect(host.textContent).toContain("Unverified preview")
  expect(host.textContent).toContain("50.0%, 50.0%")
  expect(s.getSnapshot().measurement?.valid).toBe(false)
})
test("recording exports the applied offset and finalizes before a programmatic offset change can mix coordinate systems", async () => {
  const { s, id } = calibrate()
  s.setOffset([0.025, -0.025])
  s.startCapture("validation")
  collectValidation(s, id, () => [-0.025, 0.025])
  expect(s.getSnapshot().validation?.passed).toBe(true)
  const canvas = document.createElement("canvas")
  canvas.width = 640
  canvas.height = 480
  const camera = {
    rawCanvas: canvas,
    latest: { width: 640, height: 480 },
    stream: null,
    getSnapshot: () => ({
      source: null,
      transform: { rotation: 0, mirrorX: false, mirrorY: false },
    }),
  } as unknown as SceneCamera
  const tracker = {
    sourceCanvas: { current: null },
    source: null,
    transform: { rotation: 0, mirrorX: false, mirrorY: false },
    frame: null,
    settings: {},
  } as unknown as TrackerController
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  const render = () =>
    act(async () =>
      root!.render(
        createElement(RecordingControls, {
          camera,
          tracker,
          state: s.getSnapshot(),
          hand: null,
          identity: "offset-test",
        })
      )
    )
  await render()
  await act(async () =>
    (host.querySelector(".eye-button.primary") as HTMLButtonElement).click()
  )
  expect(host.textContent).toContain("Stop")
  s.setOffset([0.05, 0])
  await render()
  expect(host.textContent).not.toContain("Stop")
  expect(
    (host.querySelector(".eye-button.primary") as HTMLButtonElement).disabled
  ).toBe(false)
  const createUrl = URL.createObjectURL
  const click = HTMLAnchorElement.prototype.click
  let exported: Blob | null = null
  URL.createObjectURL = (blob) => {
    exported = blob
    return "blob:offset-export"
  }
  HTMLAnchorElement.prototype.click = () => {}
  try {
    const button = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "JSON"
    )!
    expect(button).toBeDefined()
    await act(async () => button.click())
    const json = JSON.parse(await exported!.text())
    expect(json.metadata.gazeOffset).toEqual({ normalized: [0.025, -0.025] })
    expect(json.metadata.validation.offset).toEqual([0.025, -0.025])
    expect(json.metadata.accuracy).toBe("independently-checked")
    expect(s.getSnapshot().offset).toEqual([0.05, 0])
    await act(async () =>
      (host.querySelector(".eye-button.primary") as HTMLButtonElement).click()
    )
    await act(async () =>
      (host.querySelector(".eye-button.primary") as HTMLButtonElement).click()
    )
    const newExport = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "JSON"
    )!
    await act(async () => newExport.click())
    const adjusted = JSON.parse(await exported!.text())
    expect(adjusted.metadata.accuracy).toBe("reused-calibration-not-rechecked")
    expect(adjusted.metadata.gazeOffset).toEqual({ normalized: [0.05, 0] })
  } finally {
    URL.createObjectURL = createUrl
    HTMLAnchorElement.prototype.click = click
  }
})
test("continuous capture audio stops on detection loss, buzzes once, and resumes on fresh samples", async () => {
  const original = globalThis.AudioContext
  const tones: number[] = []
  const playing = new Set<number>()
  const stops: { frequency: number; at: number }[] = []
  class TestAudio {
    state = "running"
    currentTime = 0
    destination = {}
    resume = async () => {}
    close = async () => {}
    createOscillator = () => {
      const frequency = { value: 0 }
      return {
        frequency,
        connect() {},
        disconnect() {},
        onended: null,
        start() {
          tones.push(frequency.value)
          playing.add(frequency.value)
        },
        stop(at: number) {
          playing.delete(frequency.value)
          stops.push({ frequency: frequency.value, at })
        },
      }
    }
    createGain = () => ({
      gain: {
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        cancelScheduledValues() {},
      },
      connect() {},
      disconnect() {},
    })
  }
  globalThis.AudioContext = TestAudio as unknown as typeof AudioContext
  const session = new SceneSession()
  try {
    localStorage.removeItem("gaze-core.scene.point-sound")
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    await act(async () =>
      root!.render(
        createElement(FingerControls, {
          session,
          state: session.getSnapshot(),
          hands: {
            status: "ready",
            error: "",
            hand: null,
            previewHand: null,
            delegate: null,
            inferenceMs: null,
          },
          canCapture: true,
          retry() {},
          onLive() {},
        })
      )
    )
    await act(async () =>
      (host.querySelector(".eye-button.primary") as HTMLButtonElement).click()
    )
    let id = 0
    const feed = (x = 0.5, y = 0.5, visible = true) => {
      id++
      session.addEye({
        id,
        timestamp: id * 50,
        feature: [x - 0.5, y - 0.5],
        confidence: 0.95,
        valid: true,
      })
      session.observeHand(
        {
          scene: {
            id,
            timestamp: id * 50,
            width: 640,
            height: 480,
            generation: 1,
          },
          landmarks: visible
            ? [Array.from({ length: 21 }, () => ({ x, y, z: 0 }))]
            : [],
          worldLandmarks: [],
          handedness: visible ? ["Right"] : [],
        },
        id * 50
      )
      session.checkCaptureFreshness(id * 50)
      if (session.getSnapshot().collection?.canLock) session.lockPoint()
    }
    // Begin one hold, then drop the hand while valid eye frames continue.
    for (let frame = 0; frame < 12; frame++) feed()
    expect(tones.filter((f) => f === 520)).toHaveLength(1)
    expect(playing.has(660)).toBe(true)
    const beforePause = tones.length
    for (let frame = 0; frame < 14; frame++) feed(0.5, 0.5, false)
    expect(session.getSnapshot().collection?.status).toBe("paused")
    expect(playing.has(660)).toBe(false)
    expect(tones).toHaveLength(beforePause + 1)
    expect(tones.filter((f) => f === 140)).toHaveLength(1)
    expect(stops.find((s) => s.frequency === 140)?.at).toBeLessThan(1)
    for (const [x, y] of [...CALIBRATION_TARGETS, ...VALIDATION_TARGETS]) {
      for (let frame = 0; frame < 35; frame++) feed(x, y)
    }
    expect(tones.filter((f) => f === 520)).toHaveLength(14)
    // One sustained tone per point, plus the interrupted first point's resume.
    expect(tones.filter((f) => f === 660)).toHaveLength(15)
    expect(playing.has(660)).toBe(false)
    expect(tones.filter((f) => f === 880)).toHaveLength(14)
    expect(tones.filter((f) => f === 1320)).toHaveLength(14)
    const total = tones.length
    session.measure(
      { id, timestamp: id * 50, width: 640, height: 480, generation: 1 },
      id * 50
    )
    expect(tones).toHaveLength(total)
    await act(async () =>
      (
        host.querySelector(
          "[aria-label='Mute calibration sounds']"
        ) as HTMLButtonElement
      ).click()
    )
    expect(localStorage.getItem("gaze-core.scene.point-sound")).toBe("off")
    await act(async () =>
      (
        host.querySelector(
          "[aria-label='Enable calibration sounds']"
        ) as HTMLButtonElement
      ).click()
    )
    expect(localStorage.getItem("gaze-core.scene.point-sound")).toBe("on")
    session.startCapture("calibration")
    for (let frame = 0; frame < 12; frame++) feed()
    expect(playing.has(660)).toBe(true)
    // A stalled pipeline must stop sounding even before a status update arrives.
    await new Promise((resolve) => setTimeout(resolve, MAX_FRAME_AGE_MS + 30))
    expect(playing.has(660)).toBe(false)
    feed()
    expect(playing.has(660)).toBe(true)
    await act(async () =>
      (
        host.querySelector(
          "[aria-label='Mute calibration sounds']"
        ) as HTMLButtonElement
      ).click()
    )
    expect(playing.has(660)).toBe(false)
    const mutedTotal = tones.length
    for (let frame = 0; frame < 12; frame++) feed()
    expect(tones).toHaveLength(mutedTotal)
  } finally {
    await act(async () => root!.unmount())
    root = null
    globalThis.AudioContext = original
    localStorage.removeItem("gaze-core.scene.point-sound")
  }
})
