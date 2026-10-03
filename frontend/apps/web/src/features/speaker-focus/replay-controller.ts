import { SpeakerClient } from "./client"
import { decodeAudio } from "./live-schema"
import { LivePlayer } from "./live-player"
import { PreviewBuffer } from "./preview-buffer"
import { ReplaySource } from "./replay-source"
import { StreamConnection } from "./stream-connection"
import { selectByPoint } from "./selection"
import { packetBytes } from "./stream-protocol"
import type { ImagePoint } from "./selection.types"
import type { ListeningMode } from "./playback.types"
import type { ReplayState } from "./replay-controller.types"
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
  private selectedPoint: ImagePoint | null = null
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
      timing: null,
      error: "",
      label,
    })
    try {
      const context = new AudioContext({ sampleRate: 16000 })
      this.context = context
      this.player = new LivePlayer({
        context,
        onError: (message) => this.pauseForOutput(message),
      })
      this.player.reset(0)
      this.preview.reset(0)
      let connected = false
      const connection = new StreamConnection({
        baseUrl: this.client.baseUrl,
        onReply: (reply) => {
          if (epoch === this.epoch) {
            this.reply(reply)
          }
        },
        onError: (message) => {
          if (epoch === this.epoch) {
            if (connected) {
              this.streamUnavailable(message)
            }
          }
        },
      })
      this.connection = connection
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
            connection.packet(
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
          connection.packet(
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
            connection.control({
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
      const ready = await connection.open(
        {
          source: "replay",
          video_offset_ms: 0,
          client_time: performance.now() / 1000,
        },
        abort.signal
      )
      if (epoch !== this.epoch) {
        return
      }
      connected = true
      this.player.setWarmTimings(ready.warm_timings)
      this.update({ status: "ready", media, error: "", serviceError: "" })
      void this.connect()
      await this.restart(0, null, false)
    } catch (error) {
      if (epoch === this.epoch) {
        const message = error instanceof Error ? error.message : "Reference could not start"
        if (this.snapshot.media) {
          this.streamUnavailable(message)
        } else {
          this.fail(message)
        }
      }
    }
  }
  private pauseForOutput(message: string): void {
    void this.restart(this.cursor(), this.selectedPoint, false)
      .then(() => this.update({ status: "paused", error: message }))
      .catch((error: unknown) => {
        this.fail(error instanceof Error ? error.message : "Playback reset failed")
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
    this.selectedPoint = null
    this.acceptedEnd = null
    this.anchor = sample
    this.update({
      status: "paused",
      tracks: [],
      selectedId: null,
      sourceSample: sample,
      timing: null,
      serviceError: message,
      error: message,
    })
    const generation = this.generation
    void this.source?.seek(sample).catch((error: unknown) => {
      if (generation === this.generation) {
        this.fail(error instanceof Error ? error.message : "Reference seek failed")
      }
    })
  }
  private fail(message: string): void {
    this.release()
    this.update({
      status: "failed",
      media: null,
      tracks: [],
      selectedId: null,
      timing: null,
      error: message,
    })
  }
  private async restart(
    sample: number,
    point: ImagePoint | null,
    play: boolean
  ): Promise<void> {
    const source = this.source
    if (!source) {
      return
    }
    this.desired = play
    source.pause()
    this.generation++
    const generation = this.generation
    this.player?.reset(generation)
    this.preview.reset(generation)
    this.acceptedEnd = null
    this.anchor = sample
    this.pendingPoint = point
    this.update({
      tracks: [],
      selectedId: null,
      sourceSample: sample,
      timing: null,
      error: "",
    })
    this.connection?.control({
      type: "target",
      generation,
      target_id: null,
      replay_start_sample: sample,
    })
    await source.seek(sample)
    if (generation !== this.generation) {
      return
    }
    if (!point && play) {
      await source.play()
      this.update({ status: "playing" })
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
    if (!this.source || !this.context) {
      return
    }
    try {
      await this.context.resume()
      if (this.snapshot.status === "ended") {
        await this.restart(0, this.selectedPoint, true)
      } else {
        this.desired = true
        await this.source.play()
        this.update({ status: "playing", error: "" })
      }
    } catch (error) {
      this.desired = false
      this.source.pause()
      this.update({
        status: "paused",
        error: error instanceof Error ? error.message : "Playback failed",
      })
    }
  }
  async pause(): Promise<void> {
    try {
      await this.restart(this.cursor(), this.selectedPoint, false)
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "Pause failed")
    }
  }
  async seek(sample: number): Promise<void> {
    this.selectedPoint = null
    try {
      await this.restart(sample, null, this.desired)
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "Seek failed")
    }
  }
  async select(point: ImagePoint): Promise<void> {
    const time = this.cursor() / 16000
    const valid = selectByPoint(this.snapshot.tracks, point, time)
    if (!valid) {
      this.update({ error: "Select a currently visible face" })
      return
    }
    this.selectedPoint = point
    try {
      await this.restart(this.cursor(), point, this.desired)
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "Selection failed")
    }
  }
  async listen(mode: ListeningMode): Promise<void> {
    if (mode === this.snapshot.mode) {
      return
    }
    const cursor = this.cursor()
    this.update({ mode })
    try {
      await this.restart(
        cursor,
        mode === "focused" ? this.selectedPoint : null,
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
    this.selectedPoint = null
    this.source?.pause()
    this.desired = false
    this.generation++
    this.player?.reset(this.generation)
    this.preview.reset(this.generation)
    this.connection?.select(this.generation, null)
    this.connection?.control({ type: "region", box })
    this.update({ selectedId: null, tracks: [], status: "paused" })
  }
  private reply(reply: StreamReply): void {
    if (reply.type === "error") {
      if (reply.generation < this.generation) {
        return
      }
      this.generation = reply.generation
      this.pendingPoint = null
      this.selectedPoint = null
      this.player?.reset(this.generation)
      this.preview.reset(this.generation)
      this.source?.pause()
      this.desired = false
      this.update({ selectedId: null, status: "paused", error: reply.message })
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
        const match = selectByPoint(tracks, point, this.anchor / 16000)
        this.pendingPoint = null
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
  draw(canvas: HTMLCanvasElement): void {
    if (!this.snapshot.media) {
      return
    }
    if (!this.snapshot.selectedId && this.snapshot.mode === "focused") {
      this.source?.drawCurrent(canvas)
    } else {
      void this.preview
        .drawAt(canvas, this.cursor(), this.generation)
        .catch(() => this.fail("Replay preview could not be decoded"))
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
    this.selectedPoint = null
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
