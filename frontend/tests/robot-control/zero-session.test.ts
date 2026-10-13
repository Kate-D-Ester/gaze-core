import { afterEach, expect, test } from "bun:test"
import { ZeroSession } from "../../apps/web/src/features/robot-control/zero-session"
import {
  createGuestIdentity,
  signMessage,
} from "../../apps/web/src/features/robot-control/zero-protocol"
import { Broker, configuration, status } from "./fixtures"
const clients: ZeroSession[] = []
afterEach(async () => {
  await Promise.all(clients.splice(0).map((session) => session.disconnect()))
})
async function fixture(retained = false) {
  const broker = new Broker(status())
  let options: any
  const session = new ZeroSession({
    connect: (url: any, supplied: any) => {
      options = supplied
      return broker as any
    },
  })
  clients.push(session)
  await session.connect(configuration)
  broker.emit("connect")
  broker.message("zero/test/state", broker.status, retained)
  return { session, broker, options }
}
test("guest packets match the firmware signature format and detect a changed direction", async () => {
  const identity = await createGuestIdentity()
  const packet = await signMessage(identity, {
    boot: "a".repeat(32),
    seq: 1,
    action: "car",
    data: { cmd: "F", speed: 25, epoch: 2 },
  })
  expect(packet.data).toBe('{"cmd":"F","speed":25,"epoch":2}')
  expect(packet.signature).toMatch(/^[0-9a-f]{128}$/)
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(identity.publicKey.match(/../g)!, (x) => parseInt(x, 16)),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  )
  const canonical = [
    "guest",
    packet.boot,
    packet.session,
    1,
    "car",
    packet.data,
  ].join("\n")
  expect(
    await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      Uint8Array.from(packet.signature.match(/../g)!, (x) => parseInt(x, 16)),
      new TextEncoder().encode(canonical)
    )
  ).toBe(true)
  expect(
    await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      Uint8Array.from(packet.signature.match(/../g)!, (x) => parseInt(x, 16)),
      new TextEncoder().encode(canonical.replace('"F"', '"B"'))
    )
  ).toBe(false)
})
test("join enrolls with a challenge before publishing authenticated non-retained movement", async () => {
  const { session, broker, options } = await fixture()
  expect(options.queueQoSZero).toBe(false)
  await session.join("Gaze viewer")
  expect(session.getSnapshot().canControl).toBe(true)
  await session.move("car", "R", 25, () => true)
  const command = broker.sent.at(-1)!
  expect(command.topic).toBe("zero/test/control")
  expect(command.packet.action).toBe("car")
  expect(JSON.parse(command.packet.data)).toEqual({
    cmd: "R",
    speed: 25,
    epoch: 2,
  })
  expect(command.options).toEqual({ qos: 0, retain: false })
  expect(
    broker.sent.find((x) => x.packet.action === "join")!.packet.data
  ).toContain('"challenge":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"')
})
test("retained status cannot enable access or motion until live telemetry arrives", async () => {
  const { session } = await fixture(true)
  expect(session.getSnapshot().online).toBe(false)
  await expect(session.join("Gaze viewer")).rejects.toThrow()
})
test("stop cancels queued movement and expires its observation guard", async () => {
  const { session, broker } = await fixture()
  await session.join("Gaze viewer")
  const motion = session.move("car", "F", 25, () => true)
  const stopping = session.stop()
  await motion.catch(() => {})
  await stopping
  expect(broker.sent.some((x) => x.packet.action === "car")).toBe(false)
  expect(broker.sent.at(-1)!.packet.action).toBe("stop")
  const before = broker.sent.length
  await session.move("car", "F", 25, () => false).catch(() => {})
  expect(broker.sent.length).toBe(before)
})
test("revocation and offline broker prevent further movement", async () => {
  const { session, broker } = await fixture()
  await session.join("Gaze viewer")
  const movement = session.move("car", "F", 25, () => true)
  broker.status = { ...broker.status, epoch: 3, current: "other" }
  broker.message("zero/test/state", broker.status)
  await movement.catch(() => {})
  expect(broker.sent.some((x) => x.packet.action === "car")).toBe(false)
  broker.emit("offline")
  expect(session.getSnapshot().canControl).toBe(false)
  await expect(session.move("car", "F", 25, () => true)).rejects.toThrow()
})
test("invalid broker schemes and wildcard topics never start a connection", async () => {
  const { session } = await fixture()
  await expect(
    session.connect({ ...configuration, topicPrefix: "zero/#" })
  ).rejects.toThrow()
  await expect(
    session.connect({ ...configuration, mqttUrl: "mqtt://broker.example" })
  ).rejects.toThrow()
})

test("a successful access grant can arrive before its enrollment acknowledgment", async () => {
  const { session, broker } = await fixture()
  const original = broker.publish.bind(broker)
  broker.publish = (topic, value, options, callback) => {
    const packet = JSON.parse(value)
    if (packet.action !== "join")
      return original(topic, value, options, callback)
    broker.sent.push({ topic, packet, options })
    callback(null)
    broker.status = {
      ...broker.status,
      epoch: 3,
      current: packet.session,
      queue: [{ name: "Gaze viewer", session: packet.session }],
    }
    broker.message("zero/test/state", broker.status)
    broker.message(`zero/test/reply/${packet.session}`, {
      session: packet.session,
      seq: packet.seq,
      ok: true,
    })
  }
  await session.join("Gaze viewer")
  expect(session.getSnapshot().canControl).toBe(true)
})
test("firmware rejection of a movement is visible and blocks further movement", async () => {
  const { session, broker } = await fixture()
  await session.join("Gaze viewer")
  await session.move("car", "F", 25, () => true)
  const packet = broker.sent.at(-1)!.packet
  broker.message(`zero/test/reply/${packet.session}`, {
    session: packet.session,
    seq: packet.seq,
    ok: false,
    error: "Control access is unavailable",
  })
  expect(session.getSnapshot().error).toContain("Control access is unavailable")
  expect(session.getSnapshot().canControl).toBe(false)
  await expect(session.move("car", "F", 25, () => true)).rejects.toThrow()
})

test("graceful disconnect sends signed leave after stop so the control name can be reused", async () => {
  const { session, broker } = await fixture()
  await session.join("Gaze viewer")
  await session.disconnect()
  expect(broker.sent.slice(-2).map((x) => x.packet.action)).toEqual([
    "stop",
    "leave",
  ])
  expect(broker.sent.at(-1)!.packet.role).toBe("guest")
  await session.connect(configuration)
  broker.emit("connect")
  broker.message("zero/test/state", broker.status)
  await session.join("Gaze viewer")
  expect(session.getSnapshot().canControl).toBe(true)
})
