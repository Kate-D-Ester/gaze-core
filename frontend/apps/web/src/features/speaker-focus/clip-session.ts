import type { Box, Job } from "./client.types"
import type { ClipSessionOptions, ClipSessionState } from "./clip-session.types"
import type { ListeningMode } from "./playback.types"
import { SelectionController } from "./selection"
import type { ImagePoint } from "./selection.types"

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Speaker processing failed"

/** Owns one source and accepts only results for its current selection generation. */
export class ClipSession {
  private readonly selection = new SelectionController()
  private snapshot: ClipSessionState = {
    status: "idle",
    sourceUrl: null,
    filename: "",
    clip: null,
    job: null,
    health: null,
    selection: this.selection.state,
    mode: "original",
    error: "",
    serviceError: "",
  }
  private listeners = new Set<() => void>()
  private sourceAbort: AbortController | null = null
  private healthAbort: AbortController | null = null
  private taskAbort: AbortController | null = null
  private activeJob: string | null = null
  private sourceGeneration = 0
  private disposed = false
  private cached = new Map<string, Job>()
  constructor(
    readonly video: HTMLVideoElement,
    private readonly options: ClipSessionOptions
  ) {
    this.mount()
  }
  mount(): void {
    if (this.disposed) {
      this.disposed = false
      this.sourceGeneration++
      this.update({
        status: "idle",
        sourceUrl: null,
        filename: "",
        clip: null,
        job: null,
        health: null,
        error: "",
        serviceError: "",
        selection: this.selection.reset(this.sourceGeneration),
      })
    }
    this.options.playback.mount?.()
    this.video.addEventListener("seeking", this.seek)
    this.video.addEventListener("timeupdate", this.checkFrame)
  }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private update(next: Partial<ClipSessionState>): void {
    if (this.disposed) {
      return
    }
    this.snapshot = { ...this.snapshot, ...next }
    this.listeners.forEach((listener) => listener())
  }
  private cancelTask(): void {
    this.taskAbort?.abort()
    this.taskAbort = null
    const job = this.activeJob
    this.activeJob = null
    if (job) {
      void this.options.client.cancel(job).catch(() => {})
    }
  }
  stop = (): void => {
    this.cancelTask()
    this.options.playback.clear()
    this.update({
      selection: this.selection.clear(),
      job: null,
      status: this.snapshot.clip ? "ready" : "idle",
    })
  }
  private seek = () => {
    if (
      this.activeJob ||
      this.snapshot.status === "processing" ||
      !this.options.playback.ready
    ) {
      this.stop()
    }
  }
  reportError(error: string): void {
    this.cancelTask()
    this.options.playback.clear()
    this.update({
      error,
      job: null,
      status: this.snapshot.clip ? "ready" : "idle",
    })
  }
  private checkFrame = () => {
    const clip = this.snapshot.clip
    if (!clip || !this.snapshot.selection.selectedId) {
      return
    }
    const state = this.selection.checkTracks(
      clip.tracks,
      this.video.currentTime
    )
    if (state.paused && !this.snapshot.selection.paused) {
      this.cancelTask()
      this.options.playback.clear()
      this.update({ selection: state, status: "ready", error: state.reason })
    }
  }
  async connect(): Promise<void> {
    this.healthAbort?.abort()
    const abort = new AbortController()
    this.healthAbort = abort
    try {
      const health = await this.options.client.health(abort.signal)
      console.info(
        "speaker health",
        health.ready,
        this.disposed,
        abort.signal.aborted
      )
      if (this.disposed || abort.signal.aborted) {
        return
      }
      if (!health.ready) {
        this.stop()
      }
      if (health.ready && !this.snapshot.health?.ready && this.snapshot.clip) {
        try {
          await this.options.client.clip(this.snapshot.clip.id)
        } catch {
          this.stop()
          this.cached.clear()
          this.update({
            clip: null,
            status: "failed",
            error: "Session expired after service restart; reload the source",
          })
        }
      }
      this.update({ health, serviceError: health.error?.message ?? "" })
    } catch (error) {
      if (abort.signal.aborted || this.disposed) {
        return
      }
      this.stop()
      this.update({ health: null, serviceError: message(error) })
    }
  }
  private resetSource(): number {
    this.sourceAbort?.abort()
    this.sourceAbort = new AbortController()
    this.cancelTask()
    this.options.playback.clear()
    this.video.pause()
    this.cached.clear()
    const previous = this.snapshot.clip
    if (previous) {
      void this.options.client.remove(previous.id).catch(() => {})
    }
    const previousUrl = this.snapshot.sourceUrl
    if (previousUrl) {
      ;(this.options.revokeObjectUrl ?? URL.revokeObjectURL)(previousUrl)
    }
    this.sourceGeneration++
    this.update({
      status: "loading",
      clip: null,
      job: null,
      sourceUrl: null,
      error: "",
      selection: this.selection.reset(this.sourceGeneration),
    })
    return this.sourceGeneration
  }
  async loadFile(file: File): Promise<void> {
    const generation = this.resetSource()
    const abort = this.sourceAbort!
    const sourceUrl = (this.options.createObjectUrl ?? URL.createObjectURL)(
      file
    )
    this.video.src = sourceUrl
    this.video.load()
    this.update({ sourceUrl, filename: file.name, status: "analysing" })
    try {
      const uploaded = await this.options.client.upload(file, abort.signal)
      if (
        this.disposed ||
        generation !== this.sourceGeneration ||
        abort.signal.aborted
      ) {
        void this.options.client.remove(uploaded.id).catch(() => {})
        return
      }
      this.update({ clip: uploaded })
      const clip = await this.options.client.waitForClip(
        uploaded.id,
        abort.signal
      )
      if (
        !this.disposed &&
        generation === this.sourceGeneration &&
        !abort.signal.aborted
      ) {
        this.update({ clip, status: "ready" })
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        this.update({ status: "failed", error: message(error) })
      }
    }
  }
  async loadReference(): Promise<void> {
    const generation = this.resetSource()
    const abort = this.sourceAbort!
    try {
      const response = await fetch("/speaker-reference/debate.mp4", {
        signal: abort.signal,
      })
      if (!response.ok) {
        throw new Error(
          "Reference is missing; run bun run prepare:speaker-reference with the approved degraded clip"
        )
      }
      const blob = await response.blob()
      if (
        generation !== this.sourceGeneration ||
        abort.signal.aborted ||
        this.disposed
      ) {
        return
      }
      await this.loadFile(
        new File([blob], "cnn-debate-low-quality-320x180-15fps.mp4", {
          type: "video/mp4",
        })
      )
    } catch (error) {
      if (!abort.signal.aborted) {
        this.update({ status: "failed", error: message(error) })
      }
    }
  }
  async region(box: Box): Promise<void> {
    const clip = this.snapshot.clip
    if (!clip) {
      return
    }
    this.stop()
    const generation = this.sourceGeneration
    const abort = this.sourceAbort!
    this.update({ status: "analysing", error: "" })
    try {
      await this.options.client.region(clip.id, box, abort.signal)
      const updated = await this.options.client.waitForClip(
        clip.id,
        abort.signal
      )
      if (generation === this.sourceGeneration && !abort.signal.aborted) {
        if (updated.error) {
          throw new Error(updated.error.message)
        }
        this.update({ clip: updated, status: "ready" })
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        this.update({ status: "ready", error: message(error) })
      }
    }
  }
  async listen(mode: ListeningMode): Promise<void> {
    await this.options.playback.listen(mode)
    this.update({ mode })
  }
  async selectPoint(point: ImagePoint): Promise<void> {
    const clip = this.snapshot.clip
    if (!clip || clip.status !== "ready") {
      return
    }
    const state = this.selection.click(
      clip.tracks,
      point,
      this.video.currentTime
    )
    this.cancelTask()
    this.options.playback.clear()
    this.update({ selection: state, job: null, error: "" })
    if (!state.selectedId) {
      return
    }
    await this.listen("focused")
    const sourceGeneration = this.sourceGeneration
    const selectionGeneration = state.generation
    const abort = new AbortController()
    this.taskAbort = abort
    const current = () =>
      !this.disposed &&
      !abort.signal.aborted &&
      sourceGeneration === this.sourceGeneration &&
      selectionGeneration === this.selection.state.generation
    try {
      let result = this.cached.get(state.selectedId)
      if (!result) {
        this.update({ status: "processing" })
        const job = await this.options.client.extract(
          clip.id,
          state.selectedId,
          selectionGeneration,
          abort.signal
        )
        if (!current()) {
          void this.options.client.cancel(job.id).catch(() => {})
          return
        }
        this.activeJob = job.id
        this.update({ job })
        result = await this.options.client.waitForJob(
          job.id,
          abort.signal,
          (progress) => {
            if (current()) {
              this.update({ job: progress })
            }
          }
        )
        if (!current()) {
          return
        }
        this.activeJob = null
        if (
          result.clip_id !== clip.id ||
          result.target_id !== state.selectedId ||
          result.generation !== selectionGeneration
        ) {
          throw new Error("Obsolete extraction result was rejected")
        }
        if (this.cached.size >= 8) {
          const first = this.cached.keys().next().value
          if (first) {
            const evicted = this.cached.get(first)!
            this.cached.delete(first)
            void this.options.client.cancel(evicted.id).catch(() => {})
          }
        }
        this.cached.set(state.selectedId, result)
      }
      if (!result.audio_url || !current()) {
        return
      }
      await this.options.playback.load(
        this.options.client.outputUrl(result.audio_url),
        selectionGeneration,
        abort.signal
      )
      if (current()) {
        this.update({ job: result, status: "ready" })
      }
    } catch (error) {
      if (current()) {
        this.cancelTask()
        this.options.playback.clear()
        this.update({ status: "ready", error: message(error), job: null })
      }
    }
  }
  dispose(): void {
    this.stop()
    this.sourceAbort?.abort()
    this.healthAbort?.abort()
    this.video.removeEventListener("seeking", this.seek)
    this.video.removeEventListener("timeupdate", this.checkFrame)
    const clip = this.snapshot.clip
    if (clip) {
      void this.options.client.remove(clip.id).catch(() => {})
    }
    if (this.snapshot.sourceUrl) {
      ;(this.options.revokeObjectUrl ?? URL.revokeObjectURL)(
        this.snapshot.sourceUrl
      )
    }
    this.disposed = true
    this.listeners.clear()
    this.options.playback.dispose()
    this.video.removeAttribute("src")
    this.video.load()
  }
}
