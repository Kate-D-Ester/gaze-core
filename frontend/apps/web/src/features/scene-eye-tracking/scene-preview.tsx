import { useEffect, useRef } from "react"
import type { SceneCamera } from "./scene-camera"
import type { Point } from "../eye-tracking/eye-tracking.types"
import { MAX_HAND_RECOVERY_MS } from "./calibration"
import {
  NETWORK_CONNECTION_LABELS,
  type NetworkConnectionState,
} from "../eye-tracking/network-camera"
import { Camera, LoaderCircle } from "lucide-react"
import type {
  CalibrationMethod,
  CalibrationHold,
  GazeMeasurement,
  HandObservation,
  SceneObservation,
} from "./scene.types"
import type { MarkerObservation } from "./marker-detector"
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
  handRecovering = false,
  marker = null,
  hideMarkerPattern = false,
  method = "hand",
  gaze,
  trace,
  holds,
  capturing,
  target,
  progress,
  connection,
}: {
  camera: SceneCamera
  frame: SceneObservation | null
  hand: HandObservation | null
  handRecovering?: boolean
  marker?: MarkerObservation | null
  hideMarkerPattern?: boolean
  method?: CalibrationMethod
  gaze: GazeMeasurement | null
  trace: GazeMeasurement[]
  holds: CalibrationHold[]
  capturing: boolean
  target: Point | null
  progress: number
  connection: NetworkConnectionState
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
    if (
      hideMarkerPattern &&
      marker?.position &&
      marker.corners.length &&
      marker.scene.generation === frame.generation &&
      performance.now() - marker.scene.timestamp <= 250
    ) {
      // A same-screen preview must not become another optical calibration
      // target. Mask only the display copy; detector and recordings use rawCanvas.
      const xs = marker.corners.map(([x]) => x * w),
        ys = marker.corners.map(([, y]) => y * h)
      const left = Math.min(...xs),
        top = Math.min(...ys),
        width = Math.max(...xs) - left,
        height = Math.max(...ys) - top
      ctx.fillStyle = "#19231f"
      ctx.fillRect(
        left - width * 0.1,
        top - height * 0.1,
        width * 1.2,
        height * 1.2
      )
    }
    if (capturing) {
      for (const hold of holds) {
        ctx.fillStyle = "#83d7b2"
        ctx.beginPath()
        ctx.arc(
          hold.target[0] * w,
          hold.target[1] * h,
          4 * scale,
          0,
          Math.PI * 2
        )
        ctx.fill()
      }
      if (target) {
        const radius = Math.min(w, h) * 0.1
        ctx.lineWidth = 2 * scale
        ctx.strokeStyle = "rgba(255,255,255,.6)"
        ctx.setLineDash([6 * scale, 5 * scale])
        ctx.beginPath()
        ctx.arc(target[0] * w, target[1] * h, radius, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.strokeStyle = "#83d7b2"
        ctx.lineWidth = 4 * scale
        ctx.beginPath()
        ctx.arc(
          target[0] * w,
          target[1] * h,
          radius,
          -Math.PI / 2,
          -Math.PI / 2 + progress * Math.PI * 2
        )
        ctx.stroke()
      }
    }
    if (
      hand &&
      connection === "live" &&
      hand.scene.generation === frame.generation &&
      performance.now() - hand.scene.timestamp <= MAX_HAND_RECOVERY_MS
    ) {
      ctx.globalAlpha = handRecovering ? 0.45 : 1
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
      ctx.globalAlpha = 1
    }
    if (
      marker?.position &&
      marker.scene.generation === frame.generation &&
      performance.now() - marker.scene.timestamp <= 250
    ) {
      ctx.strokeStyle = "#83d7b2"
      ctx.lineWidth = 2 * scale
      ctx.beginPath()
      marker.corners.forEach(([x, y], index) =>
        index ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)
      )
      ctx.closePath()
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(
        marker.position[0] * w,
        marker.position[1] * h,
        6 * scale,
        0,
        Math.PI * 2
      )
      ctx.stroke()
    }
    ctx.strokeStyle = "rgba(244,114,182,.7)"
    ctx.lineWidth = 2 * scale
    let previous: GazeMeasurement | null = null
    for (const point of capturing ? [] : trace) {
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
    if (
      !capturing &&
      connection === "live" &&
      (gaze?.valid || gaze?.preview) &&
      gaze.position
    ) {
      ctx.beginPath()
      ctx.arc(
        gaze.position[0] * w,
        gaze.position[1] * h,
        9 * scale,
        0,
        Math.PI * 2
      )
      if (gaze.valid && !gaze.estimated) {
        ctx.fillStyle = "#f472b6"
        ctx.fill()
      } else ctx.setLineDash([4 * scale, 3 * scale])
      ctx.lineWidth = 2 * scale
      ctx.strokeStyle = gaze.valid && !gaze.estimated ? "white" : "#fbbf24"
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [
    camera,
    connection,
    frame,
    hand,
    handRecovering,
    marker,
    hideMarkerPattern,
    method,
    gaze,
    trace,
    holds,
    capturing,
    target,
    progress,
  ])
  return (
    <div className={`scene-preview ${frame ? "has-scene" : ""}`}>
      <canvas
        ref={canvas}
        aria-label={
          method === "marker"
            ? "Scene camera preview with calibration marker and mapped gaze"
            : "Scene camera preview with hand landmarks and mapped gaze"
        }
        hidden={!frame}
      />
      {!frame && (
        <div className="scene-empty">
          <Camera size={32} strokeWidth={1.25} aria-hidden="true" />
          <p>No camera connected</p>
        </div>
      )}
      {(connection === "waiting" ||
        connection === "reconnecting" ||
        connection === "connecting") && (
        <div className="scene-recovery" role="status" aria-live="polite">
          <LoaderCircle size={18} aria-hidden="true" />
          <span>{NETWORK_CONNECTION_LABELS[connection]}</span>
        </div>
      )}
      <div className="scene-preview-caption">
        <span>
          {camera.getSnapshot().transform.rotation}°
          {camera.getSnapshot().transform.mirrorX ? " · Mirrored" : ""}
          {camera.getSnapshot().transform.mirrorY ? " · Flipped" : ""}
          {!capturing && gaze?.preview ? " · Unverified preview" : ""}
          {!capturing && gaze?.estimated ? " · One-point estimate" : ""}
        </span>
        {frame && (
          <span>
            {frame.width} × {frame.height}
          </span>
        )}
      </div>
    </div>
  )
}
