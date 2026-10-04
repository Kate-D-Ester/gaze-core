import type { ReplayMedia, ReplaySourceOptions } from "./replay-source.types"
const MAX_BYTES = 120 * 1024 * 1024
const FRAME_RATE = 15
const AUDIO_DISPATCH_SAMPLES = 1600
export class ReplaySource {
  private video: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private pcm: Float32Array | null = null
  private url: string | null = null
  private epoch = 0
  private cursor = 0
  private advanced = 0
  private desired = false
  private flow = false
  private pumping = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private wake: (() => void) | null = null
  private lastFrame = -1
  private removeAbort: (() => void) | null = null
  private readonly now: () => number
  get position(): number {
    return this.advanced
  }
  constructor(private readonly options: ReplaySourceOptions) {
    this.now = options.now ?? (() => performance.now() / 1000)
  }
  private async fetchSource(url: string, signal: AbortSignal): Promise<Blob> {
    const response = await fetch(url, { signal })
    if (!response.ok || !response.body) {
      throw new Error(
        "Reference is missing; prepare the approved debate video first"
      )
    }
    const declared = Number(response.headers.get("content-length") || 0)
    if (declared > MAX_BYTES) {
      await response.body.cancel()
      throw new Error("Video exceeds 120 MiB")
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array<ArrayBuffer>[] = []
    let size = 0
    try {
      while (true) {
        signal.throwIfAborted()
        const result = await reader.read()
        if (result.done) {
          break
        }
        size += result.value.byteLength
        if (size > MAX_BYTES) {
          throw new Error("Video exceeds 120 MiB")
        }
        chunks.push(result.value.slice())
      }
      return new Blob(chunks, { type: "video/mp4" })
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }
  async load(input: File | string, signal: AbortSignal): Promise<ReplayMedia> {
    this.dispose()
    signal.throwIfAborted()
    const epoch = this.epoch
    const aborted = () => this.dispose()
    signal.addEventListener("abort", aborted, { once: true })
    this.removeAbort = () => signal.removeEventListener("abort", aborted)
    try {
      const blob =
        typeof input === "string"
          ? await this.fetchSource(input, signal)
          : input
      signal.throwIfAborted()
      if (!blob.size || blob.size > MAX_BYTES) {
        throw new Error("Video must fit within 120 MiB")
      }
      const video = (
        this.options.videoFactory ?? (() => document.createElement("video"))
      )()
      this.video = video
      this.canvas = (
        this.options.canvasFactory ?? (() => document.createElement("canvas"))
      )()
      video.muted = true
      video.playsInline = true
      video.preload = "auto"
      this.url = (this.options.createUrl ?? URL.createObjectURL)(blob)
      video.src = this.url
      video.load()
      if (video.readyState < 2) {
        await this.waitVideo("loadeddata", signal)
      }
      signal.throwIfAborted()
      if (
        !Number.isFinite(video.duration) ||
        video.duration <= 0 ||
        video.duration > 120 ||
        !video.videoWidth ||
        !video.videoHeight
      ) {
        throw new Error(
          "Choose a video with valid timestamps, up to 120 seconds"
        )
      }
      const bytes = await blob.arrayBuffer()
      signal.throwIfAborted()
      const decode =
        this.options.decode ??
        ((data) => new OfflineAudioContext(1, 1, 16000).decodeAudioData(data))
      const decoded = await decode(bytes)
      signal.throwIfAborted()
      if (epoch !== this.epoch) {
        throw new Error("Video load was replaced")
      }
      if (
        decoded.sampleRate !== 16000 ||
        !decoded.length ||
        decoded.length > 120 * 16000 ||
        decoded.numberOfChannels < 1 ||
        decoded.numberOfChannels > 8 ||
        Math.abs(decoded.length / 16000 - video.duration) > 0.15
      ) {
        throw new Error("Video audio is missing or its timing is not aligned")
      }
      const pcm = new Float32Array(decoded.length)
      for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
        const data = decoded.getChannelData(channel)
        for (let index = 0; index < data.length; index++) {
          pcm[index] = pcm[index]! + data[index]! / decoded.numberOfChannels
        }
      }
      if (
        !pcm.every((value) => Number.isFinite(value) && Math.abs(value) <= 1.01)
      ) {
        throw new Error("Video contains invalid mixed audio")
      }
      this.pcm = pcm
      await this.capture(0)
      return {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
        sampleCount: pcm.length,
      }
    } catch (error) {
      if (epoch === this.epoch) {
        this.dispose()
      }
      if (signal.aborted) {
        signal.throwIfAborted()
      }
      throw new Error(
        error instanceof Error
          ? error.message
          : "Browser could not decode this video"
      )
    }
  }
  private waitVideo(event: string, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const video = this.video!
      const cleanup = () => {
        clearTimeout(timer)
        video.removeEventListener(event, done)
        video.removeEventListener("error", failed)
        signal?.removeEventListener("abort", failed)
      }
      const done = () => {
        cleanup()
        resolve()
      }
      const failed = () => {
        cleanup()
        reject(new Error("Browser could not decode this video"))
      }
      const timer = setTimeout(failed, 10000)
      video.addEventListener(event, done, { once: true })
      video.addEventListener("error", failed, { once: true })
      signal?.addEventListener("abort", failed, { once: true })
    })
  }
  private advance(sample: number): void {
    if (!this.pcm) {
      return
    }
    const end = Math.min(this.pcm.length, Math.max(this.cursor, sample))
    const clock = this.now()
    while (this.cursor < end) {
      const start = this.cursor
      const count = Math.min(3200, end - start)
      this.options.onAudio({
        startSample: start,
        captureTime: clock - (end - start) / 16000,
        generation: this.options.generation(),
        pcm: this.pcm.slice(start, start + count),
      })
      this.cursor += count
    }
    this.advanced = end
  }
  private async capture(sample: number): Promise<void> {
    const video = this.video
    const canvas = this.canvas
    const epoch = this.epoch
    const generation = this.options.generation()
    if (!video || !canvas || sample <= this.lastFrame) {
      return
    }
    const scale = Math.min(1, 640 / video.videoWidth, 480 / video.videoHeight)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const context = canvas.getContext("2d")
    if (!context) {
      throw new Error("Video frame capture is unavailable")
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const jpeg = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("Video encoding failed")),
        "image/jpeg",
        0.7
      )
    })
    if (epoch !== this.epoch || generation !== this.options.generation()) {
      return
    }
    this.lastFrame = sample
    await this.options.onFrame({
      sample,
      captureTime: this.now(),
      generation,
      jpeg,
    })
  }
  private wait(seconds: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        if (this.timer) {
          clearTimeout(this.timer)
        }
        this.timer = null
        this.wake = null
        resolve()
      }
      this.wake = done
      this.timer = setTimeout(done, Math.max(0, seconds * 1000))
    })
  }
  private async positionVideo(sample: number): Promise<void> {
    const video = this.video
    if (!video) {
      return
    }
    const time = sample / 16000
    if (Math.abs(video.currentTime - time) > 0.00001) {
      const seeked = this.waitVideo("seeked")
      video.currentTime = time
      await seeked
    }
  }
  private startPump(): void {
    if (this.pumping || !this.desired || this.flow || !this.pcm) {
      return
    }
    this.pumping = true
    const epoch = this.epoch
    const generation = this.options.generation()
    void this.pump(epoch, generation)
      .catch((error: unknown) => {
        if (epoch === this.epoch && generation === this.options.generation()) {
          this.desired = false
          this.options.onError(
            error instanceof Error ? error.message : "Replay failed"
          )
        }
      })
      .finally(() => {
        this.pumping = false
        if (this.desired && !this.flow) {
          this.startPump()
        }
      })
  }
  private async pump(epoch: number, generation: number): Promise<void> {
    let due = this.now()
    while (
      this.pcm &&
      this.desired &&
      !this.flow &&
      epoch === this.epoch &&
      generation === this.options.generation()
    ) {
      const nextIndex =
        Math.floor(((this.lastFrame + 0.5) * FRAME_RATE) / 16000) + 1
      const sample = Math.min(
        this.pcm.length - 1,
        Math.round((nextIndex * 16000) / FRAME_RATE)
      )
      const interval = (sample - this.lastFrame) / 16000
      due = Math.max(due + interval, this.now())
      await this.wait(due - this.now())
      if (
        !this.desired ||
        this.flow ||
        epoch !== this.epoch ||
        generation !== this.options.generation()
      ) {
        return
      }
      await this.positionVideo(sample)
      if (epoch !== this.epoch || generation !== this.options.generation()) {
        return
      }
      await this.capture(sample)
      if (
        !this.pcm ||
        !this.desired ||
        this.flow ||
        epoch !== this.epoch ||
        generation !== this.options.generation()
      ) {
        return
      }
      if (sample >= this.pcm.length - 1) {
        this.advance(this.pcm.length)
        this.desired = false
        this.options.onEnd(this.pcm.length)
        return
      }
      if (sample - this.cursor >= AUDIO_DISPATCH_SAMPLES) {
        this.advance(sample)
      }
    }
  }
  async play(): Promise<void> {
    if (!this.video || !this.pcm) {
      throw new Error("Load a reference video first")
    }
    this.desired = true
    this.startPump()
  }
  pause(): void {
    this.desired = false
    this.video?.pause()
    this.wake?.()
  }
  setFlow(paused: boolean): void {
    this.flow = paused
    this.wake?.()
    if (!paused && this.desired) {
      this.startPump()
    }
  }
  async seek(sample: number): Promise<void> {
    if (
      !this.video ||
      !this.pcm ||
      !Number.isSafeInteger(sample) ||
      sample < 0 ||
      sample > this.pcm.length
    ) {
      throw new Error("Invalid reference position")
    }
    this.pause()
    const epoch = ++this.epoch
    this.flow = false
    this.cursor = sample
    this.advanced = sample
    this.lastFrame = -1
    await this.positionVideo(sample)
    if (epoch === this.epoch) {
      await this.capture(sample)
    }
  }
  drawCurrent(canvas: HTMLCanvasElement): void {
    if (this.video?.readyState && this.video.readyState >= 2) {
      canvas.width = this.video.videoWidth
      canvas.height = this.video.videoHeight
      canvas.getContext("2d")?.drawImage(this.video, 0, 0)
    }
  }
  dispose(): void {
    this.epoch++
    this.pause()
    this.removeAbort?.()
    this.removeAbort = null
    if (this.video) {
      this.video.removeAttribute("src")
      this.video.load()
    }
    if (this.url) {
      ;(this.options.revokeUrl ?? URL.revokeObjectURL)(this.url)
    }
    this.url = null
    this.video = null
    this.canvas = null
    this.pcm = null
    this.cursor = 0
    this.advanced = 0
    this.lastFrame = -1
    this.flow = false
  }
}
