import { expect, test } from "bun:test"
import {
  liveReplySchema,
  decodeAudio,
} from "../../apps/web/src/features/speaker-focus/live-schema"
import { StreamConnection } from "../../apps/web/src/features/speaker-focus/stream-connection"
test("v2 accepts variable output lengths and rejects obsolete or inconsistent audio", () => {
  const pcm = new Float32Array(28780)
  const reply = {
    type: "audio",
    generation: 1,
    start_sample: 917,
    sample_count: pcm.length,
    sample_rate: 16000,
    capture_spans: [
      { start_sample: 917, end_sample: 917 + pcm.length, capture_time: 1 },
    ],
    device: "mps",
    timings: { processing_seconds: 1.2 },
    queued_windows: 1,
    pcm: Buffer.from(pcm.buffer).toString("base64"),
  }
  expect(decodeAudio(liveReplySchema.parse(reply) as never).pcm.length).toBe(
    pcm.length
  )
  expect(
    liveReplySchema.safeParse({ ...reply, sample_count: 28781 }).success
  ).toBe(false)
  expect(
    liveReplySchema.safeParse({ ...reply, capture_spans: [] }).success
  ).toBe(false)
  const bad = new Float32Array([NaN])
  expect(
    liveReplySchema.safeParse({
      ...reply,
      sample_count: 1,
      capture_spans: [{ start_sample: 917, end_sample: 918, capture_time: 1 }],
      pcm: Buffer.from(bad.buffer).toString("base64"),
    }).success
  ).toBe(false)
  expect(
    liveReplySchema.safeParse({
      type: "ready",
      generation: 0,
      device: "mps",
      window_seconds: 2,
      stride_seconds: 1,
      playout_seconds: 4,
    }).success
  ).toBe(false)
})
test("abort while connecting closes the socket and ignores late replies", async () => {
  let closed = 0
  const socket = {
    readyState: 0,
    close: () => closed++,
    send() {},
    bufferedAmount: 0,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  } as unknown as WebSocket
  const replies: unknown[] = []
  const connection = new StreamConnection({
    baseUrl: "http://127.0.0.1:4033",
    socketFactory: () => socket,
    onReply: (r) => replies.push(r),
    onError() {},
  })
  const abort = new AbortController()
  const opening = connection.open(
    { source: "replay", video_offset_ms: 0, client_time: 1 },
    abort.signal
  )
  abort.abort()
  await expect(opening).rejects.toThrow()
  expect(closed).toBe(1)
  expect(replies).toEqual([])
})
