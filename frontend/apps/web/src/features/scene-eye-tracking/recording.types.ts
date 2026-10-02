export type RecordingResult = {
  blob: Blob
  mimeType: string
  extension: "mp4" | "webm"
  startedAt: number
  endedAt: number
  error: string
  capture: "canvas-reencode" | "usb-track"
}

export type RecordingOptions = {
  maxBytes?: number
  limitMs?: number
  stream?: MediaStream | null
  onLimit?: () => void
  onStopped?: (result: RecordingResult) => void
}

export type RecordingController = {
  start: () => void
  stop: () => Promise<RecordingResult>
  dispose: () => void
}

export type RecorderErrorEvent = { error?: Error }
