import assert from "node:assert/strict"
import { startOrReuseCameraRelay } from "../../../apps/web/scripts/camera-relay"

async function checkRelayReuse() {
  const relay = await startOrReuseCameraRelay(0)
  if (!relay) throw new Error("Expected a new relay")
  try {
    const response = await fetch(new URL("/health", relay.url))
    assert.deepEqual(await response.json(), {
      ok: true,
      service: "camera-relay",
    })
    assert.equal(await startOrReuseCameraRelay(relay.port), null)
    assert.equal((await fetch(new URL("/health", relay.url))).ok, true)
  } finally {
    await relay.stop(true)
  }
}

async function checkOccupiedPort() {
  const otherServer = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => Response.json({ ok: true, service: "something-else" }),
  })
  try {
    await assert.rejects(
      startOrReuseCameraRelay(otherServer.port),
      /no healthy camera relay is available/
    )
  } finally {
    await otherServer.stop(true)
  }
}

await checkRelayReuse()
await checkOccupiedPort()
