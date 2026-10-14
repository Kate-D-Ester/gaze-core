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
import { Broker, configuration } from "./fixtures"
let root: Root | null = null,
  host: HTMLDivElement,
  session: ZeroSession
let broker: Broker, tracker: ObjectTracking
const originalFetch = globalThis.fetch
async function render() {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input) === "/api/bot-config") return Response.json(configuration)
    return originalFetch(input)
  }) as typeof fetch
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
  broker = new Broker()
  session = new ZeroSession({
    connect: () => {
      queueMicrotask(() => {
        broker.emit("connect")
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
  globalThis.fetch = originalFetch
})
const button = (text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (x) => x.textContent === text
  )!
test("connect enables Follow directly, and Stop stays available when settings are collapsed", async () => {
  await render()
  expect(button("Follow").disabled).toBe(true)
  expect(host.querySelector('[aria-label="Bot MQTT endpoint"]')).toBeNull()
  expect(host.querySelector('[aria-label="Bot command topic"]')).toBeNull()
  await act(async () => button("Connect bot").click())
  expect(host.querySelector("[role=alert]")?.textContent).toBeUndefined()
  const deadline = Date.now() + 1000
  while (!session.getSnapshot().canControl && Date.now() < deadline)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  expect(session.getSnapshot().canControl).toBe(true)
  expect(button("Request control")).toBeUndefined()
  const accessDeadline = Date.now() + 1000
  while (!session.getSnapshot().canControl && Date.now() < accessDeadline)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  expect(broker.sent).toHaveLength(0)
  expect(button("Follow").disabled).toBe(false)
  await act(async () => button("Follow").click())
  expect(button("Follow").getAttribute("aria-pressed")).toBe("true")
  expect(button("Stop bot").disabled).toBe(false)
  await act(async () => button("Stop bot").click())
  expect(button("Follow").getAttribute("aria-pressed")).toBe("false")
  expect(broker.sent.some((x) => x.packet.cmd === "S")).toBe(true)
  expect(localStorage.getItem("gazecore.bot.credentials")).toBeNull()
})
test("losing page focus stops following without automatically rearming it", async () => {
  await render()
  await act(async () => session.connect(configuration))
  await act(async () => button("Follow").click())
  expect(button("Follow").getAttribute("aria-pressed")).toBe("true")
  await act(async () => window.dispatchEvent(new Event("blur")))
  expect(button("Follow").getAttribute("aria-pressed")).toBe("false")
  await act(async () => window.dispatchEvent(new Event("focus")))
  expect(button("Follow").getAttribute("aria-pressed")).toBe("false")
})

test("Stop remains available to retry after an MQTT publication error", async () => {
  await render()
  await act(async () => session.connect(configuration))
  await act(async () => broker.emit("error", new Error("transport error")))
  expect(button("Follow").disabled).toBe(true)
  expect(button("Stop bot").disabled).toBe(false)
  const count = broker.sent.length
  await act(async () => button("Stop bot").click())
  expect(broker.sent.length).toBeGreaterThan(count)
  expect(broker.sent.at(-1)!.packet.cmd).toBe("S")
})

test("reconnecting keeps Disconnect available without exposing MQTT fields", async () => {
  await render()
  await act(async () => button("Connect bot").click())
  await act(async () => broker.emit("offline"))
  expect(button("Disconnect bot")).toBeDefined()
  expect(host.querySelector('[aria-label="Bot MQTT endpoint"]')).toBeNull()
  expect(button("Follow").disabled).toBe(true)
})
test("missing local configuration shows a connection error without asking for credentials", async () => {
  await render()
  globalThis.fetch = (async () =>
    Response.json(
      { error: "Bot MQTT is not configured locally." },
      { status: 503 }
    )) as typeof fetch
  await act(async () => button("Connect bot").click())
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "not configured locally"
  )
  expect(button("Follow").disabled).toBe(true)
  expect(host.querySelector('input[type="password"]')).toBeNull()
})

test("a configuration response after unmount cannot reconnect the bot", async () => {
  await render()
  let resolveConfiguration!: (value: Response) => void
  globalThis.fetch = (() =>
    new Promise<Response>((resolve) => {
      resolveConfiguration = resolve
    })) as typeof fetch
  await act(async () => button("Connect bot").click())
  await act(async () => root!.unmount())
  root = null
  resolveConfiguration(Response.json(configuration))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5))
  })
  expect(session.getSnapshot().connected).toBe(false)
  expect(session.getSnapshot().connecting).toBe(false)
})
