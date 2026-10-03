import { AdaptiveJitter } from "./adaptive-jitter"
import type {
  LiveClock,
  LivePlayerOptions,
  PlaybackTiming,
  ScheduledChunk,
  StreamAudioChunk,
} from "./live-player.types"
export class LivePlayer {
  generation = 0
  private sources = new Map<AudioBufferSourceNode, GainNode>()
  private scheduled: ScheduledChunk[] = []
  private nextSample: number | null = null
  private nextTime: number | null = null
  private disposed = false
  private failed = false
  private clock: LiveClock | null = null
  private finalSample: number | null = null
  private bytes = 0
  private jitter: AdaptiveJitter
  private readonly now: () => number
  constructor(private readonly options: LivePlayerOptions) {
    this.now = options.now ?? (() => performance.now() / 1000)
    this.jitter = new AdaptiveJitter(
      options.context.sampleRate,
      options.context.baseLatency || 0,
      options.warmTimings
    )
    options.context.addEventListener("statechange", this.stateChanged)
  }
  setWarmTimings(timings: number[]): void {
    this.jitter = new AdaptiveJitter(
      this.options.context.sampleRate,
      this.options.context.baseLatency || 0,
      timings
    )
  }
  reset(generation: number): void {
    this.generation = generation
    this.failed = false
    this.nextSample = null
    this.nextTime = null
    this.finalSample = null
    this.clock = null
    this.jitter.reset()
    const now = this.options.context.currentTime
    for (const [source, gain] of this.sources) {
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(0, now + 0.015)
      source.stop(now + 0.015)
    }
    this.sources.clear()
    this.scheduled = []
    this.bytes = 0
  }
  private fail(message: string): false {
    this.reset(this.generation)
    this.failed = true
    this.options.onError(message)
    return false
  }
  private stateChanged = () => {
    if (
      !this.disposed &&
      this.clock &&
      this.options.context.state !== "running"
    ) {
      this.fail("Audio output paused; resume listening")
    }
  }
  audio(chunk: StreamAudioChunk): boolean {
    if (this.disposed || this.failed || chunk.generation !== this.generation) {
      return false
    }
    const context = this.options.context
    const now = this.now()
    this.clock ??= { audio: context.currentTime, performance: now }
    const drift = Math.abs(
      context.currentTime - this.clock.audio - (now - this.clock.performance)
    )
    const endSample = chunk.startSample + chunk.pcm.length
    let captureCursor = chunk.startSample
    for (const span of chunk.captures) {
      if (
        span.startSample !== captureCursor ||
        span.endSample <= span.startSample ||
        !Number.isFinite(span.captureTime)
      ) {
        return this.fail("Invalid audio capture mapping")
      }
      captureCursor = span.endSample
    }
    if (context.state !== "running" || drift > 0.15) {
      return this.fail("Audio output clock changed; resume listening")
    }
    if (
      !Number.isSafeInteger(chunk.startSample) ||
      chunk.startSample < 0 ||
      !chunk.pcm.length ||
      !chunk.pcm.every(Number.isFinite) ||
      captureCursor !== endSample ||
      (this.nextSample !== null && this.nextSample !== chunk.startSample)
    ) {
      return this.fail("Audio source is discontinuous; resume listening")
    }
    if (this.bytes + chunk.pcm.byteLength > 4 * 1024 * 1024) {
      return this.fail("Audio buffer is full; resume listening")
    }
    const duration = chunk.pcm.length / 16000
    this.jitter.arrive(now, duration)
    let when = this.nextTime
    const transition = when === null
    if (when !== null && when < context.currentTime) {
      this.jitter.underrun(context.currentTime - when)
      when = null
    }
    when ??= context.currentTime + this.jitter.reserve
    const buffer = context.createBuffer(1, chunk.pcm.length, 16000)
    buffer.copyToChannel(chunk.pcm.slice(), 0)
    const source = context.createBufferSource()
    const gain = context.createGain()
    source.buffer = buffer
    source.connect(gain)
    gain.connect(context.destination)
    gain.gain.setValueAtTime(transition ? 0 : 1, when)
    if (transition) {
      gain.gain.linearRampToValueAtTime(1, when + 0.015)
    }
    this.bytes += chunk.pcm.byteLength
    source.onended = () => {
      this.sources.delete(source)
      if (chunk.generation === this.generation) {
        this.bytes = Math.max(0, this.bytes - chunk.pcm.byteLength)
      }
      source.disconnect()
      gain.disconnect()
    }
    this.sources.set(source, gain)
    source.start(when)
    this.scheduled.push({ chunk, when, end: when + duration })
    this.nextTime = when + duration
    this.nextSample = endSample
    return true
  }
  private active(): ScheduledChunk | null {
    const time = this.options.context.currentTime
    while (this.scheduled.length > 1 && this.scheduled[0]!.end <= time) {
      this.scheduled.shift()
    }
    return this.scheduled[0] ?? null
  }
  sourceSample(): number | null {
    const record = this.active()
    if (!record || this.options.context.currentTime < record.when) {
      return null
    }
    const elapsed = Math.min(
      record.chunk.pcm.length,
      Math.max(
        0,
        Math.round((this.options.context.currentTime - record.when) * 16000)
      )
    )
    return record.chunk.startSample + elapsed
  }
  getTiming(): PlaybackTiming {
    const record = this.active()
    const sample = this.sourceSample()
    const time = this.options.context.currentTime
    const span = record?.chunk.captures.find(
      (s) => sample !== null && sample >= s.startSample && sample < s.endSample
    )
    const context = this.options.context
    const latency =
      (Number.isFinite(context.baseLatency) ? context.baseLatency : 0) +
      (Number.isFinite(context.outputLatency) ? context.outputLatency : 0)
    let state: PlaybackTiming["state"] = "buffering"
    if (this.failed) {
      state = "failed"
    } else if (
      sample !== null &&
      this.finalSample !== null &&
      sample >= this.finalSample
    ) {
      state = "ended"
    } else if (record && time >= record.when && time < record.end) {
      state = "playing"
    }
    return {
      state,
      reserveSeconds: this.jitter.reserve,
      bufferedSeconds: Math.max(0, (this.nextTime ?? time) - time),
      delaySeconds:
        span && sample !== null
          ? Math.max(
              0,
              this.now() -
                span.captureTime -
                (sample - span.startSample) / 16000 +
                latency
            )
          : null,
      hardwareLatencyAvailable:
        Number.isFinite(context.outputLatency) ||
        Number.isFinite(context.baseLatency),
    }
  }
  flushEnd(sourceEndSample: number): void {
    if (sourceEndSample !== this.nextSample) {
      this.fail("Final audio interval is incomplete")
      return
    }
    this.finalSample = sourceEndSample
  }
  dispose(): void {
    this.disposed = true
    this.options.context.removeEventListener("statechange", this.stateChanged)
    this.reset(this.generation + 1)
    void this.options.context.close()
  }
}
