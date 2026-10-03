import type { ListeningMode, PlaybackOptions } from "./playback.types"

/** The video is authoritative; focused Web Audio follows its play/seek/rate clock. */
export class PlaybackController {
  mode: ListeningMode = "original"
  generation = -1
  private context: AudioContext | null = null
  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null
  private gain: GainNode | null = null
  private fetchAbort: AbortController | null = null
  private epoch = 0
  private disposed = false
  private frame = 0
  private anchorVideo = 0
  private anchorAudio = 0
  private readonly fetcher: typeof fetch
  private readonly requestFrame: typeof requestAnimationFrame
  private readonly cancelFrame: typeof cancelAnimationFrame
  constructor(
    private readonly video: HTMLVideoElement,
    private readonly options: PlaybackOptions = {}
  ) {
    this.fetcher = options.fetcher ?? fetch.bind(globalThis)
    this.requestFrame =
      options.requestFrame ?? requestAnimationFrame.bind(globalThis)
    this.cancelFrame =
      options.cancelFrame ?? cancelAnimationFrame.bind(globalThis)
    this.mount()
  }
  mount(): void {
    this.disposed = false
    for (const event of ["play", "seeked", "ratechange"]) {
      this.video.addEventListener(event, this.sync)
    }
    for (const event of ["pause", "seeking", "ended"]) {
      this.video.addEventListener(event, this.stopSound)
    }
  }
  get ready() {
    return this.buffer !== null
  }
  private getContext(): AudioContext {
    this.context ??= this.options.contextFactory?.() ?? new AudioContext()
    return this.context
  }
  async listen(mode: ListeningMode): Promise<void> {
    if (this.disposed) {
      return
    }
    this.mode = mode
    this.video.muted = mode === "focused"
    if (mode === "original") {
      this.stopSound()
      return
    }
    try {
      await this.getContext().resume()
      if (!this.disposed && this.mode === "focused") {
        this.sync()
      }
    } catch {
      this.options.onError?.(
        "Allow audio playback, then select focused audio again"
      )
    }
  }
  async load(
    url: string,
    generation: number,
    signal?: AbortSignal
  ): Promise<void> {
    this.clear()
    this.generation = generation
    const epoch = this.epoch
    const abort = new AbortController()
    this.fetchAbort = abort
    const combined = signal
      ? AbortSignal.any([signal, abort.signal])
      : abort.signal
    try {
      const response = await this.fetcher(url, {
        signal: combined,
        credentials: "omit",
      })
      if (!response.ok) {
        throw new Error("Focused audio expired; process this person again")
      }
      const bytes = await response.arrayBuffer()
      if (this.disposed || epoch !== this.epoch || combined.aborted) {
        return
      }
      const buffer = await this.getContext().decodeAudioData(bytes)
      if (this.disposed || epoch !== this.epoch || combined.aborted) {
        return
      }
      this.buffer = buffer
      this.sync()
    } catch (error) {
      if (combined.aborted || epoch !== this.epoch || this.disposed) {
        return
      }
      this.options.onError?.(
        error instanceof Error
          ? error.message
          : "Focused audio could not be loaded"
      )
      throw error
    }
  }
  private stopSound = () => {
    if (this.frame) {
      this.cancelFrame(this.frame)
      this.frame = 0
    }
    const source = this.source
    const gain = this.gain
    this.source = null
    this.gain = null
    if (source && gain && this.context) {
      const now = this.context.currentTime
      gain.gain.setValueAtTime(1, now)
      gain.gain.linearRampToValueAtTime(0, now + 0.015)
      source.onended = () => {
        source.disconnect()
        gain.disconnect()
      }
      source.stop(now + 0.015)
    }
  }
  private sync = () => {
    this.stopSound()
    if (
      this.disposed ||
      this.mode !== "focused" ||
      this.video.paused ||
      !this.buffer ||
      !this.context ||
      this.video.currentTime >= this.buffer.duration
    ) {
      return
    }
    const source = this.context.createBufferSource()
    const gain = this.context.createGain()
    source.buffer = this.buffer
    source.playbackRate.value = this.video.playbackRate
    source.connect(gain)
    gain.connect(this.context.destination)
    gain.gain.setValueAtTime(0, this.context.currentTime)
    gain.gain.linearRampToValueAtTime(1, this.context.currentTime + 0.015)
    this.anchorVideo = this.video.currentTime
    this.anchorAudio = this.context.currentTime
    source.start(0, this.anchorVideo)
    this.source = source
    this.gain = gain
    this.frame = this.requestFrame(this.checkClock)
  }
  private checkClock = () => {
    this.frame = 0
    if (!this.source || !this.context || this.video.paused) {
      this.stopSound()
      return
    }
    const audible =
      this.anchorVideo +
      (this.context.currentTime - this.anchorAudio) * this.video.playbackRate
    if (Math.abs(audible - this.video.currentTime) > 0.08) {
      this.sync()
      return
    }
    this.frame = this.requestFrame(this.checkClock)
  }
  clear(): void {
    this.epoch++
    this.fetchAbort?.abort()
    this.fetchAbort = null
    this.stopSound()
    this.buffer = null
    this.generation = -1
  }
  dispose(): void {
    this.disposed = true
    this.clear()
    for (const event of ["play", "seeked", "ratechange"]) {
      this.video.removeEventListener(event, this.sync)
    }
    for (const event of ["pause", "seeking", "ended"]) {
      this.video.removeEventListener(event, this.stopSound)
    }
    this.video.pause()
    void this.context?.close()
    this.context = null
  }
}
