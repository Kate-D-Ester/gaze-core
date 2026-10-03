export type ListeningMode = "original" | "focused"
export type PlaybackOptions = {
  contextFactory?: () => AudioContext
  fetcher?: typeof fetch
  requestFrame?: typeof requestAnimationFrame
  cancelFrame?: typeof cancelAnimationFrame
  onError?: (message: string) => void
}
