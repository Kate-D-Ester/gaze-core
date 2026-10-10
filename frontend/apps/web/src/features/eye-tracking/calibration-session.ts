import {
  CALIBRATION_TARGETS,
  VALIDATION_TARGETS,
  fitInitialCalibration,
  mapGaze,
} from "./calibration"
import {
  ScreenCalibrationGuide,
  isScreenCalibrationGrid,
} from "../tracking-calibration/screen-calibration"
import { DEFAULT_GAZE_ORIENTATION } from "./calibration-orientation"
import type {
  CalibrationObservation,
  CalibrationSessionOptions,
  CalibrationSessionSnapshot,
} from "./calibration-session.types"
import type {
  Calibration,
  CalibrationSample,
  GazeOrientation,
} from "./calibration.types"
import type { Point } from "./eye-tracking.types"
import {
  HEAD_MOVEMENTS,
  isNeutralHeadPose,
  matchesHeadMovement,
} from "./head-tracking/head-movement"
import {
  relativeHeadPose,
  synchronizedHeadPose,
} from "./head-tracking/head-pose"
import type { HeadPose } from "./head-tracking/head-pose.types"
export const CALIBRATION_READING_MAX_AGE_MS = 350
const SETTLE_MS = 650
const TARGET_MAX_MS = 20000
const VALIDATION_MAX_MS = 8000
const FIXATION_MS = 1000
const MIN_FIXATION_SAMPLES = 12
const BURST_MS = 260
function averageFeature(points: Point[]): Point {
  const mean: Point = [0, 0]
  for (const point of points) {
    mean[0] += point[0] / points.length
    mean[1] += point[1] / points.length
  }
  return mean
}
function averagePose(
  observations: CalibrationObservation[]
): HeadPose | undefined {
  const last = observations.at(-1)?.headPose
  if (!last) {
    return undefined
  }
  const position: HeadPose["position"] = [0, 0, 0]
  const rotation: HeadPose["rotation"] = [0, 0, 0]
  for (let axis = 0; axis < 3; axis++) {
    let sine = 0
    let cosine = 0
    for (const observation of observations) {
      const pose = observation.headPose!
      position[axis] += pose.position[axis] / observations.length
      sine += Math.sin(pose.rotation[axis])
      cosine += Math.cos(pose.rotation[axis])
    }
    rotation[axis] = Math.atan2(sine, cosine)
  }
  return { ...last, position, rotation }
}
export class CalibrationSession {
  readonly samples: CalibrationSample[] = []
  snapshot: CalibrationSessionSnapshot = {
    phase: "intro",
    target: [0.5, 0.5],
    progress: 0,
    instruction: "Look at each dot until it pops",
    label: "CALIBRATION",
  }
  private pointIndex = 0
  private movementDirections = Array<number>(6).fill(0)
  private observations: CalibrationObservation[] = []
  private stablePoints: Point[] = []
  private lastEyeId = -1
  private targetStarted = 0
  private burstStarted = 0
  private mapping: Calibration | null
  private referencePose: HeadPose | null = null
  private readonly guide: ScreenCalibrationGuide
  private readonly orientation: GazeOrientation
  private readonly options: CalibrationSessionOptions
  constructor(options: CalibrationSessionOptions) {
    this.options = options
    this.mapping = options.validation ?? null
    this.orientation = options.orientation ?? DEFAULT_GAZE_ORIENTATION
    this.guide = new ScreenCalibrationGuide([
      this.orientation.horizontal,
      this.orientation.vertical,
    ])
    if (options.validation) {
      this.snapshot.label = "VALIDATION"
    }
    if (options.seedSamples) {
      this.resumeHeadPass(options.seedSamples)
    }
  }
  private resumeHeadPass(grid: CalibrationSample[]): void {
    const valid =
      this.options.headEnabled &&
      !this.options.validation &&
      isScreenCalibrationGrid(grid.map((sample) => sample.target)) &&
      grid.every(
        (sample) => sample.headPose && sample.feature.every(Number.isFinite)
      )
    const mapping = fitInitialCalibration(grid, this.orientation)
    if (!valid || !mapping) {
      this.updateSnapshot({
        phase: "error",
        instruction:
          "The saved gaze grid is unavailable. Start a new calibration.",
      })
      return
    }
    this.samples.push(...grid)
    this.pointIndex = CALIBRATION_TARGETS.length
    this.referencePose = grid[0].headPose!
    this.mapping = mapping
    this.updateSnapshot({
      label: "HEAD MOVEMENT",
      instruction: "Keep looking at the center dot while moving your head",
    })
  }
  private get targets(): Point[] {
    if (this.options.validation) {
      return this.options.targets ?? VALIDATION_TARGETS
    }
    if (this.options.headEnabled) {
      return [
        ...CALIBRATION_TARGETS,
        ...HEAD_MOVEMENTS.map((): Point => [0.5, 0.5]),
      ]
    }
    return CALIBRATION_TARGETS
  }
  private get movement() {
    if (!this.options.headEnabled || this.options.validation) {
      return null
    }
    const index = this.pointIndex - CALIBRATION_TARGETS.length
    const movement = HEAD_MOVEMENTS[index]
    if (!movement) {
      return null
    }
    let direction = 0
    if (index % 2 === 1) {
      direction = -this.movementDirections[movement.axis]
    }
    return { ...movement, direction }
  }
  start(now: number): void {
    if (this.snapshot.phase === "intro") {
      this.beginFixation(now)
    }
  }
  retryCurrentTarget(now: number): void {
    if (this.snapshot.phase === "error" && this.snapshot.retryable) {
      this.beginFixation(now)
    }
  }
  private updateSnapshot(next: Partial<CalibrationSessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next }
  }
  private resetCollection(instruction: string): void {
    this.observations = []
    this.stablePoints = []
    this.updateSnapshot({ progress: 0, instruction })
  }
  private beginFixation(now: number): void {
    this.targetStarted = now
    this.lastEyeId = -1
    this.resetCollection("Look at the dot")
    if (this.movement) {
      this.resetCollection(this.movement.instruction)
    }
    let label = "CALIBRATION"
    if (this.options.validation) {
      label = "VALIDATION"
    }
    if (this.movement) {
      label = "HEAD MOVEMENT"
    }
    let position = this.pointIndex + 1
    let count = this.targets.length
    if (this.options.headEnabled && !this.options.validation) {
      count = CALIBRATION_TARGETS.length
    }
    if (this.movement) {
      position -= CALIBRATION_TARGETS.length
      count = HEAD_MOVEMENTS.length
    }
    this.updateSnapshot({
      phase: "fixation",
      retryable: false,
      target: this.targets[this.pointIndex],
      label: `${label} · ${position} / ${count}`,
    })
  }
  observe(observation: CalibrationObservation | null, now: number): void {
    const phase = this.snapshot.phase
    if (phase === "intro" || phase === "complete" || phase === "error") {
      return
    }
    if (phase === "burst") {
      if (now - this.burstStarted < BURST_MS) {
        return
      }
      if (this.pointIndex === this.targets.length) {
        this.updateSnapshot({ phase: "complete" })
      } else {
        this.beginFixation(now)
      }
      return
    }
    if (!this.options.validation && now - this.targetStarted >= TARGET_MAX_MS) {
      this.updateSnapshot({
        phase: "error",
        retryable: true,
        instruction: this.movement
          ? "This head movement could not be captured. Retry this dot or finish eye-only calibration."
          : "This dot could not be captured. Check the eye reading and retry this dot; your completed dots are saved.",
      })
      return
    }
    if (this.options.validation) {
      this.collectValidation(observation, now)
      return
    }
    if (
      !observation ||
      now - observation.timestamp > CALIBRATION_READING_MAX_AGE_MS ||
      now < observation.timestamp
    ) {
      this.resetCollection("Eye lost. Keep your pupil visible.")
      return
    }
    if (!observation.feature.every(Number.isFinite)) {
      this.resetCollection("Waiting for a clear eye reading")
      return
    }
    if (
      this.options.headEnabled &&
      !synchronizedHeadPose(
        observation.headPose ?? null,
        observation.timestamp,
        now
      )
    ) {
      this.resetCollection("Face lost. Face the front camera.")
      return
    }
    if (observation.id === this.lastEyeId) {
      return
    }
    this.lastEyeId = observation.id
    if (now - this.targetStarted < SETTLE_MS) {
      return
    }
    if (!this.referencePose && observation.headPose) {
      this.referencePose = observation.headPose
    }
    this.collectFixation(observation, now)
  }
  private collectValidation(
    observation: CalibrationObservation | null,
    now: number
  ): void {
    const elapsed = now - this.targetStarted
    if (elapsed < SETTLE_MS) {
      return
    }
    if (
      observation &&
      observation.id !== this.lastEyeId &&
      observation.timestamp >= this.targetStarted + SETTLE_MS &&
      now >= observation.timestamp &&
      now - observation.timestamp <= CALIBRATION_READING_MAX_AGE_MS &&
      observation.feature.every(Number.isFinite)
    ) {
      this.lastEyeId = observation.id
      this.observations.push(observation)
    }
    const span =
      this.observations.length > 1
        ? this.observations.at(-1)!.timestamp - this.observations[0].timestamp
        : 0
    const ready =
      span >= FIXATION_MS && this.observations.length >= MIN_FIXATION_SAMPLES
    this.updateSnapshot({
      progress: Math.min(1, (elapsed - SETTLE_MS) / VALIDATION_MAX_MS),
      instruction: "Keep looking",
    })
    if (!ready && elapsed < SETTLE_MS + VALIDATION_MAX_MS) {
      return
    }
    if (this.observations.length) {
      this.saveFixation(now)
    } else {
      this.pointIndex++
      this.burstStarted = now
      this.updateSnapshot({ phase: "burst", progress: 1 })
    }
  }
  private collectFixation(
    observation: CalibrationObservation,
    now: number
  ): void {
    const feature = observation.feature
    if (
      this.options.headEnabled &&
      !this.options.validation &&
      this.referencePose &&
      observation.headPose
    ) {
      if (this.movement) {
        if (
          !matchesHeadMovement(
            observation.headPose,
            this.referencePose,
            this.movement
          )
        ) {
          this.resetCollection(this.movement.instruction)
          return
        }
      } else if (!isNeutralHeadPose(observation.headPose, this.referencePose)) {
        this.resetCollection("Keep your head centered for these dots")
        return
      }
    }
    if (
      !this.options.validation &&
      !this.movement &&
      !this.guide.matches(feature, this.snapshot.target)
    ) {
      this.resetCollection("Look toward the dot from the center")
      return
    }
    let stabilityFeature = feature
    if (this.mapping && !this.movement) {
      const predicted = mapGaze(
        this.mapping,
        observation.feature,
        observation.headPose
      )
      if (!predicted) {
        this.resetCollection("Face the screen and keep your face visible.")
        return
      }
      stabilityFeature = predicted
    }
    this.observations.push(observation)
    this.stablePoints.push(stabilityFeature)
    const mean = averageFeature(this.stablePoints)
    const variance =
      this.stablePoints.reduce(
        (sum, point) =>
          sum + (point[0] - mean[0]) ** 2 + (point[1] - mean[1]) ** 2,
        0
      ) / this.stablePoints.length
    const moved =
      Math.hypot(stabilityFeature[0] - mean[0], stabilityFeature[1] - mean[1]) >
      0.06
    let headMoved = false
    if (this.movement && observation.headPose) {
      const relative = relativeHeadPose(
        observation.headPose,
        this.observations[0].headPose!
      )
      headMoved =
        !relative ||
        relative.some(
          (value, axis) => Math.abs(value) > (axis < 3 ? 0.012 : 0.025)
        )
    }
    if (Math.sqrt(variance) > 0.025 || moved || headMoved) {
      this.resetCollection("Hold your gaze steady")
      this.observations.push(observation)
      this.stablePoints.push(stabilityFeature)
      return
    }
    const elapsed = observation.timestamp - this.observations[0].timestamp
    const progress = Math.min(
      1,
      elapsed / (this.options.comfortableHold ? 700 : FIXATION_MS),
      this.observations.length /
        (this.options.comfortableHold ? 4 : MIN_FIXATION_SAMPLES)
    )
    this.updateSnapshot({ progress, instruction: "Keep looking" })
    if (progress < 1) {
      return
    }
    this.saveFixation(now)
  }
  private saveFixation(now: number): void {
    const sample: CalibrationSample = {
      feature: averageFeature(
        this.observations.map((observation) => observation.feature)
      ),
      target: this.snapshot.target,
      measurements: this.observations.map((observation) => ({
        feature: [...observation.feature],
        timestamp: observation.timestamp,
        headPose: observation.headPose,
      })),
    }
    if (
      this.options.headEnabled &&
      this.observations.every((observation) => observation.headPose)
    ) {
      sample.headPose = averagePose(this.observations)
      sample.headMeasurements = this.observations.map((observation) => ({
        feature: observation.feature,
        pose: observation.headPose!,
      }))
    }
    this.samples.push(sample)
    if (this.movement && sample.headPose && this.referencePose) {
      const relative = relativeHeadPose(sample.headPose, this.referencePose)
      if (relative) {
        this.movementDirections[this.movement.axis] = Math.sign(
          relative[this.movement.axis]
        )
      }
    }
    if (this.pointIndex === 0 && !this.options.validation) {
      // Collection and the geometry fit must share this stable, averaged head baseline.
      if (sample.headPose) {
        this.referencePose = sample.headPose
      }
    }
    if (!this.options.validation && !this.movement) {
      this.guide.record(
        this.snapshot.target,
        this.observations.map((reading) => reading.feature)
      )
    }
    this.pointIndex++
    if (
      !this.options.validation &&
      this.pointIndex === CALIBRATION_TARGETS.length
    ) {
      this.mapping = fitInitialCalibration(this.samples, this.orientation)
      if (!this.mapping) {
        this.updateSnapshot({
          phase: "error",
          instruction:
            "The samples did not cover the screen. Check camera orientation and follow each dot.",
        })
        return
      }
    }
    this.burstStarted = now
    this.updateSnapshot({ phase: "burst", progress: 1 })
  }
}
