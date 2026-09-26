import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react"
import { Camera, Crop, ScanEye } from "lucide-react"
import type { TrackerController } from "./use-tracker"
import type { Ellipse, Point, Rect, TrackingFrame } from "./types"
import {
  moveRegion,
  regionFromPoints,
  resizeRegion,
  type ResizeHandle,
} from "./roi"

const HANDLES: { handle: ResizeHandle; label: string; x: number; y: number }[] =
  [
    { handle: "nw", label: "top left", x: 0, y: 0 },
    { handle: "n", label: "top", x: 50, y: 0 },
    { handle: "ne", label: "top right", x: 100, y: 0 },
    { handle: "e", label: "right", x: 100, y: 50 },
    { handle: "se", label: "bottom right", x: 100, y: 100 },
    { handle: "s", label: "bottom", x: 50, y: 100 },
    { handle: "sw", label: "bottom left", x: 0, y: 100 },
    { handle: "w", label: "left", x: 0, y: 50 },
  ]
type RegionGesture = {
  pointerId: number
  start: Point
  region: Rect
  mode: "draw" | "move" | ResizeHandle
}

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
  onEditRegion,
  showModel = false,
}: {
  tracker: TrackerController
  selectRegion: boolean
  selectCorners: boolean
  onRegion: (roi: Rect) => void
  onCorner: (p: Point) => void
  onEditRegion?: () => void
  showModel?: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const gesture = useRef<RegionGesture | null>(null)
  const [selection, setSelection] = useState<Rect | null>(null)
  const [redraw, setRedraw] = useState(false)
  const [view, setView] = useState<"image" | "threshold">("image")
  const { frame, dimensions } = tracker
  const roi = tracker.settings.roi
  const displayRegion = selection ?? roi

  useEffect(() => {
    const canvas = ref.current,
      source = tracker.sourceCanvas.current
    if (!canvas || !source) return
    canvas.width = source.width
    canvas.height = source.height
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const colors = getComputedStyle(canvas)
    ctx.drawImage(source, 0, 0)
    const preview = frame?.detection.previews[frame.detection.selected]
    if (view === "threshold") {
      ctx.fillStyle = "#111111"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      if (preview && frame) {
        const image = ctx.createImageData(frame.roi.width, frame.roi.height)
        for (let i = 0; i < preview.mask.length; i++) {
          const j = i * 4
          image.data[j] =
            image.data[j + 1] =
            image.data[j + 2] =
              preview.mask[i]
          image.data[j + 3] = 255
        }
        ctx.putImageData(image, frame.roi.x, frame.roi.y)
      }
    }
    const rect = selection ?? roi
    ctx.fillStyle = "rgba(0,0,0,.42)"
    ctx.beginPath()
    ctx.rect(0, 0, canvas.width, canvas.height)
    ctx.rect(rect.x, rect.y, rect.width, rect.height)
    ctx.fill("evenodd")
    ctx.strokeStyle = selectRegion
      ? "#fafafa"
      : colors.getPropertyValue("--eye-pupil")
    ctx.lineWidth = 1.5
    ctx.setLineDash([7, 5])
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
    ctx.setLineDash([])
    const candidate = frame?.detection.candidate
    if (!frame?.detection.ellipse && candidate) {
      ctx.setLineDash([4, 4])
      drawEllipse(
        ctx,
        candidate,
        [roi.x, roi.y],
        colors.getPropertyValue("--eye-ray")
      )
      ctx.setLineDash([])
    }
    if (frame?.detection.ellipse) {
      drawEllipse(
        ctx,
        frame.detection.ellipse,
        [roi.x, roi.y],
        colors.getPropertyValue("--eye-pupil")
      )
      const p = frame.detection.ellipse.center
      ctx.fillStyle = "#fafafa"
      ctx.beginPath()
      ctx.arc(p[0] + roi.x, p[1] + roi.y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    if (showModel && frame?.model && view === "image") {
      const m = frame.model
      ctx.strokeStyle = colors.getPropertyValue("--eye-sphere")
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
        ctx.strokeStyle = colors.getPropertyValue("--eye-ray")
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
      ctx.fillStyle = colors.getPropertyValue("--eye-ray")
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
    showModel,
    view,
  ])

  function point(event: PointerEvent<HTMLElement>): Point {
    const canvas = ref.current!
    const box = canvas.getBoundingClientRect()
    return [
      Math.round(
        Math.max(
          0,
          Math.min(
            dimensions.width,
            ((event.clientX - box.left) * dimensions.width) / box.width
          )
        )
      ),
      Math.round(
        Math.max(
          0,
          Math.min(
            dimensions.height,
            ((event.clientY - box.top) * dimensions.height) / box.height
          )
        )
      ),
    ]
  }
  function beginGesture(
    event: PointerEvent<HTMLElement>,
    handle?: ResizeHandle
  ) {
    if (event.button !== 0 || gesture.current) return
    const p = point(event)
    if (selectCorners && !selectRegion) {
      onCorner(p)
      return
    }
    if (!selectRegion) return
    event.preventDefault()
    const inside =
      p[0] >= roi.x &&
      p[0] <= roi.x + roi.width &&
      p[1] >= roi.y &&
      p[1] <= roi.y + roi.height
    gesture.current = {
      pointerId: event.pointerId,
      start: p,
      region: roi,
      mode: handle ?? (redraw || !inside ? "draw" : "move"),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.focus()
  }
  function nextRegion(event: PointerEvent<HTMLElement>) {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return null
    const p = point(event),
      delta: Point = [p[0] - current.start[0], p[1] - current.start[1]]
    if (current.mode === "draw")
      return regionFromPoints(current.start, p, dimensions)
    if (current.mode === "move")
      return moveRegion(current.region, delta, dimensions)
    return resizeRegion(current.region, current.mode, delta, dimensions)
  }
  function commitRegion(next: Rect) {
    if (
      next.x !== roi.x ||
      next.y !== roi.y ||
      next.width !== roi.width ||
      next.height !== roi.height
    )
      onRegion(next)
  }
  function cancelGesture() {
    gesture.current = null
    setSelection(null)
  }
  function finishGesture(event: PointerEvent<HTMLElement>) {
    const current = gesture.current,
      next = nextRegion(event)
    if (!current || !next) return
    const p = point(event)
    const moved =
      Math.hypot(p[0] - current.start[0], p[1] - current.start[1]) >= 2
    cancelGesture()
    setRedraw(false)
    if (moved) commitRegion(next)
  }
  function editWithKeyboard(
    event: KeyboardEvent<HTMLElement>,
    handle?: ResizeHandle
  ) {
    if (!selectRegion) return
    if (event.key === "Escape") {
      cancelGesture()
      setRedraw(false)
      return
    }
    const direction: Record<string, Point> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    const delta = direction[event.key]
    if (!delta) return
    event.preventDefault()
    const amount = event.altKey ? 10 : 1
    const change: Point = [delta[0] * amount, delta[1] * amount]
    commitRegion(
      handle || event.shiftKey
        ? resizeRegion(roi, handle ?? "se", change, dimensions)
        : moveRegion(roi, change, dimensions)
    )
  }

  return (
    <div className="eye-preview">
      <div className="eye-preview-heading">
        <span>
          <span
            className={tracker.source ? "status-light on" : "status-light"}
          />
          {tracker.source ? "Eye view" : "Preview"}
        </span>
        {tracker.source && (
          <div className="eye-preview-tools">
            <div
              className="eye-preview-switch"
              role="group"
              aria-label="Preview display"
            >
              <button
                aria-pressed={view === "image"}
                onClick={() => setView("image")}
              >
                Image
              </button>
              <button
                aria-pressed={view === "threshold"}
                onClick={() => setView("threshold")}
              >
                Threshold
              </button>
            </div>
            <button
              className={`eye-roi-edit ${selectRegion ? "active" : ""}`}
              aria-pressed={selectRegion}
              onClick={() => {
                setRedraw(false)
                onEditRegion?.()
                ref.current?.focus()
              }}
            >
              <Crop size={13} />
              Edit ROI
            </button>
          </div>
        )}
      </div>
      {tracker.source ? (
        <>
          {selectRegion && (
            <div className="eye-roi-toolbar">
              <span>
                {redraw ? "Draw a new box" : "Drag to move · handles to resize"}
              </span>
              <button aria-pressed={redraw} onClick={() => setRedraw(!redraw)}>
                Redraw
              </button>
            </div>
          )}
          <div
            className="eye-preview-image"
            style={{ maxWidth: dimensions.width }}
            onPointerMove={(event) => {
              const next = nextRegion(event)
              if (next) setSelection(next)
            }}
            onPointerUp={finishGesture}
            onPointerCancel={cancelGesture}
            onLostPointerCapture={cancelGesture}
          >
            <canvas
              ref={ref}
              width={dimensions.width}
              height={dimensions.height}
              aria-label={
                selectRegion
                  ? "Eye region editor. Arrow keys move; Shift and arrows resize; Alt uses 10 pixel steps."
                  : "Eye camera preview"
              }
              tabIndex={selectRegion ? 0 : undefined}
              className={
                selectRegion
                  ? redraw
                    ? "selectable"
                    : "movable"
                  : selectCorners
                    ? "selectable"
                    : ""
              }
              onPointerDown={(event) => beginGesture(event)}
              onKeyDown={(event) => editWithKeyboard(event)}
            />
            {selectRegion && !redraw && (
              <div
                className="eye-roi-overlay"
                style={{
                  left: `${(displayRegion.x / dimensions.width) * 100}%`,
                  top: `${(displayRegion.y / dimensions.height) * 100}%`,
                  width: `${(displayRegion.width / dimensions.width) * 100}%`,
                  height: `${(displayRegion.height / dimensions.height) * 100}%`,
                }}
              >
                {HANDLES.map(({ handle, label, x, y }) => (
                  <button
                    key={handle}
                    className={`eye-roi-handle ${handle}`}
                    aria-label={`Resize ROI ${label}`}
                    title={`Resize ${label}; arrow keys adjust`}
                    style={{ left: `${x}%`, top: `${y}%` }}
                    onPointerDown={(event) => beginGesture(event, handle)}
                    onKeyDown={(event) => editWithKeyboard(event, handle)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="eye-preview-empty">
          <div className="eye-camera-outline">
            <Camera size={30} strokeWidth={1.2} />
          </div>
          <h2>Connect an eye camera</h2>
          <p>Or open a video or sample.</p>
          <span className="eye-viewfinder-corner tl" />
          <span className="eye-viewfinder-corner tr" />
          <span className="eye-viewfinder-corner bl" />
          <span className="eye-viewfinder-corner br" />
        </div>
      )}
      <div className="eye-preview-footer">
        <span>
          {selectRegion
            ? `${displayRegion.width} × ${displayRegion.height} px · ${displayRegion.x}, ${displayRegion.y}`
            : selectCorners
              ? "Select both eye corners"
              : (frame?.detection.reason ??
                (view === "threshold"
                  ? "Waiting for threshold image"
                  : "Local processing"))}
        </span>
        <span>
          {frame
            ? `${frame.width} × ${frame.height} · ${Math.round(frame.processingMs)} ms`
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
    const colors = getComputedStyle(ref.current!)
    ctx.clearRect(0, 0, 280, 220)
    ctx.strokeStyle = colors.getPropertyValue("--line")
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
      ctx.strokeStyle = colors.color
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(140, 105)
      ctx.lineTo(140 + gaze[0] * 115, 105 + gaze[1] * 115)
      ctx.stroke()
      ctx.fillStyle = colors.color
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
