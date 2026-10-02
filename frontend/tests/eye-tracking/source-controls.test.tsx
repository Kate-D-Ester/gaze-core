import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import type { CameraSourceRole } from "../../apps/web/src/features/eye-tracking/use-camera-source-preferences.types"
import type { TrackerController } from "../../apps/web/src/features/eye-tracking/use-tracker.types"

if (typeof document === "undefined") GlobalRegistrator.register()
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
const { act, createElement } = await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { SourceControls } =
  await import("../../apps/web/src/features/eye-tracking/steps/source-controls")
const { DEFAULT_SETTINGS } =
  await import("../../apps/web/src/features/eye-tracking/use-tracker")

const storageKey = "gazecore.eye-camera.source.v1"
let host: HTMLDivElement
let root: ReturnType<typeof createRoot> | null
const tracker: TrackerController = {
  settings: DEFAULT_SETTINGS,
  dimensions: { width: 640, height: 480 },
  configure() {},
  frame: null,
  latest: { current: null },
  source: null,
  sourceCanvas: { current: null },
  busy: false,
  error: "",
  setError() {},
  engineReady: true,
  devices: [],
  startCamera: mock(async () => {}),
  startNetworkStream: mock(async () => {}),
  startVideo: async () => {},
  startSample() {},
  stop() {},
  setSampleTarget() {},
  setPreviewMasksEnabled() {},
  setBlink() {},
}

async function mountControls(role: CameraSourceRole = "eye"): Promise<void> {
  await act(async () => {
    root ??= createRoot(host)
    root.render(
      createElement(SourceControls, {
        tracker,
        role,
        resetSource() {},
      })
    )
  })
}

async function enterUrl(url: string): Promise<void> {
  const input = host.querySelector<HTMLInputElement>(
    '[aria-label="Network stream URL"]'
  )!
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, url)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

beforeEach(() => {
  localStorage.removeItem(storageKey)
  mock.clearAllMocks()
  host = document.createElement("div")
  document.body.append(host)
})

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = null
  host.remove()
  localStorage.removeItem(storageKey)
})

test("an unconnected camera URL and selected source mode survive reloading the controls", async () => {
  await mountControls()
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Network stream"]')!
      .click()
  )
  await enterUrl("http://esp32.local/stream")
  expect(JSON.parse(localStorage.getItem(storageKey) ?? "null")).toEqual({
    kind: "network",
    url: "http://esp32.local/stream",
    deviceId: "",
  })
  await act(async () => root?.unmount())
  root = null
  await mountControls()
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="Network stream URL"]')
      ?.value
  ).toBe("http://esp32.local/stream")
  expect(tracker.startCamera).not.toHaveBeenCalled()
  expect(tracker.startNetworkStream).not.toHaveBeenCalled()
})

test("a saved USB selection survives remounting without opening the camera", async () => {
  localStorage.setItem(
    storageKey,
    JSON.stringify({ kind: "usb", url: "", deviceId: "eye-usb" })
  )
  await mountControls()
  expect(
    host.querySelector<HTMLSelectElement>('[aria-label="Eye camera"]')?.value
  ).toBe("eye-usb")
  expect(host.textContent).toContain("Saved camera")
  expect(tracker.startCamera).not.toHaveBeenCalled()
  await act(async () =>
    host.querySelector<HTMLButtonElement>(".primary")!.click()
  )
  expect(tracker.startCamera).toHaveBeenCalledWith("eye-usb", undefined)
  const select = host.querySelector<HTMLSelectElement>(
    '[aria-label="Eye camera"]'
  )!
  await act(async () => {
    select.value = ""
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  await act(async () => root?.unmount())
  root = null
  await mountControls()
  expect(
    host.querySelector<HTMLSelectElement>('[aria-label="Eye camera"]')?.value
  ).toBe("")
})

test("clearing the camera URL replaces the saved value", async () => {
  localStorage.setItem(
    storageKey,
    JSON.stringify({ kind: "network", url: "http://192.168.1.11/stream" })
  )
  await mountControls()
  await enterUrl("")
  await act(async () => root?.unmount())
  root = null
  await mountControls()
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="Network stream URL"]')
      ?.value
  ).toBe("")
})

test("malformed saved camera settings leave the source controls usable", async () => {
  localStorage.setItem(storageKey, "{not json")
  await mountControls()
  expect(host.querySelector('[aria-label="Eye camera"]')).not.toBeNull()
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Network stream"]')!
      .click()
  )
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="Network stream URL"]')
      ?.value
  ).toBe("")
})

test("switching to USB keeps the saved network URL for later", async () => {
  localStorage.setItem(
    storageKey,
    JSON.stringify({ kind: "network", url: "http://esp32.local/stream" })
  )
  await mountControls()
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="USB camera"]')!.click()
  )
  await act(async () => root?.unmount())
  root = null
  await mountControls()
  expect(host.querySelector('[aria-label="Eye camera"]')).not.toBeNull()
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Network stream"]')!
      .click()
  )
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="Network stream URL"]')
      ?.value
  ).toBe("http://esp32.local/stream")
})

test("unsupported source kinds and non-string URLs restore safe defaults", async () => {
  localStorage.setItem(
    storageKey,
    JSON.stringify({ kind: "unsupported", url: 123 })
  )
  await mountControls()
  expect(host.querySelector('[aria-label="Eye camera"]')).not.toBeNull()
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Network stream"]')!
      .click()
  )
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="Network stream URL"]')
      ?.value
  ).toBe("")
})

test("unavailable browser storage does not prevent editing the camera URL", async () => {
  const readStorage = spyOn(Storage.prototype, "getItem").mockImplementation(
    () => {
      throw new DOMException("Storage is blocked", "SecurityError")
    }
  )
  const writeStorage = spyOn(Storage.prototype, "setItem").mockImplementation(
    () => {
      throw new DOMException("Storage is full", "QuotaExceededError")
    }
  )

  try {
    await mountControls()
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Network stream"]')!
        .click()
    )
    await enterUrl("http://esp32.local/stream")
    expect(
      host.querySelector<HTMLInputElement>('[aria-label="Network stream URL"]')
        ?.value
    ).toBe("http://esp32.local/stream")
  } finally {
    readStorage.mockRestore()
    writeStorage.mockRestore()
  }
})

for (const role of [
  "scene-eye",
  "scene",
  "head",
  "remote-webcam",
  "remote-mobile",
  "remote-ir",
] as const) {
  test(`${role} restores its own device and never overwrites another camera role`, async () => {
    const key = `gazecore.${role}-camera.source.v1`
    localStorage.setItem(
      key,
      JSON.stringify({ kind: "usb", url: "", deviceId: role })
    )
    localStorage.setItem(
      storageKey,
      JSON.stringify({ kind: "usb", url: "", deviceId: "main-eye" })
    )
    try {
      await mountControls(role)
      expect(host.querySelector<HTMLSelectElement>("select")?.value).toBe(role)
      await mountControls("eye")
      expect(host.querySelector<HTMLSelectElement>("select")?.value).toBe(
        "main-eye"
      )
      await mountControls(role)
      expect(host.querySelector<HTMLSelectElement>("select")?.value).toBe(role)
      expect(JSON.parse(localStorage.getItem(storageKey)!).deviceId).toBe(
        "main-eye"
      )
      expect(tracker.startCamera).not.toHaveBeenCalled()
    } finally {
      localStorage.removeItem(key)
    }
  })
}

test("scene eye cameras inherit the previous shared selection once", async () => {
  const sceneKey = "gazecore.scene-eye-camera.source.v1"
  localStorage.removeItem(sceneKey)
  localStorage.setItem(
    storageKey,
    JSON.stringify({ kind: "network", url: "http://esp32.local/stream" })
  )
  try {
    await mountControls("scene-eye")
    expect(
      host.querySelector<HTMLInputElement>('[aria-label="Network stream URL"]')
        ?.value
    ).toBe("http://esp32.local/stream")
    await enterUrl("http://scene-eye.local/stream")
    expect(JSON.parse(localStorage.getItem(storageKey)!).url).toBe(
      "http://esp32.local/stream"
    )
    expect(JSON.parse(localStorage.getItem(sceneKey)!).url).toBe(
      "http://scene-eye.local/stream"
    )
  } finally {
    localStorage.removeItem(sceneKey)
  }
})
