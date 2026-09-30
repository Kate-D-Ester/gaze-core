import {
  collectPair,
  createCollector,
  fitSceneCalibration,
  mapSceneGaze,
  MAX_FRAME_AGE_MS,
  MAX_PAIR_SKEW_MS,
  pairObservation,
  validateSceneCalibration,
} from "./calibration"
import type {
  CollectionResult,
  Collector,
  EyeObservation,
  GazeMeasurement,
  HandObservation,
  SceneCalibration,
  SceneObservation,
  ValidationResult,
} from "./scene.types"

export type SceneSessionSnapshot = {
  calibration: SceneCalibration | null
  validation: ValidationResult | null
  capture: Collector["mode"] | null
  collection: CollectionResult | null
  notice: string
  delayMs: number
  measurement: GazeMeasurement | null
  trace: GazeMeasurement[]
}
export class SceneSession {
  private snapshot: SceneSessionSnapshot = {
    calibration: null,
    validation: null,
    capture: null,
    collection: null,
    notice: "",
    delayMs: 0,
    measurement: null,
    trace: [],
  }
  private eyes: EyeObservation[] = []
  private collector: Collector | null = null
  private listeners = new Set<() => void>()
  private lastHandId = -1
  private lastMeasuredEyeId = -1
  private continuityAfter = -Infinity
  private pendingHands: HandObservation[] = []
  private scenes: SceneObservation[] = []
  getSnapshot = () => this.snapshot
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  private update(next: Partial<SceneSessionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next }
    this.listeners.forEach((fn) => fn())
  }
  addEye(eye: EyeObservation, now = eye.timestamp) {
    if (this.eyes.at(-1)?.id === eye.id) return
    this.eyes.push(eye)
    this.eyes = this.eyes
      .filter((value) => eye.timestamp - value.timestamp <= 3000)
      .slice(-180)
    const anchor = this.collector?.anchor
    const usable =
      eye.valid &&
      !!eye.feature &&
      eye.confidence >= 0.7 &&
      Number.isFinite(eye.confidence) &&
      Number.isFinite(eye.timestamp) &&
      eye.feature.every(Number.isFinite)
    const moved =
      !!anchor &&
      !!eye.feature &&
      eye.timestamp >= anchor.eyeTimestamp &&
      Math.hypot(
        eye.feature[0] - anchor.feature[0],
        eye.feature[1] - anchor.feature[1]
      ) > 0.03
    if (this.collector && (!usable || moved)) {
      this.continuityAfter = eye.timestamp
      this.pendingHands = []
      this.update({ collection: collectPair(this.collector, null) })
    }
    this.drainHands(now)
  }
  invalidate(reason = "Camera or eye setup changed. Calibrate again.") {
    const hadMapping = !!this.snapshot.calibration || !!this.snapshot.capture
    this.collector = null
    this.eyes = []
    this.lastHandId = -1
    this.lastMeasuredEyeId = -1
    this.continuityAfter = -Infinity
    this.pendingHands = []
    this.scenes = []
    this.update({
      calibration: null,
      validation: null,
      capture: null,
      collection: null,
      measurement: null,
      trace: [],
      notice: hadMapping ? reason : "",
    })
  }
  setDelay(delayMs: number) {
    if (
      !Number.isFinite(delayMs) ||
      Math.abs(delayMs) > 500 ||
      delayMs === this.snapshot.delayMs
    )
      return
    this.invalidate("Camera delay changed. Calibrate again.")
    this.update({ delayMs })
  }
  startCapture(mode: Collector["mode"]) {
    if (mode === "validation" && !this.snapshot.calibration) return
    this.collector = createCollector(mode)
    this.lastHandId = -1
    this.pendingHands = []
    this.continuityAfter = -Infinity
    this.update({
      capture: mode,
      collection: collectPair(this.collector, null),
      notice: "",
      validation: null,
      ...(mode === "calibration" ? { calibration: null, trace: [] } : {}),
    })
  }
  cancelCapture() {
    this.collector = null
    this.pendingHands = []
    this.update({
      capture: null,
      collection: null,
      notice: "Collection cancelled.",
    })
  }
  observeHand(hand: HandObservation, now: number) {
    if (!this.collector || this.lastHandId === hand.scene.id) return
    this.lastHandId = hand.scene.id
    if (hand.landmarks.length !== 1) {
      this.pendingHands = []
      this.update({ collection: collectPair(this.collector, null) })
      return
    }
    this.pendingHands.push(hand)
    this.pendingHands = this.pendingHands.slice(-90)
    this.drainHands(now)
  }
  private drainHands(now: number) {
    while (this.collector && this.pendingHands.length) {
      const hand = this.pendingHands[0]
      const targetTime = hand.scene.timestamp - this.snapshot.delayMs
      const maxAge = MAX_FRAME_AGE_MS + Math.max(0, -this.snapshot.delayMs)
      if (
        now - hand.scene.timestamp <= maxAge &&
        this.snapshot.delayMs < 0 &&
        (this.eyes.at(-1)?.timestamp ?? -Infinity) < targetTime
      )
        return
      this.pendingHands.shift()
      this.collectHand(hand, now)
    }
    if (!this.collector) this.pendingHands = []
  }
  private collectHand(hand: HandObservation, now: number) {
    if (!this.collector) return
    let pair = pairObservation(this.eyes, hand, this.snapshot.delayMs, now)
    if (pair && pair.eyeTimestamp <= this.continuityAfter) pair = null
    const collection = collectPair(this.collector, pair)
    if (!collection.complete) {
      this.update({ collection })
      return
    }
    if (this.snapshot.capture === "validation" && this.snapshot.calibration) {
      const validation = validateSceneCalibration(
        this.snapshot.calibration,
        collection.holds
      )
      this.update({
        validation,
        capture: null,
        collection,
        notice: validation?.passed
          ? "Fresh finger accuracy check passed."
          : "Accuracy check needs improvement. Recalibrate at your working distance.",
      })
    } else {
      const calibration = fitSceneCalibration(collection.holds)
      this.update({
        calibration,
        capture: null,
        collection,
        notice: calibration
          ? "Scene mapping ready. Check accuracy with fresh finger holds."
          : "These holds did not form a reliable mapping. Cover the scene more widely and try again.",
      })
    }
    this.collector = null
  }
  measure(latestScene: SceneObservation | null, now: number) {
    if (latestScene && this.scenes.at(-1)?.id !== latestScene.id) {
      this.scenes.push(latestScene)
      this.scenes = this.scenes
        .filter((s) => now - s.timestamp <= 3000)
        .slice(-180)
    }
    const calibration = this.snapshot.calibration
    if (!calibration) return
    const newestEye = this.eyes.at(-1)
    let scene = latestScene
    if (this.snapshot.delayMs < 0 && newestEye) {
      const sceneTime = newestEye.timestamp + this.snapshot.delayMs
      scene = this.scenes.reduce<SceneObservation | null>(
        (best, value) =>
          !best ||
          Math.abs(value.timestamp - sceneTime) <
            Math.abs(best.timestamp - sceneTime)
            ? value
            : best,
        null
      )
    }
    const time = (scene?.timestamp ?? now) - this.snapshot.delayMs
    const eye = this.eyes.reduce<EyeObservation | null>(
      (best, e) =>
        !best || Math.abs(e.timestamp - time) < Math.abs(best.timestamp - time)
          ? e
          : best,
      null
    )
    let reason = "",
      position = null
    if (
      !latestScene ||
      now - latestScene.timestamp > MAX_FRAME_AGE_MS ||
      !scene ||
      !Number.isFinite(scene.timestamp) ||
      !Number.isFinite(scene.width) ||
      !Number.isFinite(scene.height) ||
      scene.width <= 0 ||
      scene.height <= 0 ||
      now < scene.timestamp ||
      now - scene.timestamp >
        MAX_FRAME_AGE_MS + Math.max(0, -this.snapshot.delayMs)
    )
      reason = "Scene frames stale or unavailable"
    else if (
      !newestEye?.valid ||
      !eye ||
      !eye.valid ||
      !eye.feature ||
      !Number.isFinite(eye.confidence) ||
      !Number.isFinite(eye.timestamp) ||
      now < eye.timestamp ||
      eye.confidence < 0.7 ||
      now - eye.timestamp > MAX_FRAME_AGE_MS + Math.abs(this.snapshot.delayMs)
    )
      reason = "Fresh pupil evidence unavailable"
    else if (Math.abs(eye.timestamp - time) > MAX_PAIR_SKEW_MS)
      reason = "Camera frames could not be paired"
    else position = mapSceneGaze(calibration, eye.feature)
    if (!position && !reason) reason = "Invalid gaze feature"
    // Repainting/new scene frames must not refresh already-used pupil evidence.
    if (position && eye?.id === this.lastMeasuredEyeId) return
    if (position && eye) this.lastMeasuredEyeId = eye.id
    const inFrame = !!position && position.every((v) => v >= 0 && v <= 1)
    if (position && !inFrame) reason = "Gaze outside the scene camera view"
    const extrapolated =
      !!position &&
      position.some(
        (v, i) => v < calibration.bounds.min[i] || v > calibration.bounds.max[i]
      )
    const measurement: GazeMeasurement = {
      timestamp: now,
      eyeId: eye?.id ?? null,
      sceneId: scene?.id ?? null,
      eyeTimestamp: eye?.timestamp ?? null,
      sceneTimestamp: scene?.timestamp ?? null,
      confidence: eye?.confidence ?? 0,
      position,
      pixels:
        position && scene
          ? [position[0] * scene.width, position[1] * scene.height]
          : null,
      valid: inFrame,
      reason,
      extrapolated,
    }
    const trace = [...this.snapshot.trace, measurement]
      .filter((m) => now - m.timestamp <= 3000)
      .slice(-120)
    this.update({ measurement, trace })
  }
  checkCaptureFreshness(now: number) {
    if (
      this.collector &&
      this.collector.lastTimestamp <
        now - (MAX_FRAME_AGE_MS + Math.max(0, -this.snapshot.delayMs))
    )
      this.update({ collection: collectPair(this.collector, null) })
  }
}
