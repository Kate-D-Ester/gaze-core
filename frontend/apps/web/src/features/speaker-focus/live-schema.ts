import { z } from "zod"
import { trackSchema } from "./client-schema"
import type { StreamAudioChunk } from "./live-player.types"
const number = z.number().finite().nonnegative()
const sample = number.int().max(Number.MAX_SAFE_INTEGER)
const generation = number.int().max(0xffffffff)
const captureSchema = z
  .object({ start_sample: sample, end_sample: sample, capture_time: number })
  .strict()
const audioSchema = z
  .object({
    type: z.literal("audio"),
    generation,
    start_sample: sample,
    sample_count: number.int().positive().max(128000),
    sample_rate: z.literal(16000),
    device: z.string(),
    timings: z.record(z.string(), number),
    queued_windows: number.int().max(2),
    capture_spans: z.array(captureSchema).min(1).max(256),
    pcm: z
      .string()
      .max(700000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict()
  .refine((reply) => {
    try {
      const chunk = decodeAudio(reply)
      let cursor = chunk.startSample
      for (const span of chunk.captures) {
        if (span.startSample !== cursor || span.endSample <= cursor) {
          return false
        }
        cursor = span.endSample
      }
      return (
        chunk.pcm.length === reply.sample_count &&
        chunk.pcm.every(Number.isFinite) &&
        cursor === chunk.startSample + chunk.pcm.length
      )
    } catch {
      return false
    }
  }, "Audio length or capture mapping is invalid")
export const liveReplySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("ready"),
      generation,
      device: z.string(),
      protocol_version: z.literal(2),
      window_samples: number.int().positive().max(128000),
      stride_samples: number.int().positive().max(128000),
      noise_processor: z.string(),
      warm_timings: z.array(number).length(3),
    })
    .strict(),
  z
    .object({
      type: z.literal("selected"),
      generation,
      target_id: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal("faces"),
      generation,
      tracks: z.array(trackSchema).max(6),
    })
    .strict(),
  z
    .object({
      type: z.literal("error"),
      generation,
      code: z.string(),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("flow"),
      generation,
      action: z.enum(["pause", "resume"]),
      queued_windows: number.int().max(3),
      reason: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("drained"),
      generation,
      source_end_sample: sample,
    })
    .strict(),
  audioSchema,
])
export function decodeAudio(
  reply: z.infer<typeof audioSchema>
): StreamAudioChunk {
  const binary = atob(reply.pcm)
  if (binary.length % 4) {
    throw new Error("Invalid float PCM byte count")
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return {
    generation: reply.generation,
    startSample: reply.start_sample,
    pcm: new Float32Array(bytes.buffer),
    captures: reply.capture_spans.map((s) => ({
      startSample: s.start_sample,
      endSample: s.end_sample,
      captureTime: s.capture_time,
    })),
  }
}
