export type ReplayMedia = {
  width: number
  height: number
  duration: number
  sampleCount: number
}
export type ReplayPcm = {
  startSample: number
  captureTime: number
  generation: number
  pcm: Float32Array
}
export type ReplayFrame = {
  sample: number
  captureTime: number
  generation: number
  jpeg: Blob
}
export type ReplaySourceOptions = {
  generation: () => number
  onAudio: (event: ReplayPcm) => void
  onFrame: (event: ReplayFrame) => void | Promise<void>
  onEnd: (sourceEndSample: number) => void
  onError: (message: string) => void
  now?: () => number
  decode?: (bytes: ArrayBuffer) => Promise<AudioBuffer>
  videoFactory?: () => HTMLVideoElement
  canvasFactory?: () => HTMLCanvasElement
  createUrl?: (blob: Blob) => string
  revokeUrl?: (url: string) => void
}
