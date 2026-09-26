import { fitEyeCenter, minorAxisLine, outerEdgeDistance } from "./geometry"
import type { Ellipse, EyeModel, Point } from "./types"
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
    if (!fit) {
      this.latest = null
      this.centers = []
      return null
    }
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
    const ready =
      fit.inliers.length >= 30 &&
      coverage >= 0.625 &&
      radius >= Math.min(width, height) * 0.08 &&
      radius < Math.min(width, height) * 0.75 &&
      fit.residual < Math.max(2, Math.min(width, height) * 0.015)
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
