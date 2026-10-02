import type {
  RemoteMode,
  RemoteResponse,
  RemoteSettings,
} from "./remote-eye-tracking.types"
import type { SessionEnvironment, SessionState } from "./session.types"
export type { SessionEnvironment, SessionState } from "./session.types"
const initialState = (): SessionState => ({
  status: "idle",
  error: "",
  observation: null,
  devices: [],
  cameraAccess: "idle",
  cameraError: "",
  fps: 0,
  source: null,
  sourceName: "",
})
function cameraDevices(): MediaDevices {
  const devices = globalThis.navigator?.mediaDevices
  if (!globalThis.isSecureContext || !devices) {
    throw new Error(
      "Camera access needs HTTPS or localhost. Open the phone page through a secure connection."
    )
  }
  return devices
}
function browserEnvironment(video: HTMLVideoElement): SessionEnvironment {
  return {
    getStream: async (constraints) => {
      const devices = cameraDevices()
      if (typeof devices.getUserMedia !== "function") {
        throw new Error("This browser does not support camera access.")
      }
      return devices.getUserMedia(constraints)
    },
    enumerate: async () => {
      const devices = cameraDevices()
      if (typeof devices.enumerateDevices !== "function") {
        throw new Error("This browser cannot list available cameras.")
      }
      return devices.enumerateDevices()
    },
    onDeviceChange: (refresh) => {
      const devices = navigator.mediaDevices
      if (!devices?.addEventListener) {
        return () => {}
      }
      devices.addEventListener("devicechange", refresh)
      return () => devices.removeEventListener("devicechange", refresh)
    },
    worker: () =>
      new Worker(new URL("./remote.worker.ts", import.meta.url), {
        type: "module",
      }),
    capture: (video) => createImageBitmap(video),
    createObjectURL: (file) => URL.createObjectURL(file),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    requestFrame: (callback) =>
      typeof video.requestVideoFrameCallback === "function"
        ? video.requestVideoFrameCallback((now) => callback(now))
        : requestAnimationFrame(callback),
    cancelFrame: (id) => {
      if (typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(id)
      } else {
        cancelAnimationFrame(id)
      }
    },
  }
}
function cameraError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Camera permission was denied. Allow camera access in your browser and try again."
    }
    if (error.name === "NotFoundError") {
      return "No camera was found. Connect a camera and try again."
    }
    if (error.name === "NotReadableError") {
      return "The camera is busy. Close other camera apps and try again."
    }
  }
  return error instanceof Error
    ? error.message
    : "Camera could not start. Please try again."
}
/** Owns one local media source, one worker, and at most one frame. Epochs discard late asynchronous responses. */
export class RemoteSession {
  private env: SessionEnvironment
  private state = initialState()
  private generation = 0
  private deviceRevision = 0
  private disposed = false
  private permissionStream: MediaStream | null = null
  private removeDeviceChange: (() => void) | undefined
  private stream: MediaStream | null = null
  private worker: Worker | null = null
  private frameId = 0
  private busy = false
  private modelReady = false
  private mediaReady = false
  private objectUrl: string | null = null
  private resumeReplay = false
  private removeMediaEvents: (() => void) | undefined
  private resetReplay: (() => void) | undefined
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
    this.removeDeviceChange = this.env.onDeviceChange?.(
      () => void this.refreshDevices()
    )
    void this.refreshDevices()
  }
  private update(patch: Partial<SessionState>): void {
    if (this.disposed) {
      return
    }
    this.state = { ...this.state, ...patch }
    this.notify(this.state)
  }
  async refreshDevices(): Promise<void> {
    await this.discoverDevices()
  }
  private async discoverDevices(generation?: number): Promise<void> {
    if (this.disposed) {
      return
    }
    const revision = ++this.deviceRevision
    const current = () =>
      !this.disposed &&
      revision === this.deviceRevision &&
      (generation === undefined || generation === this.generation)
    try {
      const devices = (await this.env.enumerate()).filter(
        (device) => device.kind === "videoinput"
      )
      if (!current()) {
        return
      }
      let cameraAccess = this.state.cameraAccess
      if (
        cameraAccess !== "requesting" &&
        devices.some((device) => device.label)
      ) {
        cameraAccess = "granted"
      }
      this.update({ devices, cameraAccess, cameraError: "" })
    } catch (error) {
      if (current()) {
        this.update({
          cameraAccess:
            this.state.cameraAccess === "requesting" ? "requesting" : "error",
          cameraError: cameraError(error),
        })
      }
    }
  }
  async requestCameraAccess(): Promise<void> {
    const cameraAccess = this.state.cameraAccess
    if (this.disposed || cameraAccess === "requesting") {
      return
    }
    if (this.stream || this.state.status === "loading") {
      await this.refreshDevices()
      return
    }
    const generation = this.generation
    this.update({ cameraAccess: "requesting", cameraError: "" })
    let stream: MediaStream | null = null
    try {
      stream = await this.env.getStream({ audio: false, video: true })
      if (this.disposed || generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      this.permissionStream = stream
      await this.discoverDevices(generation)
      if (
        !this.disposed &&
        generation === this.generation &&
        this.state.cameraAccess === "requesting"
      ) {
        this.update({ cameraAccess: "granted" })
      }
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        this.update({ cameraAccess: "error", cameraError: cameraError(error) })
      }
    } finally {
      if (stream && this.permissionStream === stream) {
        this.permissionStream = null
        stream.getTracks().forEach((track) => track.stop())
      }
    }
  }
  dispose(): void {
    this.disposed = true
    this.removeDeviceChange?.()
    this.removeDeviceChange = undefined
    this.stop()
  }
  setSettings(settings: RemoteSettings): void {
    const previous = this.settings
    if (
      previous.threshold === settings.threshold &&
      previous.roi.x === settings.roi.x &&
      previous.roi.y === settings.roi.y &&
      previous.roi.width === settings.roi.width &&
      previous.roi.height === settings.roi.height
    ) {
      return
    }
    this.settings = settings
    this.resetReplay?.()
  }
  private clearTracking(): void {
    this.env.cancelFrame(this.frameId)
    if (this.initTimer) {
      clearTimeout(this.initTimer)
    }
    if (this.frameTimer) {
      clearTimeout(this.frameTimer)
    }
    if (this.freshnessTimer) {
      clearTimeout(this.freshnessTimer)
    }
    this.freshnessTimer = null
    this.initTimer = this.frameTimer = null
    this.worker?.terminate()
    this.worker = null
    this.modelReady = this.busy = false
    this.lastResult = 0
    this.lastVideoTime = -1
  }
  stop(): void {
    this.generation++
    this.clearTracking()
    this.removeMediaEvents?.()
    this.removeMediaEvents = undefined
    this.resetReplay = undefined
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    this.permissionStream?.getTracks().forEach((track) => track.stop())
    this.permissionStream = null
    this.video.pause()
    this.video.srcObject = null
    if (this.objectUrl) {
      this.video.removeAttribute("src")
      this.video.load()
      const revoke = this.env.revokeObjectURL ?? URL.revokeObjectURL
      revoke(this.objectUrl)
      this.objectUrl = null
    }
    this.mediaReady = this.resumeReplay = false
    this.update({
      status: "idle",
      observation: null,
      error: "",
      fps: 0,
      source: null,
      sourceName: "",
      cameraAccess:
        this.state.cameraAccess === "requesting"
          ? "idle"
          : this.state.cameraAccess,
    })
  }
  private fail(message: string): void {
    this.stop()
    this.update({ status: "error", error: message })
  }
  private startWorker(mode: RemoteMode, generation: number): void {
    this.update({ status: "loading" })
    const worker = this.env.worker()
    this.worker = worker
    worker.onmessage = (event: MessageEvent<RemoteResponse>) => {
      if (generation !== this.generation) {
        return
      }
      const message = event.data
      if (message.type === "ready") {
        this.modelReady = true
        this.activate(generation)
      } else if (message.type === "error") {
        this.fail(message.message)
      } else {
        this.busy = false
        if (this.frameTimer) {
          clearTimeout(this.frameTimer)
        }
        this.frameTimer = null
        if (
          this.state.source === "video" &&
          (this.video.seeking || this.video.ended)
        ) {
          return
        }
        const now = performance.now()
        const fps = this.lastResult ? 1000 / (now - this.lastResult) : 0
        this.lastResult = now
        const observation =
          now - message.observation.timestamp < 1000
            ? { ...message.observation, source: this.state.source ?? "camera" }
            : null
        if (this.freshnessTimer) {
          clearTimeout(this.freshnessTimer)
        }
        this.freshnessTimer = setTimeout(
          () => {
            if (generation === this.generation) {
              this.update({ observation: null })
            }
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
      if (generation === this.generation) {
        this.fail("Tracking worker failed. Reload or restart tracking.")
      }
    }
    worker.postMessage({ type: "init", mode })
    this.initTimer = setTimeout(() => {
      if (generation === this.generation) {
        this.fail(
          this.state.source === "video"
            ? "Video or model setup timed out. Choose a supported local video and reload the page."
            : "Camera or model setup timed out. Check camera permission and reload the page."
        )
      }
    }, 45000)
  }
  async start(mode: RemoteMode, deviceId?: string): Promise<void> {
    if (this.disposed) {
      return
    }
    this.stop()
    const generation = this.generation
    this.update({ source: "camera" })
    try {
      this.startWorker(mode, generation)
      let source: MediaTrackConstraints =
        mode === "mobile" ? { facingMode: { ideal: "user" } } : {}
      if (deviceId) {
        source = { deviceId: { exact: deviceId } }
      }
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
      for (const track of stream.getVideoTracks()) {
        track.addEventListener(
          "ended",
          () => {
            if (generation === this.generation) {
              this.fail("Camera disconnected. Reconnect it and start again.")
            }
          },
          { once: true }
        )
      }
      this.video.srcObject = stream
      await this.video.play()
      if (generation !== this.generation) {
        return
      }
      this.mediaReady = true
      this.activate(generation)
      this.update({ cameraAccess: "granted", cameraError: "" })
      void this.refreshDevices()
    } catch (error) {
      if (generation === this.generation) {
        this.fail(cameraError(error))
      }
    }
  }
  async startVideo(mode: RemoteMode, file: File): Promise<void> {
    if (this.disposed) {
      return
    }
    this.stop()
    const generation = this.generation
    this.update({ source: "video", sourceName: file.name })
    try {
      const url = (this.env.createObjectURL ?? URL.createObjectURL)(file)
      this.objectUrl = url
      const current = () => !this.disposed && this.objectUrl === url
      this.resumeReplay = true
      const listen = (name: string, listener: () => void) => {
        this.video.addEventListener(name, listener)
        return () => this.video.removeEventListener(name, listener)
      }
      const restart = () => {
        if (!current() || this.worker) {
          return
        }
        try {
          this.mediaReady = this.video.readyState >= 2
          this.startWorker(mode, this.generation)
        } catch (error) {
          this.fail(cameraError(error))
        }
      }
      let ignoredPauses = 0
      const pausePlayback = () => {
        if (!this.video.paused) {
          ignoredPauses++
        }
        this.video.pause()
      }
      const reset = () => {
        if (!current()) {
          return
        }
        this.resumeReplay ||= !this.video.paused
        pausePlayback()
        this.generation++
        this.clearTracking()
        this.update({ observation: null, fps: 0, status: "loading" })
        if (!this.video.seeking) {
          restart()
        }
      }
      this.resetReplay = reset
      const removers = [
        listen("seeking", reset),
        listen("seeked", restart),
        listen("play", () => {
          if (!current() || this.video.paused || this.video.seeking) {
            return
          }
          if (!this.modelReady) {
            this.resumeReplay = true
          }
          restart()
        }),
        listen("pause", () => {
          if (!current()) {
            return
          }
          if (ignoredPauses) {
            ignoredPauses--
          } else if (this.video.paused) {
            this.resumeReplay = false
          }
        }),
        listen("ended", () => {
          if (!current()) {
            return
          }
          this.generation++
          this.clearTracking()
          this.update({ observation: null, fps: 0 })
        }),
        listen("error", () => {
          if (current()) {
            this.fail(
              "This video could not be played. Choose a supported local video file."
            )
          }
        }),
      ]
      this.removeMediaEvents = () => removers.forEach((remove) => remove())
      this.startWorker(mode, generation)
      this.video.src = url
      await this.video.play()
      if (!current() || generation !== this.generation) {
        return
      }
      pausePlayback()
      this.mediaReady = this.video.readyState >= 2
      this.activate(this.generation)
    } catch (error) {
      if (generation === this.generation) {
        this.fail(cameraError(error))
      }
    }
  }
  private activate(generation: number): void {
    if (!this.mediaReady || !this.modelReady || this.state.status === "ready") {
      return
    }
    if (this.initTimer) {
      clearTimeout(this.initTimer)
    }
    this.initTimer = null
    this.update({ status: "ready" })
    if (this.resumeReplay) {
      this.resumeReplay = false
      void this.video.play().catch((error) => {
        if (generation === this.generation) {
          this.fail(cameraError(error))
        }
      })
    }
    const tick = () => {
      if (generation !== this.generation) {
        return
      }
      if (
        this.state.observation &&
        performance.now() - this.state.observation.timestamp > 1000
      ) {
        this.update({ observation: null })
      }
      if (
        !this.busy &&
        !this.video.seeking &&
        !this.video.ended &&
        this.video.readyState >= 2 &&
        this.video.videoWidth > 0 &&
        this.video.currentTime !== this.lastVideoTime
      ) {
        this.lastVideoTime = this.video.currentTime
        void this.sendFrame(generation)
      }
      this.frameId = this.env.requestFrame(tick)
    }
    // A paused seek already presents its selected frame; no future video callback is guaranteed.
    if (this.state.source === "video" && this.video.paused) {
      tick()
    } else {
      this.frameId = this.env.requestFrame(tick)
    }
  }
  private async sendFrame(generation: number): Promise<void> {
    this.busy = true
    try {
      const timestamp = performance.now()
      const mediaTimestamp =
        this.state.source === "video"
          ? this.video.currentTime * 1000
          : undefined
      const frame = await this.env.capture(this.video)
      if (generation !== this.generation || !this.worker) {
        frame.close()
        return
      }
      try {
        this.worker.postMessage(
          {
            type: "frame",
            frame,
            timestamp,
            mediaTimestamp,
            settings: this.settings,
          },
          [frame]
        )
      } catch (error) {
        frame.close()
        throw error
      }
      this.frameTimer = setTimeout(() => {
        if (generation === this.generation) {
          this.fail("Tracking stopped responding. Restart tracking.")
        }
      }, 10000)
    } catch (error) {
      if (generation === this.generation) {
        this.fail(cameraError(error))
      }
    }
  }
}
