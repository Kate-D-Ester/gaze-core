import { transformKey } from "./object-tracking"
import { MAX_FRAME_AGE_MS } from "../scene-eye-tracking/calibration"
import { drawEyePreviewFrame } from "../eye-tracking/components/eye-preview"
import { ViewerGazePreview } from "./viewer-gaze-preview"
import { ObjectOverlay } from "./object-overlay"
import type { ObjectBox, PointerRegion } from "./object-tracking.types"
import { Camera } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { CameraPreviewProps } from "./camera-preview.types"

export function CameraPreview({
  label,
  camera,
  state,
  selection,
  gazeSession,
  tracking,
  trackingRole,
  region,
  onRegion,
  now = 0,
  onPoint,
}: CameraPreviewProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const pointer = useRef<PointerRegion | null>(null)
  const suppressClick = useRef(false)
  const [draft, setDraft] = useState<ObjectBox | null>(null)
  const Preview = onPoint ? "button" : "div"
  const frame = state.frame
  const live = state.connection === "live" && !!frame
  const eyePreview = camera.eyePreview
  const pupilFrame = eyePreview?.frame
  const clock = Math.max(now, frame?.timestamp ?? 0)
  const pupilFresh =
    !!pupilFrame &&
    Number.isFinite(now) &&
    Number.isFinite(pupilFrame.timestamp) &&
    clock >= pupilFrame.timestamp &&
    clock - pupilFrame.timestamp <= MAX_FRAME_AGE_MS
  useEffect(() => {
    const element = canvas.current
    if (!element || !live || !frame) {
      return
    }
    if (eyePreview) {
      drawEyePreviewFrame(element, camera.rawCanvas, {
        ...eyePreview,
        frame: pupilFresh ? pupilFrame : null,
      })
    } else {
      element.width = frame.width
      element.height = frame.height
      element.getContext("2d")?.drawImage(camera.rawCanvas, 0, 0)
    }
  }, [camera, frame, live, eyePreview, pupilFrame, pupilFresh])
  return (
    <Preview
      type={onPoint ? "button" : undefined}
      aria-label={onPoint ? `Choose a point in ${label}` : `${label} preview`}
      disabled={onPoint ? !live : undefined}
      className="relative block w-full overflow-hidden bg-[#090909] text-muted-foreground disabled:opacity-100!"
      style={{
        aspectRatio: frame ? `${frame.width}/${frame.height}` : "4/3",
        touchAction: onRegion ? "none" : undefined,
      }}
      onPointerDown={(event) => {
        if (!onRegion || event.button !== 0) {
          return
        }
        const bounds = event.currentTarget.getBoundingClientRect()
        if (!bounds.width || !bounds.height) {
          return
        }
        const point: [number, number] = [
          (event.clientX - bounds.left) / bounds.width,
          (event.clientY - bounds.top) / bounds.height,
        ]
        pointer.current = {
          start: point,
          current: point,
          startX: event.clientX,
          startY: event.clientY,
          id: event.pointerId,
          sourceKey: state.source!.key,
          generation: state.frame!.generation,
          transformKey: transformKey(state),
        }
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }}
      onPointerMove={(event) => {
        const active = pointer.current
        if (!active || active.id !== event.pointerId) {
          return
        }
        const bounds = event.currentTarget.getBoundingClientRect()
        const x = Math.max(
          0,
          Math.min(1, (event.clientX - bounds.left) / bounds.width)
        )
        const y = Math.max(
          0,
          Math.min(1, (event.clientY - bounds.top) / bounds.height)
        )
        active.current = [x, y]
        setDraft([
          Math.min(active.start[0], x),
          Math.min(active.start[1], y),
          Math.max(active.start[0], x),
          Math.max(active.start[1], y),
        ])
      }}
      onPointerUp={(event) => {
        const active = pointer.current
        if (!active || active.id !== event.pointerId) {
          return
        }
        pointer.current = null
        setDraft(null)
        if (
          active.sourceKey !== state.source?.key ||
          active.generation !== state.frame?.generation ||
          active.transformKey !== transformKey(state)
        ) {
          suppressClick.current = true
          return
        }
        const bounds = event.currentTarget.getBoundingClientRect()
        if (!bounds.width || !bounds.height) {
          return
        }
        active.current = [
          Math.max(
            0,
            Math.min(1, (event.clientX - bounds.left) / bounds.width)
          ),
          Math.max(
            0,
            Math.min(1, (event.clientY - bounds.top) / bounds.height)
          ),
        ]
        if (
          Math.abs(event.clientX - active.startX) >= 8 &&
          Math.abs(event.clientY - active.startY) >= 8
        ) {
          const box: ObjectBox = [
            Math.min(active.start[0], active.current[0]),
            Math.min(active.start[1], active.current[1]),
            Math.max(active.start[0], active.current[0]),
            Math.max(active.start[1], active.current[1]),
          ]
          suppressClick.current = true
          onRegion?.(box)
        }
      }}
      onPointerCancel={() => {
        pointer.current = null
        setDraft(null)
      }}
      onClick={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false
          return
        }
        const bounds = event.currentTarget.getBoundingClientRect()
        if (bounds.width && bounds.height) {
          onPoint?.([
            (event.clientX - bounds.left) / bounds.width,
            (event.clientY - bounds.top) / bounds.height,
          ])
        }
      }}
      onKeyDown={(event) => {
        if (live && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault()
          onPoint?.([0.5, 0.5])
        }
      }}
    >
      {live ? (
        <canvas
          ref={canvas}
          className="absolute inset-0 size-full"
          aria-label={`Live ${label} feed`}
        />
      ) : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-sm">
          <Camera size={28} aria-hidden="true" />
          {state.busy ? "Connecting camera…" : "Connect a camera to preview"}
        </span>
      )}
      {gazeSession && live && (
        <ViewerGazePreview session={gazeSession} camera={state} now={now} />
      )}
      {tracking && trackingRole && (
        <ObjectOverlay
          role={trackingRole}
          tracking={tracking}
          camera={state}
          now={clock}
          region={draft ?? region}
        />
      )}
      {selection && live && (
        <span
          role="img"
          aria-label={`${label} static selection`}
          className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary/20 shadow-[0_0_0_2px_#0008]"
          style={{
            left: `${selection.point[0] * 100}%`,
            top: `${selection.point[1] * 100}%`,
          }}
        />
      )}
    </Preview>
  )
}
