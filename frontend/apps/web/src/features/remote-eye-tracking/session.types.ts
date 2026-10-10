import type { RemoteObservation } from "./remote-eye-tracking.types"

export type RemoteFrameTiming = { timestamp: number; captureMs: number }

export type SessionState = {
  status: "idle" | "loading" | "ready" | "error"
  error: string
  observation: RemoteObservation | null
  devices: MediaDeviceInfo[]
  cameraAccess: "idle" | "requesting" | "granted" | "error"
  cameraError: string
  fps: number
  source: "camera" | "video" | null
  /** Actual selected hardware identity; local preferences only, never diagnostics. */
  cameraDeviceId?: string
  sourceName: string
}

export type SessionEnvironment = {
  getStream: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  enumerate: () => Promise<MediaDeviceInfo[]>
  onDeviceChange?: (refresh: () => void) => () => void
  worker: () => Worker
  capture: (video: HTMLVideoElement) => Promise<ImageBitmap>
  requestFrame: (callback: FrameRequestCallback) => number
  cancelFrame: (id: number) => void
  createObjectURL?: (file: File) => string
  revokeObjectURL?: (url: string) => void
}
