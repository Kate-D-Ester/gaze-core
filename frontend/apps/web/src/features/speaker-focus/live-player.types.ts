export type CaptureSpan = {
  startSample: number
  endSample: number
  captureTime: number
}
export type StreamAudioChunk = {
  generation: number
  startSample: number
  captures: CaptureSpan[]
  pcm: Float32Array
}
export type PlaybackTiming = {
  state: "buffering" | "playing" | "ended" | "failed"
  reserveSeconds: number
  bufferedSeconds: number
  delaySeconds: number | null
  hardwareLatencyAvailable: boolean
}
export type LivePlayerOptions = {
  context: AudioContext
  now?: () => number
  onError: (message: string, sourceSample: number | null) => void
  warmTimings?: number[]
}
export type ScheduledChunk = {
  chunk: StreamAudioChunk
  when: number
  end: number
}
export type LiveClock = { audio: number; performance: number }
export type PreviewFrame = {
  image: ImageBitmap
  timestamp: number
  generation: number
}
