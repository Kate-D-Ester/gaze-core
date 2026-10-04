import type { ReplayMedia, ReplaySourceOptions } from "./replay-source.types"
const MAX_BYTES = 120 * 1024 * 1024
const FRAME_RATE = 15
const AUDIO_DISPATCH_SAMPLES = 320
export class ReplaySource {
  private video: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private pcm: Float32Array | null = null
  private url: string | null = null
  private epoch = 0
  private cursor = 0
  private desired = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private capturePending: Promise<void> | null = null
  private clockOrigin = 0
  private ending = false
  private sourceEnded = false
  private ended = (): void => {
    this.sourceEnded = true
    this.tick()
  }
  private lastFrame = -1
  private removeAbort: (() => void) | null = null
  private readonly now: () => number
  get position(): number {
    if (!this.video || !this.pcm) {
      return this.cursor
    }
    if (this.sourceEnded) {
      return this.pcm.length
    }
    return Math.min(this.pcm.length, Math.round(this.video.currentTime * 16000))
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
      video.addEventListener("ended", this.ended)
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
      this.clockOrigin = this.now()
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
    while (this.cursor < end) {
      const start = this.cursor
      const count = Math.min(3200, end - start)
      this.options.onAudio({
        startSample: start,
        captureTime: this.clockOrigin + start / 16000,
        generation: this.options.generation(),
        pcm: this.pcm.slice(start, start + count),
      })
      this.cursor += count
    }
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
    const capturedAt = this.clockOrigin + sample / 16000
    this.lastFrame = sample
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
    await this.options.onFrame({
      sample,
      captureTime: capturedAt,
      generation,
      jpeg,
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
  private fail(error: unknown, epoch: number): void {
    if (epoch !== this.epoch) {
      return
    }
    this.pause()
    this.options.onError(
      error instanceof Error ? error.message : "Replay failed"
    )
  }
  private tick = (): void => {
    const video = this.video
    const pcm = this.pcm
    if (!this.desired || !video || !pcm || this.ending) {
      return
    }
    const epoch = this.epoch
    const sample = this.position
    if (sample - this.cursor >= AUDIO_DISPATCH_SAMPLES) {
      this.advance(sample)
    }
    if (sample >= pcm.length) {
      this.ending = true
      void this.finish(epoch).catch((error: unknown) => this.fail(error, epoch))
      return
    }
    if (!this.capturePending && sample - this.lastFrame >= 16000 / FRAME_RATE) {
      const pending = this.capture(sample)
      this.capturePending = pending
      void pending
        .catch((error: unknown) => this.fail(error, epoch))
        .finally(() => {
          if (this.capturePending === pending) {
            this.capturePending = null
          }
        })
    }
  }
  private async finish(epoch: number): Promise<void> {
    await this.capturePending
    if (epoch !== this.epoch || !this.desired || !this.pcm) {
      return
    }
    await this.capture(this.pcm.length - 1)
    if (epoch !== this.epoch || !this.desired || !this.pcm) {
      return
    }
    const end = this.pcm.length
    this.advance(end)
    this.pause()
    this.options.onEnd(end)
  }
  async play(): Promise<void> {
    const video = this.video
    if (!video || !this.pcm) {
      throw new Error("Load a reference video first")
    }
    if (this.desired) {
      return
    }
    this.desired = true
    this.ending = false
    this.clockOrigin = this.now() - video.currentTime
    const epoch = this.epoch
    try {
      video.playbackRate = 1
      await video.play()
      if (epoch === this.epoch && this.desired) {
        this.timer = setInterval(this.tick, 20)
      }
    } catch (error) {
      if (epoch === this.epoch) {
        this.pause()
      }
      throw error
    }
  }
  pause(): void {
    this.desired = false
    this.video?.pause()
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
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
    this.cursor = sample
    this.lastFrame = -1
    await this.positionVideo(sample)
    this.clockOrigin = this.now() - sample / 16000
    this.ending = false
    this.sourceEnded = false
    if (epoch === this.epoch) {
      await this.capture(sample)
    }
  }
  drawCurrent(canvas: HTMLCanvasElement): number | null {
    const video = this.video
    if (!video || video.readyState < 2 || video.seeking) {
      return null
    }
    const context = canvas.getContext("2d")
    if (!context) {
      return null
    }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    context.drawImage(video, 0, 0)
    return Math.round(video.currentTime * 16000)
  }
  dispose(): void {
    this.epoch++
    this.pause()
    this.removeAbort?.()
    this.removeAbort = null
    if (this.video) {
      this.video.removeEventListener("ended", this.ended)
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
    this.lastFrame = -1
    this.sourceEnded = false
    this.capturePending = null
  }
}
