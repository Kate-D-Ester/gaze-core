import { verifiedGazePoint } from "./gaze-evidence"
import { SpeakerClient } from "./client"
import { startCapture, startMicrophone } from "./capture"
import { LivePlayer } from "./live-player"
import { liveReplySchema } from "./live-schema"
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
  }
  private listeners = new Set<() => void>()
  private evidence: LiveEvidence | null = null
  private displayedGaze: DisplayedGaze | null = null
  private sourceIdentity = ""
  private abort: AbortController | null = null
  private socket: WebSocket | null = null
  private player: LivePlayer | null = null
  private captureStop: (() => void) | null = null
  private epoch = 0
  private generation = 0
  private offset = 0
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
    this.timer = setInterval(() => this.observe(), 100)
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
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(value))
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
    this.offset = offsetMs / 1000
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
      const socket = new WebSocket(
        this.client.baseUrl.replace("http:", "ws:") + "/live"
      )
      this.socket = socket
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Local live connection timed out")),
          5000
        )
        const cancelled = () => {
          clearTimeout(timer)
          reject(abort.signal.reason)
        }
        abort.signal.addEventListener("abort", cancelled, { once: true })
        const settled = () => {
          clearTimeout(timer)
          abort.signal.removeEventListener("abort", cancelled)
        }
        socket.onopen = () =>
          this.send({
            type: "configure",
            sample_rate: 16000,
            audio: true,
            source: evidence.source!.kind,
            sync_verified: true,
            video_offset_ms: offsetMs,
            client_time: performance.now() / 1000,
          })
        socket.onmessage = (event) => {
          if (epoch !== this.epoch || abort.signal.aborted) {
            return
          }
          try {
            if (typeof event.data !== "string" || event.data.length > 100000) {
              throw new Error("Invalid live service response")
            }
            const reply = liveReplySchema.parse(JSON.parse(event.data))
            if (reply.type === "ready") {
              settled()
              this.update({ device: reply.device })
              resolve()
            } else if (
              reply.type === "error" &&
              this.snapshot.status === "starting"
            ) {
              settled()
              reject(new Error(reply.message))
            } else {
              this.reply(reply)
            }
          } catch {
            settled()
            reject(new Error("Local service returned invalid live data"))
            this.stop("Local service returned invalid live data")
          }
        }
        socket.onerror = () => {
          settled()
          reject(new Error("Local live connection failed"))
          this.stop("Local live connection failed")
        }
        socket.onclose = () => {
          settled()
          reject(new Error("Local live connection closed"))
          if (epoch === this.epoch) {
            this.stop("Local live connection closed; start again to reconnect")
          }
        }
      })
      this.captureStop = await startCapture(stream, {
        camera: evidence.camera,
        context,
        signal: abort.signal,
        generation: () => this.generation,
        onPacket: (packet) => {
          if (
            socket.readyState !== WebSocket.OPEN ||
            socket.bufferedAmount > 256000
          ) {
            this.stop("Live network overload; stop and retry")
            return
          }
          socket.send(packet)
        },
        onPcm: (pcm, timestamp, generation) => {
          if (this.snapshot.mode === "original") {
            this.player?.audio(pcm, timestamp, generation)
          }
        },
        onFrame: (image, timestamp, generation) =>
          this.player?.frame({
            image,
            timestamp: timestamp + this.offset,
            generation,
          }),
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
    if (reply.type === "faces") {
      this.update({ tracks: reply.tracks })
      this.observe()
    }
    if (reply.type === "audio" && this.snapshot.mode === "focused") {
      const bytes = Uint8Array.from(atob(reply.pcm), (character) =>
        character.charCodeAt(0)
      )
      const pcm = new Float32Array(bytes.buffer)
      this.player?.audio(pcm, reply.start, reply.generation)
      this.update({
        inferenceSeconds: reply.processing_seconds,
        arrivalDelay: reply.delay_seconds,
      })
    }
  }
  listen(mode: ListeningMode): void {
    this.generation++
    this.player?.reset(this.generation)
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
    this.update({ selection: this.adapter.clear(), tracks: [] })
    this.send({ type: "target", generation: this.generation, target_id: null })
    this.send({ type: "region", box })
  }
  draw(canvas: HTMLCanvasElement): void {
    this.player?.draw(canvas)
  }
  stop(error = ""): void {
    this.epoch++
    this.abort?.abort()
    this.abort = null
    this.captureStop?.()
    this.captureStop = null
    const socket = this.socket
    this.socket = null
    if (socket) {
      socket.onopen = null
      socket.onmessage = null
      socket.onerror = null
      socket.onclose = null
      socket.close()
    }
    this.player?.dispose()
    this.player = null
    this.update({
      status: error ? "failed" : "idle",
      tracks: [],
      selection: this.adapter.clear(),
      error,
      inferenceSeconds: null,
      arrivalDelay: null,
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
