import assert from "node:assert/strict"
import { proxyVision } from "../../../apps/web/src/features/camera-viewer/vision-bridge"

const configuration = {
  url: "http://127.0.0.1:49999",
  secret: "local-test-secret",
}
function request(body: string, origin = "http://localhost:4014") {
  return new Request("http://localhost:4014/api/viewer-vision", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body,
  })
}
const scenario = process.argv[2]
if (scenario === "validation") {
  assert.equal(
    (
      await proxyVision(
        request('{"action":"status"}', "https://unrelated.example"),
        configuration
      )
    ).status,
    403
  )
  assert.equal(
    (await proxyVision(request("x".repeat(2 * 1024 * 1024 + 1)), configuration))
      .status,
    413
  )
} else if (scenario === "forward") {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(input) {
      if (input.headers.get("Authorization") !== "Bearer local-test-secret") {
        return Response.json({ error: "Unauthorized" }, { status: 401 })
      }
      const body = await input.json()
      return Response.json({
        status: body.action === "status" ? "ready" : "searching",
      })
    },
  })
  try {
    const result = await proxyVision(request('{"action":"status"}'), {
      ...configuration,
      url: `http://127.0.0.1:${server.port}`,
    })
    assert.deepEqual(await result.json(), { status: "ready" })
    const rewritten = new Request("http://localhost:4014/api/viewer-vision", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:4014",
        Host: "127.0.0.1:4014",
        "Content-Type": "application/json",
      },
      body: '{"action":"status"}',
    })
    const hostnameResult = await proxyVision(rewritten, {
      ...configuration,
      url: `http://127.0.0.1:${server.port}`,
    })
    assert.equal(hostnameResult.status, 200)
    const rebound = new Request("http://localhost:4014/api/viewer-vision", {
      method: "POST",
      headers: {
        Origin: "http://unrelated.example:4014",
        Host: "unrelated.example:4014",
        "Content-Type": "application/json",
      },
      body: '{"action":"status"}',
    })
    assert.equal((await proxyVision(rebound, configuration)).status, 403)
    assert.equal(result.headers.get("cache-control"), "no-store")
    assert.equal(
      (
        await proxyVision(
          request('{"action":"fetch-url","url":"https://camera"}'),
          configuration
        )
      ).status,
      400
    )
    assert.equal(
      (
        await proxyVision(request('{"action":"status"}'), {
          url: "https://external.example",
          secret: "x",
        })
      ).status,
      503
    )
  } finally {
    server.stop(true)
  }
} else if (scenario === "missing") {
  const result = await proxyVision(request('{"action":"status"}'), {
    url: "",
    secret: "",
  })
  assert.equal(result.status, 503)
  assert.match((await result.json()).error, /restart/)
} else {
  throw new Error("Unknown bridge test scenario")
}
