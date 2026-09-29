import { fitEyeCenter, minorAxisLine, outerEdgeDistance } from "./geometry"
import type { Ellipse, EyeModel, Point } from "./eye-tracking.types"
import type { EyeModelLockStatus } from "./eye-model.types"

const MINIMUM_SAMPLES = 30
const REQUIRED_COVERAGE = 0.375
const REQUIRED_DIRECTIONS = 3
const MINIMUM_MOVEMENT_RATIO = 0.035

function getMaximumResidual(width: number, height: number) {
  return Math.max(2, Math.min(width, height) * 0.015)
}

export function getEyeModelLockStatus(
  model: Pick<
    EyeModel,
    "samples" | "coverage" | "radius" | "residual" | "ready"
  > | null,
  width: number,
  height: number,
  regionWidth = width,
  regionHeight = height
): EyeModelLockStatus {
  const minRegionDimension = Math.min(regionWidth, regionHeight)
  const coveredDirections = Math.round((model?.coverage ?? 0) * 8)
  if (!model || width <= 0 || height <= 0 || minRegionDimension <= 0) {
    return {
      ready: false,
      blocker: "waiting",
      coveredDirections,
      requiredDirections: REQUIRED_DIRECTIONS,
      progress: 0,
    }
  }

  let blocker: EyeModelLockStatus["blocker"] = "ready"
  if (!model.ready) {
    if (model.samples < MINIMUM_SAMPLES) blocker = "samples"
    else if (model.coverage < REQUIRED_COVERAGE) blocker = "coverage"
    else if (
      model.radius < minRegionDimension * 0.08 ||
      model.radius >= minRegionDimension * 0.75
    ) {
      blocker = "radius"
    } else if (model.residual >= getMaximumResidual(width, height)) {
      blocker = "fit"
    }
  }

  const readinessProgress = Math.min(
    model.samples / MINIMUM_SAMPLES,
    coveredDirections / REQUIRED_DIRECTIONS
  )
  return {
    ready: blocker === "ready",
    blocker,
    coveredDirections,
    requiredDirections: REQUIRED_DIRECTIONS,
    progress:
      blocker === "ready"
        ? 100
        : Math.min(99, Math.round(readinessProgress * 100)),
  }
}

export class EyeModelEstimator {
  private observations: Ellipse[] = []
  private centers: Point[] = []
  private readonly coveredSectors = new Set<number>()
  private maximumRadius = 0
  private latest: EyeModel | null = null
  reset() {
    this.observations = []
    this.centers = []
    this.coveredSectors.clear()
    this.maximumRadius = 0
    this.latest = null
  }
  getLatest() {
    return this.latest
  }
  observe(
    e: Ellipse,
    width: number,
    height: number,
    regionWidth = width,
    regionHeight = height
  ): EyeModel | null {
    if (e.confidence < 0.85 || !minorAxisLine(e)) return this.latest
    const previous = this.observations.at(-1)
    if (
      previous &&
      Math.hypot(
        e.center[0] - previous.center[0],
        e.center[1] - previous.center[1]
      ) < 1 &&
      Math.abs(Math.sin(e.angle - previous.angle)) < 0.04
    )
      return this.latest
    this.observations.push(e)
    if (this.observations.length > 100) this.observations.shift()
    const fit = fitEyeCenter(this.observations, width, height)
    // Keep the last usable fit while a noisy observation window cannot agree.
    if (!fit) return this.latest
    this.centers.push(fit.center)
    if (this.centers.length > 30) this.centers.shift()
    const center: Point = [0, 1].map(
      (axis) =>
        this.centers.reduce((s, p) => s + p[axis], 0) / this.centers.length
    ) as Point
    const canCollectRange = fit.residual < getMaximumResidual(width, height)
    const minimumMovement =
      Math.min(regionWidth, regionHeight) * MINIMUM_MOVEMENT_RATIO
    for (const item of fit.inliers) {
      const dx = item.center[0] - center[0],
        dy = item.center[1] - center[1]
      if (canCollectRange && Math.hypot(dx, dy) > minimumMovement) {
        this.coveredSectors.add(
          Math.floor(((Math.atan2(dy, dx) + Math.PI) * 4) / Math.PI) % 8
        )
      }
    }
    const observedRadius = Math.max(
      ...fit.inliers.map((item) => outerEdgeDistance(center, item))
    )
    if (canCollectRange) {
      this.maximumRadius = Math.max(this.maximumRadius, observedRadius)
    }
    const coverage = this.coveredSectors.size / 8
    const lockStatus = getEyeModelLockStatus(
      {
        samples: fit.inliers.length,
        coverage,
        radius: this.maximumRadius,
        residual: fit.residual,
        ready: false,
      },
      width,
      height,
      regionWidth,
      regionHeight
    )
    const ready = this.latest?.ready === true || lockStatus.ready
    this.latest = {
      center,
      radius: this.maximumRadius,
      residual: fit.residual,
      samples: fit.inliers.length,
      coverage,
      ready,
    }
    return this.latest
  }
}
