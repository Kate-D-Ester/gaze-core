import { afterEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
if (typeof document === "undefined") GlobalRegistrator.register()
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
const { act, createElement } = await import("../../apps/web/node_modules/react")
import type { Root } from "../../apps/web/node_modules/react-dom/client"
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { BotControls } =
  await import("../../apps/web/src/features/robot-control/bot-controls")
import { ZeroSession } from "../../apps/web/src/features/robot-control/zero-session"
import { ObjectTracking } from "../../apps/web/src/features/camera-viewer/object-tracking"
import { SceneCamera } from "../../apps/web/src/features/scene-eye-tracking/scene-camera"
import { liveSnapshot } from "../camera-viewer/fixtures"
import { Broker, configuration, status } from "./fixtures"
let root: Root | null = null,
  host: HTMLDivElement,
  session: ZeroSession
let broker: Broker, tracker: ObjectTracking
async function render() {
  const scene = new SceneCamera(),
    target = new SceneCamera(),
    s = liveSnapshot(),
    t = liveSnapshot()
  s.frame!.timestamp = t.frame!.timestamp = performance.now()
  t.source!.key = "target"
  scene.getSnapshot = () => s
  target.getSnapshot = () => t
  tracker = new ObjectTracking({
    now: () => performance.now(),
    encode: () => "jpeg",
    request: async (req) =>
      req.action === "select"
        ? { token: "selection", box: [0.1, 0.2, 0.4, 0.6], label: "Object" }
        : { status: "searching" },
  })
  await tracker.select(scene, { box: [0.1, 0.2, 0.4, 0.6] })
  broker = new Broker(status())
  session = new ZeroSession({
    connect: () => {
      queueMicrotask(() => {
        broker.emit("connect")
        broker.message("zero/test/state", broker.status)
      })
      return broker as any
    },
  })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () =>
    root!.render(
      createElement(BotControls, { tracking: tracker, scene, target, session })
    )
  )
}
afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  host?.remove()
  await session?.disconnect()
  tracker?.clear()
})
const button = (text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (x) => x.textContent === text
  )!
async function input(label: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(field, value)
    field.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
test("connect and queue access enable Follow, and Stop stays available when settings are collapsed", async () => {
  await render()
  expect(button("Follow").disabled).toBe(true)
  await act(async () => button("Bot settings").click())
  await input("Bot MQTT endpoint", configuration.mqttUrl)
  await input("Bot topic prefix", configuration.topicPrefix)
  await act(async () =>
    host
      .querySelector("form[aria-label='Bot connection']")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  )
  expect(host.querySelector("[role=alert]")?.textContent).toBeUndefined()
  const deadline = Date.now() + 1000
  while (!session.getSnapshot().online && Date.now() < deadline)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  expect(session.getSnapshot().online).toBe(true)
  await act(async () => button("Request control").click())
  const accessDeadline = Date.now() + 1000
  while (!session.getSnapshot().canControl && Date.now() < accessDeadline)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  expect(button("Follow").disabled).toBe(false)
  await act(async () => button("Follow").click())
  expect(button("Follow").getAttribute("aria-pressed")).toBe("true")
  expect(button("Stop bot").disabled).toBe(false)
  await act(async () => button("Stop bot").click())
  expect(button("Follow").getAttribute("aria-pressed")).toBe("false")
  expect(broker.sent.some((x) => x.packet.action === "stop")).toBe(true)
  expect(localStorage.getItem("gazecore.bot.credentials")).toBeNull()
})
test("losing page focus stops following without automatically rearming it", async () => {
  await render()
  await act(async () => session.connect(configuration))
  await act(async () => session.join("Gaze viewer"))
  await act(async () => button("Follow").click())
  expect(button("Follow").getAttribute("aria-pressed")).toBe("true")
  await act(async () => window.dispatchEvent(new Event("blur")))
  expect(button("Follow").getAttribute("aria-pressed")).toBe("false")
  await act(async () => window.dispatchEvent(new Event("focus")))
  expect(button("Follow").getAttribute("aria-pressed")).toBe("false")
})
