import { openNetworkSource } from "../eye-tracking/network-source"
import {
  getCameraErrorMessage,
  waitForVideoDimensions,
} from "../eye-tracking/video-source"
import type { SceneObservation } from "./scene.types"

export type SceneSource = {
  kind: "camera" | "network"
  name: string
  key: string
  deviceId?: string
}
export type SceneCameraSnapshot = {
  source: SceneSource | null
  busy: boolean
  error: string
  devices: MediaDeviceInfo[]
  frame: SceneObservation | null
}

export class SceneCamera {
  readonly rawCanvas = document.createElement("canvas")
  latest: SceneObservation | null = null
  stream: MediaStream | null = null
  private snapshot: SceneCameraSnapshot = {
    source: null,
    busy: false,
    error: "",
    devices: [],
    frame: null,
  }
  private listeners = new Set<() => void>()
  private video: HTMLVideoElement | null = null
  private bitmap: ImageBitmap | null = null
  private bitmapTime = 0
  private bitmapId = 0
  private drawnBitmapId = -1
  private abort: AbortController | null = null
  private generation = 0
  private sequence = 0
  private raf = 0
  private videoFrameHandle = 0
  private usesFrameCallbacks = false
  private videoFrameReady = false
  private videoFrameTimestamp = 0
  private lastPresentedFrames = -1
  private lastArrival = 0
  private disposed = false
  private refreshDevices = async () => {
    try {
      const devices = (await navigator.mediaDevices?.enumerateDevices()) ?? []
      if (!this.disposed)
        this.update({ devices: devices.filter((d) => d.kind === "videoinput") })
    } catch {
      /* Permission-sensitive enumeration can fail before startup. */
    }
  }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private update(next: Partial<SceneCameraSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next }
    this.listeners.forEach((listener) => listener())
  }
  mount() {
    this.disposed = false
    void this.refreshDevices()
    navigator.mediaDevices?.addEventListener(
      "devicechange",
      this.refreshDevices
    )
  }
  stop(error = "") {
    this.generation++
    this.abort?.abort()
    this.abort = null
    cancelAnimationFrame(this.raf)
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    if (this.video) {
      if (this.videoFrameHandle)
        this.video.cancelVideoFrameCallback?.(this.videoFrameHandle)
      this.video.pause()
      this.video.srcObject = null
      this.video.removeAttribute("src")
      this.video.load()
    }
    this.video = null
    this.bitmap?.close()
    this.bitmap = null
    this.latest = null
    this.videoFrameHandle = 0
    this.usesFrameCallbacks = false
    this.videoFrameReady = false
    this.lastPresentedFrames = -1
    this.drawnBitmapId = -1
    this.update({ source: null, busy: false, error, frame: null })
  }
  dispose() {
    this.disposed = true
    this.stop()
    navigator.mediaDevices?.removeEventListener(
      "devicechange",
      this.refreshDevices
    )
  }
  async startCamera(deviceId: string, excludedDeviceId?: string) {
    this.stop()
    this.update({ busy: true })
    const epoch = this.generation
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera access needs localhost or HTTPS in a supported browser."
        )
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      if (epoch !== this.generation) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      this.stream = stream
      const track = stream.getVideoTracks()[0],
        actualId = track?.getSettings().deviceId
      if (excludedDeviceId && actualId === excludedDeviceId)
        throw new Error(
          "Choose a different USB device for the scene camera and the eye camera."
        )
      const video = document.createElement("video")
      video.muted = true
      video.playsInline = true
      video.srcObject = stream
      this.video = video
      await video.play()
      await waitForVideoDimensions(video)
      if (epoch !== this.generation) return
      this.activate(
        {
          kind: "camera",
          name: track?.label || "Scene camera",
          key: `usb:${actualId || deviceId}:${epoch}`,
          deviceId: actualId,
        },
        epoch
      )
      track?.addEventListener(
        "ended",
        () => {
          if (this.stream === stream)
            this.stop("Scene camera disconnected. Reconnect it and try again.")
        },
        { once: true }
      )
      void this.refreshDevices()
    } catch (error) {
      if (epoch === this.generation) this.stop(getCameraErrorMessage(error))
    }
  }
  async startNetworkStream(url: string) {
    this.stop()
    this.update({ busy: true })
    const epoch = this.generation,
      abort = new AbortController()
    this.abort = abort
    // Covers an MJPEG connection that never sends its first complete frame.
    const timer = setTimeout(() => {
      if (epoch === this.generation)
        this.stop(
          "The scene camera connection timed out. Check its stream URL."
        )
    }, 15000)
    try {
      const network = await openNetworkSource(url, abort.signal)
      if (epoch !== this.generation) {
        if (network.kind === "video") {
          network.video.pause()
          network.video.removeAttribute("src")
          network.video.load()
        } else await network.frames.return(undefined)
        return
      }
      const source: SceneSource = {
        kind: "network",
        name: network.name,
        key: `network:${url.trim()}:${epoch}`,
      }
      if (network.kind === "video") {
        this.video = network.video
        this.activate(source, epoch)
        network.video.addEventListener(
          "error",
          () => {
            if (epoch === this.generation)
              this.stop(
                "The scene network video stopped. Check its URL and CORS settings."
              )
          },
          { once: true }
        )
        return
      }
      const first = await createImageBitmap(
        new Blob([new Uint8Array(network.firstFrame)], { type: "image/jpeg" })
      )
      if (epoch !== this.generation) {
        first.close()
        await network.frames.return(undefined)
        return
      }
      this.bitmap = first
      this.bitmapTime = performance.now()
      this.bitmapId++
      this.activate(source, epoch)
      void (async () => {
        try {
          for await (const bytes of network.frames) {
            const timestamp = performance.now()
            const bitmap = await createImageBitmap(
              new Blob([new Uint8Array(bytes)], { type: "image/jpeg" })
            )
            if (epoch !== this.generation) {
              bitmap.close()
              return
            }
            this.bitmap?.close()
            this.bitmap = bitmap
            this.bitmapTime = timestamp
            this.bitmapId++
          }
          if (epoch === this.generation)
            this.stop(
              "The scene camera stream ended. Reconnect it and try again."
            )
        } catch (error) {
          if (epoch === this.generation && !abort.signal.aborted)
            this.stop(getCameraErrorMessage(error))
        }
      })()
    } catch (error) {
      if (epoch === this.generation) this.stop(getCameraErrorMessage(error))
    } finally {
      clearTimeout(timer)
    }
  }
  private activate(source: SceneSource, epoch: number) {
    this.lastArrival = performance.now()
    this.update({ source, busy: false, error: "" })
    const video = this.video
    this.usesFrameCallbacks = !!video?.requestVideoFrameCallback
    if (video && this.usesFrameCallbacks) {
      const presented: VideoFrameRequestCallback = (now, metadata) => {
        if (epoch !== this.generation || this.disposed) return
        if (metadata.presentedFrames !== this.lastPresentedFrames) {
          this.lastPresentedFrames = metadata.presentedFrames
          this.videoFrameReady = true
          this.videoFrameTimestamp = now
        }
        this.videoFrameHandle = video.requestVideoFrameCallback(presented)
      }
      this.videoFrameHandle = video.requestVideoFrameCallback(presented)
    } else if (video && typeof video.getVideoPlaybackQuality !== "function") {
      this.stop(
        "Scene video needs video-frame callbacks or playback frame counters. Use a current browser."
      )
      return
    }
    const loop = (time: number) => {
      if (epoch !== this.generation || this.disposed) return
      const image = this.bitmap || this.video
      const quality = !this.usesFrameCallbacks
        ? this.video?.getVideoPlaybackQuality?.()
        : null
      const presentedFrames = quality
        ? quality.totalVideoFrames - quality.droppedVideoFrames
        : -1
      const fresh =
        !!image &&
        (this.bitmap
          ? this.bitmapId !== this.drawnBitmapId
          : this.video!.readyState >= 2 &&
            (this.usesFrameCallbacks
              ? this.videoFrameReady
              : presentedFrames > 0 &&
                presentedFrames !== this.lastPresentedFrames))
      if (fresh && image) {
        const width = this.bitmap?.width || this.video!.videoWidth,
          height = this.bitmap?.height || this.video!.videoHeight
        if (width && height) {
          if (this.rawCanvas.width !== width) this.rawCanvas.width = width
          if (this.rawCanvas.height !== height) this.rawCanvas.height = height
          const ctx = this.rawCanvas.getContext("2d")
          if (!ctx) {
            this.stop("Unable to create a scene preview in this browser.")
            return
          }
          try {
            ctx.drawImage(image, 0, 0, width, height)
          } catch (error) {
            this.stop(getCameraErrorMessage(error))
            return
          }
          this.drawnBitmapId = this.bitmapId
          this.videoFrameReady = false
          if (!this.usesFrameCallbacks)
            this.lastPresentedFrames = presentedFrames
          this.lastArrival = time
          if (this.bitmap) this.lastArrival = this.bitmapTime
          else if (this.usesFrameCallbacks)
            this.lastArrival = this.videoFrameTimestamp
          this.latest = {
            id: ++this.sequence,
            timestamp: this.lastArrival,
            width,
            height,
            generation: epoch,
          }
          this.update({ frame: this.latest })
        }
      }
      if (time - this.lastArrival > 2000) {
        this.stop(
          "The scene camera stopped sending frames. Reconnect it and try again."
        )
        return
      }
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }
}
