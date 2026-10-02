import { pointInPolygon } from "../eye-tracking/geometry"
import type { CV } from "../eye-tracking/opencv.types"
import { PupilTracker } from "../eye-tracking/pupil-tracker"
import type {
  IrEyeBackgroundCandidate,
  IrEyeCoordinates,
} from "./ir-eye-tracker.types"
import {
  detectIrEye,
  type IrEyeOptions,
  type IrReference,
  type IrTrackingState,
} from "./ir-features"
import { prepareIrEye, prepareIrLocalEye } from "./ir-preprocessing"
import type { Point } from "./remote-eye-tracking.types"
export type { IrEyeCoordinates } from "./ir-eye-tracker.types"
/** Eye-local coordinates from current canthi, independent of the pupil. */
/** Pupil history survives missing glints; references still require a current reflection. */
export class IrEyeTrack {
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
    coordinates?: IrEyeCoordinates,
    originalGray: Uint8Array = gray
  ) {
    const dimensions = `${width},${height}`
    if (this.coordinates && coordinates) {
      const scale = coordinates.scale / this.coordinates.scale
      const angle = coordinates.angle - this.coordinates.angle
      if (scale < 0.5 || scale > 2 || Math.abs(angle) > Math.PI / 3) {
        this.reset()
      } else {
        const c = Math.cos(angle)
        const s = Math.sin(angle)
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
      this.tracking,
      originalGray
    )
    if (result.reference) {
      this.reference = result.reference
    } else if (this.reference && timestamp - this.reference.timestamp > 250) {
      this.reference = null
    }
    return result
  }
}
/** Keep native and enhanced intensity histories separate; fresh native evidence wins. */
export class IrEyeTracker {
  private readonly native: IrEyeTrack
  private readonly enhanced: IrEyeTrack
  private readonly local: IrEyeBackgroundCandidate[]
  private readonly cv: CV
  constructor(cv: CV) {
    this.cv = cv
    this.native = new IrEyeTrack(cv)
    this.enhanced = new IrEyeTrack(cv)
    this.local = [0.48, 0.24].map((backgroundFraction) => ({
      backgroundFraction,
      track: new IrEyeTrack(cv),
    }))
  }
  reset() {
    this.native.reset()
    this.enhanced.reset()
    this.local.forEach(({ track }) => track.reset())
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
    const native = this.native.process(
      gray,
      width,
      height,
      threshold,
      timestamp,
      options,
      coordinates
    )
    if (native.pupil || threshold !== 0 || !options.centerRegion) {
      return native
    }
    let recovered = native
    for (const { backgroundFraction, track } of this.local) {
      const local = prepareIrLocalEye(
        this.cv,
        gray,
        width,
        height,
        backgroundFraction
      )
      if (!local) {
        track.reset()
        continue
      }
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!pointInPolygon([x, y], options.centerRegion)) {
            local[y * width + x] = 255
          }
        }
      }
      const result = track.process(
        local,
        width,
        height,
        threshold,
        timestamp,
        { ...options, requireRawRim: true },
        coordinates,
        gray
      )
      // Broad normalization preserves the pupil interior; a finer rim is the fallback.
      // Keep both histories current, even when the first scale supplies this frame.
      if (!recovered.pupil && result.pupil) {
        recovered = result
      }
    }
    const prepared = prepareIrEye(gray, width, height)
    if (!prepared) {
      this.enhanced.reset()
      return recovered
    }
    const enhanced = this.enhanced.process(
      prepared,
      width,
      height,
      threshold,
      timestamp,
      { ...options, requireRawRim: true },
      coordinates,
      gray
    )
    // Keep both recovery histories current rather than starving the fallback when one succeeds.
    return recovered.pupil ? recovered : enhanced
  }
}
