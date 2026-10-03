import { useEffect, useMemo, useSyncExternalStore } from "react"
import { GAZE_BUBBLE_MAX_AGE_MS, GazeBubbleProcessor } from "./gaze-bubble"
import type { GazeBubbleState } from "./gaze-bubble.types"
import type {
  GazeBubbleStore,
  UseGazeBubbleOptions,
} from "./use-gaze-bubble.types"

function createStore(): GazeBubbleStore {
  const processor = new GazeBubbleProcessor()
  const listeners = new Set<() => void>()
  let snapshot: GazeBubbleState | null = null
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => snapshot,
    update(sample, options, now) {
      const next = processor.update(sample, options, now)
      if (next === null && snapshot === null) {
        return
      }
      snapshot = next
      listeners.forEach((listener) => listener())
    },
  }
}

export function useGazeBubble({
  point,
  timestamp,
  view,
  errorRadiusPx,
  verified,
  stabilize,
  resetKey,
  offset,
  maxAgeMs = GAZE_BUBBLE_MAX_AGE_MS,
}: UseGazeBubbleOptions) {
  const width = view?.width ?? 0
  const height = view?.height ?? 0
  const scale = view?.scale ?? 1
  const offsetX = offset?.[0] ?? 0
  const offsetY = offset?.[1] ?? 0
  // A new coordinate/calibration context must get a fresh estimator immediately.
  const store = useMemo(
    () => createStore(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resetKey, width, height, scale, offsetX, offsetY, stabilize]
  )
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => null
  )
  const x = point?.[0]
  const y = point?.[1]
  useEffect(() => {
    const sample =
      x !== undefined && y !== undefined && timestamp !== null
        ? { point: [x, y] as [number, number], timestamp }
        : null
    const options = {
      width,
      height,
      errorRadiusPx: errorRadiusPx === null ? null : errorRadiusPx * scale,
      verified,
      stabilize,
      maxAgeMs,
    }
    const refresh = () => store.update(sample, options, performance.now())
    refresh()
    if (!sample) {
      return
    }
    // Use the original source time. A redraw cannot extend sample freshness.
    const remaining = sample.timestamp + maxAgeMs - performance.now()
    if (!Number.isFinite(remaining) || remaining < 0 || remaining > maxAgeMs) {
      return
    }
    const expiry = setTimeout(refresh, remaining + 1)
    return () => clearTimeout(expiry)
  }, [
    store,
    x,
    y,
    timestamp,
    width,
    height,
    scale,
    errorRadiusPx,
    verified,
    stabilize,
    maxAgeMs,
  ])
  return state
}
