import type {
  RemoteMode,
  RemoteObservation,
  RemoteResponse,
  RemoteSettings,
} from "./types"
export type SessionState = {
  status: "idle" | "loading" | "ready" | "error"
  error: string
  observation: RemoteObservation | null
  devices: MediaDeviceInfo[]
  fps: number
}
export type SessionEnvironment = {
  getStream: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  enumerate: () => Promise<MediaDeviceInfo[]>
  worker: () => Worker
  capture: (video: HTMLVideoElement) => Promise<ImageBitmap>
  requestFrame: (callback: FrameRequestCallback) => number
  cancelFrame: (id: number) => void
}
const initialState = (): SessionState => ({
  status: "idle",
  error: "",
  observation: null,
  devices: [],
  fps: 0,
})
function browserEnvironment(video: HTMLVideoElement): SessionEnvironment {
  return {
    getStream: (constraints) => {
      if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        return Promise.reject(
          new Error(
            "Camera access needs HTTPS or localhost. Open the phone page through a secure connection."
          )
        )
      return navigator.mediaDevices.getUserMedia(constraints)
    },
    enumerate: () => navigator.mediaDevices.enumerateDevices(),
    worker: () =>
      new Worker(new URL("./remote.worker.ts", import.meta.url), {
        type: "module",
      }),
    capture: (video) => createImageBitmap(video),
    requestFrame: (callback) =>
      typeof video.requestVideoFrameCallback === "function"
        ? video.requestVideoFrameCallback((now) => callback(now))
        : requestAnimationFrame(callback),
    cancelFrame: (id) => {
      if (typeof video.cancelVideoFrameCallback === "function")
        video.cancelVideoFrameCallback(id)
      else cancelAnimationFrame(id)
    },
  }
}
function cameraError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError")
      return "Camera permission was denied. Allow camera access in your browser and try again."
    if (error.name === "NotFoundError")
      return "No camera was found. Connect a camera and try again."
    if (error.name === "NotReadableError")
      return "The camera is busy. Close other camera apps and try again."
  }
  return error instanceof Error
    ? error.message
    : "Camera could not start. Please try again."
}
/** Owns one camera, one worker, and at most one frame. Epochs discard late permission/inference responses. */
export class RemoteSession {
  private env: SessionEnvironment
  private state = initialState()
  private generation = 0
  private stream: MediaStream | null = null
  private worker: Worker | null = null
  private frameId = 0
  private busy = false
  private modelReady = false
  private cameraReady = false
  private lastResult = 0
  private lastVideoTime = -1
  private freshnessTimer: ReturnType<typeof setTimeout> | null = null
  private initTimer: ReturnType<typeof setTimeout> | null = null
  private frameTimer: ReturnType<typeof setTimeout> | null = null
  private settings: RemoteSettings = {
    roi: { x: 0, y: 0, width: 1, height: 1 },
    threshold: 0,
  }

  private video: HTMLVideoElement
  private notify: (state: SessionState) => void
  constructor(
    video: HTMLVideoElement,
    notify: (state: SessionState) => void,
    env?: SessionEnvironment
  ) {
    this.video = video
    this.notify = notify
    this.env = env ?? browserEnvironment(video)
  }
  private update(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch }
    this.notify(this.state)
  }
  setSettings(settings: RemoteSettings): void {
    this.settings = settings
  }
  stop(): void {
    this.generation++
    this.env.cancelFrame(this.frameId)
    if (this.initTimer) clearTimeout(this.initTimer)
    if (this.frameTimer) clearTimeout(this.frameTimer)
    if (this.freshnessTimer) clearTimeout(this.freshnessTimer)
    this.freshnessTimer = null
    this.initTimer = this.frameTimer = null
    this.worker?.terminate()
    this.worker = null
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    this.video.pause()
    this.video.srcObject = null
    this.modelReady = this.cameraReady = this.busy = false
    this.lastResult = 0
    this.lastVideoTime = -1
    this.update({ status: "idle", observation: null, error: "", fps: 0 })
  }
  private fail(message: string): void {
    this.stop()
    this.update({ status: "error", error: message })
  }
  async start(mode: RemoteMode, deviceId?: string): Promise<void> {
    this.stop()
    const generation = this.generation
    this.update({ status: "loading", devices: [] })
    try {
      const worker = this.env.worker()
      this.worker = worker
      worker.onmessage = (event: MessageEvent<RemoteResponse>) => {
        if (generation !== this.generation) return
        const message = event.data
        if (message.type === "ready") {
          this.modelReady = true
          this.activate(generation)
        } else if (message.type === "error") this.fail(message.message)
        else {
          this.busy = false
          if (this.frameTimer) clearTimeout(this.frameTimer)
          this.frameTimer = null
          const now = performance.now()
          const fps = this.lastResult ? 1000 / (now - this.lastResult) : 0
          this.lastResult = now
          const observation =
            now - message.observation.timestamp < 1000
              ? message.observation
              : null
          if (this.freshnessTimer) clearTimeout(this.freshnessTimer)
          this.freshnessTimer = setTimeout(
            () => {
              if (generation === this.generation)
                this.update({ observation: null })
            },
            Math.max(0, 1000 - (now - message.observation.timestamp))
          )
          this.update({
            observation,
            fps: this.state.fps ? this.state.fps * 0.8 + fps * 0.2 : fps,
          })
        }
      }
      worker.onerror = () => {
        if (generation === this.generation)
          this.fail("Tracking worker failed. Reload or restart the camera.")
      }
      worker.postMessage({ type: "init", mode })
      this.initTimer = setTimeout(() => {
        if (generation === this.generation)
          this.fail(
            "Camera or model setup timed out. Check camera permission and reload the page."
          )
      }, 45000)
      let source: MediaTrackConstraints =
        mode === "mobile" ? { facingMode: { ideal: "user" } } : {}
      if (deviceId) source = { deviceId: { exact: deviceId } }
      const stream = await this.env.getStream({
        audio: false,
        video: {
          ...source,
          width: { ideal: mode === "mobile" ? 1280 : 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
      })
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      this.stream = stream
      for (const track of stream.getVideoTracks())
        track.addEventListener(
          "ended",
          () => {
            if (generation === this.generation)
              this.fail("Camera disconnected. Reconnect it and start again.")
          },
          { once: true }
        )
      this.video.srcObject = stream
      await this.video.play()
      if (generation !== this.generation) return
      this.cameraReady = true
      this.activate(generation)
      void this.env
        .enumerate()
        .then((devices) => {
          if (generation === this.generation)
            this.update({
              devices: devices.filter((device) => device.kind === "videoinput"),
            })
        })
        .catch(() => {})
    } catch (error) {
      if (generation === this.generation) this.fail(cameraError(error))
    }
  }
  private activate(generation: number): void {
    if (!this.cameraReady || !this.modelReady || this.state.status === "ready")
      return
    if (this.initTimer) clearTimeout(this.initTimer)
    this.initTimer = null
    this.update({ status: "ready" })
    const tick = () => {
      if (generation !== this.generation) return
      if (
        this.state.observation &&
        performance.now() - this.state.observation.timestamp > 1000
      )
        this.update({ observation: null })
      if (
        !this.busy &&
        this.video.readyState >= 2 &&
        this.video.videoWidth > 0 &&
        this.video.currentTime !== this.lastVideoTime
      ) {
        this.lastVideoTime = this.video.currentTime
        void this.sendFrame(generation)
      }
      this.frameId = this.env.requestFrame(tick)
    }
    this.frameId = this.env.requestFrame(tick)
  }
  private async sendFrame(generation: number): Promise<void> {
    this.busy = true
    try {
      const timestamp = performance.now()
      const frame = await this.env.capture(this.video)
      if (generation !== this.generation || !this.worker) {
        frame.close()
        return
      }
      try {
        this.worker.postMessage(
          { type: "frame", frame, timestamp, settings: this.settings },
          [frame]
        )
      } catch (error) {
        frame.close()
        throw error
      }
      this.frameTimer = setTimeout(() => {
        if (generation === this.generation)
          this.fail("Tracking stopped responding. Restart the camera.")
      }, 10000)
    } catch (error) {
      if (generation === this.generation) this.fail(cameraError(error))
    }
  }
}
