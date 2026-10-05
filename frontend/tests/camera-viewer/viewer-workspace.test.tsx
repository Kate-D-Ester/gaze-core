import { calibrate } from "../scene-eye-tracking/fixtures"
import { ObjectTracking } from "../../apps/web/src/features/camera-viewer/object-tracking"
import { spyOn } from "bun:test"
import { SceneCamera } from "../../apps/web/src/features/scene-eye-tracking/scene-camera"
import { liveSnapshot } from "./fixtures"
import type { ViewerWorkspaceProps } from "../../apps/web/src/features/camera-viewer/viewer-workspace.types"
import { LocalVoiceController } from "../../apps/web/src/features/camera-viewer/local-voice"
import { afterEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import type { Root } from "../../apps/web/node_modules/react-dom/client"
if (typeof document === "undefined") {
  GlobalRegistrator.register()
}
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
const { act, createElement } = await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { ViewerWorkspace } =
  await import("../../apps/web/src/features/camera-viewer/viewer-workspace")
let root: Root | null = null
let host: HTMLDivElement
async function render(props: ViewerWorkspaceProps = {}) {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(createElement(ViewerWorkspace, props))
  })
}
afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount()
    })
  }
  root = null
  host?.remove()
})
async function command(text: string) {
  const input = host.querySelector<HTMLInputElement>(
    "[aria-label='Viewer command']"
  )!
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, text)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await act(async () => {
    host
      .querySelector("form[aria-label='Camera commands']")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
}

test("the public viewer opens with three independent camera source and orientation panels", async () => {
  await render()
  expect(host.querySelector("h1")?.textContent).toBe("Three-camera viewer")
  for (const name of ["Eye camera", "Scene camera", "Target camera"]) {
    expect(host.querySelector(`[aria-label='${name} source']`)).not.toBeNull()
    expect(
      host.querySelector(`[aria-label='${name} rotation angle']`)
    ).not.toBeNull()
  }
  expect(
    host.querySelectorAll("[aria-label$=' disconnect']:disabled")
  ).toHaveLength(3)
  expect(
    host.querySelector("[aria-label='Take photo']")?.hasAttribute("disabled")
  ).toBe(true)
})

test("typed commands switch the active camera and reject disconnected selection and unsupported phrases", async () => {
  await render()
  await command("auxiliary camera")
  expect(
    host
      .querySelector("[aria-label='Use Target camera']")
      ?.getAttribute("aria-pressed")
  ).toBe("true")
  await command("switch camera")
  expect(
    host
      .querySelector("[aria-label='Use Eye camera']")
      ?.getAttribute("aria-pressed")
  ).toBe("true")
  await command("select")
  expect(host.querySelector("[role='alert']")?.textContent).toContain(
    "fresh frame"
  )
  await command("unsupported command")
  expect(host.querySelector("[role='alert']")?.textContent).toContain(
    "Unknown command"
  )
})

test("multiple voice commands execute in order before a React render", async () => {
  let deliver!: (text: string) => void
  // Replace only the slow microphone/model boundary, retaining viewer command dispatch.
  const microphone = spyOn(
    LocalVoiceController.prototype,
    "start"
  ).mockImplementation(async (handler) => {
    deliver = handler
  })
  try {
    await render()
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>("[aria-label='Enable local voice']")!
        .click()
    )
    await act(async () => {
      deliver("eye camera")
      deliver("switch camera")
    })
    expect(
      host
        .querySelector("[aria-label='Use Scene camera']")
        ?.getAttribute("aria-pressed")
    ).toBe("true")
    expect(
      host
        .querySelector("[aria-label='Use Target camera']")
        ?.getAttribute("aria-pressed")
    ).toBe("false")
  } finally {
    microphone.mockRestore()
  }
})

test("pending USB allocation is serialized and stop cameras cancels its late permission stream", async () => {
  const original = Object.getOwnPropertyDescriptor(navigator, "mediaDevices")
  const requests: ((stream: MediaStream) => void)[] = []
  let stopped = 0
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: () =>
        new Promise<MediaStream>((resolve) => requests.push(resolve)),
      enumerateDevices: async () => [],
      addEventListener() {},
      removeEventListener() {},
    },
  })
  try {
    await render()
    await act(async () => {
      host
        .querySelector("form[aria-label='Eye camera source']")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      host
        .querySelector("form[aria-label='Scene camera source']")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(requests).toHaveLength(1)
    expect(
      [...host.querySelectorAll("fieldset")].every(
        (fieldset) => fieldset.disabled
      )
    ).toBe(true)
    await command("stop cameras")
    expect(
      [...host.querySelectorAll("fieldset")].every(
        (fieldset) => !fieldset.disabled
      )
    ).toBe(true)
    await act(async () => {
      requests[0]!({
        getTracks: () => [
          {
            stop: () => {
              stopped++
            },
          },
        ],
      } as unknown as MediaStream)
    })
    expect(stopped).toBe(1)
    expect(
      host
        .querySelector("[aria-label='Eye camera disconnect']")
        ?.hasAttribute("disabled")
    ).toBe(true)
  } finally {
    if (original) {
      Object.defineProperty(navigator, "mediaDevices", original)
    } else {
      Reflect.deleteProperty(navigator, "mediaDevices")
    }
  }
})

test("select requires a manually chosen point and keeps its feedback in the command bar", async () => {
  const camera = new SceneCamera()
  const snapshot = liveSnapshot()
  snapshot.frame!.timestamp = performance.now()
  camera.getSnapshot = () => snapshot
  await render({ sceneCamera: camera })
  await command("select")
  expect(
    !!host.querySelector("[aria-label='Scene camera static selection']")
  ).toBe(false)
  const alert = host.querySelector("[role='alert']")!
  expect(alert.textContent).toContain("Click a point")
  expect(
    !!alert.closest("section[aria-labelledby='viewer-command-title']")
  ).toBe(true)
})

test("clicking Scene starts object selection without copying coordinates into Target", async () => {
  const camera = new SceneCamera()
  const snapshot = liveSnapshot()
  snapshot.frame!.timestamp = performance.now()
  camera.getSnapshot = () => snapshot
  const tracking = new ObjectTracking({
    encode: () => "jpeg",
    request: async (request) => {
      if (request.action === "select") {
        expect(request.point).toEqual([0.25, 0.9])
        return {
          token: "selected-token",
          box: [0.1, 0.7, 0.4, 1],
          label: "Object",
        }
      }
      return { status: "searching" }
    },
  })
  await render({ sceneCamera: camera, objectTracking: tracking })
  const preview = host.querySelector<HTMLButtonElement>(
    "[aria-label='Choose a point in Scene camera']"
  )!
  preview.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100)
  await act(async () =>
    preview.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 50, clientY: 90 })
    )
  )
  expect(tracking.getSnapshot().reference?.token).toBe("selected-token")
  const marker = host.querySelector<HTMLElement>(
    "[aria-label='Scene camera static selection']"
  )!
  expect(marker.style.left).toBe("25%")
  expect(marker.style.top).toBe("90%")
  expect(
    host.querySelector("[aria-label='Target camera static selection']")
  ).toBeNull()
  expect(host.querySelector("[role='status']")?.textContent).toContain(
    "selected"
  )
  snapshot.frame!.timestamp = performance.now() - 2000
  await command("select")
  expect(host.querySelector("[role='alert']")?.textContent).toContain(
    "fresh frame"
  )
  expect(
    !!host.querySelector("[aria-label='Scene camera static selection']")
  ).toBe(false)
})

test("voice state and command outcomes remain visible together in the pinned controls", async () => {
  let deliver!: (text: string) => void
  let reject!: () => void
  let stopped = false
  await render({
    voiceSessionFactory: async (handler, _signal, _failure, onRejected) => {
      deliver = handler
      reject = onRejected!
      return {
        stop: () => {
          stopped = true
        },
      }
    },
  })
  const toggle = host.querySelector<HTMLButtonElement>(
    "[aria-label='Enable local voice']"
  )!
  expect(toggle.textContent).toContain("Voice off")
  await act(async () => toggle.click())
  expect(toggle.textContent).toContain("Listening")
  await act(async () => deliver("select"))
  expect(host.querySelector("[aria-label='Voice feedback']")?.textContent).toBe(
    "Heard: select"
  )
  const alert = host.querySelector("[role='alert']")!
  expect(alert.textContent).toContain("fresh frame")
  expect(
    !!alert.closest("section[aria-labelledby='viewer-command-title']")
  ).toBe(true)
  await act(async () => reject())
  expect(
    host.querySelector("[aria-label='Voice feedback']")?.textContent
  ).toContain("not understood")
  await act(async () => toggle.click())
  expect(stopped).toBe(true)
  expect(toggle.textContent).toContain("Voice off")
  expect(!!host.querySelector("[aria-label='Voice feedback']")).toBe(false)
})

test("auxiliary tracking status explains how to start without requiring Eye", async () => {
  const camera = new SceneCamera()
  const snapshot = liveSnapshot()
  snapshot.frame!.timestamp = performance.now()
  camera.getSnapshot = () => snapshot
  await render({ auxiliaryCamera: camera })
  expect(
    host.querySelector("[aria-label='target object tracking']")?.textContent
  ).toContain("Select an object in Scene")
  expect(
    host.querySelector("[aria-label='target matched object box']")
  ).toBeNull()
})

test("real controller results render third-camera geometry and clear removes it", async () => {
  const scene = new SceneCamera(),
    auxiliary = new SceneCamera()
  const sceneState = liveSnapshot(),
    auxiliaryState = liveSnapshot()
  sceneState.frame!.timestamp = auxiliaryState.frame!.timestamp =
    performance.now()
  scene.getSnapshot = () => sceneState
  auxiliary.getSnapshot = () => auxiliaryState
  const tracking = new ObjectTracking({
    encode: () => "jpeg",
    request: async (request) =>
      request.action === "select"
        ? {
            token: "selected-token",
            box: [0.1, 0.2, 0.4, 0.6],
            label: "Bottle",
          }
        : {
            status: "matched",
            box: [0.6, 0.3, 0.9, 0.7],
            score: 0.91,
            inliers: 18,
            detectionConfidence: 0.82,
          },
  })
  await render({
    sceneCamera: scene,
    auxiliaryCamera: auxiliary,
    objectTracking: tracking,
  })
  await act(async () => tracking.select(scene, { point: [0.2, 0.3] }))
  await act(async () => tracking.tick(scene, auxiliary))
  const box = host.querySelector<HTMLElement>(
    "[aria-label='target matched object box']"
  )!
  expect(box.style.left).toBe("60%")
  expect(box.style.top).toBe("30%")
  expect(
    host.querySelector("[aria-label='target object tracking']")?.textContent
  ).toContain("Locked · 91%")
  auxiliaryState.frame!.timestamp = performance.now() - 2000
  await command("auxiliary camera")
  expect(
    host.querySelector("[aria-label='target matched object box']")
  ).toBeNull()
  auxiliaryState.frame!.timestamp = performance.now()
  await command("switch camera")
  await command("clear")
  expect(
    host.querySelector("[aria-label='target matched object box']")
  ).toBeNull()
  expect(tracking.getSnapshot().reference).toBeNull()
})

test("Scene drag uses pointer-up coordinates rather than the last move", async () => {
  const scene = new SceneCamera(),
    state = liveSnapshot()
  state.frame!.timestamp = performance.now()
  scene.getSnapshot = () => state
  await render({ sceneCamera: scene })
  const preview = host.querySelector<HTMLButtonElement>(
    "[aria-label='Choose a point in Scene camera']"
  )!
  preview.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100)
  await act(async () => {
    preview.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    )
    preview.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 1,
        clientX: 80,
        clientY: 50,
      })
    )
    preview.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 1,
        clientX: 120,
        clientY: 80,
      })
    )
  })
  const box = host.querySelector<HTMLElement>(
    "[aria-label='scene reference box']"
  )!
  expect(box.style.left).toBe("10%")
  expect(parseFloat(box.style.width)).toBeCloseTo(50)
  expect(parseFloat(box.style.height)).toBeCloseTo(60)
})
test("a Scene drag spanning a source change cannot select a rectangle", async () => {
  const scene = new SceneCamera(),
    state = liveSnapshot()
  state.frame!.timestamp = performance.now()
  scene.getSnapshot = () => state
  await render({ sceneCamera: scene })
  const preview = host.querySelector<HTMLButtonElement>(
    "[aria-label='Choose a point in Scene camera']"
  )!
  preview.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100)
  await act(async () =>
    preview.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    )
  )
  state.source!.key = "replacement"
  await act(async () => {
    preview.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 1,
        clientX: 80,
        clientY: 50,
      })
    )
    preview.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 1,
        clientX: 120,
        clientY: 80,
      })
    )
  })
  expect(host.querySelector("[aria-label='scene reference box']")).toBeNull()
})

test("Eye and Target previews cannot select points or replace a Scene reference", async () => {
  const scene = new SceneCamera()
  const eye = new SceneCamera()
  const target = new SceneCamera()
  const state = liveSnapshot()
  state.frame!.timestamp = performance.now()
  scene.getSnapshot = eye.getSnapshot = target.getSnapshot = () => state
  const tracking = new ObjectTracking({
    encode: () => "jpeg",
    request: async (request) =>
      request.action === "select"
        ? {
            token: "scene-reference",
            box: [0.1, 0.2, 0.4, 0.6],
            label: "Bottle",
          }
        : { status: "searching" },
  })
  await render({
    sceneCamera: scene,
    eyeCamera: eye,
    auxiliaryCamera: target,
    objectTracking: tracking,
  })
  await act(async () => tracking.select(scene, { point: [0.2, 0.3] }))
  for (const label of ["Eye camera", "Target camera"]) {
    expect(
      !!host.querySelector(`[aria-label='Choose a point in ${label}']`)
    ).toBe(false)
    const preview = host.querySelector<HTMLElement>(
      `[aria-label='${label} preview']`
    )!
    expect(preview).not.toBeNull()
    await act(async () => {
      preview.click()
      preview.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })
      )
    })
    expect(tracking.getSnapshot().reference?.token).toBe("scene-reference")
    expect(
      host.querySelector(`[aria-label='${label} static selection']`)
    ).toBeNull()
  }
})

test("spoken select uses fresh Scene gaze while Target is active instead of an old clicked point", async () => {
  const scene = new SceneCamera()
  const target = new SceneCamera()
  const state = liveSnapshot()
  state.frame!.timestamp = performance.now()
  scene.getSnapshot = target.getSnapshot = () => state
  const { s: session } = calibrate()
  const stamp = performance.now()
  const gazeState = {
    ...session.getSnapshot(),
    measurement: {
      timestamp: stamp,
      eyeId: 1,
      sceneId: 1,
      eyeTimestamp: stamp,
      sceneTimestamp: stamp,
      confidence: 0.95,
      position: [0.72, 0.31] as [number, number],
      pixels: [460.8, 148.8] as [number, number],
      valid: true,
      reason: "",
      extrapolated: false,
    },
  }
  session.getSnapshot = () => gazeState
  const points: unknown[] = []
  const tracking = new ObjectTracking({
    encode: () => "jpeg",
    request: async (request) => {
      if (request.action === "select") {
        points.push(request.point)
        return {
          token: "gaze-reference",
          box: [0.6, 0.2, 0.85, 0.45],
          label: "Bottle",
        }
      }
      return { status: "searching" }
    },
  })
  let deliver!: (text: string) => void
  await render({
    sceneCamera: scene,
    auxiliaryCamera: target,
    gazeSession: session,
    objectTracking: tracking,
    voiceSessionFactory: async (handler) => {
      deliver = handler
      return { stop() {} }
    },
  })
  const preview = host.querySelector<HTMLButtonElement>(
    "[aria-label='Choose a point in Scene camera']"
  )!
  preview.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100)
  await act(async () =>
    preview.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 50, clientY: 40 })
    )
  )
  await command("auxiliary camera")
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>("[aria-label='Enable local voice']")!
      .click()
  )
  gazeState.measurement.eyeTimestamp =
    gazeState.measurement.sceneTimestamp =
    state.frame!.timestamp =
      performance.now()
  await act(async () => deliver("select"))
  expect(points.at(-1)).toEqual([0.72, 0.31])
  expect(tracking.getSnapshot().reference?.token).toBe("gaze-reference")
  expect(host.querySelector("[aria-label='Voice feedback']")?.textContent).toBe(
    "Heard: select"
  )
  expect(
    host.querySelector("[aria-label='scene reference box']")
  ).not.toBeNull()
  gazeState.measurement.eyeTimestamp = performance.now() - 1000
  state.frame!.timestamp = performance.now()
  await act(async () => deliver("select"))
  expect(points.at(-1)).toEqual([0.25, 0.4])
  expect(
    host
      .querySelector("[aria-label='Use Target camera']")
      ?.getAttribute("aria-pressed")
  ).toBe("true")
})

test("an older selection completion cannot replace feedback for a newer pending selection", async () => {
  const scene = new SceneCamera()
  const state = liveSnapshot()
  state.frame!.timestamp = performance.now()
  scene.getSnapshot = () => state
  let finishFirst!: (result: Record<string, unknown>) => void
  let finishSecond!: (result: Record<string, unknown>) => void
  let requests = 0
  const first = new Promise<Record<string, unknown>>((resolve) => {
    finishFirst = resolve
  })
  const second = new Promise<Record<string, unknown>>((resolve) => {
    finishSecond = resolve
  })
  const tracking = new ObjectTracking({
    encode: () => "jpeg",
    request: async (request) => {
      if (request.action !== "select") {
        return {}
      }
      return ++requests === 1 ? first : second
    },
  })
  await render({ sceneCamera: scene, objectTracking: tracking })
  const preview = host.querySelector<HTMLButtonElement>(
    "[aria-label='Choose a point in Scene camera']"
  )!
  preview.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100)
  await act(async () =>
    preview.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 50, clientY: 40 })
    )
  )
  await act(async () =>
    preview.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 150, clientY: 50 })
    )
  )
  await act(async () => {
    finishFirst({ token: "old", box: [0.1, 0.2, 0.4, 0.6], label: "First" })
    await Promise.resolve()
  })
  const feedback = host.querySelector(
    "section[aria-labelledby='viewer-command-title'] [role='status']"
  )?.textContent
  await act(async () =>
    finishSecond({ token: "new", box: [0.6, 0.3, 0.9, 0.7], label: "Second" })
  )
  expect(feedback).toContain("Selecting")
  expect(tracking.getSnapshot().reference?.token).toBe("new")
})
