import { validObjectBox } from "../camera-viewer/object-tracking"
import type { ObjectBox } from "../camera-viewer/object-tracking.types"
import type { CameraTransform } from "../eye-tracking/camera-transform.types"
import type { FollowSettings, Movement } from "./robot-control.types"
export const DEFAULT_FOLLOW_SETTINGS: FollowSettings = {
  desiredWidth: 0.3,
  speed: 25,
}
export function validateFollowSettings(settings: FollowSettings) {
  if (
    !Number.isFinite(settings.desiredWidth) ||
    settings.desiredWidth < 0.1 ||
    settings.desiredWidth > 0.8 ||
    !Number.isInteger(settings.speed) ||
    settings.speed < 1 ||
    settings.speed > 100
  ) {
    throw new Error(
      "Choose an object width from 10–80% and a speed from 1–100%."
    )
  }
}
/** Hysteresis avoids alternating directions around the center/size setpoint. */
export class VisualServo {
  private previous: Movement["cmd"] | null = null
  constructor(private readonly settings: FollowSettings) {
    validateFollowSettings(settings)
  }
  reset() {
    this.previous = null
  }
  decide(box: ObjectBox, transform: CameraTransform): Movement | null {
    if (!validObjectBox(box)) {
      this.reset()
      return null
    }
    const x = ((box[0] + box[2]) / 2 - 0.5) * (transform.mirrorX ? -1 : 1)
    let cmd: Movement["cmd"] | null = null
    const continuingTurn =
      (this.previous === "L" && x < 0) || (this.previous === "R" && x > 0)
    const xBand = continuingTurn ? 0.04 : 0.08
    if (Math.abs(x) > xBand) {
      cmd = x < 0 ? "L" : "R"
    }
    const clipped =
      box[0] <= 0.01 || box[1] <= 0.01 || box[2] >= 0.99 || box[3] >= 0.99
    if (!cmd && !clipped) {
      const error = box[2] - box[0] - this.settings.desiredWidth
      const continuingApproach =
        (this.previous === "F" && error < 0) ||
        (this.previous === "B" && error > 0)
      const widthBand = continuingApproach ? 0.015 : 0.03
      if (Math.abs(error) > widthBand) {
        cmd = error < 0 ? "F" : "B"
      }
    }
    this.previous = cmd
    return cmd ? { action: "car", cmd, speed: this.settings.speed } : null
  }
}
