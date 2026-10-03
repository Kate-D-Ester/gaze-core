export type LivePlayerOptions = {
  context: AudioContext
  now?: () => number
  onError: (message: string) => void
  delay?: number
}
export type PreviewFrame = {
  image: ImageBitmap
  timestamp: number
  generation: number
}

export type LiveClock = { audio: number; performance: number }
