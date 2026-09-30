import { expect, test } from "bun:test"
import {
  pairObservation, createCollector, collectPair, fitSceneCalibration,
  mapSceneGaze, validateSceneCalibration,
} from "../../apps/web/src/features/scene-eye-tracking/calibration"
import type { CalibrationPair, CalibrationHold, HandObservation } from "../../apps/web/src/features/scene-eye-tracking/scene.types"

function hand(time = 1000, count = 1): HandObservation {
  return { scene: { id: 1, timestamp: time, width: 640, height: 480, generation: 1 },
    landmarks: Array.from({length: count}, () => Array.from({length: 21}, () => ({ x: .5, y: .5, z: 0 }))),
    worldLandmarks: [], handedness: ["Right"] }
}
const eye = { id: 1, timestamp: 990, feature: [.1, .2] as [number, number], confidence: .9, valid: true }
function pair(id: number, time: number, x = .5, y = .5): CalibrationPair {
  return { eyeId: id, sceneId: id, eyeTimestamp: time, sceneTimestamp: time,
    feature: [x - .5, y - .5], target: [x, y], handedness: "Right", width: 640, height: 480 }
}
function holds(quadratic = false): CalibrationHold[] {
  return Array.from({length: 9}, (_, i) => {
    const x = [.15, .5, .85][i % 3], y = [.15, .5, .85][Math.floor(i / 3)]
    const feature: [number, number] = [x - .5, y - .5]
    const target: [number, number] = quadratic ? [x + .18 * feature[0] * feature[1], y + .15 * feature[0] ** 2] : [x, y]
    return { region: i, feature, target, pairs: [pair(i + 1, 1000, x, y)] }
  })
}

test("pairs nearest fresh eye evidence after relative camera delay adjustment", () => {
  expect(pairObservation([eye, {...eye, id: 2, timestamp: 1100}], hand(), 0, 1100)?.eyeId).toBe(1)
  expect(pairObservation([{...eye, timestamp: 850}], hand(), 150, 1100)?.eyeId).toBe(1)
  expect(pairObservation([eye], hand(), NaN, 1100)).toBeNull()
})
test("rejects stale, low-confidence, invalid, ambiguous and out-of-frame observations", () => {
  expect(pairObservation([eye], hand(), 0, 1300)).toBeNull()
  expect(pairObservation([{...eye, confidence: .69}], hand(), 0, 1100)).toBeNull()
  expect(pairObservation([{...eye, valid: false}], hand(), 0, 1100)).toBeNull()
  expect(pairObservation([{...eye, feature: [NaN, 0]}], hand(), 0, 1100)).toBeNull()
  expect(pairObservation([eye], hand(1000, 2), 0, 1100)).toBeNull()
  const outside = hand(); outside.landmarks[0][8].x = 1.1
  expect(pairObservation([eye], outside, 0, 1100)).toBeNull()
  expect(pairObservation([{...eye, timestamp: 800}], hand(), 0, 1100)).toBeNull()
})
test("settles and collects unique pairs; duplicate frames do not finish a hold", () => {
  const c = createCollector("calibration")
  for (let i=0; i<40; i++) collectPair(c, pair(1, 1000))
  expect(c.holds).toHaveLength(0)
  for (let i=2; i<30; i++) collectPair(c, pair(i, 1000 + i * 50))
  expect(c.holds).toHaveLength(1)
  for (let i=30; i<65; i++) collectPair(c, pair(i, 1000 + i * 50))
  expect(c.holds).toHaveLength(1)
})
test("hand movement, pupil movement, blink and handedness switches reset an incomplete hold", () => {
  for (const interrupt of [null, pair(11, 1500, .8, .5), {...pair(11, 1500), feature: [.2, .1] as [number, number]}, {...pair(11, 1500), handedness: "Left"}]) {
    const c = createCollector("calibration")
    for (let i=1; i<=10; i++) collectPair(c, pair(i, 1000+i*50))
    collectPair(c, interrupt)
    expect(c.holds).toHaveLength(0)
    expect(c.pending.length).toBeLessThanOrEqual(1)
  }
})
test("calibration requires nine regions; validation requires five distinct regions", () => {
  for (const mode of ["calibration", "validation"] as const) {
    const c = createCollector(mode)
    let id = 0, time = 0
    const count = mode === "calibration" ? 9 : 5
    for (let region=0; region<count; region++) {
      for(let i=0;i<30;i++) collectPair(c, pair(++id, time += 50, [.15,.5,.85][region%3], [.15,.5,.85][Math.floor(region/3)]))
    }
    expect(c.holds).toHaveLength(count)
    expect(collectPair(c, null).complete).toBe(true)
  }
})
test("fits affine mapping with whole-location held-out error and unclamped output", () => {
  const fit = fitSceneCalibration(holds())!
  expect(fit.model).toBe("affine")
  expect(fit.crossValidationRms).toBeLessThan(1e-8)
  expect(mapSceneGaze(fit, [.1, -.2])![0]).toBeCloseTo(.6, 7)
  expect(mapSceneGaze(fit, [2, 0])![0]).toBeGreaterThan(1)
  expect(mapSceneGaze(fit, [NaN, 0])).toBeNull()
})
test("selects quadratic mapping only when held-out accuracy improves", () => {
  const fit = fitSceneCalibration(holds(true))!
  expect(fit.model).toBe("quadratic")
  expect(fit.crossValidationRms).toBeLessThan(1e-8)
  expect(mapSceneGaze(fit, [.2, -.2])![0]).toBeCloseTo(.7 - .0072, 7)
})
test("rejects missing regions, poor scene coverage, collapsed features and corrupt samples", () => {
  expect(fitSceneCalibration(holds().slice(0, 8))).toBeNull()
  expect(fitSceneCalibration(holds().map(h => ({...h, feature: [0,0]})))).toBeNull()
  expect(fitSceneCalibration(holds().map(h => ({...h, feature: [h.feature[0],h.feature[0]]})))).toBeNull()
  expect(fitSceneCalibration(holds().map(h => ({...h, target: [.5,.5]})))).toBeNull()
  const corrupt = holds(); corrupt[0].feature[0] = Infinity
  expect(fitSceneCalibration(corrupt)).toBeNull()
})
test("independent validation reports normalized and pixel RMS and failure", () => {
  const fit = fitSceneCalibration(holds())!
  const fresh = holds().slice(0,5).map(h => ({...h, target: [h.target[0]+.05,h.target[1]] as [number, number]}))
  const result = validateSceneCalibration(fit, fresh)!
  expect(result.normalizedRms).toBeCloseTo(.05, 7)
  expect(result.pixelRms).toBeCloseTo(32, 7)
  expect(result.passed).toBe(true)
  expect(validateSceneCalibration(fit, fresh.map(h=>({...h, target: [h.target[0]+.2,h.target[1]]})))!.passed).toBe(false)
})
