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
const { RecordingControls, drawRecordingOverlays } =
  await import("../../apps/web/src/features/scene-eye-tracking/recording-controls")
const { useSyncExternalStore } =
  await import("../../apps/web/node_modules/react")
import type { TrackerController } from "../../apps/web/src/features/eye-tracking/use-tracker.types"
import type { RecordingOverlayFrame } from "../../apps/web/src/features/scene-eye-tracking/recording-controls.types"
let root: Root | null = null,
  host: HTMLDivElement
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = null
  host?.remove()
})

test("the primary recovery action retries only the named point and survives cancelling the retry", async () => {
  const session = new SceneSession()
  session.startCapture("calibration")
  const collected = collectValidation(
    session,
    0,
    (index) => (index === 1 ? [0.2, 0] : [0, 0]),
    CALIBRATION_TARGETS
  )
  const saved = session.getSnapshot().fitFailure!.holds
  expect(saved).toHaveLength(9)

  function Controls() {
    const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
    return createElement(FingerControls, {
      session,
      state,
      hands: { status: "ready", error: "" },
      canCapture: true,
      retry() {},
      onCorrect() {},
      onLive() {},
    })
  }
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(Controls)))

  const retry = host.querySelector<HTMLButtonElement>(".eye-button.primary")!
  expect(retry.textContent).toContain("Retry top left")
  await act(async () => retry.click())
  expect(session.getSnapshot().collection?.holds).toEqual(
    saved.filter((_, index) => index !== 1)
  )
  expect(session.getSnapshot().collection?.target).toEqual([0.15, 0.15])
  const cancel = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === "Cancel"
  )!
  await act(async () => cancel.click())
  expect(session.getSnapshot().fitFailure?.holds).toEqual(saved)
  await act(async () =>
    host.querySelector<HTMLButtonElement>(".eye-button.primary")!.click()
  )
  expect(session.getSnapshot().collection?.holds).toHaveLength(8)
  await act(async () => {
    collectValidation(session, collected.id, () => [0, 0], [[0.15, 0.15]])
  })
  expect(session.getSnapshot().calibration?.holds).toHaveLength(9)
  expect(session.getSnapshot().capture).toBe("validation")
  expect(session.getSnapshot().validation).toBeNull()
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
      onCorrect() {},
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
test("click correction preserves the mapping, resets both axes, and is disabled during recording", async () => {
  const { s } = calibrate()
  const mapping = s.getSnapshot().calibration
  let requests = 0
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
          onCorrect() {
            requests++
          },
          recording,
        })
      )
    )
  await render()
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        '[aria-label="Correct gaze with a click"]'
      )!
      .click()
  )
  expect(requests).toBe(1)
  expect(host.querySelector('input[type="range"]')).toBeNull()
  // The preview correction layer supplies both normalized offsets in one update.
  s.setOffset([0.025, -0.025])
  await render()
  expect(s.getSnapshot().calibration).toBe(mapping)
  expect(host.textContent).toContain("Previous accuracy check")
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Reset gaze offset"]')!
      .click()
  )
  expect(s.getSnapshot().offset).toEqual([0, 0])
  await render(true)
  expect(
    host.querySelector<HTMLButtonElement>(
      '[aria-label="Correct gaze with a click"]'
    )!.disabled
  ).toBe(true)
  expect(
    host.querySelector<HTMLButtonElement>('[aria-label="Reset gaze offset"]')!
      .disabled
  ).toBe(true)
})

test("completed calibration can open click correction without another calibration", async () => {
  const { s } = calibrate()
  const mapping = s.getSnapshot().calibration
  let requests = 0
  function Controls() {
    const state = useSyncExternalStore(s.subscribe, s.getSnapshot)
    return createElement(FingerControls, {
      session: s,
      state,
      hands: { status: "ready", error: "" },
      canCapture: true,
      retry() {},
      onLive() {},
      onCorrect() {
        requests++
      },
    })
  }
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(Controls)))
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        '[aria-label="Correct gaze with a click"]'
      )!
      .click()
  )
  expect(requests).toBe(1)
  expect(s.getSnapshot().calibration).toBe(mapping)
  expect(s.getSnapshot().capture).toBeNull()
  expect(
    host.querySelectorAll('[aria-label="Gaze position adjustment"]')
  ).toHaveLength(1)
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
    host.querySelector("[aria-label='Correct gaze with a click']")
  ).not.toBeNull()
  const apply = host.querySelector<HTMLButtonElement>(
    "[aria-label='Apply suggested offset as unverified preview']"
  )
  expect(apply).not.toBeNull()
  expect(
    host.querySelector("[aria-label='Download calibration diagnostics']")
  ).not.toBeNull()
  await act(async () => apply!.click())
  expect(s.getSnapshot().offset[0]).toBeCloseTo(-0.06)
  expect(s.getSnapshot().offset[1]).toBeCloseTo(0.04)
  expect(s.getSnapshot().capture).toBeNull()
  expect(s.getSnapshot().validation?.passed).toBe(false)
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
async function mountRecordingControls(session: SceneSession) {
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
          state: session.getSnapshot(),
          hand: null,
          identity: "recording-test",
          preview: { scene: { current: canvas }, gaze: { current: null } },
        })
      )
    )
  await render()
  return { camera, render }
}

test.each(["failed", "cancelled"])(
  "a completed calibration with a %s accuracy check can record without claiming verified gaze",
  async (check) => {
    const { s, id } = calibrate(false)
    if (check === "failed") {
      collectValidation(s, id, () => [0.06, -0.04])
      expect(s.getSnapshot().validation?.passed).toBe(false)
    } else {
      s.cancelCapture()
    }
    const { render } = await mountRecordingControls(s)
    const record = host.querySelector<HTMLButtonElement>(".eye-button.primary")!
    expect(record.disabled).toBe(false)
    await act(async () => record.click())
    expect(host.textContent).toContain("Stop")

    const timestamp = performance.now()
    s.addEye({
      id: 1000,
      timestamp,
      feature: [0, 0],
      confidence: 0.95,
      valid: true,
    })
    s.measure(
      { id: 1000, timestamp, width: 640, height: 480, generation: 1 },
      timestamp
    )
    await render()
    expect(s.getSnapshot().measurement?.preview).toBe(true)
    expect(s.getSnapshot().measurement?.valid).toBe(false)
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".eye-button.primary")!.click()
    })

    const createUrl = URL.createObjectURL
    const click = HTMLAnchorElement.prototype.click
    let exported: Blob | null = null
    URL.createObjectURL = (blob) => {
      exported = blob
      return "blob:unverified-export"
    }
    HTMLAnchorElement.prototype.click = () => {}
    try {
      const jsonButton = Array.from(host.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "JSON"
      )!
      await act(async () => jsonButton.click())
      const json = JSON.parse(await exported!.text())
      expect(json.metadata.accuracy).toBe("unverified")
      expect(json.measurements).toHaveLength(1)
      expect(json.measurements[0].preview).toBe(true)
      expect(json.measurements[0].valid).toBe(false)
      expect(json.measurements[0].estimated).toBe(false)
      expect(json.measurements[0].position[0]).toBeCloseTo(0.5)
      expect(json.measurements[0].position[1]).toBeCloseTo(0.5)
    } finally {
      URL.createObjectURL = createUrl
      HTMLAnchorElement.prototype.click = click
    }
  }
)

test("recording includes the annotated eye video by default", async () => {
  const { s } = calibrate()
  await mountRecordingControls(s)
  expect(
    host.querySelector<HTMLInputElement>("input[type='checkbox']")!.checked
  ).toBe(true)
})

test("recorded overlays align with transformed camera pixels and remove stale gaze and pupil values", () => {
  const images: CanvasImageSource[] = []
  const ellipses: number[][] = []
  const circles: number[][] = []
  const captions: string[] = []
  const context = {
    drawImage(image: CanvasImageSource) {
      images.push(image)
    },
    ellipse(...values: number[]) {
      ellipses.push(values)
    },
    arc(...values: number[]) {
      circles.push(values)
    },
    fillText(value: string) {
      captions.push(value)
    },
    fillRect() {},
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    fill() {},
    stroke() {},
    strokeRect() {},
    setLineDash() {},
    moveTo() {},
    lineTo() {},
  } as unknown as CanvasRenderingContext2D
  const createCanvas = () => {
    const canvas = document.createElement("canvas")
    canvas.width = 640
    canvas.height = 480
    canvas.getContext = (() => context) as typeof canvas.getContext
    return canvas
  }
  const scene = createCanvas()
  const eye = createCanvas()
  const raw = createCanvas()
  const preview = createCanvas()
  const eyeSource = createCanvas()
  const { s } = calibrate(false)
  s.cancelCapture()
  const input: RecordingOverlayFrame = {
    camera: {
      rawCanvas: raw,
      latest: { width: 640, height: 480, timestamp: 1000 },
    } as SceneCamera,
    tracker: {
      sourceCanvas: { current: eyeSource },
      settings: {
        roi: { x: 100, y: 50, width: 300, height: 200 },
        corners: null,
      },
      frame: {
        timestamp: 1000,
        roi: { x: 100, y: 50, width: 300, height: 200 },
        detection: {
          ellipse: {
            center: [20, 30],
            major: 15,
            minor: 10,
            angle: 0.4,
            confidence: 0.95,
          },
          previews: [],
          selected: 0,
        },
        model: { center: [140, 120], radius: 80 },
        gaze: { direction: [0.1, 0.2, -0.9] },
      },
    } as unknown as TrackerController,
    state: {
      ...s.getSnapshot(),
      measurement: {
        timestamp: 1000,
        eyeTimestamp: 1000,
        sceneTimestamp: 1000,
        eyeId: 1,
        sceneId: 1,
        confidence: 0.95,
        position: [0.25, 0.75],
        pixels: [160, 360],
        valid: false,
        preview: true,
        extrapolated: false,
        reason: "Accuracy check required",
      },
    },
    preview: {
      scene: { current: preview },
      gaze: {
        current: {
          view: { width: 320, height: 240, left: 40, top: 0, scale: 0.5 },
          bubble: {
            center: [0.25, 0.75],
            rawPoint: [0.25, 0.75],
            radiusPx: 14,
            errorRadiusPx: null,
            limited: false,
            verified: false,
            motion: "moving",
          },
        },
      },
    },
  }
  drawRecordingOverlays(scene, eye, input, 1050)
  expect(images).toEqual([preview, eyeSource])
  expect(images).not.toContain(raw)
  expect(ellipses[0].slice(0, 5)).toEqual([120, 80, 15, 10, 0.4])
  expect(
    circles.some(
      (circle) => circle[0] === 160 && circle[1] === 360 && circle[2] === 28
    )
  ).toBe(true)
  expect(
    circles.some(
      (circle) => circle[0] === 140 && circle[1] === 120 && circle[2] === 80
    )
  ).toBe(true)
  expect(captions.join("\n")).toContain(
    "Gaze X 160.0 px  Y 360.0 px | 0.250, 0.750"
  )
  expect(captions.join("\n")).toContain("Pupil X 120.0 px  Y 80.0 px | 95%")
  expect(captions.join("\n")).toContain("Eye vector 0.100, 0.200, -0.900")
  expect(captions.join("\n")).toContain("Unverified preview")
  expect(captions.join("\n")).not.toContain("Accuracy checked")

  images.length = 0
  ellipses.length = 0
  circles.length = 0
  captions.length = 0
  drawRecordingOverlays(scene, eye, input, 2000)
  expect(circles).toHaveLength(0)
  expect(ellipses).toHaveLength(0)
  expect(captions.join("\n")).toContain("Gaze unavailable")
  expect(captions.join("\n")).toContain("Pupil unavailable")
  expect(captions.join("\n")).not.toContain("160.0")
})

test("recording requires a mapping and scene frames, and an accuracy check finalizes it", async () => {
  const { s } = calibrate(false)
  const { camera, render } = await mountRecordingControls(s)
  const record = () =>
    host.querySelector<HTMLButtonElement>(".eye-button.primary")!
  expect(record().disabled).toBe(true)
  s.cancelCapture()
  camera.latest = null
  await render()
  expect(record().disabled).toBe(true)
  camera.latest = {
    id: 1,
    timestamp: performance.now(),
    width: 640,
    height: 480,
    generation: 1,
  }
  await render()
  expect(record().disabled).toBe(false)
  await act(async () => record().click())
  expect(host.textContent).toContain("Stop")
  s.startCapture("validation")
  await render()
  expect(host.textContent).not.toContain("Stop")
  expect(record().disabled).toBe(true)
  expect(host.textContent).toContain("JSON")

  const fresh = new SceneSession()
  await act(async () => root!.unmount())
  root = null
  host.remove()
  await mountRecordingControls(fresh)
  expect(record().disabled).toBe(true)
})

test("recording exports the applied offset and finalizes before a programmatic offset change can mix coordinate systems", async () => {
  const { s, id } = calibrate()
  s.setOffset([0.025, -0.025])
  s.startCapture("validation")
  collectValidation(s, id, () => [-0.025, 0.025])
  expect(s.getSnapshot().validation?.passed).toBe(true)
  const { render } = await mountRecordingControls(s)
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
