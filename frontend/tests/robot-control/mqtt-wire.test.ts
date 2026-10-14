import { afterEach, expect, test } from "bun:test"
import { createRequire } from "node:module"
import { realpathSync } from "node:fs"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { ZeroSession } from "../../apps/web/src/features/robot-control/zero-session"
import { TargetFollower } from "../../apps/web/src/features/robot-control/target-follower"
import { ObjectTracking } from "../../apps/web/src/features/camera-viewer/object-tracking"
import { SceneCamera } from "../../apps/web/src/features/scene-eye-tracking/scene-camera"
import type { ObjectBox } from "../../apps/web/src/features/camera-viewer/object-tracking.types"
import { liveSnapshot } from "../camera-viewer/fixtures"
if (typeof document === "undefined") GlobalRegistrator.register()
const { default: mqttBrowser } =
  await import("../../apps/web/node_modules/mqtt/dist/mqtt.esm.js")
const requireMqtt = createRequire(
  realpathSync(
    new URL("../../apps/web/node_modules/mqtt/package.json", import.meta.url)
  )
)
const mqttPacket = requireMqtt("mqtt-packet")
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})
async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 1500
  while (!predicate() && Date.now() < deadline) await Bun.sleep(5)
  expect(predicate()).toBe(true)
}
/** Real MQTT 3.1.1 WebSocket receiver, isolated from any physical broker. */
function broker() {
  const received: {
    topic: string
    payload: any
    qos: number
    retain: boolean
  }[] = []
  const sockets = new Set<any>()
  const server = Bun.serve<{ parser: any }>({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request, server) {
      if (server.upgrade(request, { data: { parser: mqttPacket.parser() } }))
        return
      return new Response("WebSocket only", { status: 400 })
    },
    websocket: {
      open(socket) {
        sockets.add(socket)
        socket.data.parser.on("packet", (packet: any) => {
          if (packet.cmd === "connect")
            socket.send(
              mqttPacket.generate({
                cmd: "connack",
                returnCode: 0,
                sessionPresent: false,
              })
            )
          else if (packet.cmd === "pingreq")
            socket.send(mqttPacket.generate({ cmd: "pingresp" }))
          else if (packet.cmd === "publish")
            received.push({
              topic: packet.topic,
              payload: JSON.parse(packet.payload.toString()),
              qos: packet.qos,
              retain: packet.retain,
            })
        })
      },
      message(socket, message) {
        socket.data.parser.parse(Buffer.from(message as any))
      },
      close(socket) {
        sockets.delete(socket)
      },
    },
  })
  cleanup.push(async () => {
    server.stop(true)
  })
  return { received, sockets, url: `ws://127.0.0.1:${server.port}/mqtt` }
}
async function fixture() {
  const wire = broker()
  const session = new ZeroSession({
    // Bun/Happy DOM cannot run MQTT.js's browser timer worker; keep the real WebSocket transport.
    connect: (url, options) =>
      mqttBrowser.connect(url, { ...options, timerVariant: "native" }),
  })
  cleanup.push(() => session.disconnect())
  await session.connect({
    mqttUrl: wire.url,
    commandTopic: "my-bot/car/command",
    mqttUsername: "",
    mqttPassword: "",
  })
  await waitFor(() => session.getSnapshot().canControl)
  let now = 100,
    box: ObjectBox = [0.65, 0.35, 0.95, 0.65],
    present = true
  const scene = new SceneCamera(),
    target = new SceneCamera(),
    s = liveSnapshot(),
    t = liveSnapshot()
  s.frame!.timestamp = t.frame!.timestamp = now
  t.source!.key = "target"
  scene.getSnapshot = () => s
  target.getSnapshot = () => t
  const tracking = new ObjectTracking({
    now: () => now,
    encode: () => "jpeg",
    request: async (request) =>
      request.action === "select"
        ? { token: "selection", box: [0.1, 0.2, 0.4, 0.6], label: "Object" }
        : request.action === "clear"
          ? {}
          : present
            ? { status: "matched", box, score: 0.95, method: "temporal" }
            : { status: "searching" },
  })
  await tracking.select(scene, { box: [0.1, 0.2, 0.4, 0.6] })
  const follower = new TargetFollower(
    session,
    tracking,
    scene,
    target,
    () => now
  )
  const unsubscribe = session.subscribe(() => follower.tick())
  cleanup.push(async () => {
    unsubscribe()
    follower.disable()
    tracking.clear()
  })
  async function frame(next?: ObjectBox) {
    if (next) box = next
    now += 100
    s.frame = { ...s.frame!, timestamp: now, id: s.frame!.id + 1 }
    t.frame = { ...t.frame!, timestamp: now, id: t.frame!.id + 1 }
    await tracking.tick(scene, target)
    follower.tick()
    await Bun.sleep(10)
  }
  return {
    ...wire,
    session,
    follower,
    frame,
    lose: () => {
      present = false
    },
    recover: () => {
      present = true
    },
  }
}
test("Follow sends only L/R/S from real tracker boxes over real MQTT to the user topic", async () => {
  const f = await fixture()
  expect(f.received).toHaveLength(0)
  f.follower.enable({ speed: 25 })
  await f.frame()
  expect(f.received.filter((p) => p.payload.cmd !== "S")).toHaveLength(0)
  await f.frame()
  await waitFor(() => f.received.at(-1)?.payload.cmd === "R")
  for (const [box, cmd] of [
    [[0.05, 0.35, 0.35, 0.65], "L"],
    [[0.45, 0.35, 0.55, 0.65], "S"],
    [[0.25, 0.35, 0.75, 0.65], "S"],
    [[0.35, 0.35, 0.65, 0.65], "S"],
  ] as [ObjectBox, string][]) {
    await f.frame(box)
    await waitFor(() => f.received.at(-1)?.payload.cmd === cmd)
  }
  for (const packet of f.received) {
    expect(packet.topic).toBe("my-bot/car/command")
    expect(Object.keys(packet.payload).sort()).toEqual([
      "cmd",
      "id",
      "speed",
      "timestamp",
    ])
    expect(["L", "R", "S"]).toContain(packet.payload.cmd)
    if (packet.payload.cmd === "S") expect(packet.payload.speed).toBe(0)
    else {
      expect(packet.payload.speed).toBeGreaterThanOrEqual(1)
      expect(packet.payload.speed).toBeLessThanOrEqual(25)
    }
    expect(packet.qos).toBe(0)
    expect(packet.retain).toBe(false)
  }
  const count = f.received.length
  for (const x of [0.41, 0.44, 0.42, 0.25])
    await f.frame([x, 0.35, x + 0.3, 0.65])
  expect(f.received).toHaveLength(count)
  expect(f.follower.getSnapshot().phase).toBe("holding")
})
test("loss sends S over MQTT and recovery needs two fresh matching observations", async () => {
  const f = await fixture()
  f.follower.enable({ speed: 25 })
  await f.frame()
  await f.frame()
  await waitFor(() => f.received.at(-1)?.payload.cmd === "R")
  f.lose()
  await f.frame()
  await waitFor(() => f.received.at(-1)?.payload.cmd === "S")
  const count = f.received.length
  f.recover()
  await f.frame()
  expect(f.received).toHaveLength(count)
  await f.frame()
  await waitFor(() => f.received.at(-1)?.payload.cmd === "R")
  f.follower.disable()
  await waitFor(() => f.received.at(-1)?.payload.cmd === "S")
})

test("real MQTT turn speed rises when the target moves away faster", async () => {
  const f = await fixture()
  f.follower.enable({ speed: 50 })
  await f.frame([0.5, 0.35, 0.8, 0.65])
  await f.frame()
  await waitFor(() => f.received.at(-1)?.payload.cmd === "R")
  const slow = f.received.at(-1)!.payload.speed
  await f.frame([0.57, 0.35, 0.87, 0.65])
  await f.frame([0.63, 0.35, 0.93, 0.65])
  await f.frame()
  await waitFor(() => f.received.at(-1)?.payload.speed > slow)
  expect(f.received.at(-1)!.payload.cmd).toBe("R")
  expect(f.received.at(-1)!.payload.speed).toBeLessThanOrEqual(50)
})
