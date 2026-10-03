import type {
  LiveClock,
  LivePlayerOptions,
  PreviewFrame,
} from "./live-player.types"
export class LivePlayer {
  generation = 0
  private sources = new Map<AudioBufferSourceNode, GainNode>()
  private frames: PreviewFrame[] = []
  private lastEnd: number | null = null
  private disposed = false
  private paused = false
  private clock: LiveClock | null = null
  readonly delay: number
  private readonly now: () => number
  constructor(private readonly options: LivePlayerOptions) {
    this.delay = options.delay ?? 4
    this.now = options.now ?? (() => performance.now() / 1000)
    options.context.addEventListener("statechange", this.stateChanged)
  }
  reset(generation: number): void {
    this.generation = generation
    this.paused = false
    this.lastEnd = null
    this.clock = null
    const now = this.options.context.currentTime
    for (const [source, gain] of this.sources) {
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(0, now + 0.015)
      source.stop(now + 0.015)
    }
    this.sources.clear()
    this.frames.forEach((frame) => frame.image.close())
    this.frames = []
  }
  private stateChanged = () => {
    if (
      !this.disposed &&
      this.clock &&
      this.options.context.state !== "running"
    ) {
      this.reset(this.generation)
      this.paused = true
      this.options.onError("Audio output paused; restart live capture")
    }
  }
  audio(pcm: Float32Array, start: number, generation: number): boolean {
    if (this.disposed || this.paused || generation !== this.generation) {
      return false
    }
    const now = this.now()
    const context = this.options.context
    this.clock ??= { audio: context.currentTime, performance: now }
    const drift = Math.abs(
      context.currentTime - this.clock.audio - (now - this.clock.performance)
    )
    const seconds = start + this.delay - now
    if (
      context.state !== "running" ||
      drift > 0.15 ||
      !Number.isFinite(start) ||
      !pcm.length ||
      !pcm.every(Number.isFinite) ||
      seconds < -0.05 ||
      seconds > this.delay + 0.2 ||
      this.sources.size >= 50 ||
      (this.lastEnd !== null && Math.abs(start - this.lastEnd) > 0.003)
    ) {
      this.reset(this.generation)
      this.paused = true
      this.options.onError(
        "Live output is late or discontinuous; stop and recheck synchronization"
      )
      return false
    }
    const buffer = context.createBuffer(1, pcm.length, 16000)
    buffer.copyToChannel(pcm.slice(), 0)
    const source = context.createBufferSource()
    const gain = context.createGain()
    source.buffer = buffer
    source.connect(gain)
    gain.connect(context.destination)
    const when = context.currentTime + Math.max(0, seconds)
    if (this.lastEnd === null) {
      gain.gain.setValueAtTime(0, when)
      gain.gain.linearRampToValueAtTime(1, when + 0.015)
    } else {
      gain.gain.setValueAtTime(1, when)
    }
    source.onended = () => {
      this.sources.delete(source)
      source.disconnect()
      gain.disconnect()
    }
    this.sources.set(source, gain)
    source.start(when)
    this.lastEnd = start + pcm.length / 16000
    return true
  }
  frame(frame: PreviewFrame): void {
    if (
      this.disposed ||
      frame.generation !== this.generation ||
      this.frames.length >= 64
    ) {
      frame.image.close()
      return
    }
    this.frames.push(frame)
  }
  draw(canvas: HTMLCanvasElement): void {
    const due = this.now() - this.delay
    let chosen: PreviewFrame | undefined
    while (this.frames[0] && this.frames[0].timestamp <= due) {
      chosen?.image.close()
      chosen = this.frames.shift()
    }
    if (!chosen) {
      return
    }
    canvas.width = chosen.image.width
    canvas.height = chosen.image.height
    canvas.getContext("2d")?.drawImage(chosen.image, 0, 0)
    chosen.image.close()
  }
  dispose(): void {
    this.disposed = true
    this.options.context.removeEventListener("statechange", this.stateChanged)
    this.reset(this.generation + 1)
    void this.options.context.close()
  }
}
