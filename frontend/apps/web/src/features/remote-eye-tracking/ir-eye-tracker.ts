import { PupilTracker } from "../eye-tracking/pupil-tracker"
import type { CV } from "../eye-tracking/opencv.types"
import type { Point } from "./types"
import {
  detectIrEye,
  type IrEyeOptions,
  type IrReference,
  type IrTrackingState,
} from "./ir-features"

/** Eye-local coordinates from current canthi, independent of the pupil. */
export type IrEyeCoordinates = { origin: Point; scale: number; angle: number }

/** Pupil history survives missing glints; references still require a current reflection. */
export class IrEyeTracker {
  private readonly tracking: IrTrackingState
  private reference: IrReference | null = null
  private coordinates: IrEyeCoordinates | undefined
  private dimensions = ""
  private readonly cv: CV
  constructor(cv: CV) {
    this.cv = cv
    this.tracking = { pupils: new PupilTracker(cv) }
  }
  reset() {
    this.tracking.pupils.reset()
    this.tracking.polarity = undefined
    this.reference = null
    this.coordinates = undefined
    this.dimensions = ""
  }
  process(
    gray: Uint8Array,
    width: number,
    height: number,
    threshold: number,
    timestamp: number,
    options: IrEyeOptions = {},
    coordinates?: IrEyeCoordinates
  ) {
    const dimensions = `${width},${height}`
    if (this.coordinates && coordinates) {
      const scale = coordinates.scale / this.coordinates.scale
      const angle = coordinates.angle - this.coordinates.angle
      if (scale < 0.5 || scale > 2 || Math.abs(angle) > Math.PI / 3) {
        this.reset()
      } else {
        const c = Math.cos(angle),
          s = Math.sin(angle)
        const offset: Point = [
          coordinates.origin[0] -
            scale *
              (c * this.coordinates.origin[0] - s * this.coordinates.origin[1]),
          coordinates.origin[1] -
            scale *
              (s * this.coordinates.origin[0] + c * this.coordinates.origin[1]),
        ]
        this.tracking.pupils.transform(scale, angle, offset)
        if (this.reference) {
          const map = ([x, y]: Point): Point => [
            scale * (c * x - s * y) + offset[0],
            scale * (s * x + c * y) + offset[1],
          ]
          this.reference = {
            ...this.reference,
            pupil: {
              ...this.reference.pupil,
              center: map(this.reference.pupil.center),
              major: this.reference.pupil.major * scale,
              minor: this.reference.pupil.minor * scale,
              angle: this.reference.pupil.angle + angle,
            },
            glint: map(this.reference.glint),
          }
        }
      }
    } else if (
      dimensions !== this.dimensions ||
      !!coordinates !== !!this.coordinates
    ) {
      this.reset()
    }
    this.coordinates = coordinates
    this.dimensions = dimensions
    const result = detectIrEye(
      this.cv,
      gray,
      width,
      height,
      threshold,
      timestamp,
      this.reference,
      options,
      this.tracking
    )
    if (result.reference) this.reference = result.reference
    else if (this.reference && timestamp - this.reference.timestamp > 250)
      this.reference = null
    return result
  }
}
