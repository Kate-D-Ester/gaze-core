import { validObjectBox } from "../camera-viewer/object-tracking"
import type { ObjectBox } from "../camera-viewer/object-tracking.types"
import type { CameraTransform } from "../eye-tracking/camera-transform.types"
import type { FollowSettings, Movement } from "./robot-control.types"

export const DEFAULT_FOLLOW_SETTINGS: FollowSettings = { speed: 25 }
export function validateFollowSettings(settings: FollowSettings) {
  if (
    !Number.isInteger(settings.speed) ||
    settings.speed < 1 ||
    settings.speed > 100
  ) {
    throw new Error("Choose a maximum turn speed from 1–100%.")
  }
}

/** Turn only: hysteresis holds near center; timestamped image motion adjusts speed. */
export class VisualServo {
  private previous: Movement["cmd"] | null = null
  private lastPosition = 0
  private lastTimestamp = -Infinity
  private velocity = 0
  constructor(private readonly settings: FollowSettings) {
    validateFollowSettings(settings)
  }
  reset() {
    this.previous = null
    this.lastTimestamp = -Infinity
    this.velocity = 0
  }
  private observe(position: number, timestamp?: number) {
    if (
      timestamp === undefined ||
      !Number.isFinite(timestamp) ||
      timestamp === this.lastTimestamp
    ) {
      return
    }
    const elapsed = timestamp - this.lastTimestamp
    if (elapsed > 0 && elapsed <= 500) {
      const rate = Math.max(
        -2,
        Math.min(2, ((position - this.lastPosition) * 1000) / elapsed)
      )
      this.velocity = 0.6 * this.velocity + 0.4 * rate
    } else {
      this.velocity = 0
    }
    this.lastPosition = position
    this.lastTimestamp = timestamp
  }
  decide(
    box: ObjectBox,
    transform: CameraTransform,
    timestamp?: number
  ): Movement | null {
    if (!validObjectBox(box)) {
      this.reset()
      return null
    }
    const x = ((box[0] + box[2]) / 2 - 0.5) * (transform.mirrorX ? -1 : 1)
    this.observe(x, timestamp)
    const continuing =
      (this.previous === "L" && x < 0) || (this.previous === "R" && x > 0)
    if (Math.abs(x) <= (continuing ? 0.08 : 0.12)) {
      this.previous = null
      return null
    }
    const cmd = x < 0 ? "L" : "R"
    // Boost only motion away from center; approaching motion must not accelerate the turn.
    const awayRate = Math.max(0, Math.sign(x) * this.velocity)
    const urgency = Math.min(1, Math.abs(x) / 0.35 + awayRate / 1.5)
    const speed = Math.max(
      1,
      Math.round(this.settings.speed * (0.35 + 0.65 * urgency))
    )
    this.previous = cmd
    return { action: "car", cmd, speed }
  }
}
