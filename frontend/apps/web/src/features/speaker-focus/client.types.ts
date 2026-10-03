import type { z } from "zod"
import type {
  boxSchema,
  clipSchema,
  healthSchema,
  jobSchema,
  trackSchema,
} from "./client-schema"
export type Box = z.infer<typeof boxSchema>
export type FaceTrack = z.infer<typeof trackSchema>
export type Clip = z.infer<typeof clipSchema>
export type Job = z.infer<typeof jobSchema>
export type Health = z.infer<typeof healthSchema>
export type ClientOptions = {
  baseUrl?: string
  fetcher?: typeof fetch
  timeoutMs?: number
}
export type PollOptions = { timeoutMs?: number; intervalMs?: number }
