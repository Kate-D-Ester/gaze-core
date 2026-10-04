import type { SceneCamera } from "../scene-eye-tracking/scene-camera"
export type MicrophoneOptions = {
  source: "camera" | "network"
  syncVerified: boolean
  deviceId?: string
  signal?: AbortSignal
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
}
export type CaptureOptions = {
  camera: SceneCamera
  context: AudioContext
  signal: AbortSignal
  generation: () => number
  onPacket: (packet: ArrayBuffer) => void
  onPcm: (
    pcm: Float32Array,
    sampleStart: number,
    captureTime: number,
    generation: number
  ) => void
  onFrame?: (jpeg: Blob, sampleStart: number, generation: number) => void
  onError: (message: string) => void
}
export type CaptureMessage = {
  pcm: ArrayBuffer
  timestamp: number
  sampleStart: number
  generation: number
}
