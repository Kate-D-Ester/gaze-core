import { z } from "zod"
import { trackSchema } from "./client-schema"
const number = z.number().finite().nonnegative()
const generation = number.int().max(0xffffffff)
export const liveReplySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("ready"),
      generation,
      device: z.string(),
      window_seconds: z.literal(2),
      stride_seconds: z.literal(1),
      playout_seconds: z.literal(4),
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
      type: z.literal("audio"),
      generation,
      start: number,
      end: number,
      sample_rate: z.literal(16000),
      device: z.string(),
      processing_seconds: number,
      queued_windows: number.int().max(2),
      delay_seconds: number,
      pcm: z
        .string()
        .length(85336)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    })
    .strict()
    .refine((value) => Math.abs(value.end - value.start - 1) < 1e-6),
])
