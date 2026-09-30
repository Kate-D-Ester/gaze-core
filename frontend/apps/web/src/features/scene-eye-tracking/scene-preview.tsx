import { useEffect, useRef } from "react"
import type { SceneCamera } from "./scene-camera"
import type {
  CalibrationHold,
  GazeMeasurement,
  HandObservation,
  SceneObservation,
} from "./scene.types"
const CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
]
export function ScenePreview({
  camera,
  frame,
  hand,
  gaze,
  trace,
  holds,
  capturing,
}: {
  camera: SceneCamera
  frame: SceneObservation | null
  hand: HandObservation | null
  gaze: GazeMeasurement | null
  trace: GazeMeasurement[]
  holds: CalibrationHold[]
  capturing: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current,
      raw = camera.rawCanvas
    if (!element || !frame) return
    if (element.width !== frame.width) element.width = frame.width
    if (element.height !== frame.height) element.height = frame.height
    const ctx = element.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, element.width, element.height)
    ctx.drawImage(raw, 0, 0)
    const w = element.width,
      h = element.height,
      scale = Math.max(1, w / 640)
    if (capturing) {
      ctx.lineWidth = scale
      ctx.strokeStyle = "rgba(255,255,255,.35)"
      for (let i = 1; i < 3; i++) {
        ctx.beginPath()
        ctx.moveTo((w * i) / 3, 0)
        ctx.lineTo((w * i) / 3, h)
        ctx.moveTo(0, (h * i) / 3)
        ctx.lineTo(w, (h * i) / 3)
        ctx.stroke()
      }
      for (const hold of holds) {
        ctx.fillStyle = "rgba(80,200,150,.18)"
        ctx.fillRect(
          ((hold.region % 3) * w) / 3,
          (Math.floor(hold.region / 3) * h) / 3,
          w / 3,
          h / 3
        )
      }
    }
    if (
      hand &&
      hand.scene.generation === frame.generation &&
      performance.now() - hand.scene.timestamp <= 250
    )
      for (const landmarks of hand.landmarks) {
        ctx.lineWidth = 2 * scale
        ctx.strokeStyle = "#7dd3fc"
        for (const [a, b] of CONNECTIONS) {
          const p = landmarks[a],
            q = landmarks[b]
          if (!p || !q) continue
          ctx.beginPath()
          ctx.moveTo(p.x * w, p.y * h)
          ctx.lineTo(q.x * w, q.y * h)
          ctx.stroke()
        }
        for (let i = 0; i < landmarks.length; i++) {
          const p = landmarks[i]
          ctx.beginPath()
          ctx.arc(p.x * w, p.y * h, (i === 8 ? 8 : 3) * scale, 0, Math.PI * 2)
          ctx.fillStyle = i === 8 ? "#fbbf24" : "#d9f4ff"
          ctx.fill()
        }
      }
    ctx.strokeStyle = "rgba(244,114,182,.7)"
    ctx.lineWidth = 2 * scale
    let previous: GazeMeasurement | null = null
    for (const point of trace) {
      if (!point.valid || !point.position) {
        previous = null
        continue
      }
      if (previous?.position && point.timestamp - previous.timestamp <= 250) {
        ctx.beginPath()
        ctx.moveTo(previous.position[0] * w, previous.position[1] * h)
        ctx.lineTo(point.position[0] * w, point.position[1] * h)
        ctx.stroke()
      }
      previous = point
    }
    if (gaze?.valid && gaze.position) {
      ctx.beginPath()
      ctx.arc(
        gaze.position[0] * w,
        gaze.position[1] * h,
        9 * scale,
        0,
        Math.PI * 2
      )
      ctx.fillStyle = "#f472b6"
      ctx.fill()
      ctx.lineWidth = 2 * scale
      ctx.strokeStyle = "white"
      ctx.stroke()
    }
  }, [camera, frame, hand, gaze, trace, holds, capturing])
  return (
    <div
      className={`scene-preview ${frame ? "has-scene" : ""}`}
      style={{ aspectRatio: frame ? `${frame.width}/${frame.height}` : "4/3" }}
    >
      <canvas
        ref={canvas}
        aria-label="Scene camera preview with hand landmarks and mapped gaze"
        hidden={!frame}
      />
      {!frame && (
        <div className="scene-empty">
          <span className="eye-eyebrow">SCENE CAMERA</span>
          <h2>The world in front of you</h2>
          <p>
            Connect the outward-facing camera to see your hand and map your
            gaze.
          </p>
        </div>
      )}
      <div className="scene-preview-caption">
        <span>Unmirrored scene view</span>
        {frame && (
          <span>
            {frame.width} × {frame.height}
          </span>
        )}
      </div>
    </div>
  )
}
