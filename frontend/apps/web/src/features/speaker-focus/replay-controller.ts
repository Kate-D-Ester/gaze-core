import { SpeakerClient } from "./client"
import { decodeAudio } from "./live-schema"
import { LivePlayer } from "./live-player"
import { PreviewBuffer } from "./preview-buffer"
import { ReplaySource } from "./replay-source"
import { StreamConnection } from "./stream-connection"
import { boxAtTime, selectByPoint } from "./selection"
import { selectByBubble } from "./bubble-selection"
import type { SelectionBubble } from "./bubble-selection.types"
import { packetBytes } from "./stream-protocol"
import type { ImagePoint } from "./selection.types"
import type { ListeningMode } from "./playback.types"
import type {
  ReplaySelectionOptions,
  ReplayState,
} from "./replay-controller.types"
import type { StreamReply } from "./stream-connection.types"

export class ReplayController {
  private readonly client = new SpeakerClient()
  private snapshot: ReplayState = {
    status: "empty",
    mode: "focused",
    media: null,
    label: "",
    tracks: [],
    selectedId: null,
    sourceSample: 0,
    displayedSample: null,
    timing: null,
    health: null,
    serviceError: "",
    error: "",
  }
  private listeners = new Set<() => void>()
  private source: ReplaySource | null = null
  private player: LivePlayer | null = null
  private context: AudioContext | null = null
  private preview = new PreviewBuffer()
  private connection: StreamConnection | null = null
  private abort: AbortController | null = null
  private generation = 0
  private epoch = 0
  private disposed = false
  private desired = false
  private anchor = 0
  private pendingPoint: ImagePoint | null = null
  private pendingBubble: SelectionBubble | null = null
  private acceptedEnd: number | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private update(next: Partial<ReplayState>): void {
    if (this.disposed) {
      return
    }
    this.snapshot = { ...this.snapshot, ...next }
    this.listeners.forEach((listener) => listener())
  }
  mount(): void {
    this.disposed = false
    if (!this.timer) {
      this.timer = setInterval(() => this.tick(), 50)
    }
    void this.connect()
  }
  async connect(): Promise<void> {
    const epoch = this.epoch
    try {
      const health = await this.client.health()
      if (epoch === this.epoch) {
        this.update({
          health,
          serviceError: health.live
            ? ""
            : health.streaming_error ||
              "Streaming is warming up or unavailable",
        })
        if (health.live && this.source && this.context && !this.connection) {
          const sample = this.cursor()
          this.abort ??= new AbortController()
          await this.openStream(epoch, this.abort.signal)
          if (epoch === this.epoch) {
            await this.restart(sample, null, false)
          }
        }
      }
    } catch (error) {
      if (epoch === this.epoch) {
        this.update({
          health: null,
          serviceError:
            error instanceof Error
              ? error.message
              : "Local service unavailable",
        })
      }
    }
  }
  loadReference = () =>
    this.load("/speaker-reference/debate.mp4", "Degraded debate")
  loadFile = (file: File) => this.load(file, file.name)
  private async load(input: File | string, label: string): Promise<void> {
    this.release()
    const epoch = this.epoch
    this.generation = 0
    const abort = new AbortController()
    this.abort = abort
    this.update({
      status: "loading",
      media: null,
      tracks: [],
      selectedId: null,
      sourceSample: 0,
      displayedSample: null,
      timing: null,
      error: "",
      label,
    })
    try {
      const context = new AudioContext({ sampleRate: 16000 })
      this.context = context
      this.player = new LivePlayer({
        context,
        onError: (message, sample) => this.pauseForOutput(message, sample),
      })
      this.player.reset(0)
      this.preview.reset(0)
      const source = new ReplaySource({
        generation: () => this.generation,
        onAudio: (event) => {
          if (epoch !== this.epoch) {
            return
          }
          if (this.snapshot.mode === "original") {
            this.player?.audio({
              generation: event.generation,
              startSample: event.startSample,
              pcm: event.pcm,
              captures: [
                {
                  startSample: event.startSample,
                  endSample: event.startSample + event.pcm.length,
                  captureTime: event.captureTime,
                },
              ],
            })
          } else if (
            this.snapshot.selectedId &&
            this.connection?.packet(
              packetBytes(
                1,
                event.generation,
                event.startSample,
                event.captureTime,
                event.pcm.buffer as ArrayBuffer
              )
            )
          ) {
            this.acceptedEnd = event.startSample + event.pcm.length
          }
        },
        onFrame: async (event) => {
          const bytes = await event.jpeg.arrayBuffer()
          if (epoch !== this.epoch || event.generation !== this.generation) {
            return
          }
          this.preview.add(event.sample, event.jpeg, event.generation)
          this.connection?.packet(
            packetBytes(
              2,
              event.generation,
              event.sample,
              event.captureTime,
              bytes
            )
          )
        },
        onEnd: (end) => {
          if (epoch !== this.epoch) {
            return
          }
          if (this.snapshot.mode === "original") {
            this.player?.flushEnd(end)
          } else if (this.acceptedEnd !== null) {
            this.connection?.control({
              type: "end",
              source_end_sample: this.acceptedEnd,
            })
          } else {
            this.update({ status: "ended" })
          }
        },
        onError: (message) => {
          if (epoch === this.epoch) {
            this.fail(message)
          }
        },
      })
      this.source = source
      const media = await source.load(input, abort.signal)
      abort.signal.throwIfAborted()
      this.update({ status: "ready", media })
      await this.openStream(epoch, abort.signal)
      if (epoch !== this.epoch) {
        return
      }
      void this.connect()
      await this.restart(0, null, false)
    } catch (error) {
      if (epoch === this.epoch) {
        const message =
          error instanceof Error ? error.message : "Reference could not start"
        if (this.snapshot.media) {
          this.streamUnavailable(message)
        } else {
          this.fail(message)
        }
      }
    }
  }
  private async openStream(epoch: number, signal: AbortSignal): Promise<void> {
    let connected = false
    const connection = new StreamConnection({
      baseUrl: this.client.baseUrl,
      onReply: (reply) => {
        if (epoch === this.epoch && this.connection === connection) {
          this.reply(reply)
        }
      },
      onError: (message) => {
        if (epoch === this.epoch && this.connection === connection) {
          if (connected) {
            this.streamUnavailable(message)
          }
        }
      },
    })
    this.connection = connection
    try {
      const ready = await connection.open(
        {
          source: "replay",
          video_offset_ms: 0,
          client_time: performance.now() / 1000,
        },
        signal
      )
      if (epoch !== this.epoch || this.connection !== connection) {
        return
      }
      connected = true
      this.player?.setWarmTimings(ready.warm_timings)
      this.update({ serviceError: "", error: "" })
    } catch (error) {
      if (this.connection === connection) {
        connection.close()
        this.connection = null
      }
      throw error
    }
  }
  private recoveryPoint(sample: number): ImagePoint | null {
    const track = this.snapshot.tracks.find(
      (item) => item.id === this.snapshot.selectedId
    )
    const box = track ? boxAtTime(track, sample / 16000) : null
    return box ? [box[0] + box[2] / 2, box[1] + box[3] / 2] : null
  }
  private pauseForOutput(
    message: string,
    playedSample: number | null = null
  ): void {
    const sample = playedSample ?? this.cursor()
    const point = this.recoveryPoint(sample)
    const epoch = this.epoch
    const generation = this.generation + 1
    void this.restart(sample, point, false)
      .then(() => {
        if (epoch === this.epoch && generation === this.generation) {
          this.update({ status: "paused", error: message })
        }
      })
      .catch((error: unknown) => {
        if (epoch === this.epoch && generation === this.generation) {
          this.fail(
            error instanceof Error ? error.message : "Playback reset failed"
          )
        }
      })
  }
  private streamUnavailable(message: string): void {
    const sample = this.cursor()
    this.desired = false
    this.source?.pause()
    this.source?.setFlow(false)
    this.connection?.close()
    this.connection = null
    this.generation++
    this.player?.reset(this.generation)
    this.preview.reset(this.generation)
    this.pendingPoint = null
    this.pendingBubble = null
    this.acceptedEnd = null
    this.anchor = sample
    this.update({
      status: "paused",
      tracks: [],
      selectedId: null,
      sourceSample: sample,
      displayedSample: null,
      timing: null,
      serviceError: message,
      error: message,
    })
    const generation = this.generation
    void this.source?.seek(sample).catch((error: unknown) => {
      if (generation === this.generation) {
        this.fail(
          error instanceof Error ? error.message : "Reference seek failed"
        )
      }
    })
  }
  private fail(message: string): void {
    this.release()
    this.update({
      status: "failed",
      media: null,
      displayedSample: null,
      tracks: [],
      selectedId: null,
      timing: null,
      error: message,
    })
  }
  private async restart(
    sample: number,
    point: ImagePoint | null,
    play: boolean,
    bubble: SelectionBubble | null = null
  ): Promise<void> {
    const source = this.source
    if (!source) {
      return
    }
    const epoch = this.epoch
    this.desired = play
    source.pause()
    this.generation++
    const generation = this.generation
    this.player?.reset(generation)
    this.preview.reset(generation)
    this.acceptedEnd = null
    this.anchor = sample
    this.pendingPoint = point
    this.pendingBubble = bubble
    this.update({
      tracks: [],
      selectedId: null,
      sourceSample: sample,
      displayedSample: null,
      timing: null,
      error: "",
      status: play ? "playing" : "paused",
    })
    this.connection?.control({
      type: "target",
      generation,
      target_id: null,
      replay_start_sample: sample,
    })
    await source.seek(sample)
    if (
      generation !== this.generation ||
      epoch !== this.epoch ||
      source !== this.source
    ) {
      return
    }
    if (!point && play) {
      await source.play()
      if (
        generation === this.generation &&
        epoch === this.epoch &&
        source === this.source
      ) {
        this.update({ status: "playing" })
      }
    } else {
      this.update({ status: play ? "playing" : "paused" })
    }
  }
  private cursor(): number {
    return (
      this.player?.sourceSample() ??
      (this.snapshot.selectedId
        ? this.anchor
        : (this.source?.position ?? this.snapshot.sourceSample))
    )
  }
  async play(): Promise<void> {
    if (this.snapshot.mode === "focused" && this.snapshot.serviceError) {
      this.update({ error: this.snapshot.serviceError })
      return
    }
    const source = this.source
    const context = this.context
    const epoch = this.epoch
    const generation = this.generation
    if (!source || !context) {
      return
    }
    try {
      await context.resume()
      if (
        epoch !== this.epoch ||
        generation !== this.generation ||
        source !== this.source
      ) {
        return
      }
      if (this.snapshot.status === "ended") {
        const point =
          this.snapshot.mode === "focused"
            ? this.recoveryPoint(this.snapshot.displayedSample ?? this.cursor())
            : null
        await this.restart(0, point, true)
      } else {
        this.desired = true
        await source.play()
        if (
          epoch === this.epoch &&
          generation === this.generation &&
          source === this.source
        ) {
          this.update({ status: "playing", error: "" })
        }
      }
    } catch (error) {
      if (
        epoch !== this.epoch ||
        generation !== this.generation ||
        source !== this.source
      ) {
        return
      }
      this.desired = false
      source.pause()
      this.update({
        status: "paused",
        error: error instanceof Error ? error.message : "Playback failed",
      })
    }
  }
  async pause(): Promise<void> {
    const sample = this.cursor()
    const point = this.recoveryPoint(sample)
    const needsSelection = Boolean(this.snapshot.selectedId && !point)
    const epoch = this.epoch
    const generation = this.generation + 1
    try {
      await this.restart(sample, point, false)
      if (
        epoch === this.epoch &&
        generation === this.generation &&
        needsSelection
      ) {
        this.update({ error: "Selected face is unverified; select it again" })
      }
    } catch (error) {
      if (epoch === this.epoch && generation === this.generation) {
        this.fail(error instanceof Error ? error.message : "Pause failed")
      }
    }
  }
  async seek(sample: number): Promise<void> {
    try {
      await this.restart(sample, null, this.desired)
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "Seek failed")
    }
  }
  async select(
    point: ImagePoint,
    options?: ReplaySelectionOptions
  ): Promise<void> {
    if (this.snapshot.serviceError) {
      this.update({ error: this.snapshot.serviceError })
      return
    }
    const sample =
      options?.sourceSample ??
      this.snapshot.displayedSample ??
      this.snapshot.sourceSample
    if (
      !Number.isSafeInteger(sample) ||
      sample < 0 ||
      (this.snapshot.media && sample > this.snapshot.media.sampleCount)
    ) {
      return
    }
    const time = sample / 16000
    const bubble: SelectionBubble | null = options?.radius
      ? { center: point, radius: options.radius, timestamp: time }
      : null
    const valid = bubble
      ? selectByBubble(
          this.snapshot.tracks,
          bubble,
          time,
          this.snapshot.selectedId
        )
      : selectByPoint(this.snapshot.tracks, point, time)
    if (!valid) {
      this.update({
        error: this.snapshot.selectedId
          ? ""
          : "Select a currently visible face",
      })
      return
    }
    if (valid === this.snapshot.selectedId) {
      this.update({ error: "" })
      return
    }
    try {
      const startSample = this.snapshot.status === "ended" ? 0 : sample
      await this.restart(startSample, point, this.desired, bubble)
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "Selection failed")
    }
  }
  async listen(mode: ListeningMode): Promise<void> {
    if (mode === this.snapshot.mode) {
      return
    }
    const cursor = this.cursor()
    const point = this.recoveryPoint(cursor)
    this.update({ mode })
    try {
      await this.restart(
        cursor,
        mode === "focused" ? point : null,
        this.desired
      )
    } catch (error) {
      this.fail(
        error instanceof Error ? error.message : "Listening switch failed"
      )
    }
  }
  async correct(
    box: readonly [number, number, number, number] | null
  ): Promise<void> {
    this.pendingPoint = null
    this.pendingBubble = null
    this.source?.pause()
    this.desired = false
    this.generation++
    this.player?.reset(this.generation)
    this.preview.reset(this.generation)
    this.connection?.select(this.generation, null)
    this.connection?.control({ type: "region", box })
    this.update({
      selectedId: null,
      tracks: [],
      status: "paused",
      displayedSample: null,
    })
  }
  private reply(reply: StreamReply): void {
    if (reply.type === "error") {
      if (reply.generation < this.generation) {
        return
      }
      const sample = this.cursor()
      this.generation = reply.generation
      const generation = this.generation + 1
      const epoch = this.epoch
      void this.restart(sample, null, false).catch((error: unknown) => {
        if (epoch === this.epoch && generation === this.generation) {
          this.fail(
            error instanceof Error ? error.message : "Reference reset failed"
          )
        }
      })
      this.update({ error: reply.message })
      return
    }
    if (reply.generation !== this.generation) {
      return
    }
    if (reply.type === "flow") {
      this.source?.setFlow(reply.action === "pause")
    }
    if (reply.type === "drained") {
      this.player?.flushEnd(reply.source_end_sample)
    }
    if (reply.type === "audio" && this.snapshot.mode === "focused") {
      this.player?.audio(decodeAudio(reply))
    }
    if (reply.type === "faces") {
      const tracks = reply.tracks.map((track) => {
        const old = this.snapshot.tracks.find((t) => t.id === track.id)
        const latest = track.observations[0]
        const observations = old ? [...old.observations] : []
        if (
          latest &&
          (!observations.length ||
            observations[observations.length - 1]!.timestamp < latest.timestamp)
        ) {
          observations.push(latest)
        }
        return { ...track, observations: observations.slice(-3600) }
      })
      this.update({ tracks })
      if (this.pendingPoint) {
        const point = this.pendingPoint
        const match = this.pendingBubble
          ? selectByBubble(tracks, this.pendingBubble, this.anchor / 16000)
          : selectByPoint(tracks, point, this.anchor / 16000)
        this.pendingPoint = null
        this.pendingBubble = null
        if (!match) {
          this.update({
            error: "Face was not detected at that position; select again",
          })
          return
        }
        this.generation++
        this.player?.reset(this.generation)
        this.preview.reset(this.generation)
        this.connection?.select(this.generation, match)
        this.update({ selectedId: match })
        const generation = this.generation
        void this.source
          ?.seek(this.anchor)
          .then(async () => {
            if (generation === this.generation && this.desired) {
              await this.source?.play()
            }
          })
          .catch((error: unknown) =>
            this.fail(
              error instanceof Error ? error.message : "Selection failed"
            )
          )
      }
    }
  }
  private tick(): void {
    const timing = this.player?.getTiming() ?? null
    const sample = this.cursor()
    this.update({ timing, sourceSample: sample })
    if (timing?.state === "ended") {
      this.desired = false
      this.update({ status: "ended" })
    }
  }
  async draw(canvas: HTMLCanvasElement): Promise<void> {
    if (!this.snapshot.media) {
      return
    }
    const generation = this.generation
    const epoch = this.epoch
    try {
      const sample =
        !this.snapshot.selectedId && this.snapshot.mode === "focused"
          ? (this.source?.drawCurrent(canvas) ?? null)
          : await this.preview.drawAt(canvas, this.cursor(), generation)
      if (
        epoch === this.epoch &&
        generation === this.generation &&
        sample !== null &&
        sample !== this.snapshot.displayedSample
      ) {
        this.update({ displayedSample: sample })
      }
    } catch {
      if (epoch === this.epoch && generation === this.generation) {
        this.fail("Replay preview could not be decoded")
      }
    }
  }
  private release(): void {
    this.epoch++
    this.desired = false
    this.abort?.abort()
    this.abort = null
    this.connection?.close()
    this.connection = null
    this.source?.dispose()
    this.source = null
    this.player?.dispose()
    this.player = null
    this.context = null
    this.preview.reset()
    this.pendingPoint = null
    this.pendingBubble = null
    this.acceptedEnd = null
    this.anchor = 0
  }
  dispose(): void {
    this.release()
    this.disposed = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.listeners.clear()
  }
}
