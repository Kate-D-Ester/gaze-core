import { verifiedGazePoint } from "./gaze-evidence"
import { SpeakerClient } from "./client"
import { startCapture, startMicrophone } from "./capture"
import { LivePlayer } from "./live-player"
import { decodeAudio } from "./live-schema"
import { StreamConnection } from "./stream-connection"
import { SceneSelectionAdapter } from "./scene-adapter"
import type {
  DisplayedGaze,
  LiveEvidence,
  LiveReply,
  LiveState,
} from "./live-controller.types"
import type { ImagePoint, SelectionState } from "./selection.types"
import type { ListeningMode } from "./playback.types"

export class LiveController {
  private readonly adapter = new SceneSelectionAdapter()
  private readonly client = new SpeakerClient()
  private snapshot: LiveState = {
    status: "idle",
    mode: "focused",
    tracks: [],
    selection: this.adapter.state,
    device: "",
    inferenceSeconds: null,
    arrivalDelay: null,
    error: "",
    timing: null,
  }
  private listeners = new Set<() => void>()
  private evidence: LiveEvidence | null = null
  private displayedGaze: DisplayedGaze | null = null
  private sourceIdentity = ""
  private abort: AbortController | null = null
  private connection: StreamConnection | null = null
  private acceptedEnd: number | null = null
  private player: LivePlayer | null = null
  private captureStop: (() => void) | null = null
  private epoch = 0
  private generation = 0
  private disposed = false
  private timer: ReturnType<typeof setInterval> | null = null
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private update(next: Partial<LiveState>): void {
    if (!this.disposed) {
      this.snapshot = { ...this.snapshot, ...next }
      this.listeners.forEach((listener) => listener())
    }
  }
  mount(): void {
    this.disposed = false
    this.timer = setInterval(() => {
      const timing = this.player?.getTiming() ?? null
      this.update({ timing })
      if (this.snapshot.status === "draining" && timing?.state === "ended") {
        this.update({
          status: "paused",
          error:
            "This device cannot keep up with continuous capture. Resume to listen again.",
        })
      }
      this.observe()
    }, 100)
  }
  setEvidence(evidence: LiveEvidence): void {
    const identity = JSON.stringify([
      evidence.identity,
      evidence.frame?.generation,
      evidence.frame?.width,
      evidence.frame?.height,
      evidence.source?.key,
    ])
    if (this.sourceIdentity && identity !== this.sourceIdentity) {
      this.displayedGaze = null
      this.stop("Scene source or orientation changed; restart live capture")
    }
    this.sourceIdentity = identity
    this.evidence = evidence
    this.observe()
  }
  setDisplayedGaze(gaze: DisplayedGaze | null): void {
    this.displayedGaze = gaze
    this.observe()
  }
  private observe(): void {
    const evidence = this.evidence
    if (!evidence || this.snapshot.status !== "live") {
      return
    }
    const now = performance.now()
    // Keep the bubble and its source sample together across React commits. A
    // physically missing/invalid eye sample still interrupts dwell immediately.
    const displayed = verifiedGazePoint(evidence.measurement, now)
      ? this.displayedGaze
      : null
    const previous = this.adapter.state
    const next = this.adapter.observe({
      ...evidence,
      measurement: displayed?.measurement ?? null,
      tracks: this.snapshot.tracks,
      bubble: displayed?.bubble ?? null,
      now,
    })
    this.selectionChanged(previous, next)
  }
  private selectionChanged(
    previous: SelectionState,
    next: SelectionState
  ): void {
    if (next.generation !== previous.generation) {
      this.generation++
      this.player?.reset(this.generation)
      this.acceptedEnd = null
      this.send({
        type: "target",
        generation: this.generation,
        target_id:
          next.paused || this.snapshot.mode === "original"
            ? null
            : next.selectedId,
      })
    }
    this.update({ selection: next })
  }
  select(point: ImagePoint): void {
    const previous = this.adapter.state
    const next = this.adapter.click(point, performance.now())
    this.selectionChanged(previous, next)
  }
  private send(value: object): void {
    this.connection?.control(value)
  }
  private drainCapture(): void {
    if (this.snapshot.status !== "live") {
      return
    }
    this.captureStop?.()
    this.captureStop = null
    if (this.acceptedEnd !== null) {
      this.connection?.control({
        type: "end",
        source_end_sample: this.acceptedEnd,
      })
      this.update({ status: "draining", error: "" })
    } else {
      this.update({
        status: "paused",
        error: "This device cannot keep up. Resume listening.",
      })
    }
  }

  async start(syncVerified: boolean, offsetMs: number): Promise<void> {
    this.stop()
    const evidence = this.evidence
    if (
      !evidence?.source ||
      !evidence.frame ||
      performance.now() - evidence.frame.timestamp > 150
    ) {
      this.update({
        status: "failed",
        error: "Connect a fresh scene camera first",
      })
      return
    }
    if (
      !syncVerified ||
      !Number.isFinite(offsetMs) ||
      Math.abs(offsetMs) > 500
    ) {
      this.update({
        status: "failed",
        error:
          "Check camera/microphone alignment and synchronization offset first",
      })
      return
    }
    if (evidence.source.kind === "network") {
      this.update({
        status: "failed",
        error:
          "Network camera capture timestamps are unavailable; use a USB camera or synchronized clip",
      })
      return
    }
    const epoch = this.epoch
    const abort = new AbortController()
    this.abort = abort
    this.generation = 0
    this.update({ status: "starting", error: "", tracks: [] })
    try {
      const context = new AudioContext({ sampleRate: 16000 })
      this.player = new LivePlayer({
        context,
        onError: (message) => this.stop(message),
      })
      this.player.reset(0)
      this.update({ status: "starting", error: "", tracks: [] })
      await context.resume()
      const health = await this.client.health(abort.signal)
      if (!health.ready || !health.live) {
        throw new Error("Start the matching local service with live support")
      }
      abort.signal.throwIfAborted()
      const stream = await startMicrophone({
        source: evidence.source.kind,
        syncVerified,
        signal: abort.signal,
      })
      // Permission can take arbitrarily long; reserve a live session only after
      // it succeeds, and own the stream while connection/setup is still pending.
      this.captureStop = () =>
        stream.getTracks().forEach((track) => track.stop())
      abort.signal.throwIfAborted()
      const connection = new StreamConnection({
        baseUrl: this.client.baseUrl,
        onReply: (reply) => {
          if (epoch === this.epoch && !abort.signal.aborted) {
            this.reply(reply)
          }
        },
        onError: (message) => {
          if (epoch === this.epoch) {
            if (message.includes("transport cannot keep up")) {
              this.drainCapture()
            } else {
              this.stop(message)
            }
          }
        },
      })
      this.connection = connection
      const ready = await connection.open(
        {
          source: "camera",
          video_offset_ms: offsetMs,
          client_time: performance.now() / 1000,
        },
        abort.signal
      )
      abort.signal.throwIfAborted()
      this.player.setWarmTimings(ready.warm_timings)
      this.update({ device: ready.device })
      this.captureStop = await startCapture(stream, {
        camera: evidence.camera,
        context,
        signal: abort.signal,
        generation: () => this.generation,
        onPacket: (packet) => {
          if (connection.packet(packet)) {
            const view = new DataView(packet)
            if (
              view.getUint8(4) === 1 &&
              this.snapshot.mode === "focused" &&
              this.snapshot.selection.selectedId &&
              !this.snapshot.selection.paused
            ) {
              this.acceptedEnd =
                Number(view.getBigUint64(12, true)) +
                (packet.byteLength - 32) / 4
            }
          }
        },
        onPcm: (pcm, startSample, captureTime, generation) => {
          if (this.snapshot.mode === "original") {
            this.player?.audio({
              pcm,
              startSample,
              generation,
              captures: [
                {
                  startSample,
                  endSample: startSample + pcm.length,
                  captureTime,
                },
              ],
            })
          }
        },
        onError: (message) => this.stop(message),
      })
      if (abort.signal.aborted || epoch !== this.epoch) {
        this.captureStop()
        return
      }
      this.update({ status: "live", selection: this.adapter.clear() })
    } catch (error) {
      if (epoch === this.epoch) {
        this.stop(
          error instanceof Error ? error.message : "Live capture failed"
        )
      }
    }
  }
  private reply(reply: LiveReply): void {
    if (reply.type === "error") {
      if (reply.generation < this.generation) {
        return
      }
      this.generation = Math.max(this.generation, reply.generation) + 1
      this.player?.reset(this.generation)
      this.acceptedEnd = null
      this.send({
        type: "target",
        generation: this.generation,
        target_id: null,
      })
      this.update({ selection: this.adapter.clear(), error: reply.message })
      return
    }
    if (reply.generation !== this.generation) {
      return
    }
    if (reply.type === "flow" && reply.action === "pause") {
      this.drainCapture()
    }
    if (reply.type === "drained") {
      this.player?.flushEnd(reply.source_end_sample)
    }
    if (reply.type === "faces") {
      this.update({ tracks: reply.tracks })
      this.observe()
    }
    if (reply.type === "audio" && this.snapshot.mode === "focused") {
      this.player?.audio(decodeAudio(reply))
      this.update({
        inferenceSeconds: reply.timings.processing_seconds ?? null,
        arrivalDelay: this.player?.getTiming().delaySeconds ?? null,
      })
    }
  }
  listen(mode: ListeningMode): void {
    this.generation++
    this.player?.reset(this.generation)
    this.acceptedEnd = null
    this.update({ mode, error: "" })
    this.send({
      type: "target",
      generation: this.generation,
      target_id: mode === "focused" ? this.snapshot.selection.selectedId : null,
    })
  }
  correct(box: readonly [number, number, number, number] | null): void {
    this.generation++
    this.player?.reset(this.generation)
    this.acceptedEnd = null
    this.update({ selection: this.adapter.clear(), tracks: [] })
    this.send({ type: "target", generation: this.generation, target_id: null })
    this.send({ type: "region", box })
  }
  draw(canvas: HTMLCanvasElement): void {
    const camera = this.evidence?.camera
    const context = canvas.getContext("2d")
    if (!camera?.latest || !context) {
      return
    }
    canvas.width = camera.rawCanvas.width
    canvas.height = camera.rawCanvas.height
    context.drawImage(camera.rawCanvas, 0, 0)
  }
  stop(error = ""): void {
    this.epoch++
    this.abort?.abort()
    this.abort = null
    this.captureStop?.()
    this.captureStop = null
    this.connection?.close()
    this.connection = null
    this.acceptedEnd = null
    this.player?.dispose()
    this.player = null
    this.update({
      status: error ? "failed" : "idle",
      tracks: [],
      selection: this.adapter.clear(),
      error,
      inferenceSeconds: null,
      arrivalDelay: null,
      timing: null,
    })
  }
  dispose(): void {
    this.displayedGaze = null
    this.stop()
    this.disposed = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.listeners.clear()
  }
}
