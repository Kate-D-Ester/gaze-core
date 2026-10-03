import { ViewerGazePreview } from "./viewer-gaze-preview"
import { Camera } from "lucide-react"
import { useEffect, useRef } from "react"
import type { CameraPreviewProps } from "./camera-preview.types"

export function CameraPreview({
  label,
  camera,
  state,
  selection,
  gazeSession,
  now = 0,
  onPoint,
}: CameraPreviewProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const frame = state.frame
  useEffect(() => {
    const element = canvas.current
    if (!element || !frame) {
      return
    }
    element.width = frame.width
    element.height = frame.height
    element.getContext("2d")?.drawImage(camera.rawCanvas, 0, 0)
  }, [camera, frame])
  const live = state.connection === "live" && !!frame
  return (
    <button
      type="button"
      aria-label={`Choose a point in ${label}`}
      disabled={!live}
      className="relative block w-full overflow-hidden bg-[#090909] text-muted-foreground disabled:opacity-100!"
      style={{ aspectRatio: frame ? `${frame.width}/${frame.height}` : "4/3" }}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        if (bounds.width && bounds.height) {
          onPoint([
            (event.clientX - bounds.left) / bounds.width,
            (event.clientY - bounds.top) / bounds.height,
          ])
        }
      }}
      onKeyDown={(event) => {
        if (live && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault()
          onPoint([0.5, 0.5])
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
    </button>
  )
}
