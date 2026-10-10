import type { TargetCollectorOptions } from "./sample-collector.types"
import type {
  CalibrationSample,
  Point,
  RemoteObservation,
} from "./remote-eye-tracking.types"
export const REQUIRED_TARGET_SAMPLES = 18
/** Records synchronized eye + head observations; head motion is never averaged away. */
export class TargetCollector {
  readonly samples: CalibrationSample[] = []
  private lastTimestamp = -Infinity
  private target: Point
  private targetId: number
  private started: number
  private options: TargetCollectorOptions
  constructor(
    target: Point,
    targetId: number,
    started: number,
    options: TargetCollectorOptions = {
      minimumSamples: REQUIRED_TARGET_SAMPLES,
      minimumDurationMs: 0,
    }
  ) {
    this.options = options
    this.target = target
    this.targetId = targetId
    this.started = started
  }
  add(observation: RemoteObservation | null, now: number): boolean {
    if (this.complete) {
      return false
    }
    if (
      !observation ||
      observation.source === "video" ||
      observation.timestamp < this.started + 700 ||
      now - observation.timestamp > 1000 ||
      observation.timestamp > now ||
      observation.reason ||
      observation.quality < 0.45 ||
      !observation.feature?.length ||
      !observation.feature.every(Number.isFinite) ||
      !observation.pose
    ) {
      if (this.options.resetOnInvalid) {
        this.samples.length = 0
      }
      return false
    }
    // Polling the same valid camera frame is not a break in fixation.
    if (observation.timestamp <= this.lastTimestamp) {
      return false
    }
    // New readings must be fresh. An accepted frame can remain visible while
    // slower inference processes its replacement, without advancing the hold.
    if (now - observation.timestamp > 500) {
      if (this.options.resetOnInvalid) {
        this.samples.length = 0
      }
      return false
    }
    this.lastTimestamp = observation.timestamp
    if (
      this.options.accepts &&
      !this.options.accepts(observation, this.samples)
    ) {
      if (this.options.resetOnInvalid) {
        this.samples.length = 0
      }
      return false
    }
    if (
      this.options.minimumDurationMs > 0 &&
      observation.timestamp -
        (this.samples.at(-1)?.observation.timestamp ?? observation.timestamp) >
        500
    ) {
      this.samples.length = 0
    }
    this.samples.push({
      target: [...this.target],
      targetId: this.targetId,
      observation,
    })
    return true
  }
  get progress(): number {
    const duration =
      (this.samples.at(-1)?.observation.timestamp ?? 0) -
      (this.samples[0]?.observation.timestamp ?? 0)
    let elapsedProgress = 1
    if (this.options.minimumDurationMs > 0) {
      elapsedProgress = duration / this.options.minimumDurationMs
    }
    let progress = Math.min(
      1,
      this.samples.length / this.options.minimumSamples,
      elapsedProgress
    )
    if (
      progress >= 1 &&
      this.options.canComplete &&
      !this.options.canComplete(this.samples)
    ) {
      progress = 0.95
    }
    return progress
  }
  get complete(): boolean {
    const first = this.samples[0]?.observation.timestamp
    const last = this.samples.at(-1)?.observation.timestamp
    return (
      first !== undefined &&
      last !== undefined &&
      this.samples.length >= this.options.minimumSamples &&
      last - first >= this.options.minimumDurationMs &&
      (!this.options.canComplete || this.options.canComplete(this.samples))
    )
  }
}
