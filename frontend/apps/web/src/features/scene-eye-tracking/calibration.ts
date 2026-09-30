import type { Point } from "../eye-tracking/eye-tracking.types"
import type { CalibrationHold, CalibrationPair, CollectionResult, Collector, EyeObservation, HandObservation, SceneCalibration, ValidationResult } from "./scene.types"

export const MAX_FRAME_AGE_MS = 250
export const MAX_PAIR_SKEW_MS = 100
const finite = (values: number[]) => values.every(Number.isFinite)
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1])
export const sceneRegion = (p: Point) => Math.min(2, Math.floor(p[1] * 3)) * 3 + Math.min(2, Math.floor(p[0] * 3))

export function pairObservation(eyes: EyeObservation[], hand: HandObservation, delayMs: number, now: number): CalibrationPair | null {
  const scene = hand.scene
  if (!Number.isFinite(delayMs) || Math.abs(delayMs) > 500 || !Number.isFinite(now) ||
      now - scene.timestamp < 0 || now - scene.timestamp > MAX_FRAME_AGE_MS ||
      scene.width <= 0 || scene.height <= 0 || hand.landmarks.length !== 1) return null
  const tip = hand.landmarks[0][8]
  if (hand.landmarks[0].length !== 21 || !tip || !finite([tip.x, tip.y, tip.z]) || tip.x < 0 || tip.x > 1 || tip.y < 0 || tip.y > 1) return null
  // Positive delay means the scene arrives later than the eye stream.
  const targetTime = scene.timestamp - delayMs
  const eye = eyes.reduce<EyeObservation | null>((best, value) =>
    !best || Math.abs(value.timestamp - targetTime) < Math.abs(best.timestamp - targetTime) ? value : best, null)
  if (!eye || !eye.valid || eye.confidence < .7 || !eye.feature || !finite([...eye.feature, eye.timestamp, eye.confidence]) ||
      now - eye.timestamp < 0 || now - eye.timestamp > MAX_FRAME_AGE_MS + Math.abs(delayMs) ||
      Math.abs(eye.timestamp - targetTime) > MAX_PAIR_SKEW_MS) return null
  return { eyeId: eye.id, sceneId: scene.id, eyeTimestamp: eye.timestamp, sceneTimestamp: scene.timestamp,
    feature: eye.feature, target: [tip.x, tip.y], handedness: hand.handedness[0] ?? "Unknown", width: scene.width, height: scene.height }
}

export function createCollector(mode: Collector["mode"]): Collector {
  return { mode, holds: [], pending: [], anchor: null, lastEyeId: -1, lastSceneId: -1, lastTimestamp: -Infinity }
}
const median = (values: number[]) => {
  const sorted = [...values].sort((a,b) => a-b), mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2
}
function aggregate(pairs: CalibrationPair[]): CalibrationHold {
  const feature = [0,1].map(axis => median(pairs.map(p=>p.feature[axis]))) as Point
  const target = [0,1].map(axis => median(pairs.map(p=>p.target[axis]))) as Point
  return { region: sceneRegion(target), feature, target, pairs: [...pairs] }
}
export function collectPair(c: Collector, pair: CalibrationPair | null): CollectionResult {
  const required = c.mode === "calibration" ? 9 : 5
  let hint = "Hold your physical index fingertip still and look directly at it."
  if (!pair) { c.pending = []; c.anchor = null; hint = "Waiting for a fresh pupil and one visible hand." }
  else if (pair.eyeId > c.lastEyeId && pair.sceneId > c.lastSceneId) {
    const gap = pair.sceneTimestamp - c.lastTimestamp
    c.lastTimestamp = pair.sceneTimestamp
    c.lastEyeId = pair.eyeId; c.lastSceneId = pair.sceneId
    const region = sceneRegion(pair.target)
    if (c.holds.some(h => h.region === region)) {
      c.pending = []; c.anchor = null; hint = "Move your finger to an uncovered region, then hold."
    } else {
      if (!c.anchor || sceneRegion(c.anchor.target) !== region || c.anchor.handedness !== pair.handedness ||
          distance(c.anchor.target, pair.target) > .025 || distance(c.anchor.feature, pair.feature) > .03 ||
          gap > MAX_FRAME_AGE_MS) {
        c.anchor = pair; c.pending = []
      }
      if (pair.sceneTimestamp - c.anchor.sceneTimestamp >= 300) c.pending.push(pair)
      if (c.pending.length >= 20 && pair.sceneTimestamp - c.pending[0].sceneTimestamp >= 800) {
        c.holds.push(aggregate(c.pending)); c.pending = []; c.anchor = null
        hint = "Location collected. Move your finger to another region."
      }
    }
  }
  return { complete: c.holds.length >= required, progress: Math.min(1, c.pending.length / 20), hint, holds: c.holds }
}

function terms(p: Point, model: SceneCalibration["model"]): number[] {
  const [x,y] = p
  return model === "affine" ? [1,x,y] : [1,x,y,x*x,x*y,y*y]
}
function solve(holds: CalibrationHold[], model: SceneCalibration["model"]): Pick<SceneCalibration, "coefficients" | "mean" | "scale" | "model"> | null {
  const n = holds.length, columns = model === "affine" ? 3 : 6
  if (n <= columns || holds.some(h => !finite([...h.feature,...h.target]))) return null
  const mean = [0,1].map(axis => holds.reduce((sum,h)=>sum+h.feature[axis],0)/n) as Point
  const scale = [0,1].map(axis => Math.sqrt(holds.reduce((sum,h)=>sum+(h.feature[axis]-mean[axis])**2,0)/n)) as Point
  if (scale.some(s=>s<.002)) return null
  const rows = holds.map(h=>terms([(h.feature[0]-mean[0])/scale[0],(h.feature[1]-mean[1])/scale[1]],model))
  const q: number[][] = [], r = Array.from({length:columns},()=>Array<number>(columns).fill(0))
  for(let j=0;j<columns;j++) {
    const v = rows.map(row=>row[j])
    // Two-pass modified Gram-Schmidt avoids cancellation in nearly singular fits.
    for(let pass=0;pass<2;pass++) for(let i=0;i<j;i++) {
      const projection=q[i].reduce((sum,x,k)=>sum+x*v[k],0)
      r[i][j]+=projection
      for(let k=0;k<n;k++) v[k]-=projection*q[i][k]
    }
    r[j][j]=Math.hypot(...v)
    if(r[j][j]<1e-6*Math.sqrt(n)) return null
    q.push(v.map(x=>x/r[j][j]))
  }
  const coefficients = [0,1].map(axis=>{
    const a=q.map(col=>col.reduce((sum,x,i)=>sum+x*holds[i].target[axis],0))
    for(let i=columns-1;i>=0;i--) { for(let j=i+1;j<columns;j++) a[i]-=r[i][j]*a[j]; a[i]/=r[i][i] }
    return a
  }) as [number[],number[]]
  return {model,mean,scale,coefficients}
}
export function mapSceneGaze(calibration: Pick<SceneCalibration,"coefficients"|"mean"|"scale"|"model">, feature: Point): Point | null {
  if(!finite(feature)) return null
  const row=terms([(feature[0]-calibration.mean[0])/calibration.scale[0],(feature[1]-calibration.mean[1])/calibration.scale[1]],calibration.model)
  const p=calibration.coefficients.map(c=>c.reduce((sum,v,i)=>sum+v*row[i],0)) as Point
  return finite(p)?p:null
}
function crossValidate(holds: CalibrationHold[], model: SceneCalibration["model"]): number {
  let squared=0
  for(let i=0;i<holds.length;i++) {
    const fit=solve(holds.filter((_,index)=>index!==i),model)
    const p=fit && mapSceneGaze(fit,holds[i].feature)
    if(!p) return Infinity
    squared+=distance(p,holds[i].target)**2
  }
  return Math.sqrt(squared/holds.length)
}
export function fitSceneCalibration(holds: CalibrationHold[]): SceneCalibration | null {
  if(holds.length!==9 || new Set(holds.map(h=>h.region)).size!==9 || holds.some(h=>h.region!==sceneRegion(h.target))) return null
  const min=[0,1].map(axis=>Math.min(...holds.map(h=>h.target[axis]))) as Point
  const max=[0,1].map(axis=>Math.max(...holds.map(h=>h.target[axis]))) as Point
  if(max[0]-min[0]<.5 || max[1]-min[1]<.5) return null
  const affineError=crossValidate(holds,"affine"), quadraticError=crossValidate(holds,"quadratic")
  const model=quadraticError<affineError*.9 && affineError>1e-6 ? "quadratic" : "affine"
  const error=model==="quadratic"?quadraticError:affineError, fit=solve(holds,model)
  return fit && Number.isFinite(error) && error<=.08 ? {...fit,crossValidationRms:error,bounds:{min,max},holds:[...holds]}:null
}
export function validateSceneCalibration(calibration: SceneCalibration, holds: CalibrationHold[]): ValidationResult | null {
  if(holds.length<5) return null
  let normalized=0, pixels=0
  for(const h of holds) {
    const p=mapSceneGaze(calibration,h.feature), pair=h.pairs[0]
    if(!p || !pair || !finite(h.target)) return null
    normalized+=distance(p,h.target)**2
    pixels+=((p[0]-h.target[0])*pair.width)**2+((p[1]-h.target[1])*pair.height)**2
  }
  const normalizedRms=Math.sqrt(normalized/holds.length)
  return {normalizedRms,pixelRms:Math.sqrt(pixels/holds.length),passed:normalizedRms<=.08,holds:holds.length,pairs:holds.reduce((sum,h)=>sum+h.pairs.length,0)}
}
