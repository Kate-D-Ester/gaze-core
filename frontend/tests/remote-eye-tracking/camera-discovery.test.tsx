import { expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { useRemoteTracker } from "../../apps/web/src/features/remote-eye-tracking/use-remote-tracker"

if (typeof document === "undefined") GlobalRegistrator.register()
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const { act, createElement, Fragment } =
  await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const settings = { roi: { x: 0, y: 0, width: 1, height: 1 }, threshold: 0 }

function camera(deviceId: string, label: string): MediaDeviceInfo {
  const value = { deviceId, label, kind: "videoinput" as const, groupId: "" }
  return { ...value, toJSON: () => value }
}
function Harness() {
  const tracker = useRemoteTracker(settings)
  return createElement(
    Fragment,
    null,
    createElement("video", { ref: tracker.videoRef }),
    createElement(
      "select",
      null,
      tracker.state.devices.map((device) =>
        createElement(
          "option",
          {
            key: device.deviceId,
            value: device.deviceId,
          },
          device.label || "Unnamed camera"
        )
      )
    ),
    createElement("output", null, tracker.state.status),
    createElement(
      "button",
      { onClick: () => void tracker.requestCameraAccess() },
      "Reveal cameras"
    ),
    createElement("button", { onClick: tracker.stop }, "Stop")
  )
}

test("the hook discovers cameras on mount, reveals labels on request, and removes hotplug discovery on unmount", async () => {
  const mediaDescriptor = Object.getOwnPropertyDescriptor(
    navigator,
    "mediaDevices"
  )
  const secureDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "isSecureContext"
  )
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  let available = [camera("", "")]
  let requests = 0,
    stopped = 0,
    enumerations = 0
  let constraints: MediaStreamConstraints | undefined
  const changes = new EventTarget()
  const media = Object.assign(changes, {
    enumerateDevices: async () => {
      enumerations++
      return available
    },
    getUserMedia: async (requested: MediaStreamConstraints) => {
      requests++
      constraints = requested
      available = [
        camera("front", "Built-in camera"),
        camera("usb", "USB camera"),
      ]
      const track = { stop: () => stopped++ }
      return {
        getTracks: () => [track],
        getVideoTracks: () => [track],
      } as unknown as MediaStream
    },
  })
  const choices = () =>
    [...host.querySelectorAll("option")].map((option) => option.value)
  try {
    Object.defineProperty(globalThis, "isSecureContext", {
      configurable: true,
      value: true,
    })
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: media,
    })
    await act(async () => root.render(createElement(Harness)))
    expect(choices()).toEqual([""])
    expect(requests).toBe(0)
    await act(async () =>
      host.querySelector<HTMLButtonElement>("button")!.click()
    )
    expect(constraints).toEqual({ audio: false, video: true })
    expect(choices()).toEqual(["front", "usb"])
    expect(stopped).toBe(1)
    expect(host.querySelector("output")?.textContent).toBe("idle")
    expect(host.querySelector("video")?.srcObject).toBeNull()
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Stop")!
        .click()
    )
    available = [camera("usb", "USB camera")]
    await act(async () => changes.dispatchEvent(new Event("devicechange")))
    expect(choices()).toEqual(["usb"])
    await act(async () => root.unmount())
    const count = enumerations
    changes.dispatchEvent(new Event("devicechange"))
    expect(enumerations).toBe(count)
  } finally {
    await act(async () => root.unmount())
    host.remove()
    if (mediaDescriptor)
      Object.defineProperty(navigator, "mediaDevices", mediaDescriptor)
    else Reflect.deleteProperty(navigator, "mediaDevices")
    if (secureDescriptor)
      Object.defineProperty(globalThis, "isSecureContext", secureDescriptor)
    else Reflect.deleteProperty(globalThis, "isSecureContext")
  }
})
