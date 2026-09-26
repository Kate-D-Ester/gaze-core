import { useEffect, useRef, useState, type PointerEvent } from "react"
import { Camera, ScanEye } from "lucide-react"
import type { TrackerController } from "./use-tracker"
import type { Ellipse, Point, Rect, TrackingFrame } from "./types"

function drawEllipse(
  ctx: CanvasRenderingContext2D,
  e: Ellipse,
  offset: Point,
  color: string
) {
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(
    e.center[0] + offset[0],
    e.center[1] + offset[1],
    e.major,
    e.minor,
    e.angle,
    0,
    2 * Math.PI
  )
  ctx.stroke()
}
export function EyePreview({
  tracker,
  selectRegion,
  selectCorners,
  onRegion,
  onCorner,
}: {
  tracker: TrackerController
  selectRegion: boolean
  selectCorners: boolean
  onRegion: (roi: Rect) => void
  onCorner: (p: Point) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    start = useRef<Point | null>(null)
  const [selection, setSelection] = useState<Rect | null>(null)
  const frame = tracker.frame,
    roi = tracker.settings.roi
  useEffect(() => {
    const canvas = ref.current,
      source = tracker.sourceCanvas.current
    if (!canvas || !source) return
    canvas.width = source.width
    canvas.height = source.height
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(source, 0, 0)
    const rect = selection ?? roi
    ctx.fillStyle = "rgba(8,17,17,.42)"
    ctx.beginPath()
    ctx.rect(0, 0, canvas.width, canvas.height)
    ctx.rect(rect.x, rect.y, rect.width, rect.height)
    ctx.fill("evenodd")
    ctx.strokeStyle = selectRegion ? "#e1eeef" : "#65dbc8"
    ctx.lineWidth = 1.5
    ctx.setLineDash([7, 5])
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
    ctx.setLineDash([])
    if (frame?.detection.ellipse) {
      drawEllipse(ctx, frame.detection.ellipse, [roi.x, roi.y], "#67f0cf")
      const p = frame.detection.ellipse.center
      ctx.fillStyle = "#dffff5"
      ctx.beginPath()
      ctx.arc(p[0] + roi.x, p[1] + roi.y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    if (frame?.model) {
      const m = frame.model
      ctx.strokeStyle = "#6ba6ff"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(...m.center, m.radius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(m.center[0] - 6, m.center[1])
      ctx.lineTo(m.center[0] + 6, m.center[1])
      ctx.moveTo(m.center[0], m.center[1] - 6)
      ctx.lineTo(m.center[0], m.center[1] + 6)
      ctx.stroke()
      if (frame.detection.ellipse) {
        ctx.strokeStyle = "#fbdb8a"
        ctx.beginPath()
        ctx.moveTo(...m.center)
        ctx.lineTo(
          frame.detection.ellipse.center[0] + roi.x,
          frame.detection.ellipse.center[1] + roi.y
        )
        ctx.stroke()
      }
    }
    for (const p of tracker.settings.corners ?? []) {
      ctx.fillStyle = "#f5c876"
      ctx.beginPath()
      ctx.arc(...p, 5, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [
    frame,
    tracker.sourceCanvas,
    tracker.settings.corners,
    roi,
    selection,
    selectRegion,
  ])
  function point(event: PointerEvent<HTMLCanvasElement>): Point {
    const canvas = event.currentTarget,
      b = canvas.getBoundingClientRect()
    return [
      Math.round(
        Math.max(
          0,
          Math.min(
            canvas.width,
            ((event.clientX - b.left) * canvas.width) / b.width
          )
        )
      ),
      Math.round(
        Math.max(
          0,
          Math.min(
            canvas.height,
            ((event.clientY - b.top) * canvas.height) / b.height
          )
        )
      ),
    ]
  }
  function updateSelection(p: Point) {
    if (!start.current) return null
    const a = start.current
    return {
      x: Math.min(a[0], p[0]),
      y: Math.min(a[1], p[1]),
      width: Math.abs(p[0] - a[0]),
      height: Math.abs(p[1] - a[1]),
    }
  }
  return (
    <div className="eye-preview">
      <div className="eye-preview-heading">
        <span>
          <span
            className={tracker.source ? "status-light on" : "status-light"}
          />
          {tracker.source ? "Camera view" : "Preview"}
        </span>
        <span>
          {tracker.source?.kind === "sample"
            ? "SIMULATED INPUT"
            : tracker.source
              ? "LOCAL PROCESSING"
              : "NO SOURCE"}
        </span>
      </div>
      {tracker.source ? (
        <canvas
          ref={ref}
          aria-label="Eye camera preview. Drag to select an eye region."
          className={selectRegion || selectCorners ? "selectable" : ""}
          onPointerDown={(event) => {
            if (selectCorners) {
              onCorner(point(event))
              return
            }
            if (!selectRegion) return
            start.current = point(event)
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            if (start.current) setSelection(updateSelection(point(event)))
          }}
          onPointerCancel={() => {
            start.current = null
            setSelection(null)
          }}
          onPointerUp={(event) => {
            const rect = updateSelection(point(event))
            start.current = null
            setSelection(null)
            if (rect && rect.width >= 24 && rect.height >= 24) onRegion(rect)
          }}
        />
      ) : (
        <div className="eye-preview-empty">
          <div className="eye-camera-outline">
            <Camera size={30} strokeWidth={1.2} />
          </div>
          <h2>A clear view starts here.</h2>
          <p>Connect an eye camera or explore the sample.</p>
          <span className="eye-viewfinder-corner tl" />
          <span className="eye-viewfinder-corner tr" />
          <span className="eye-viewfinder-corner bl" />
          <span className="eye-viewfinder-corner br" />
        </div>
      )}
      <div className="eye-preview-footer">
        <span>
          {selectRegion
            ? "Drag a box around one eye"
            : selectCorners
              ? "Select the inner and outer eye corners"
              : (frame?.detection.reason ?? "Your camera stays on this device")}
        </span>
        <span>
          {frame
            ? `${frame.width} × ${frame.height} · ${Math.round(frame.processingMs)} ms / frame`
            : "—"}
        </span>
      </div>
    </div>
  )
}
function MaskPreview({
  mask,
  width,
  height,
}: {
  mask: Uint8Array
  width: number
  height: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = width
    c.height = height
    const ctx = c.getContext("2d")
    if (!ctx) return
    const image = ctx.createImageData(width, height)
    for (let i = 0; i < mask.length; i++) {
      const j = i * 4
      image.data[j] = image.data[j + 1] = image.data[j + 2] = mask[i]
      image.data[j + 3] = 255
    }
    ctx.putImageData(image, 0, 0)
  }, [mask, width, height])
  return <canvas ref={ref} />
}
export function PipelinePreviews({ frame }: { frame: TrackingFrame | null }) {
  return (
    <div className="eye-thumbnails">
      {(frame?.detection.previews.length
        ? frame.detection.previews
        : [
            { label: "Strict", threshold: 0 },
            { label: "Balanced", threshold: 0 },
            { label: "Relaxed", threshold: 0 },
          ]
      ).map((p, i) => (
        <div
          key={p.label}
          className={`eye-thumbnail ${frame?.detection.selected === i ? "selected" : ""}`}
        >
          <div className="eye-thumbnail-image">
            {"mask" in p ? (
              <MaskPreview
                mask={p.mask}
                width={frame!.roi.width}
                height={frame!.roi.height}
              />
            ) : (
              <ScanEye size={22} strokeWidth={1} />
            )}
          </div>
          <div>
            <span>{p.label}</span>
            <span>
              {"score" in p
                ? `${Math.round(p.score * 100)}% fit`
                : "Awaiting frame"}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
export function SpherePreview({ frame }: { frame: TrackingFrame | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, 280, 220)
    ctx.strokeStyle = "#cbd7d4"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(140, 105, 74, 0, Math.PI * 2)
    ctx.stroke()
    for (const r of [24, 50]) {
      ctx.beginPath()
      ctx.ellipse(140, 105, r, 74, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.ellipse(140, 105, 74, r, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    const gaze = frame?.gaze?.direction
    if (gaze) {
      ctx.strokeStyle = "#128877"
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(140, 105)
      ctx.lineTo(140 + gaze[0] * 115, 105 + gaze[1] * 115)
      ctx.stroke()
      ctx.fillStyle = "#128877"
      ctx.beginPath()
      ctx.arc(140 + gaze[0] * 74, 105 + gaze[1] * 74, 6, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [frame])
  return (
    <div className="eye-sphere">
      <div className="eye-section-label">
        EYE MODEL <span>{frame?.model?.ready ? "Fitted" : "Collecting"}</span>
      </div>
      <canvas
        width={280}
        height={220}
        ref={ref}
        aria-label="Projected spherical eye model and gaze direction"
      />
      <div className="eye-sphere-metrics">
        <span>
          {frame?.model?.samples ?? 0}
          <small>observations</small>
        </span>
        <span>
          {Math.round((frame?.model?.coverage ?? 0) * 100)}%
          <small>coverage</small>
        </span>
        <span>
          {frame?.model ? frame.model.residual.toFixed(1) : "—"}
          <small>fit error · px</small>
        </span>
      </div>
    </div>
  )
}
