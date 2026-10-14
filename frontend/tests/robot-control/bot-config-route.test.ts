import { afterEach, beforeEach, expect, test } from "bun:test"
import { GET } from "../../apps/web/src/app/api/bot-config/route"
const keys = [
  "GAZE_BOT_MQTT_URL",
  "GAZE_BOT_COMMAND_TOPIC",
  "GAZE_BOT_MQTT_USERNAME",
  "GAZE_BOT_MQTT_PASSWORD",
] as const
let previous: (string | undefined)[]
beforeEach(() => {
  previous = keys.map((key) => process.env[key])
  process.env.GAZE_BOT_MQTT_URL = "wss://test-broker.example/mqtt"
  process.env.GAZE_BOT_COMMAND_TOPIC = "my/car/command"
  process.env.GAZE_BOT_MQTT_USERNAME = "test-only-user"
  process.env.GAZE_BOT_MQTT_PASSWORD = "test-only-password"
})
afterEach(() =>
  keys.forEach((key, index) => {
    if (previous[index] === undefined) delete process.env[key]
    else process.env[key] = previous[index]
  })
)
test("same-origin local Connect gets only the allowlisted environment settings with no caching", async () => {
  const response = GET(
    new Request("http://127.0.0.1:4016/api/bot-config", {
      headers: { "sec-fetch-site": "same-origin" },
    })
  )
  expect(response.status).toBe(200)
  expect(response.headers.get("cache-control")).toBe("no-store")
  expect(await response.json()).toEqual({
    mqttUrl: "wss://test-broker.example/mqtt",
    commandTopic: "my/car/command",
    mqttUsername: "test-only-user",
    mqttPassword: "test-only-password",
  })
})
test("cross-origin and non-loopback requests cannot retrieve broker configuration", () => {
  // Incoming server headers must retain Origin/Sec-Fetch-Site; Happy DOM's outgoing Request strips them.
  for (const [url, metadata] of [
    [
      "http://127.0.0.1:4016/api/bot-config",
      { origin: "https://unrelated.example" },
    ],
    [
      "http://127.0.0.1:4016/api/bot-config",
      { "sec-fetch-site": "cross-site" },
    ],
    ["http://192.168.1.2:4016/api/bot-config", {}],
  ] as [string, Record<string, string>][]) {
    const request = new Request(url)
    Object.defineProperty(request, "headers", { value: new Headers(metadata) })
    expect(GET(request).status).toBe(403)
  }
})
test("missing or invalid configuration returns a generic error without credentials", async () => {
  for (const mqttUrl of [
    "",
    "http://invalid.example",
    "wss://user:test-only-password@broker.example/mqtt",
  ]) {
    process.env.GAZE_BOT_MQTT_URL = mqttUrl
    const response = GET(new Request("http://localhost:4016/api/bot-config"))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: "Bot MQTT is not configured locally.",
    })
  }
})
test("anonymous brokers need no optional credential values in the environment", async () => {
  delete process.env.GAZE_BOT_MQTT_USERNAME
  delete process.env.GAZE_BOT_MQTT_PASSWORD
  delete process.env.GAZE_BOT_COMMAND_TOPIC
  const response = GET(new Request("http://localhost:4016/api/bot-config"))
  expect(await response.json()).toEqual({
    mqttUrl: "wss://test-broker.example/mqtt",
    commandTopic: "alice/zero/car/command",
    mqttUsername: "",
    mqttPassword: "",
  })
})

test("the browser Host is authoritative when Next rewrites the internal URL", () => {
  const request = new Request("http://localhost:4016/api/bot-config")
  Object.defineProperty(request, "headers", {
    value: new Headers({
      host: "unrelated.example",
      "sec-fetch-site": "same-origin",
    }),
    configurable: true,
  })
  expect(GET(request).status).toBe(403)
  Object.defineProperty(request, "headers", {
    value: new Headers({
      host: "127.0.0.1:4016",
      origin: "http://127.0.0.1:4016",
      "sec-fetch-site": "same-origin",
    }),
    configurable: true,
  })
  expect(GET(request).status).toBe(200)
})
