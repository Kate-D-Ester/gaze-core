import { z } from "zod"
import {
  clipSchema,
  errorSchema,
  healthSchema,
  idSchema,
  jobSchema,
} from "./client-schema"
import type { Box, ClientOptions, Clip, Job, PollOptions } from "./client.types"

export class SpeakerError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = "SpeakerError"
  }
}
function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    const aborted = () => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", aborted)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", aborted)
      resolve()
    }, milliseconds)
    signal?.addEventListener("abort", aborted, { once: true })
  })
}
export class SpeakerClient {
  readonly baseUrl: string
  private readonly fetcher: typeof fetch
  private readonly timeoutMs: number
  constructor(options: ClientOptions = {}) {
    const url = new URL(options.baseUrl ?? "http://127.0.0.1:4033")
    if (
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new SpeakerError(
        "invalid_service_url",
        "Use a loopback HTTP service address"
      )
    }
    this.baseUrl = url.origin
    this.fetcher = options.fetcher ?? fetch.bind(globalThis)
    this.timeoutMs = options.timeoutMs ?? 15000
  }
  private identifier(id: string): string {
    if (!idSchema.safeParse(id).success) {
      throw new SpeakerError("invalid_id", "Invalid local session identifier")
    }
    return id
  }
  outputUrl(path: string): string {
    if (!/^\/jobs\/[a-f0-9]{32}\/(audio|preview)$/.test(path)) {
      throw new SpeakerError(
        "invalid_output_url",
        "Invalid focused output location"
      )
    }
    return this.baseUrl + path
  }
  private async send(
    path: string,
    init: RequestInit,
    signal?: AbortSignal
  ): Promise<Response> {
    const deadline = AbortSignal.timeout(this.timeoutMs)
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline
    try {
      combined.throwIfAborted()
      const response = await this.fetcher(this.baseUrl + path, {
        ...init,
        credentials: "omit",
        signal: combined,
      })
      if (!response.ok) {
        const detail = errorSchema.safeParse(
          await response.json().catch(() => null)
        )
        if (detail.success) {
          throw new SpeakerError(detail.data.code, detail.data.message)
        }
        throw new SpeakerError(
          "http_error",
          `Local service returned HTTP ${response.status}`
        )
      }
      return response
    } catch (error) {
      if (signal?.aborted) {
        throw signal.reason
      }
      if (deadline.aborted) {
        throw new SpeakerError(
          "request_timeout",
          "Local service did not respond in time"
        )
      }
      if (error instanceof SpeakerError) {
        throw error
      }
      throw new SpeakerError(
        "service_unavailable",
        "Start the local speaker service on port 4033, then reconnect"
      )
    }
  }
  private async read<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {},
    signal?: AbortSignal
  ): Promise<T> {
    const response = await this.send(path, init, signal)
    const parsed = schema.safeParse(await response.json().catch(() => null))
    if (!parsed.success) {
      throw new SpeakerError(
        "invalid_response",
        "Local service returned incompatible data; restart with the matching version"
      )
    }
    return parsed.data
  }
  health(signal?: AbortSignal) {
    return this.read("/health", healthSchema, {}, signal)
  }
  upload(file: File, signal?: AbortSignal) {
    const body = new FormData()
    body.set("file", file)
    return this.read("/clips", clipSchema, { method: "POST", body }, signal)
  }
  clip(id: string, signal?: AbortSignal) {
    return this.read(
      `/clips/${this.identifier(id)}`,
      clipSchema.refine((value) => value.id === id),
      {},
      signal
    )
  }
  region(id: string, box: Box, signal?: AbortSignal) {
    return this.read(
      `/clips/${this.identifier(id)}/regions`,
      clipSchema.refine((value) => value.id === id),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ box }),
      },
      signal
    )
  }
  extract(
    id: string,
    targetId: string,
    generation: number,
    signal?: AbortSignal
  ) {
    return this.read(
      `/clips/${this.identifier(id)}/extract`,
      jobSchema.refine(
        (value) =>
          value.clip_id === id &&
          value.target_id === targetId &&
          value.generation === generation
      ),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: targetId, generation }),
      },
      signal
    )
  }
  job(id: string, signal?: AbortSignal) {
    return this.read(
      `/jobs/${this.identifier(id)}`,
      jobSchema.refine((value) => value.id === id),
      {},
      signal
    )
  }
  async cancel(id: string, signal?: AbortSignal) {
    await this.send(
      `/jobs/${this.identifier(id)}`,
      { method: "DELETE" },
      signal
    )
  }
  async remove(id: string, signal?: AbortSignal) {
    await this.send(
      `/clips/${this.identifier(id)}`,
      { method: "DELETE" },
      signal
    )
  }
  async waitForClip(
    id: string,
    signal?: AbortSignal,
    options: PollOptions = {}
  ): Promise<Clip> {
    const deadline = performance.now() + (options.timeoutMs ?? 120000)
    while (performance.now() < deadline) {
      const clip = await this.clip(id, signal)
      if (clip.status === "ready") {
        return clip
      }
      if (clip.status === "failed" || clip.status === "cancelled") {
        throw new SpeakerError(
          clip.error?.code ?? "analysis_failed",
          clip.error?.message ?? "Clip analysis stopped"
        )
      }
      await wait(options.intervalMs ?? 250, signal)
    }
    throw new SpeakerError(
      "poll_timeout",
      "Clip analysis timed out; cancel and retry"
    )
  }
  async waitForJob(
    id: string,
    signal?: AbortSignal,
    onProgress?: (job: Job) => void,
    options: PollOptions = {}
  ): Promise<Job> {
    const deadline = performance.now() + (options.timeoutMs ?? 180000)
    while (performance.now() < deadline) {
      const job = await this.job(id, signal)
      onProgress?.(job)
      if (job.status === "done") {
        return job
      }
      if (job.status === "failed" || job.status === "cancelled") {
        throw new SpeakerError(
          job.error?.code ?? "extraction_cancelled",
          job.error?.message ?? "Extraction cancelled"
        )
      }
      await wait(options.intervalMs ?? 250, signal)
    }
    throw new SpeakerError(
      "poll_timeout",
      "Extraction timed out; cancel and retry"
    )
  }
}
