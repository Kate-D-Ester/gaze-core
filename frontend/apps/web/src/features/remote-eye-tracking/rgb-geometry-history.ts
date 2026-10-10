import type { RgbPhysicalModel } from "./rgb-features.types"
import type {
  RgbGeometryFrame,
  RgbGeometryHistory,
} from "./rgb-geometry-history.types"

const MAX_GEOMETRY_GAP_MS = 1000

/** Preserve person-scale inputs through a brief blink; never supply cached eye observations. */
export function reusableRgbGeometry(
  history: RgbGeometryHistory | null,
  frame: RgbGeometryFrame
): RgbPhysicalModel | undefined {
  if (
    !history ||
    (frame.reason !== null && frame.reason !== "blink") ||
    frame.width !== history.width ||
    frame.height !== history.height ||
    !Number.isFinite(frame.timestamp) ||
    frame.timestamp < history.timestamp ||
    frame.timestamp - history.timestamp > MAX_GEOMETRY_GAP_MS
  ) {
    return undefined
  }
  return history.model
}
