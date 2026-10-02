import {
  CALIBRATION_TARGETS,
  VALIDATION_TARGETS,
  fitInitialCalibration,
  mapGaze,
} from "./calibration"
import { DEFAULT_GAZE_ORIENTATION } from "./calibration-orientation"
import { matchesTargetDirection } from "./calibration-direction"
import {
  synchronizedHeadPose,
  relativeHeadPose,
} from "./head-tracking/head-pose"
import {
  HEAD_MOVEMENTS,
  isNeutralHeadPose,
  matchesHeadMovement,
} from "./head-tracking/head-movement"
import type {
  Calibration,
  CalibrationSample,
  GazeOrientation,
} from "./calibration.types"
import type { Point } from "./eye-tracking.types"
import type { HeadPose } from "./head-tracking/head-pose.types"
import type {
  CalibrationObservation,
  CalibrationSessionOptions,
  CalibrationSessionSnapshot,
} from "./calibration-session.types"

const SETTLE_MS = 650
const FIXATION_MS = 1000
const MIN_FIXATION_SAMPLES = 12
const BURST_MS = 260
const TARGET_TOLERANCE = 0.18
const MIN_DIRECTION_MOVEMENT = 0.006

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
  if (!last) return undefined
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
  private centerFeature: Point | null = null
  private minimumMovement: Point = [
    MIN_DIRECTION_MOVEMENT,
    MIN_DIRECTION_MOVEMENT,
  ]
  private readonly orientation: GazeOrientation

  private readonly options: CalibrationSessionOptions

  constructor(options: CalibrationSessionOptions) {
    this.options = options
    this.mapping = options.validation ?? null
    this.orientation = options.orientation ?? DEFAULT_GAZE_ORIENTATION
    if (options.validation) this.snapshot.label = "VALIDATION"
    if (options.seedSamples) this.resumeHeadPass(options.seedSamples)
  }

  private resumeHeadPass(grid: CalibrationSample[]): void {
    const valid =
      this.options.headEnabled &&
      !this.options.validation &&
      grid.length === CALIBRATION_TARGETS.length &&
      grid.every(
        (sample, index) =>
          sample.headPose &&
          sample.feature.every(Number.isFinite) &&
          sample.target.every(
            (value, axis) => value === CALIBRATION_TARGETS[index][axis]
          )
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
    this.centerFeature = grid[0].feature
    this.mapping = mapping
    this.updateSnapshot({
      label: "HEAD MOVEMENT",
      instruction: "Keep looking at the center dot while moving your head",
    })
  }

  private get targets(): Point[] {
    if (this.options.validation) return VALIDATION_TARGETS
    if (this.options.headEnabled)
      return [
        ...CALIBRATION_TARGETS,
        ...HEAD_MOVEMENTS.map((): Point => [0.5, 0.5]),
      ]
    return CALIBRATION_TARGETS
  }

  private get movement() {
    if (!this.options.headEnabled || this.options.validation) return null
    const index = this.pointIndex - CALIBRATION_TARGETS.length
    const movement = HEAD_MOVEMENTS[index]
    if (!movement) return null
    let direction = 0
    if (index % 2 === 1) direction = -this.movementDirections[movement.axis]
    return { ...movement, direction }
  }

  start(now: number): void {
    if (this.snapshot.phase === "intro") this.beginFixation(now)
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
    if (this.movement) this.resetCollection(this.movement.instruction)
    let label = "CALIBRATION"
    if (this.options.validation) label = "VALIDATION"
    if (this.movement) label = "HEAD MOVEMENT"
    let position = this.pointIndex + 1
    let count = this.targets.length
    if (this.options.headEnabled && !this.options.validation)
      count = CALIBRATION_TARGETS.length
    if (this.movement) {
      position -= CALIBRATION_TARGETS.length
      count = HEAD_MOVEMENTS.length
    }
    this.updateSnapshot({
      phase: "fixation",
      target: this.targets[this.pointIndex],
      label: `${label} · ${position} / ${count}`,
    })
  }

  observe(observation: CalibrationObservation | null, now: number): void {
    const phase = this.snapshot.phase
    if (phase === "intro" || phase === "complete" || phase === "error") return
    if (phase === "burst") {
      if (now - this.burstStarted < BURST_MS) return
      if (this.pointIndex === this.targets.length)
        this.updateSnapshot({ phase: "complete" })
      else this.beginFixation(now)
      return
    }
    if (
      !observation ||
      now - observation.timestamp > 350 ||
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
    if (observation.id === this.lastEyeId) return
    this.lastEyeId = observation.id
    if (now - this.targetStarted < SETTLE_MS) return
    if (!this.referencePose && observation.headPose)
      this.referencePose = observation.headPose
    this.collectFixation(observation, now)
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
      this.centerFeature &&
      !matchesTargetDirection(
        feature,
        this.centerFeature,
        this.snapshot.target,
        this.orientation,
        this.minimumMovement,
        this.options.screenAspectRatio
      )
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
      // Validation measures error independently; gating it by the prediction would hide errors.
      if (
        !this.options.validation &&
        Math.hypot(
          predicted[0] - this.snapshot.target[0],
          predicted[1] - this.snapshot.target[1]
        ) > TARGET_TOLERANCE
      ) {
        this.resetCollection("Look directly at the dot")
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
      elapsed / FIXATION_MS,
      this.observations.length / MIN_FIXATION_SAMPLES
    )
    this.updateSnapshot({ progress, instruction: "Keep looking" })
    if (progress < 1) return
    this.saveFixation(now)
  }

  private saveFixation(now: number): void {
    const sample: CalibrationSample = {
      feature: averageFeature(
        this.observations.map((observation) => observation.feature)
      ),
      target: this.snapshot.target,
    }
    if (this.options.headEnabled) {
      sample.headPose = averagePose(this.observations)
      sample.headMeasurements = this.observations.map((observation) => ({
        feature: observation.feature,
        pose: observation.headPose!,
      }))
    }
    this.samples.push(sample)
    if (this.movement && sample.headPose && this.referencePose) {
      const relative = relativeHeadPose(sample.headPose, this.referencePose)
      if (relative)
        this.movementDirections[this.movement.axis] = Math.sign(
          relative[this.movement.axis]
        )
    }
    if (this.pointIndex === 0 && !this.options.validation) {
      // Keep the stable center and its measured noise as the reference for all eight directions.
      this.centerFeature = averageFeature(this.stablePoints)
      // Collection and the geometry fit must share this stable, averaged head baseline.
      if (sample.headPose) this.referencePose = sample.headPose
      for (let axis = 0; axis < 2; axis++) {
        const variance =
          this.stablePoints.reduce(
            (sum, point) =>
              sum + (point[axis] - this.centerFeature![axis]) ** 2,
            0
          ) / this.stablePoints.length
        this.minimumMovement[axis] = Math.max(
          MIN_DIRECTION_MOVEMENT,
          4 * Math.sqrt(variance)
        )
      }
    }
    this.pointIndex++
    if (!this.options.validation && this.pointIndex === 5) {
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
