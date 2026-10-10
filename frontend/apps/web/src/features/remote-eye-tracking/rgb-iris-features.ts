import type { Point } from "./remote-eye-tracking.types"
import type { RgbFaceGeometry, RgbPixels } from "./rgb-features.types"
import type { RgbIrisRefinement } from "./rgb-iris-refinement.types"
import { RGB_EYE_INDICES } from "./rgb-eye-landmarks"
import { refineIrisBoundary } from "./rgb-iris-refinement"
import { RGB_IRIS_REFINEMENT_VERSION } from "./rgb-model-version"

export function refineRgbIrisOffsets(
  pixels: RgbPixels | null,
  origin: Point,
  geometry: RgbFaceGeometry
): RgbIrisRefinement {
  const result: RgbIrisRefinement = {
    version: RGB_IRIS_REFINEMENT_VERSION,
    offsets: [...geometry.irisOffsets],
    confidence: [0, 0],
  }
  if (!pixels) {
    return result
  }
  for (const [eye, indices] of RGB_EYE_INDICES.entries()) {
    const center = geometry.eyes[eye]?.center
    if (!center) {
      continue
    }
    const a = geometry.landmarks[indices.corners[0]]!
    const b = geometry.landmarks[indices.corners[1]]!
    const width = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (width < 12) {
      continue
    }
    const dx = (b[0] - a[0]) / width
    const dy = (b[1] - a[1]) / width
    const ring = geometry.landmarks.slice(indices.iris + 1, indices.iris + 5)
    const radii: Point = [0, 0]
    for (const point of ring) {
      const x = point[0] - center[0]
      const y = point[1] - center[1]
      radii[0] = Math.max(radii[0], Math.abs(x * dx + y * dy))
      radii[1] = Math.max(radii[1], Math.abs(-x * dy + y * dx))
    }
    const fit = refineIrisBoundary(pixels, origin, {
      center,
      radii,
      angle: Math.atan2(dy, dx),
      eyelid: indices.lids.map((index) => geometry.landmarks[index]!),
    })
    if (!fit) {
      continue
    }
    const x = fit.center[0] - center[0]
    const y = fit.center[1] - center[1]
    // A weak-but-valid boundary makes a proportionally smaller correction.
    result.offsets[eye * 2]! += (fit.confidence * (x * dx + y * dy)) / width
    result.offsets[eye * 2 + 1]! +=
      (fit.confidence * (-x * dy + y * dx)) / width
    result.confidence[eye] = fit.confidence
  }
  return result
}
