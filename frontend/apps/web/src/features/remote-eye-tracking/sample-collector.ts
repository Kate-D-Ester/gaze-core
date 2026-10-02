import type { CalibrationSample, Point, RemoteObservation } from "./types"
/** Records synchronized eye + head observations; head motion is never averaged away. */
export class TargetCollector {
  readonly samples: CalibrationSample[] = []
  private lastTimestamp = -Infinity
  private target: Point
  private targetId: number
  private started: number
  constructor(target: Point, targetId: number, started: number) {
    this.target = target
    this.targetId = targetId
    this.started = started
  }
  add(observation: RemoteObservation | null, now: number): boolean {
    if (
      !observation ||
      observation.source === "video" ||
      this.complete ||
      observation.timestamp < this.started + 700 ||
      observation.timestamp <= this.lastTimestamp ||
      now - observation.timestamp > 500 ||
      observation.timestamp > now ||
      observation.reason ||
      observation.quality < 0.45 ||
      !observation.feature?.length ||
      !observation.feature.every(Number.isFinite) ||
      !observation.pose
    )
      return false
    this.lastTimestamp = observation.timestamp
    this.samples.push({
      target: [...this.target],
      targetId: this.targetId,
      observation,
    })
    return true
  }
  get complete(): boolean {
    return this.samples.length >= 18
  }
}
