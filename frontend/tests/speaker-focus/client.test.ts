import { expect, test } from "bun:test"
import { SpeakerClient } from "../../apps/web/src/features/speaker-focus/client"

const id = "c".repeat(32)
const health = {
  ready: true,
  model_state: "ready",
  engine: "RTFS-Net-4-LRS2",
  device: "cpu",
  error: null,
  clip: true,
  live: false,
  max_upload_bytes: 125829120,
  max_duration: 120,
  queued: 0,
  window_seconds: 2,
  stride_seconds: 1,
}
const respond =
  (value: unknown, status = 200) =>
  async () =>
    Response.json(value, { status })

test("validates health and forwards request cancellation", async () => {
  const controller = new AbortController()
  const client = new SpeakerClient({
    fetcher: async (_url, init) => {
      expect(init?.signal).toBeDefined()
      expect(init?.credentials).toBe("omit")
      return Response.json(health)
    },
  })
  expect((await client.health(controller.signal)).device).toBe("cpu")
})

test("rejects malformed service output instead of assuming focused success", async () => {
  const client = new SpeakerClient({
    fetcher: respond({ id, status: "done", audio_url: "/mixture.wav" }),
  })
  await expect(client.job(id)).rejects.toMatchObject({
    code: "invalid_response",
  })
})

test("exposes stable HTTP errors", async () => {
  const client = new SpeakerClient({
    fetcher: respond({ code: "queue_full", message: "Queue is full" }, 429),
  })
  await expect(client.health()).rejects.toMatchObject({
    code: "queue_full",
    message: "Queue is full",
  })
})

test("reports local service loss with an actionable message", async () => {
  const client = new SpeakerClient({
    fetcher: async () => {
      throw new TypeError("Failed to fetch")
    },
  })
  await expect(client.health()).rejects.toMatchObject({
    code: "service_unavailable",
  })
})

test("aborted requests preserve abort identity", async () => {
  const signal = AbortSignal.abort()
  const client = new SpeakerClient({
    fetcher: async (_url, init) => {
      init?.signal?.throwIfAborted()
      return Response.json(health)
    },
  })
  await expect(client.health(signal)).rejects.toHaveProperty(
    "name",
    "AbortError"
  )
})

test("refuses remote service endpoints and remote output URLs", () => {
  expect(() => new SpeakerClient({ baseUrl: "https://evil.example" })).toThrow()
  const client = new SpeakerClient()
  expect(() => client.outputUrl("https://evil.example/audio")).toThrow()
  expect(() => client.outputUrl("/jobs/../etc/passwd")).toThrow()
})

test("bounded polling stops at timeout", async () => {
  const client = new SpeakerClient({
    fetcher: respond({
      id,
      status: "queued",
      media: null,
      tracks: [],
      error: null,
    }),
  })
  await expect(
    client.waitForClip(id, undefined, { timeoutMs: 5, intervalMs: 1 })
  ).rejects.toMatchObject({ code: "poll_timeout" })
})

test("cancel requests use DELETE and cannot publish output", async () => {
  const client = new SpeakerClient({
    fetcher: async (url, init) => {
      expect(url.toString()).toEndWith("/jobs/" + id)
      expect(init?.method).toBe("DELETE")
      return new Response(null, { status: 204 })
    },
  })
  await client.cancel(id)
})

test("rejects a valid job response belonging to an older selection", async () => {
  const job = {
    id,
    clip_id: id,
    target_id: "other",
    generation: 1,
    status: "queued",
    progress: 0,
    error: null,
    audio_url: null,
    preview_url: null,
    elapsed_seconds: null,
    window_p95_seconds: null,
    device: null,
  }
  const client = new SpeakerClient({ fetcher: respond(job) })
  await expect(client.extract(id, "selected", 2)).rejects.toMatchObject({
    code: "invalid_response",
  })
})

test("rejects clip and job responses with mismatched request IDs", async () => {
  const client = new SpeakerClient({
    fetcher: respond({
      id: "a".repeat(32),
      status: "ready",
      media: null,
      tracks: [],
      error: null,
    }),
  })
  await expect(client.clip(id)).rejects.toMatchObject({
    code: "invalid_response",
  })
})
