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
  for (const name of ["Eye camera", "Scene camera", "Auxiliary camera"]) {
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
      .querySelector("[aria-label='Use Auxiliary camera']")
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
        .querySelector("[aria-label='Use Auxiliary camera']")
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

test("select confirms the clicked coordinates without copying them into another camera", async () => {
  const camera = new SceneCamera()
  const snapshot = liveSnapshot()
  snapshot.frame!.timestamp = performance.now()
  camera.getSnapshot = () => snapshot
  await render({ sceneCamera: camera })
  const preview = host.querySelector<HTMLButtonElement>(
    "[aria-label='Choose a point in Scene camera']"
  )!
  preview.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100)
  await act(async () =>
    preview.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 50, clientY: 90 })
    )
  )
  await command("select")
  const marker = host.querySelector<HTMLElement>(
    "[aria-label='Scene camera static selection']"
  )!
  expect(marker.style.left).toBe("25%")
  expect(marker.style.top).toBe("90%")
  expect(
    host.querySelector("[aria-label='Auxiliary camera static selection']")
  ).toBeNull()
  expect(host.querySelector("[role='status']")?.textContent).toContain(
    "confirmed"
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
