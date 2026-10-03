import { z } from "zod"

export const idSchema = z.string().regex(/^[a-f0-9]{32}$/)
const number = z.number().finite().nonnegative()
const error = z
  .object({ code: z.string().min(1), message: z.string().min(1) })
  .strict()
  .nullable()
export const boxSchema = z
  .tuple([number, number, number.positive(), number.positive()])
  .refine(
    ([x, y, w, h]) => x + w <= 1 && y + h <= 1,
    "Region must fit inside the image"
  )
export const trackSchema = z
  .object({
    id: z.string().min(1).max(64),
    manual: z.boolean(),
    observations: z
      .array(z.object({ timestamp: number, box: boxSchema }).strict())
      .max(3600)
      .refine(
        (items) =>
          items.every(
            (item, index) =>
              index === 0 || item.timestamp > items[index - 1]!.timestamp
          ),
        "Track timestamps must increase"
      ),
  })
  .strict()
export const clipSchema = z
  .object({
    id: idSchema,
    status: z.enum([
      "uploading",
      "queued",
      "analysing",
      "ready",
      "failed",
      "cancelled",
    ]),
    media: z
      .object({
        width: number.int().positive(),
        height: number.int().positive(),
        duration: number.positive(),
        sample_count: number.int().positive(),
        frame_count: number.int().positive(),
      })
      .strict()
      .nullable(),
    tracks: z.array(trackSchema).max(3600),
    error,
  })
  .strict()
export const jobSchema = z
  .object({
    id: idSchema,
    clip_id: idSchema,
    target_id: z.string().min(1).max(64),
    generation: number.int(),
    status: z.enum(["queued", "running", "done", "cancelled", "failed"]),
    progress: number.max(1),
    error,
    audio_url: z.string().nullable(),
    preview_url: z.string().nullable(),
    elapsed_seconds: number.nullable(),
    window_p95_seconds: number.nullable(),
    device: z.string().nullable(),
  })
  .strict()
  .refine((job) => {
    if (job.status !== "done") {
      return job.audio_url === null && job.preview_url === null
    }
    return (
      job.progress === 1 &&
      job.audio_url === `/jobs/${job.id}/audio` &&
      job.preview_url === `/jobs/${job.id}/preview`
    )
  }, "Only completed jobs expose focused output")
export const healthSchema = z
  .object({
    ready: z.boolean(),
    model_state: z.enum(["loading", "ready", "unready"]),
    engine: z.literal("RTFS-Net-4-LRS2"),
    device: z.string().nullable(),
    error,
    clip: z.boolean(),
    live: z.boolean(),
    max_upload_bytes: number.int().positive(),
    max_duration: number.positive(),
    queued: number.int(),
    window_seconds: number.positive(),
    stride_seconds: number.positive(),
  })
  .strict()
  .refine(
    (value) =>
      !value.ready || (value.model_state === "ready" && value.device !== null)
  )
export const errorSchema = z.object({ code: z.string(), message: z.string() })
