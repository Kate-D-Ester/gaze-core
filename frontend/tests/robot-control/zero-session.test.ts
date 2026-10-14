import { afterEach, expect, test } from "bun:test"
import {
  ZeroSession,
  validateBotConfiguration,
} from "../../apps/web/src/features/robot-control/zero-session"
import { Broker, configuration } from "./fixtures"
const clients: ZeroSession[] = []
afterEach(async () => {
  await Promise.all(clients.splice(0).map((session) => session.disconnect()))
})
async function fixture() {
  const broker = new Broker()
  let options: any
  const session = new ZeroSession({
    now: () => 1700000000000,
    connect: (_url, supplied) => {
      options = supplied
      return broker as any
    },
  })
  clients.push(session)
  await session.connect(configuration)
  broker.emit("connect")
  return { session, broker, options }
}
test("MQTT connection is ready without robot telemetry or queue enrollment", async () => {
  const { session, broker, options } = await fixture()
  expect(session.getSnapshot().canControl).toBe(true)
  expect(broker.sent).toHaveLength(0)
  expect(options.queueQoSZero).toBe(false)
  expect(options.will.topic).toBe("test/car/command")
  expect(JSON.parse(options.will.payload).cmd).toBe("S")
  expect(options.will.retain).toBe(false)
})
test("left and right publish the literal Zero car format to the exact user topic", async () => {
  const { session, broker } = await fixture()
  for (const cmd of ["L", "R"] as const) {
    await session.move("car", cmd, 25, () => true)
    const sent = broker.sent.at(-1)!
    expect(sent.topic).toBe("test/car/command")
    expect(sent.packet).toEqual({
      cmd,
      speed: 25,
      timestamp: 1700000000000,
      id: broker.sent.length,
    })
    expect(sent.options).toEqual({ qos: 0, retain: false })
  }
  await session.stop()
  expect(broker.sent.at(-1)!.packet).toEqual({
    cmd: "S",
    speed: 0,
    timestamp: 1700000000000,
    id: 3,
  })
})
test("stop cancels queued movement and a false observation guard never publishes", async () => {
  const { session, broker } = await fixture()
  const movement = session.move("car", "R", 25, () => true)
  const stopping = session.stop()
  await expect(movement).rejects.toThrow()
  await stopping
  expect(broker.sent.map((x) => x.packet.cmd)).toEqual(["S"])
  await expect(session.move("car", "R", 25, () => false)).rejects.toThrow()
  expect(broker.sent).toHaveLength(1)
})
test("offline movement never queues and reconnect changes the follow authority", async () => {
  const { session, broker } = await fixture()
  const authority = session.getSnapshot().authority
  const queued = session.move("car", "R", 25, () => true)
  broker.emit("offline")
  await expect(queued).rejects.toThrow()
  expect(session.getSnapshot().canControl).toBe(false)
  await expect(session.move("car", "R", 25, () => true)).rejects.toThrow()
  broker.emit("connect")
  expect(session.getSnapshot().authority).not.toBe(authority)
  expect(broker.sent).toHaveLength(0)
})
test("publication failure is visible and prevents more movement", async () => {
  const { session, broker } = await fixture()
  broker.publish = (_topic, _value, _options, callback) =>
    callback(new Error("failed"))
  await expect(session.move("car", "R", 25, () => true)).rejects.toThrow()
  expect(session.getSnapshot().error).toContain("publication")
  expect(session.getSnapshot().canControl).toBe(false)
})
test("disconnect publishes S and stale callbacks cannot reconnect an ended session", async () => {
  const { session, broker } = await fixture()
  await session.move("car", "R", 25, () => true)
  await session.disconnect()
  expect(broker.sent.map((x) => x.packet.cmd)).toEqual(["R", "S"])
  expect(broker.ended).toBe(true)
  broker.emit("connect")
  expect(session.getSnapshot().connected).toBe(false)
})
test("invalid broker URLs and wildcard or empty topics never connect", () => {
  for (const commandTopic of ["", "car/#", "car/+", "bad\u0000topic"])
    expect(() =>
      validateBotConfiguration({ ...configuration, commandTopic })
    ).toThrow()
  for (const mqttUrl of [
    "mqtt://broker.example",
    "https://broker.example",
    "ws://user:pass@broker.example/mqtt",
  ])
    expect(() =>
      validateBotConfiguration({ ...configuration, mqttUrl })
    ).toThrow()
  expect(
    validateBotConfiguration({
      ...configuration,
      commandTopic: " /custom/car/ ",
    }).commandTopic
  ).toBe("/custom/car/")
})
test("invalid actions, direction, and speed never publish", async () => {
  const { session, broker } = await fixture()
  for (const [action, cmd, speed] of [
    ["arm", "R", 25],
    ["car", "U", 25],
    ["car", "F", 25],
    ["car", "B", 25],
    ["car", "R", 0],
    ["car", "R", NaN],
  ])
    await expect(
      session.move(action as any, cmd as any, speed as number, () => true)
    ).rejects.toThrow()
  expect(broker.sent).toHaveLength(0)
})

test("disconnect supersedes a pending connect before it can open a transport", async () => {
  let opened = 0
  const broker = new Broker()
  const session = new ZeroSession({
    connect: () => {
      opened++
      return broker as any
    },
  })
  clients.push(session)
  const connecting = session.connect(configuration)
  const closing = session.disconnect()
  await Promise.all([connecting, closing])
  broker.emit("connect")
  expect(opened).toBe(0)
  expect(session.getSnapshot().canControl).toBe(false)
})
test("two simultaneous connect calls open only the latest configuration", async () => {
  const urls: string[] = []
  const broker = new Broker()
  const session = new ZeroSession({
    connect: (url) => {
      urls.push(url)
      return broker as any
    },
  })
  clients.push(session)
  await Promise.all([
    session.connect(configuration),
    session.connect({ ...configuration, mqttUrl: "wss://latest.example/mqtt" }),
  ])
  expect(urls).toEqual(["wss://latest.example/mqtt"])
})
