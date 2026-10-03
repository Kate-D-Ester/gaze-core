import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { getGazeBubbleMaxDiameter, getGazeView } from "./gaze-bubble"
import type {
  GazeBubbleOverlayProps,
  GazeBubbleOverlaySnapshot,
} from "./gaze-bubble-overlay.types"
import type { GazeView } from "./gaze-bubble.types"
import { useGazeBubble } from "./use-gaze-bubble"

export function drawGazeBubbleOverlay(
  context: CanvasRenderingContext2D,
  snapshot: GazeBubbleOverlaySnapshot,
  width: number,
  height: number
) {
  const { bubble, view } = snapshot
  if (view.width <= 0 || view.height <= 0) {
    return
  }
  const scale = width / view.width
  const radius = bubble.radiusPx * scale
  const x = bubble.center[0] * width
  const y = bubble.center[1] * height
  const rawX = bubble.rawPoint[0] * width
  const rawY = bubble.rawPoint[1] * height
  context.save()
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.fillStyle = "rgba(255,77,87,0.05)"
  context.fill()
  context.strokeStyle = "#ff4d57"
  context.lineWidth = Math.min(2, bubble.radiusPx / 3) * scale
  context.stroke()
  if (Math.hypot(rawX - x, rawY - y) + 1.5 * scale <= radius) {
    context.beginPath()
    context.arc(rawX, rawY, 1.5 * scale, 0, Math.PI * 2)
    context.fillStyle = "rgba(255,117,128,0.6)"
    context.fill()
  }
  context.restore()
}

export function GazeBubbleOverlay({
  point,
  timestamp,
  errorRadiusPx = null,
  verified = false,
  resetKey,
  offset,
  fixed = true,
  stabilize = true,
  imageSize,
  markerClassName = "",
  maxAgeMs,
  snapshotRef,
}: GazeBubbleOverlayProps) {
  const container = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<GazeView | null>(null)
  const imageWidth = imageSize?.width
  const imageHeight = imageSize?.height
  useEffect(() => {
    const element = container.current
    if (!element) {
      return
    }
    const measure = () => {
      const bounds = element.getBoundingClientRect()
      const width = fixed ? window.innerWidth : bounds.width
      const height = fixed ? window.innerHeight : bounds.height
      const image =
        imageWidth !== undefined && imageHeight !== undefined
          ? { width: imageWidth, height: imageHeight }
          : undefined
      const next = getGazeView(width, height, image)
      setView((previous) => {
        if (
          previous?.width === next?.width &&
          previous?.height === next?.height &&
          previous?.left === next?.left &&
          previous?.top === next?.top &&
          previous?.scale === next?.scale
        ) {
          return previous
        }
        return next
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener("resize", measure)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [fixed, imageWidth, imageHeight])
  const bubble = useGazeBubble({
    point,
    timestamp,
    view,
    errorRadiusPx,
    verified,
    stabilize,
    resetKey,
    offset,
    maxAgeMs,
  })
  useLayoutEffect(() => {
    if (!snapshotRef) {
      return
    }
    snapshotRef.current = bubble && view ? { bubble, view } : null
    return () => {
      snapshotRef.current = null
    }
  }, [bubble, view, snapshotRef])
  const maxDiameter = view
    ? getGazeBubbleMaxDiameter(view.width, view.height)
    : 0
  let status = ""
  if (bubble?.limited) {
    status = "Calibration error is larger than the bubble · Recalibrate"
  } else if (bubble && !bubble.verified) {
    status = "Accuracy not checked"
  }
  const rawX =
    bubble && view ? (bubble.rawPoint[0] - bubble.center[0]) * view.width : 0
  const rawY =
    bubble && view ? (bubble.rawPoint[1] - bubble.center[1]) * view.height : 0
  const rawInside = bubble && Math.hypot(rawX, rawY) + 1.5 <= bubble.radiusPx
  return (
    <div
      ref={container}
      className="gaze-bubble-overlay"
      style={{
        position: fixed ? "fixed" : "absolute",
        inset: 0,
        zIndex: fixed ? 95 : 1,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {view && bubble && (
        <div
          className="gaze-bubble-view"
          style={{
            position: "absolute",
            left: view.left,
            top: view.top,
            width: view.width,
            height: view.height,
            overflow: "hidden",
          }}
        >
          <div
            className={`gaze-bubble motion-safe:transition-[left,top,width,height] motion-safe:ease-out ${stabilize ? "motion-safe:duration-100" : "motion-safe:duration-50"} ${markerClassName}`}
            aria-hidden="true"
            data-limited={bubble.limited}
            data-motion={bubble.motion}
            style={{
              position: "absolute",
              left: `${bubble.center[0] * 100}%`,
              top: `${bubble.center[1] * 100}%`,
              width: bubble.radiusPx * 2,
              height: bubble.radiusPx * 2,
              // Enforce the cap even while a size transition is in progress.
              maxWidth: maxDiameter,
              maxHeight: maxDiameter,
              boxSizing: "border-box",
              borderRadius: "50%",
              border: `${Math.min(2, bubble.radiusPx / 3)}px solid #ff4d57`,
              background: "rgba(255,77,87,0.05)",
              boxShadow: "none",
              overflow: "hidden",
              transform: "translate(-50%, -50%)",
            }}
          >
            {rawInside && (
              <i
                style={{
                  position: "absolute",
                  left: `calc(50% + ${rawX}px)`,
                  top: `calc(50% + ${rawY}px)`,
                  width: 3,
                  height: 3,
                  borderRadius: "50%",
                  transform: "translate(-50%, -50%)",
                  background: "#ff7580",
                  opacity: 0.6,
                }}
              />
            )}
          </div>
          {status && (
            <span
              className="gaze-bubble-status"
              role="status"
              style={{
                position: "absolute",
                left: 12,
                right: 12,
                ...(fixed ? { bottom: 16 } : { top: 12 }),
                textAlign: "center",
                color: "#e9b65e",
                fontSize: 11,
                lineHeight: 1.4,
                textShadow: "0 1px 3px #000",
              }}
            >
              {status}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
