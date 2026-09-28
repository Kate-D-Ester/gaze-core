import { fitEyeCenter, minorAxisLine, outerEdgeDistance } from "./geometry"
import type { Ellipse, EyeModel, Point } from "./types"

const MINIMUM_SAMPLES = 30
const REQUIRED_COVERAGE = 0.625
const REQUIRED_DIRECTIONS = 5

export type EyeModelLockStatus = {
  ready: boolean
  blocker: "waiting" | "samples" | "coverage" | "radius" | "fit" | "ready"
  coveredDirections: number
  requiredDirections: number
  progress: number
}

export function getEyeModelLockStatus(
  model: Pick<
    EyeModel,
    "samples" | "coverage" | "radius" | "residual" | "ready"
  > | null,
  width: number,
  height: number
): EyeModelLockStatus {
  const minDimension = Math.min(width, height)
  const coveredDirections = Math.round((model?.coverage ?? 0) * 8)
  if (!model || minDimension <= 0) {
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
      model.radius < minDimension * 0.08 ||
      model.radius >= minDimension * 0.75
    ) {
      blocker = "radius"
    } else if (model.residual >= Math.max(2, minDimension * 0.015)) {
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
  private latest: EyeModel | null = null
  reset() {
    this.observations = []
    this.centers = []
    this.latest = null
  }
  getLatest() {
    return this.latest
  }
  observe(e: Ellipse, width: number, height: number): EyeModel | null {
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
    const sectors = new Set<number>()
    for (const item of fit.inliers) {
      const dx = item.center[0] - center[0],
        dy = item.center[1] - center[1]
      if (Math.hypot(dx, dy) > Math.min(width, height) * 0.035)
        sectors.add(
          Math.floor(((Math.atan2(dy, dx) + Math.PI) * 4) / Math.PI) % 8
        )
    }
    const radius = Math.max(
      ...fit.inliers.map((item) => outerEdgeDistance(center, item))
    )
    const coverage = sectors.size / 8
    const lockStatus = getEyeModelLockStatus(
      {
        samples: fit.inliers.length,
        coverage,
        radius,
        residual: fit.residual,
        ready: false,
      },
      width,
      height
    )
    const ready = this.latest?.ready === true || lockStatus.ready
    this.latest = {
      center,
      radius,
      residual: fit.residual,
      samples: fit.inliers.length,
      coverage,
      ready,
    }
    return this.latest
  }
}
